#!/usr/bin/env bash
#
# Copyright (C) 2026 Quantrail™ Data Private Limited
# Contributors -> kathir Moorthy
# chops-k8s-setup.sh - creates the read-only Kubernetes account CHOps connects with
#
set -euo pipefail

SA_NAMESPACE="chops"
SA_NAME="chops-reader"
SECRET_NAME="chops-reader-token"
NAMESPACES=()
ASSUME_YES=0

usage() {
  cat <<'EOF'
Usage: chops-k8s-setup.sh [options]

  -n NAMESPACE   Restrict access to this namespace. Repeat for several.
                 Without this, the account gets cluster-wide read access,
                 which is what lets CHOps show you a namespace dropdown.
  -s NAMESPACE   Namespace to create the service account in. Default: chops
  -y             Do not ask for confirmation.
  -h             Show this message.
EOF
}

while getopts "n:s:yh" opt; do
  case "$opt" in
    n) NAMESPACES+=("$OPTARG") ;;
    s) SA_NAMESPACE="$OPTARG" ;;
    y) ASSUME_YES=1 ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done

command -v kubectl >/dev/null 2>&1 || {
  echo "kubectl was not found on this machine." >&2
  exit 1
}

kubectl version --request-timeout=10s >/dev/null 2>&1 || {
  echo "kubectl cannot reach a cluster. Check your current context:" >&2
  echo "  kubectl config current-context" >&2
  exit 1
}

SCOPED=0
if [ ${#NAMESPACES[@]} -gt 0 ]; then
  SCOPED=1
fi

# Show what will be created

echo
echo "CHOps Kubernetes setup"
echo "======================"
echo
echo "Cluster context : $(kubectl config current-context)"
echo "Service account : ${SA_NAME} in namespace ${SA_NAMESPACE}"
if [ "$SCOPED" -eq 1 ]; then
  echo "Access scope    : namespaces ${NAMESPACES[*]} only"
else
  echo "Access scope    : read-only across the whole cluster"
fi
echo
echo "The account will be allowed to READ:"
echo "  ClickHouse installations and Keeper installations (AKOC and OCKO)"
echo "  Pods, pod logs, services, config maps, events"
echo "  Persistent volume claims and endpoint slices"
echo "  Stateful sets, network policies, ingresses, pod disruption budgets"
if [ "$SCOPED" -eq 0 ]; then
  echo "  Namespaces and storage classes (cluster-wide)"
fi
echo
echo "It will NOT be allowed to:"
echo "  Create, update, patch or delete anything at all"
echo "  Read Secrets"
echo

if [ "$ASSUME_YES" -eq 0 ]; then
  read -r -p "Create these objects? [y/N] " answer
  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Nothing was created."; exit 0 ;;
  esac
fi

# Create

kubectl create namespace "${SA_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl create serviceaccount "${SA_NAME}" -n "${SA_NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# The API group names below are published by the operator as part of its wire protocol.
NAMESPACED_RULES=$(cat <<'EOF'
  - apiGroups: ["clickhouse.altinity.com"]
    resources: ["clickhouseinstallations", "clickhouseinstallationtemplates", "clickhouseoperatorconfigurations"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["clickhouse-keeper.altinity.com"]
    resources: ["clickhousekeeperinstallations"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["clickhouse.com"]
    resources: ["clickhouseclusters", "keeperclusters"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps", "events", "persistentvolumeclaims", "resourcequotas"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]
  - apiGroups: ["discovery.k8s.io"]
    resources: ["endpointslices"]
    verbs: ["get", "list"]
  - apiGroups: ["apps"]
    resources: ["statefulsets"]
    verbs: ["get", "list"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["networkpolicies", "ingresses"]
    verbs: ["get", "list"]
  - apiGroups: ["policy"]
    resources: ["poddisruptionbudgets"]
    verbs: ["get", "list"]
  - apiGroups: ["authorization.k8s.io"]
    resources: ["selfsubjectrulesreviews"]
    verbs: ["create"]
EOF
)

if [ "$SCOPED" -eq 1 ]; then
  # A Role per namespace.
  for ns in "${NAMESPACES[@]}"; do
    kubectl apply -f - >/dev/null <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${SA_NAME}
  namespace: ${ns}
rules:
${NAMESPACED_RULES}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${SA_NAME}
  namespace: ${ns}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${SA_NAME}
subjects:
  - kind: ServiceAccount
    name: ${SA_NAME}
    namespace: ${SA_NAMESPACE}
EOF
    echo "  Granted read access in namespace ${ns}"
  done
else
  # Cluster-wide.
  kubectl apply -f - >/dev/null <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${SA_NAME}
rules:
${NAMESPACED_RULES}
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["list"]
  - apiGroups: ["storage.k8s.io"]
    resources: ["storageclasses"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${SA_NAME}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${SA_NAME}
subjects:
  - kind: ServiceAccount
    name: ${SA_NAME}
    namespace: ${SA_NAMESPACE}
EOF
  echo "  Granted cluster-wide read access"
fi

# A token that does not expire.
kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: ${SA_NAMESPACE}
  annotations:
    kubernetes.io/service-account.name: ${SA_NAME}
type: kubernetes.io/service-account-token
EOF

# The control plane fills the token in asynchronously.
echo -n "  Waiting for the token"
for _ in $(seq 1 30); do
  if kubectl get secret "${SECRET_NAME}" -n "${SA_NAMESPACE}" \
       -o jsonpath='{.data.token}' 2>/dev/null | grep -q .; then
    echo " done"
    break
  fi
  echo -n "."
  sleep 1
done

TOKEN=$(kubectl get secret "${SECRET_NAME}" -n "${SA_NAMESPACE}" -o jsonpath='{.data.token}' | base64 -d)
if [ -z "${TOKEN}" ]; then
  echo
  echo "The token was not populated. Your cluster may block manually created" >&2
  echo "service account token Secrets. Ask your platform team, or run CHOps" >&2
  echo "inside the cluster instead." >&2
  exit 1
fi

# Take the CA from the kubeconfig rather than the Secret
SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CA=$(kubectl config view --raw --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d)

if [ -z "${CA}" ]; then
  CA_FILE=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.certificate-authority}')
  if [ -n "${CA_FILE}" ] && [ -f "${CA_FILE}" ]; then
    CA=$(cat "${CA_FILE}")
  fi
fi

# Output

cat <<EOF

Done. Paste the block below into CHOps under
Cluster Management, Kubernetes, Connect.

------------------------------ COPY FROM HERE ------------------------------
API address:
${SERVER}

CA certificate:
${CA}

Token:
${TOKEN}
------------------------------- TO HERE ------------------------------------

EOF

if [ "$SCOPED" -eq 1 ]; then
  cat <<EOF
This token is scoped to specific namespaces, so CHOps cannot list them for
you. Type the namespace name instead of choosing from the dropdown:

  ${NAMESPACES[*]}

Volume expansion checks will show as unavailable, because storage classes are
a cluster-wide object this token cannot read.

EOF
fi

cat <<EOF
To revoke access at any time:

  kubectl delete serviceaccount ${SA_NAME} -n ${SA_NAMESPACE}

EOF
