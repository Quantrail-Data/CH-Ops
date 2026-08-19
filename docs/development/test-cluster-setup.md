# Setting Up a Test Cluster

A two-replica ClickHouse&reg; cluster on K3s, running under AKOC, the Altinity&reg; Kubernetes Operator for ClickHouse&reg;. This is what you connect CHOps to while you test.

**Time:** about twenty minutes, most of it waiting.
**You need:** a Linux machine, or a Mac or Windows machine with Docker.

Every command here is safe to run on a laptop. Nothing touches anything real.

---

## Step 1: Install Kubernetes

### On Linux

```bash
curl -sfL https://get.k3s.io | sh -
```

K3s writes its configuration to a file only root can read, so make it readable and tell your shell where it is:

```bash
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

To avoid a retype of that in every new terminal:

```bash
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
```

### On Mac or Windows

K3s only runs on Linux. Install Docker, then k3d, which runs K3s inside a container:

```bash
# Mac
brew install k3d

# Windows, in PowerShell as administrator
choco install k3d
```

```bash
k3d cluster create chops-test
```

k3d sets up your configuration automatically. No export needed.

### Check it worked

```bash
kubectl get nodes
```

```
NAME        STATUS   ROLES                  AGE   VERSION
mymachine   Ready    control-plane,master   1m    v1.31.4+k3s1
```

**`Ready` is the word that matters.** If it says `NotReady`, wait thirty seconds and run it again.

---

## Step 2: Install AKOC

The operator is the program that turns a ClickHouse&reg; installation description into actual running pods. CHOps reads what it creates.

```bash
kubectl apply -f https://raw.githubusercontent.com/Altinity/clickhouse-operator/master/deploy/operator/clickhouse-operator-install-bundle.yaml
```

That prints a long list of things it created. Wait for the operator itself to start:

```bash
kubectl -n kube-system get pods | grep clickhouse-operator
```

```
clickhouse-operator-5b8c9d7f4-x2kqp   2/2   Running   0   45s
```

**Wait for `Running` and `2/2`.** The operator runs two containers, and until both are up it will not act on anything you create.

---

## Step 3: Create the ClickHouse cluster

```bash
kubectl create namespace chtest
```

Now the installation itself. Copy this whole block:

```bash
kubectl apply -f - <<'EOF'
apiVersion: "clickhouse.altinity.com/v1"
kind: "ClickHouseInstallation"
metadata:
  name: "demo"
  namespace: chtest
spec:
  configuration:
    clusters:
      - name: "main"
        layout:
          shardsCount: 1
          replicasCount: 2
    users:
      chops/password: chops-test-password
      chops/networks/ip: "::/0"
      chops/profile: default
      chops/quota: default
  templates:
    volumeClaimTemplates:
      - name: data
        spec:
          accessModes: [ReadWriteOnce]
          resources:
            requests:
              storage: 1Gi
  defaults:
    templates:
      dataVolumeClaimTemplate: data
EOF
```

### What that says, in plain terms

**Two replicas, one shard.** Two copies of the same data, rather than the data split in half. Two replicas is the minimum that makes the interesting screens worth a look: a topology grid with something in it, a rotation check that can disagree between hosts, and the ON CLUSTER banner.

**A user called `chops`.** Not `default`, and that is deliberate. The operator locks the `default` user to the cluster's own pods, so a connection as `default` from outside is refused, and the refusal looks exactly like a wrong password. A separate user avoids an hour of confusion. You will test that behavior on purpose later.

**`networks/ip: "::/0"`** means the user may connect from anywhere. Fine for a laptop, wrong for anything real.

**1Gi volumes.** Small. You are not putting data in this.

### Wait for it

```bash
kubectl get chi -n chtest -w
```

```
NAME   CLUSTERS   HOSTS   STATUS       AGE
demo   1          2       InProgress   10s
demo   1          2       Completed    75s
```

Press Ctrl-C when it says `Completed`. That usually takes a minute or two, most of which is a pull of the ClickHouse&reg; image the first time.

If it stays `InProgress` for more than five minutes, jump to Troubleshooting at the end.

### Look at what was created

```bash
kubectl get pods,svc,pvc -n chtest
```

```
NAME                       READY   STATUS    RESTARTS   AGE
pod/chi-demo-main-0-0-0    1/1     Running   0          2m
pod/chi-demo-main-0-1-0    1/1     Running   0          1m

NAME                          TYPE        CLUSTER-IP     PORT(S)
service/chi-demo-main-0-0     ClusterIP   None           8123/TCP,9000/TCP
service/chi-demo-main-0-1     ClusterIP   None           8123/TCP,9000/TCP
service/clickhouse-demo       ClusterIP   10.43.12.88    8123/TCP,9000/TCP

NAME                                    STATUS   CAPACITY
persistentvolumeclaim/data-chi-demo...   Bound    1Gi
```

Two pods, one per replica. The operator creates one StatefulSet per host, which is why the pod names all end in `-0`.

The name `chi-demo-main-0-0-0` reads as installation `demo`, cluster `main`, shard `0`, replica `0`, pod `0`.

---

## Step 4: Make ClickHouse reachable

CHOps runs outside the cluster, so it cannot use the internal addresses above. For testing, a port forward is the simplest way in.

**Open a new terminal and leave this running:**

```bash
kubectl port-forward -n chtest service/clickhouse-demo 8123:8123
```

```
Forwarding from 127.0.0.1:8123 -> 8123
```

Do not close that terminal. Everything stops when you do.

**Check it from another terminal:**

```bash
curl "http://localhost:8123/ping"
```

```
Ok.
```

And a real query:

```bash
curl "http://localhost:8123/?user=chops&password=chops-test-password" \
  -d "SELECT hostName(), version()"
```

```
chi-demo-main-0-0-0    26.3.1.1
```

CHOps needs ClickHouse&reg; 26.3 or newer. The version shown here comes from whatever image the Altinity&reg; operator pulled, and your build number will differ. If the reported version is older than 26.3, pin a 26.3-or-newer ClickHouse&reg; image in the installation before you connect CHOps.

If both of those work, you are ready to point CHOps at it.

**Connection details for CHOps:**

| Field | Value |
|---|---|
| ClickHouse&reg; address | `localhost` |
| Port | `8123` |
| TLS | disabled |
| Username | `chops` |
| Password | `chops-test-password` |
| Namespace | `chtest` |
| Installation | `demo` |

---

## Useful commands while testing

### Scale the cluster

The interesting screens only do something when the cluster changes. Add a third replica:

```bash
kubectl patch chi demo -n chtest --type=merge \
  -p '{"spec":{"configuration":{"clusters":[{"name":"main","layout":{"shardsCount":1,"replicasCount":3}}]}}}'
```

Watch it happen:

```bash
kubectl get chi -n chtest -w
```

Back to two:

```bash
kubectl patch chi demo -n chtest --type=merge \
  -p '{"spec":{"configuration":{"clusters":[{"name":"main","layout":{"shardsCount":1,"replicasCount":2}}]}}}'
```

### Restart a pod

Useful to test whether the topology screen notices a host going out of rotation.

```bash
kubectl delete pod -n chtest chi-demo-main-0-1-0
```

Kubernetes starts a replacement within seconds.

### Make a pod crash

To test the previous-container log read:

```bash
kubectl exec -n chtest chi-demo-main-0-0-0 -- kill 1
```

That stops ClickHouse&reg;. The pod restarts, and its restart count goes up:

```bash
kubectl get pods -n chtest
```

### Turn on troubleshoot mode

This disables the operator's health probes, which changes what every readiness indicator means:

```bash
kubectl patch chi demo -n chtest --type=merge -p '{"spec":{"troubleshoot":"yes"}}'
```

Turn it off again:

```bash
kubectl patch chi demo -n chtest --type=merge -p '{"spec":{"troubleshoot":"no"}}'
```

### Look at the installation as the operator sees it

```bash
kubectl get chi demo -n chtest -o yaml | head -60
```

The `status` section near the bottom is what CHOps reads.

### Read ClickHouse logs

```bash
kubectl logs -n chtest chi-demo-main-0-0-0 --tail=50
```

The previous container, after a crash:

```bash
kubectl logs -n chtest chi-demo-main-0-0-0 --previous --tail=50
```

### Run SQL directly

```bash
kubectl exec -it -n chtest chi-demo-main-0-0-0 -- clickhouse-client
```

Useful to check what CHOps should be seeing:

```sql
SELECT cluster, shard_num, replica_num, host_name FROM system.clusters;
SELECT name, storage FROM system.users;
```

### Read the operator's own logs

The first place to look when the cluster will not come up:

```bash
kubectl logs -n kube-system -l app=clickhouse-operator --tail=50
```

---

## Troubleshooting

### The installation stays InProgress

Look at the pods:

```bash
kubectl get pods -n chtest
kubectl describe pod -n chtest chi-demo-main-0-0-0 | tail -20
```

The bottom of that output lists events, which almost always name the problem.

**`ImagePullBackOff`** means it cannot download ClickHouse&reg;. Check your internet connection. The first pull is a few hundred megabytes.

**`Pending`** with a message about volumes means storage is not being provisioned. On K3s this should work out of the box:

```bash
kubectl get storageclass
```

You should see `local-path` marked as default.

**`CrashLoopBackOff`** means ClickHouse&reg; starts and immediately stops. Read the logs:

```bash
kubectl logs -n chtest chi-demo-main-0-0-0 --previous
```

### Nothing happens after you apply the installation

The operator is probably not running:

```bash
kubectl -n kube-system get pods | grep clickhouse-operator
```

If it is missing, the install in Step 2 did not work. Run it again.

### Port forward keeps dying

It stops when the pod it connects through restarts. Just run it again. For something more durable, use a NodePort instead:

```bash
kubectl patch svc clickhouse-demo -n chtest -p '{"spec":{"type":"NodePort"}}'
kubectl get svc clickhouse-demo -n chtest
```

The output shows a port in the 30000s. Connect to your machine's address on that port instead of `localhost:8123`.

### Authentication failed

You almost certainly used `default` rather than `chops`. The operator restricts `default` to the cluster's own pods, and the rejection is indistinguishable from a wrong password.

Check the user exists:

```bash
kubectl exec -n chtest chi-demo-main-0-0-0 -- \
  clickhouse-client -q "SELECT name, storage FROM system.users"
```

You should see `chops` with storage `users_xml`.

### Everything is broken and you want to start over

```bash
kubectl delete namespace chtest
```

Wait a minute, then repeat Step 3.

---

## Two things this cluster cannot test

Worth knowing, so you do not chase them as bugs.

**Volume expansion.** K3s provisions storage with local-path, which does not support a growth of a volume. CHOps will correctly report that volumes cannot be expanded. If you want to exercise that path, install Longhorn (or a current release):

```bash
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml
```

Then set `storageClassName: longhorn` in the volume claim template and recreate the installation.

**Pagination.** Four pods is nowhere near the 500-item page size, so a bug in the handling of the continuation cursor cannot show up here. That test needs 600 dummy pods created deliberately, and it is described in the implementation guide.

---

## Cleaning up

Remove the ClickHouse&reg; cluster but keep Kubernetes:

```bash
kubectl delete namespace chtest
```

Remove everything:

```bash
# Linux
/usr/local/bin/k3s-uninstall.sh

# Mac or Windows
k3d cluster delete chops-test
```

---

## Quick reference

```bash
# Set up
curl -sfL https://get.k3s.io | sh -
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl apply -f https://raw.githubusercontent.com/Altinity/clickhouse-operator/master/deploy/operator/clickhouse-operator-install-bundle.yaml
kubectl create namespace chtest
# then apply the installation from Step 3

# Reach it
kubectl port-forward -n chtest service/clickhouse-demo 8123:8123

# Check it
curl "http://localhost:8123/ping"
kubectl get chi,pods,pvc -n chtest

# Poke it
kubectl delete pod -n chtest chi-demo-main-0-1-0
kubectl exec -n chtest chi-demo-main-0-0-0 -- kill 1

# Look at it
kubectl get chi demo -n chtest -o yaml
kubectl logs -n kube-system -l app=clickhouse-operator --tail=50
```
