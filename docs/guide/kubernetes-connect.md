# Connecting a Kubernetes Cluster

CHOps connects to ClickHouse&reg; clusters running in Kubernetes. Instead of typing
in each host, you point it at an installation and it reads the host list from
the cluster and keeps it current.

This page covers **AKOC**, the Altinity&reg; Kubernetes Operator for ClickHouse&reg;.
For the Official ClickHouse&reg; Kubernetes Operator (OCKO), see
[Connecting a Cluster Managed by OCKO](kubernetes-ocko.md).

It assumes you have not done this before. Every step says what to type, what you
should see, and what to do when you see something else.

**Time needed:** about 20 minutes the first time.

---

## Contents

1. [How the connection works](#1-how-the-connection-works)
2. [Which deployments are supported](#2-which-deployments-are-supported)
3. [Before you start](#3-before-you-start)
4. [Step 1: create a read-only account](#4-step-1-create-a-read-only-account)
5. [Step 2: make ClickHouse reachable](#5-step-2-make-clickhouse-reachable)
6. [Step 3: create a ClickHouse user](#6-step-3-create-a-clickhouse-user)
7. [Step 4: add the cluster](#7-step-4-add-the-cluster)
8. [Platform by platform](#8-platform-by-platform)
9. [When something does not work](#9-when-something-does-not-work)

---

## 1. How the connection works

The most important idea on this page, and the one that explains almost every
problem people hit.

CHOps makes **two separate connections**, over two separate paths:

| Connection | For | Needs |
|---|---|---|
| Kubernetes API | Reading the shape of your cluster: hosts, storage, events | An address, a CA certificate, a token |
| ClickHouse&reg; | Queries, dashboards, alerts | A reachable address, a username, a password |

They are independent. One can work while the other does not, and CHOps reports
them separately for exactly that reason.

**Why this matters.** CHOps runs outside your Kubernetes cluster. Inside a
cluster, ClickHouse&reg; is reachable at addresses like
`chi-demo-main-0-0-0.demo.svc.cluster.local`. Those resolve only inside the
cluster. From outside they mean nothing.

So even once CHOps can read your cluster perfectly, it still needs a separate,
externally reachable address to run queries against. Most of the work below is
making that second connection possible.

---

## 2. Which deployments are supported

Kubernetes discovery works wherever you control the Kubernetes API.

| Deployment | How | Requirement |
|---|---|---|
| ClickHouse&reg; under AKOC on self-managed Kubernetes | Kubernetes discovery | Reachable API and exposed ClickHouse&reg; |
| ClickHouse&reg; under AKOC on EKS, AKS or GKE | Kubernetes discovery | Same, and CHOps must be allowed past any API IP restrictions |
| ClickHouse&reg; under AKOC on K3s or minikube | Kubernetes discovery | For testing |
| Altinity.Cloud&reg; BYOK | Kubernetes discovery | The cluster is yours, so it behaves like managed Kubernetes |

### Deployments that use Direct connection instead

| Deployment | Why |
|---|---|
| ClickHouse&reg; Cloud | Managed service. No Kubernetes API is exposed to you |
| Altinity.Cloud&reg; hosted | Managed service. Altinity runs the cluster, not you |
| ClickHouse&reg; on a VM or bare metal | No Kubernetes involved |

These are not gaps. A managed service gives you a database endpoint and nothing
else, so there is no Kubernetes API for CHOps to read and nothing missing when
it does not. Add them under **Direct connection**, which takes a minute and
gives you everything except the Kubernetes screens.

### Checking which operator you have

```bash
kubectl get crd | grep -i clickhouse
```

| What you see | Operator | Guide |
|---|---|---|
| `clickhouseinstallations.clickhouse.altinity.com` | AKOC | This page |
| `clickhouseclusters.clickhouse.com` | OCKO | [The OCKO guide](kubernetes-ocko.md) |
| Both | Both | Either. You choose per cluster |
| Neither | No operator | Neither applies |

Both can run in one Kubernetes cluster without conflict. They use different API
groups, so an installation managed by one is invisible to the other.

---

## 3. Before you start

**On the machine you run commands from:**

- `kubectl`, working and pointed at the right cluster. Check with
  `kubectl get nodes` and look for at least one node marked `Ready`
- Permission to create service accounts and roles

**Already in the cluster:**

- AKOC, checked above
- At least one installation. Check with `kubectl get chi -A`

**Somewhere:** CHOps running, and you logged in as an administrator.

---

## 4. Step 1: create a read-only account

CHOps needs an identity in your cluster. You are going to create one that can
only look at things.

```bash
chmod +x scripts/chops-k8s-setup.sh
./scripts/chops-k8s-setup.sh
```

It prints exactly what it is about to create and waits for you to type `y`.
Read that list. Nothing is created before you confirm.

### What it creates

| Object | What it is |
|---|---|
| Namespace `chops` | A folder for these objects |
| ServiceAccount `chops-reader` | The identity |
| ClusterRole and binding | What it may do |
| Secret `chops-reader-token` | The credential |

The account may **read** installations, pods, pod logs, storage claims,
services, events, endpoint slices, stateful sets, network policies and
disruption budgets.

It may **not** create, update, patch or delete anything, and it cannot read
Secrets. Kubernetes enforces that, not CHOps.

### What it prints

Three values. Keep them on screen.

```
API address:
https://10.0.0.5:6443

CA certificate:
-----BEGIN CERTIFICATE-----
...

Token:
eyJhbGciOiJSUzI1NiIsImtpZCI6...
```

**API address** is where your cluster answers. **CA certificate** proves the
server at that address really is your cluster; without it, anyone able to
intercept your traffic could impersonate it, so CHOps always checks it and there
is no way to switch that off. **Token** proves who CHOps is.

### A narrower account

```bash
./scripts/chops-k8s-setup.sh -n production -n staging
```

The trade-off: CHOps cannot list namespaces, so you type the name instead of
choosing from a dropdown, and volume expansion checks become unavailable because
storage classes are a cluster-wide object. Everything else is the same.

### Check the values before going further

Ten seconds, and it saves an hour.

```bash
curl --cacert /tmp/ca.crt \
  -H "Authorization: Bearer $(cat /tmp/token.txt)" \
  https://10.0.0.5:6443/apis/clickhouse.altinity.com/v1/namespaces/YOUR-NAMESPACE/clickhouseinstallations
```

You want JSON containing `"kind":"ClickHouseInstallationList"`. If this fails,
fix it here. Nothing later can work until it succeeds.

---

## 5. Step 2: make ClickHouse reachable

This is the step people miss, for the reason in
[part 1](#1-how-the-connection-works).

### Option A: port forward, for testing only

```bash
kubectl port-forward -n YOUR-NAMESPACE service/clickhouse-YOUR-INSTALLATION 8123:8123
```

Leave that terminal open. In another:

```bash
curl http://localhost:8123/ping
```

You want `Ok.` Then use `localhost`, port `8123`, TLS disabled.

Fine for trying this out. Not for anything real, because closing that terminal
takes the cluster away.

### Option B: LoadBalancer service

Ask the operator for an external address:

```yaml
spec:
  templates:
    serviceTemplates:
      - name: external
        spec:
          type: LoadBalancer
          ports:
            - name: http
              port: 8123
  defaults:
    templates:
      serviceTemplate: external
```

Then `kubectl get svc -n YOUR-NAMESPACE` and look under `EXTERNAL-IP`. It can
take a minute or two to appear.

**Before you do this**, you are putting a database on the public internet.
Restrict it with a firewall, a security group, or ClickHouse&reg; user network
rules.

### Option C: internal load balancer, recommended

The same as B with the address private to your network, and CHOps running inside
that network. Nothing is exposed publicly. The cloud-specific annotation is in
[part 8](#8-platform-by-platform).

### Option D: Ingress

If you already run an ingress controller, add a rule and use that hostname.

---

## 6. Step 3: create a ClickHouse user

**Do not use the `default` user.** This catches nearly everybody once.

The operator restricts `default` to the IP addresses of the cluster's own pods.
A connection from CHOps is refused, and the refusal looks exactly like a wrong
password, so you will spend twenty minutes checking a password that was always
correct.

Leave `clickhouse_operator` alone too. It belongs to the operator and is
restricted to the operator's own pod.

### Create one for CHOps

```yaml
spec:
  configuration:
    users:
      chops/password: use-a-real-password-here
      chops/networks/ip: "::/0"
      chops/profile: default
      chops/quota: default
```

`networks/ip: "::/0"` means connect from anywhere. For production, narrow it to
the address CHOps runs from, such as `10.20.30.40/32`.

### For production, use a hash

```bash
echo -n "your-password" | sha256sum | tr -d '  -'
```

```yaml
      chops/password_sha256_hex: THE-HASH
```

### Check it

```bash
curl "http://localhost:8123/?user=chops&password=your-password" -d "SELECT 1"
```

You want `1`.

---

## 7. Step 4: add the cluster

**Cluster Management**, **Kubernetes** tab, **New Cluster**.

### Step 1 of 4: Connect

Paste the whole block from [part 4](#4-step-1-create-a-read-only-account) into
the large paste box. CHOps pulls out the three values itself.

Name the connection something you will recognise, then **Test connection**. You
want `Kubernetes: Connected.` If a permission is missing, CHOps names the exact
one.

### Step 2 of 4: Operator and installation

Choose **Altinity&reg; Kubernetes Operator for ClickHouse&reg; (AKOC)**. When only one
operator is installed CHOps pre-selects it from the test result, so usually you
are confirming rather than choosing.

Pick a namespace, choose **Find installations**, and select yours from the
table.

### Step 3 of 4: ClickHouse address

The address from [part 5](#5-step-2-make-clickhouse-reachable).

| Setup | Address | Port | TLS |
|---|---|---|---|
| Port forward | `localhost` | 8123 | Disabled |
| LoadBalancer, plain HTTP | the external address | 8123 | Disabled |
| LoadBalancer with TLS | the hostname | 8443 | Enabled |
| Ingress | the hostname you configured | 443 | Enabled |

### Step 4 of 4: Credentials

The user from [part 6](#6-step-3-create-a-clickhouse-user).

Entered **once for the whole installation**. Every host inherits them, which is
what keeps things working when somebody scales the cluster and new hosts appear.

CHOps tests the credentials before saving. If they do not work it says which
half failed and asks whether to add the cluster anyway. Adding anyway is
reasonable: the Kubernetes screens still work, which is what you need while
diagnosing why ClickHouse&reg; will not answer.

### Confirm it worked

Three checks, in order of how much they prove:

1. The cluster appears with the right number of hosts.
2. Open it and run `SELECT hostName(), version()`.
3. Create an alert rule against it and open a dashboard. Neither feature knows
   Kubernetes exists, and both should work unchanged. That is the whole point of
   the design.

---

## 8. Platform by platform

### K3s

Easiest, and the recommended way to try this.

```bash
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'
```

If CHOps runs on another machine, the address must be the node's real IP **and**
that IP must be in the API server's certificate. Set that at install time:

```bash
curl -sfL https://get.k3s.io | sh -s - --tls-san 10.0.0.5
```

Without `--tls-san`, connecting by IP gives a certificate error saying the
certificate does not cover the address. That message is correct and this is the
fix.

K3s ships a load balancer, so a LoadBalancer service gets an address
immediately. Its storage cannot grow a volume, so CHOps will correctly report
volumes as not expandable.

### minikube

```bash
minikube ip
```

The API is on port 8443, so the address is `https://<that-ip>:8443`.

LoadBalancer services stay `<pending>` unless `minikube tunnel` is running.
Alternatively use a NodePort and connect to the minikube IP on the port shown.

If CHOps runs in a container, put them on the same Docker network:
`docker network connect minikube your-chops-container`.

### Self-managed Kubernetes

Covers kubeadm, Rancher and OpenShift. The cleanest case, because you control
the network.

```bash
kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'
```

Use exactly what it prints. If it is a hostname, use the hostname. Substituting
an IP causes a certificate error.

On OpenShift the setup script works unchanged. Use a Route rather than an
Ingress: `oc expose service/clickhouse-demo -n demo`.

### Amazon EKS

```bash
aws eks describe-cluster --name YOUR-CLUSTER --query 'cluster.endpoint' --output text
```

**The most common blocker:**

```bash
aws eks describe-cluster --name YOUR-CLUSTER \
  --query 'cluster.resourcesVpcConfig.[endpointPublicAccess,publicAccessCidrs]'
```

If public access is `false`, CHOps must run **inside the VPC**. There is no way
around that from outside, and it is not a CHOps limitation. If a CIDR list
exists, the CHOps address must be on it.

Internal load balancer:

```yaml
        metadata:
          annotations:
            service.beta.kubernetes.io/aws-load-balancer-internal: "true"
            service.beta.kubernetes.io/aws-load-balancer-type: nlb
```

**Recommended:** CHOps on an EC2 instance in the same VPC. That solves both
problems at once.

### Azure AKS

```bash
az aks show -n YOUR-CLUSTER -g YOUR-GROUP --query fqdn -o tsv
```

Prefix with `https://`. Check authorized IP ranges:

```bash
az aks show -n YOUR-CLUSTER -g YOUR-GROUP \
  --query apiServerAccessProfile.authorizedIpRanges
```

Internal load balancer annotation:
`service.beta.kubernetes.io/azure-load-balancer-internal: "true"`

**Recommended:** CHOps on a VM in the same virtual network.

### Google GKE

```bash
gcloud container clusters describe YOUR-CLUSTER --zone YOUR-ZONE --format='value(endpoint)'
```

Prefix with `https://`. GKE calls the restriction authorized networks; if
configured, the CHOps address must be listed.

GKE normally issues short-lived credentials through `gke-gcloud-auth-plugin`.
CHOps uses a service account token instead, which does not expire and needs no
plugin on the CHOps machine. That is why the same instructions work on every
cloud.

Internal load balancer annotation:
`networking.gke.io/load-balancer-type: "Internal"`

**Recommended:** CHOps on a Compute Engine instance in the same VPC.

### Altinity.Cloud BYOK

The cluster runs in your cloud account and you have access to it, so follow
whichever of EKS, AKS or GKE it runs on.

Two differences: Altinity manages the operator, so do not change operator
settings without talking to them; and the ClickHouse&reg; endpoint is already
exposed, so use the address from the Altinity.Cloud&reg; console rather than
creating your own service.

---

## 9. When something does not work

### Work out which half failed

Open the cluster in CHOps.

- **Kubernetes screens work, queries fail.** The ClickHouse&reg; address or the
  credentials. See parts 5 and 6.
- **Queries work, Kubernetes screens fail.** The API address, certificate or
  token. Continue below.
- **Both fail.** Usually a network route problem.

### Cannot reach the Kubernetes API

Three usual causes: the address is wrong, the cluster restricts access by IP, or
there is no public endpoint at all. Compare against your kubeconfig, check the
command for your platform in [part 8](#8-platform-by-platform), and if the API
is private, CHOps must run inside your network.

### The CA certificate does not match this server

Copy it again, including the BEGIN and END lines:

```bash
kubectl config view --raw --minify \
  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d
```

Note `--raw`. Without it, kubectl hides the value.

### The certificate does not cover this address

Different problem, easy to confuse with the one above. The certificate is fine;
the address is not. Use exactly the address from your kubeconfig. On K3s this
usually means the cluster was installed without `--tls-san`.

### The token was rejected

The service account was deleted or the token revoked. Run the setup script
again.

### This token cannot list something

CHOps names the exact permission and namespace. Listing namespaces needs
cluster-wide access, so if you used `-n` that is expected: type the namespace
name instead.

### No installations found

Three causes and CHOps tells you which: the operator is not installed, the
operator does not watch that namespace, or your token cannot see it.

An installation the operator does not watch shows as unmanaged on the Reconcile
screen. It exists and nothing is acting on it.

### Authentication failed with a password you know is right

Almost certainly the `default` user. See
[part 6](#6-step-3-create-a-clickhouse-user). Confirm your user exists:

```bash
kubectl exec -n YOUR-NAMESPACE YOUR-POD -- \
  clickhouse-client -q "SELECT name FROM system.users"
```

### A host disappeared

Two innocent explanations. A pod restarting during maintenance vanishes for a
minute or two, and CHOps waits for several missed refreshes before removing a
host. Or the operator removed a host that failed to start after a scale-out,
which is its default behaviour rather than somebody deleting your machine.

---

## What next

Everything in CHOps now works against this cluster. The Kubernetes screens are
new: see [The Kubernetes Page](kubernetes-page.md) for what each one shows and
why it is worth looking at.
