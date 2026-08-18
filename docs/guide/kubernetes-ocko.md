# Connecting a Cluster Managed by OCKO

CHOps supports two Kubernetes operators for ClickHouse&reg;. This page covers the
**Official ClickHouse&reg; Kubernetes Operator (OCKO)**, published by ClickHouse
Inc.

For the Altinity&reg; Kubernetes Operator for ClickHouse&reg; (AKOC), see
[Connecting a Kubernetes Cluster](kubernetes-connect.md). Most of that page
applies here too, so this one covers only what differs.

---

## Early access

Support for OCKO is early access.

That operator's custom resources are at `v1alpha1`. Under Kubernetes convention
that means the schema may change without a deprecation cycle. We track the
operator and will update to match, but a future operator release could need a
CHOps update before it works again.

This is not a statement about the operator's stability. It releases monthly,
enforces CRD compatibility in its own CI, and ships OLM and Helm packaging. The
label is about the API contract, not the software.

If you would rather avoid that exposure today, AKOC is the fully supported
option and covers the same ground.

---

## Contents

1. [Which operator do you have](#1-which-operator-do-you-have)
2. [What you need](#2-what-you-need)
3. [Setting up access](#3-setting-up-access)
4. [Making ClickHouse reachable](#4-making-clickhouse-reachable)
5. [Adding the cluster](#5-adding-the-cluster)
6. [What differs from AKOC once connected](#6-what-differs-from-akoc-once-connected)
7. [When something does not work](#7-when-something-does-not-work)

---

## 1. Which operator do you have

One command:

```bash
kubectl get crd | grep -i clickhouse
```

| What you see | Operator | Guide |
|---|---|---|
| `clickhouseclusters.clickhouse.com` | OCKO | This page |
| `clickhouseinstallations.clickhouse.altinity.com` | AKOC | [The AKOC guide](kubernetes-connect.md) |
| Both | Both | Either. You choose per cluster in CHOps |
| Neither | No operator | Neither guide applies |

Both can run in one Kubernetes cluster without conflict. They use different API
groups, so an installation managed by one is invisible to the other. That is why
CHOps asks you which operator manages a cluster rather than guessing.

---

## 2. What you need

The same three things as AKOC:

- `kubectl` working against the cluster, and permission to create service
  accounts and roles
- Network access from CHOps to the Kubernetes API
- A ClickHouse&reg; endpoint CHOps can reach

Plus one thing specific to OCKO. It requires **cert-manager**, because the
operator registers admission webhooks that need certificates. If the operator
pod sits in `ContainerCreating` and its events mention a missing `serving-cert`
Secret, cert-manager is either absent or was still starting when the operator
was installed.

```bash
kubectl get pods -n cert-manager
```

All three pods should be `Running`.

---

## 3. Setting up access

The same script as AKOC, and it already grants what OCKO needs:

```bash
./scripts/chops-k8s-setup.sh
```

It creates a read-only service account with permission to read
`clickhouse.altinity.com` and `clickhouse.com` resources. One account covers
both operators, so there is nothing extra to run if you use both.

The script prints three values. Keep them for the next step.

### If you already ran it before OCKO support existed

Re-run it. The RBAC rules are applied with `kubectl apply`, so this updates the
existing role in place and grants the new API group without disturbing anything.

---

## 4. Making ClickHouse reachable

The same problem as AKOC, and one detail that makes it more work here.

**OCKO creates only a headless service by default.** AKOC creates per-host
services and a cluster service, so a LoadBalancer is a small change there. Here
you have `<cluster>-clickhouse-headless` and nothing else, which is not
reachable from outside the cluster.

### For testing

```bash
kubectl port-forward -n YOUR-NAMESPACE service/YOUR-CLUSTER-clickhouse-headless 8123:8123
curl http://localhost:8123/ping
```

You want `Ok.` Then use `localhost`, port `8123`, TLS disabled in CHOps.

### For anything real

Create a service of your own that selects the operator's pods:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: clickhouse-external
  namespace: YOUR-NAMESPACE
spec:
  type: LoadBalancer
  selector:
    app.kubernetes.io/instance: YOUR-CLUSTER-clickhouse
    clickhouse.com/role: clickhouse-server
  ports:
    - name: http
      port: 8123
      targetPort: 8123
```

For an internal address rather than a public one, add the annotation for your
cloud from [the AKOC guide](kubernetes-connect.md#8-platform-by-platform).
Those sections apply unchanged, since the annotation belongs to the cloud rather
than the operator.

---

## 5. Adding the cluster

Cluster Management, **Kubernetes** tab, **New Cluster**.

### Step 1: Connect

Paste the block from the setup script. Choose **Test connection**.

The result now tells you which operators it found. If both are installed, it
says so.

### Step 2: Operator and installation

**This step has an extra field for OCKO.**

Choose **Official ClickHouse&reg; Kubernetes Operator (OCKO)** from the operator
dropdown. If only one operator is installed, CHOps pre-selects it from the test
result, so usually you are confirming rather than choosing.

Then pick a namespace and choose **Find installations**. Your ClickHouseCluster
resources appear with their shard count, host count and version.

### Step 3: ClickHouse address

The address from step 4 above. Port `8123`, TLS disabled for a port forward.

### Step 4: Credentials

The `default` user has no password unless one was set, and unlike AKOC it is
**not** restricted to the cluster's own pods. So `default` works from outside,
which makes getting started easier and is worth changing before production.

To set one, `spec.settings.defaultUserPassword` takes a Secret reference rather
than an inline value.

---

## 6. What differs from AKOC once connected

Everything works. Four screens read differently, and one reads better.

### Reconcile

AKOC publishes lists of hosts that have finished creating tables and caught up
on replication. OCKO reports the same information through Kubernetes conditions
instead:

| Condition | Reason | Meaning |
|---|---|---|
| `Ready` | `AllShardsReady` | Every shard has a ready replica |
| `Ready` | `SomeShardsNotReady` | At least one shard has none |
| `ClusterSizeAligned` | `UpToDate` | Running replicas match the requested topology |
| `ClusterSizeAligned` | `ScalingUp` or `ScalingDown` | A scale is in progress |
| `SchemaInSync` | `ReplicasInSync` | Databases exist everywhere and stale metadata is cleaned up |
| `SchemaInSync` | `DatabasesNotCreated` | Databases are still being created on new replicas |

A scale is complete when all three read the first row of each pair.

The Reconcile screen shows the conditions rather than the per-host table you
would see for AKOC.

### Health

**Two checks read differently.**

*All hosts ready* uses the pod's own readiness. AKOC publishes a separate
operator verdict, which is worth more because the operator knows what it was
attempting. OCKO does not, so there is one signal rather than two.

*Health signals trustworthy* always passes. AKOC has a troubleshoot mode that
disables health probes, and CHOps warns loudly when it is on. OCKO has no such
mode, so the warning never applies.

### Storage: this one reads better

*Data survives a scale-down* passes.

OCKO does not delete persistent volume claims when a cluster is deleted, and
reuses an existing claim when a cluster of the same name is recreated. AKOC
deletes by default, so that check normally fails there and needs a deliberate
change to pass.

### Network

Fewer services, because only the headless one exists unless you created your
own. Disruption budgets are usually populated, since OCKO creates one per shard
automatically. AKOC creates none by default, so that check normally fails there.

### Configuration

One panel rather than two. AKOC merges templates into a separate running form,
so CHOps shows what was written beside what is running. OCKO has no template
merging: what you wrote is what runs, so a comparison would always report no
difference.

---

## 7. When something does not work

Most of [the AKOC troubleshooting section](kubernetes-connect.md#9-when-something-does-not-work)
applies unchanged, because the connection, certificate and token problems belong
to Kubernetes rather than to either operator.

Four things are specific to OCKO.

### The operator pod is stuck in ContainerCreating

Almost always cert-manager. See [section 2](#2-what-you-need).

### No installations found, but kubectl shows them

Check the operator dropdown in step 2. If it says AKOC, CHOps is looking for
`ClickHouseInstallation` resources under a different API group and will
correctly find none.

### A cluster shows as unmanaged

The operator has never recorded a generation for it, which means it has not
observed the resource. Usually the operator is not running, or is watching other
namespaces.

```bash
kubectl get pods -n clickhouse-operator-system
```

### Something broke after upgrading the operator

This is the early access risk. A `v1alpha1` schema can change between releases.

CHOps discovers the served API version rather than hardcoding it, so a promotion
from `v1alpha1` to `v1beta1` needs no change from us. A renamed field or label
does. If a screen goes blank or shows nothing after an operator upgrade, that is
the likely cause and it is worth telling us which operator version you moved to.

---

## Naming

**OCKO** is the Official ClickHouse&reg; Kubernetes Operator, published by
ClickHouse Inc.

**AKOC** is the Altinity&reg; Kubernetes Operator for ClickHouse&reg;, published by
Altinity Inc.

CHOps supports both and is affiliated with neither. See
[TRADEMARKS.md](https://github.com/Quantrail-Data/CH-Ops/blob/main/TRADEMARKS.md).
