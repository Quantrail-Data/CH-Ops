# Run CHOps in Kubernetes

This page tells you how to run CHOps itself as a pod in your Kubernetes cluster, with a persistent volume for its data. To connect CHOps to a ClickHouse&reg; cluster that runs in Kubernetes, see [Connecting a Kubernetes Cluster](../guide/kubernetes-connect.md) instead.

CHOps runs as one pod in a StatefulSet. The pod keeps its data on a persistent volume, so the data stays when the pod restarts, moves to another node, or gets a new image.

## Before you begin

You need:

- A Kubernetes cluster and `kubectl` with access to it.
- A storage class that gives `ReadWriteOnce` volumes. Most clusters have a default one. To see it, run `kubectl get storageclass` and look for `(default)`.
- Access to the CHOps image from the cluster: Docker Hub (`quantrailadmin1/ch-ops`) or GitHub Container Registry (`ghcr.io/quantrail-data/ch-ops`).
- Optional: an ingress controller, to open CHOps on a host name. The example Ingress is for ingress-nginx.

Use block storage (for example AWS EBS, Google Persistent Disk, Azure Disk, Longhorn or local-path). CHOps keeps its data in SQLite, and SQLite on a network file system such as NFS or SMB can corrupt the database.

## The manifests

The example manifests are in the root folder of the repository:

| File | What it makes |
|---|---|
| [`configmap.yaml`](https://github.com/Quantrail-Data/CH-Ops/blob/main/configmap.yaml) | `chops-config`: the settings that are not secret. |
| [`statefulset.yaml`](https://github.com/Quantrail-Data/CH-Ops/blob/main/statefulset.yaml) | The `chops` StatefulSet: one pod, the probes, and the persistent volume. |
| [`service.yaml`](https://github.com/Quantrail-Data/CH-Ops/blob/main/service.yaml) | The `chops` Service on port 7720, inside the cluster only. |
| [`ingress.yaml`](https://github.com/Quantrail-Data/CH-Ops/blob/main/ingress.yaml) | An Ingress for `chops.example.com`. Optional. |

You make the fifth part, the Secret `chops-secrets`, yourself in step 3. It is not in a file, so it does not go into git.

## What is on the persistent volume

The StatefulSet mounts the volume at `/app/data`. Do not change this path: CHOps always reads the encryption salt from `/app/data/crypto.salt`.

| Path | What it is |
|---|---|
| `/app/data/chops.db` | The CHOps database: users, clusters, dashboards, alerts and settings. |
| `/app/data/chops.db-wal`, `chops.db-shm` | SQLite work files. They belong to `chops.db`. |
| `/app/data/crypto.salt` | The encryption salt. With `ENCRYPTION_SECRET`, it makes the key for the stored passwords. |
| `/app/data/backups/` | Database backups, from `bun run db:backup` and from the automatic backup before each upgrade. |
| `/app/data/tmp/` | Temporary files of the application data backup. |

Export files do not go to this volume. They go to `/app/exports`, an `emptyDir` volume with an 8Gi limit. Kubernetes deletes it when the pod stops. CHOps also loses track of open exports when it restarts, so this is correct.

The database is small, usually a few megabytes. The backups take most of the space. The default size of 5Gi is enough for most teams.

## Step 1: Get the manifests

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
```

You only need the four YAML files. You can also copy them to your own deployment repository.

## Step 2: Set the image and the storage

Open `statefulset.yaml`.

**The image.** Set `image:` to the CHOps version that you want, for example `quantrailadmin1/ch-ops:1.4.1`. The tags are on [Docker Hub](https://hub.docker.com/r/quantrailadmin1/ch-ops/tags). Use a version number, not `latest`. Then you control when the version changes. If your cluster cannot pull from Docker Hub, push the image to your own registry, and set `imagePullSecrets`.

**The storage class.** The volume uses the default storage class of your cluster. To use another class, remove the `#` in front of `storageClassName` and set the name, for example `gp3`.

**The size.** Change `storage: 5Gi` if you need more space. You cannot make it smaller later. You can make it larger later only when the storage class has `allowVolumeExpansion: true`.

## Step 3: Make the namespace and the Secret

This guide uses the namespace `chops`. You can use another one.

```bash
kubectl create namespace chops

kubectl create secret generic chops-secrets -n chops \
  --from-literal=ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
  --from-literal=SUPER_ADMIN_1=admin \
  --from-literal=SUPER_ADMIN_1_PASSWORD='change-this-password' \
  --from-literal=SUPER_ADMIN_1_EMAIL=you@example.com
```

Save a copy of `ENCRYPTION_SECRET` in your password manager now:

```bash
kubectl get secret chops-secrets -n chops -o jsonpath='{.data.ENCRYPTION_SECRET}' | base64 -d
```

If you lose it, or change it later, CHOps cannot read the stored ClickHouse&reg; passwords and keys. You must then type them again.

After the first login, you can stop the `SUPER_ADMIN_1` login from `.env` values. Add `DISABLE_ENV_LOGIN=true` to the Secret or to the ConfigMap. See [Configuration](../getting-started/configuration.md).

## Step 4: Apply the manifests

```bash
kubectl apply -n chops -f configmap.yaml -f statefulset.yaml -f service.yaml
kubectl rollout status statefulset/chops -n chops
```

Kubernetes makes the pod `chops-0` and the volume claim `data-chops-0`. Check that the claim is `Bound`:

```bash
kubectl get pvc -n chops
```

At the first start, CHOps makes the database and `crypto.salt` on the volume. The pod is ready when `/api/ready` answers. That page also checks that the database can be read.

## Step 5: Open CHOps

**For a quick test**, forward the port to your computer:

```bash
kubectl port-forward -n chops svc/chops 7720:7720
```

Then open `http://localhost:7720` and log in with the `SUPER_ADMIN_1` user name and password.

**For your users**, use the Ingress:

1. In `ingress.yaml`, change `chops.example.com` to your host name.
2. Turn on HTTPS. Users send passwords to CHOps, so do not use plain HTTP. With cert-manager, add the `cert-manager.io/cluster-issuer` annotation and remove the `#` in front of the `tls:` lines.
3. In `configmap.yaml`, set `FRONTEND_LINK` to the address that users open, for example `https://chops.example.com`. CHOps puts it in the links that set a password.
4. Apply both files:

   ```bash
   kubectl apply -n chops -f configmap.yaml -f ingress.yaml
   kubectl rollout restart statefulset/chops -n chops
   ```

The ConfigMap sets `TRUST_PROXY: "1"`. This tells CHOps that one proxy, the ingress controller, is in front of it. Then the rate limits use the IP address of each user. If you have one more HTTP proxy in front, for example a cloud load balancer in HTTP mode, set it to `"2"`. If you do not use an Ingress, remove the line.

The three annotations in `ingress.yaml` let large export downloads finish. For a controller other than ingress-nginx, set the same three things in its own way: no limit on the request body size, a read timeout of one hour, and no response buffering.

## Run only one pod

Keep `replicas: 1`. CHOps keeps login limits, reset codes and the alert scheduler in the memory of its process, and SQLite allows one writer only. Two pods give wrong limits, two copies of each alert, and can damage the database. See [Run one CHOps instance only](production.md#run-one-chops-instance-only).

A StatefulSet stops the old pod before it starts the new one. So during an update, there is a short time when CHOps is not available. This is expected.

## Upgrade CHOps

1. Read the release notes of the new version.
2. Change `image:` in `statefulset.yaml` to the new version.
3. Apply it:

   ```bash
   kubectl apply -n chops -f statefulset.yaml
   kubectl rollout status statefulset/chops -n chops
   ```

When the new version starts, it changes the database to the new schema if necessary. Before the first change, it copies the database and the salt to `/app/data/backups/pre-upgrade-schema-*`. It keeps the last five of these copies.

To go back to the older version, you also need the older database. An older version does not start on a database from a newer version. Restore the `pre-upgrade-schema-*` copy as described in [Restore a backup](#restore-a-backup), and set the older image.

## Back up the data

Make a backup in the running pod. It is safe while CHOps runs:

```bash
kubectl exec -n chops chops-0 -- bun run db:backup
```

The command writes two files to `/app/data/backups/`: `chops-<time>.db` and `chops-<time>.salt`. They are on the same volume as the database, so also copy them out of the cluster:

```bash
kubectl cp chops/chops-0:/app/data/backups ./chops-backups
```

Keep the backup files and `ENCRYPTION_SECRET` in two different safe places. Together they give access to the stored passwords.

If your storage supports volume snapshots, you can also take a `VolumeSnapshot` of `data-chops-0`. Take it after `db:backup`, and restore from the `chops-<time>.db` file in the snapshot. Do not copy `chops.db` itself while CHOps runs, because the newest changes can still be in the WAL file.

## Restore a backup

1. Stop CHOps:

   ```bash
   kubectl scale statefulset/chops -n chops --replicas=0
   ```

2. Start a helper pod that mounts the volume. Save this as `chops-restore.yaml`:

   ```yaml
   apiVersion: v1
   kind: Pod
   metadata:
     name: chops-restore
   spec:
     securityContext:
       fsGroup: 1000
     containers:
       - name: restore
         image: alpine:3.20
         command: ["sleep", "3600"]
         volumeMounts:
           - name: data
             mountPath: /data
     volumes:
       - name: data
         persistentVolumeClaim:
           claimName: data-chops-0
   ```

   ```bash
   kubectl apply -n chops -f chops-restore.yaml
   kubectl wait -n chops --for=condition=Ready pod/chops-restore
   ```

3. Remove the SQLite work files, then copy the backup in. Use the database file and the salt file with the same time in their names:

   ```bash
   kubectl exec -n chops chops-restore -- rm -f /data/chops.db-wal /data/chops.db-shm
   kubectl cp ./chops-backups/chops-<time>.db chops/chops-restore:/data/chops.db
   kubectl cp ./chops-backups/chops-<time>.salt chops/chops-restore:/data/crypto.salt
   kubectl exec -n chops chops-restore -- chmod g+rw /data/chops.db /data/crypto.salt
   ```

4. Remove the helper pod and start CHOps:

   ```bash
   kubectl delete pod -n chops chops-restore
   kubectl scale statefulset/chops -n chops --replicas=1
   ```

CHOps must start with the same `ENCRYPTION_SECRET` as when it made the backup.

To move CHOps to another cluster, use the same steps: back up on the old cluster, install on the new cluster with the same Secret, then restore.

## Remove CHOps

```bash
kubectl delete -n chops -f ingress.yaml -f service.yaml -f statefulset.yaml -f configmap.yaml
```

Kubernetes does not delete the volume claim `data-chops-0`, so your data stays. If you install CHOps again in the same namespace, it uses the same data. To delete the data too, make a backup first, then run `kubectl delete pvc -n chops data-chops-0`. With the reclaim policy `Delete`, which most storage classes use, this also deletes the disk.

## Troubleshooting

**The pod is in `CrashLoopBackOff`.** Run `kubectl logs -n chops chops-0`. CHOps stops at the start when a required value is missing, and the message names the value. Check the Secret `chops-secrets`.

**The pod stays in `Pending`.** Run `kubectl describe pvc -n chops data-chops-0`. Usually the cluster has no default storage class. Set `storageClassName` in `statefulset.yaml`. You cannot change the volume claim of a StatefulSet that exists, so delete the StatefulSet and the claim first, then apply again.

**The log shows "permission denied" for `/app/data`.** The volume is not writable for the CHOps user. Check that `fsGroup: 1000` is in `statefulset.yaml`. Some storage types, such as `hostPath` and many NFS servers, do not use `fsGroup`. Use block storage, or change the owner of the folder on the volume to group 1000.

**Large exports stop at a fixed size or after one minute.** The ingress controller limits the request. Check the three annotations in `ingress.yaml`.

**All users get "Too many requests" at the same time.** CHOps sees one IP address for all users. Check `TRUST_PROXY` in `configmap.yaml`, and restart the pod after a change.

**A user gets "Invalid credentials" after a restore.** The restored database has the users and passwords from the time of the backup.
