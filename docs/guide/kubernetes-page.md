# The Kubernetes Page

When you connect a Kubernetes cluster, CHOps shows ten tabs about it under **Overview**, **Kubernetes Insights**. This page explains what each tab is for, what the numbers mean, and which readings should worry you.

It assumes little Kubernetes knowledge and explains terms on first use.

If you have not connected a cluster yet, start with [Connecting a Kubernetes Cluster](kubernetes-connect.md) for AKOC or [Connecting a Cluster Managed by OCKO](kubernetes-ocko.md) for OCKO.

---

## Why these screens exist

You already have two tools. `kubectl` tells you what Kubernetes thinks. A SQL client tells you what ClickHouse&reg; thinks. Neither tells you when the two disagree.

CHOps holds both, and the screens worth your time are the ones that join them:

- This pod says Running. Is it actually receiving queries?
- This disk is 82 percent full. Can it be grown, and how long do I have?
- ClickHouse&reg; lists four replicas. Kubernetes built five. Where did the fifth go?
- This host restarted. What did it print just before it died?

---

## Finding them

**Overview**, then **Kubernetes Insights** in the sidebar. Only administrators can open these screens.

If more than one Kubernetes cluster exists, CHOps shows the cluster you selected in the navbar if it is a Kubernetes cluster, and otherwise the first Kubernetes cluster. A line under the title shows the installation, its namespace and the operator.

The tabs are **Health**, **Topology**, **Reconcile**, **Keeper**, **Storage**, **Resources**, **Network**, **Configuration**, **Events** and **Logs**. **Refresh** reads the host list again. See [How the host list stays current](#how-the-host-list-stays-current).

Cluster Management handles configuration, and this page handles monitoring.

### Optional permissions are missing

Some features need grants that older versions of the setup script do not give. When the token does not have them, a banner at the top names the features:

- **Zone awareness** needs read access to nodes.
- **Live pod resource usage** needs read access to pod metrics.

To get the grants, run `scripts/chops-k8s-setup.sh` again against the cluster. See [Run the script again after a CHOps upgrade](kubernetes-connect.md#run-the-script-again-after-a-chops-upgrade). A token from `-n` cannot read nodes, so zone awareness stays unknown with that token.

---

## Health

The screen to open first, and the one worth checking daily.

It shows ten checks with a count, such as `6 of 8 checks passing, 2 could not run`, and each check has a plain sentence that explains what it means.

| Check | What it asks |
|---|---|
| Operator reachable | If the operator is down, the cluster serves queries fine and nothing you change is ever applied |
| All hosts ready | Whether each host is ready |
| All hosts in rotation | Whether each host is actually receiving queries |
| No version skew | Whether every host runs the same image |
| Health signals trustworthy | Whether the operator's troubleshoot mode is on, which disables probes |
| Protected against node drains | Whether a pod disruption budget exists |
| No stalled volume expansion | Whether a disk resize is stuck or failed |
| Data survives a scale-down | Whether volumes are kept when a host is removed |
| Memory limits set | Whether every pod has a memory limit. A pod without a limit can use all the memory of its node |
| Replicas spread across zones | Whether a shard keeps two or more replicas in one availability zone |

A check can also read **unknown**, which means it could not run. That is not a failure, and CHOps leaves it out of the count. Reporting "data does not survive a scale-down" when the honest answer is unknown would be worse than reporting nothing.

**Replicas spread across zones** reads the `topology.kubernetes.io/zone` label of each node. It is unknown when the token cannot read nodes, or when the nodes have no zone label.

**A failing check is not an outage.** None of these stops your cluster from serving queries now. They are the things that turn into an incident later, when somebody drains a node or a disk fills up.

On a fresh AKOC cluster, expect two failures: no disruption budget, and volumes deleted on scale-down. Both are correct answers about a default installation. **Memory limits set** also fails when the installation sets no memory limit. On OCKO the first two normally pass, because that operator creates budgets per shard and retains volumes.

Below the checks, the section **Not available on this deployment** lists the features that do not work on this deployment and says why.

**Copy report** copies the result as text, one line for each check, marked `PASS`, `FAIL` or `UNKNOWN`. Paste it in a ticket or a chat.

### Health alerts

The **Health alerts** panel sends a notification when a health check fails. To turn it on, do these steps:

1. Turn on **Alert on health check failures**.
2. In **Choose channels...**, select one or more notification channels.
3. Select **Save**.

To create a channel, go to **Control panel**, **Notification Channels**.

How the alerts work:

- CHOps runs the checks every 15 minutes, also when nobody has the page open.
- A check must fail in two runs in a row before CHOps sends a failure notification. This stops alerts for short problems.
- CHOps sends one failure notification for each failure. It does not repeat it while the check stays failed.
- When the check passes again, CHOps sends a recovery notification.
- An unknown result sends nothing.

The failure notification has severity critical. The recovery notification has severity info. Both use the same alert id, so PagerDuty closes the incident that the failure opened.

---

## Topology

The shape of your cluster, and where it does not match what you would expect.

A **shard** is a slice of your data. A **replica** is a copy of a shard. A **pod** is one running ClickHouse&reg; server. So 2 shards by 2 replicas is 4 pods: two copies each of two slices.

Each box shows the pod name, whether it is ready, whether it is in rotation, and its restart count with the reason it last stopped. A red background means the host is not ready or not in rotation. A line at the top shows when CHOps last refreshed the host list.

**Ready and in rotation are different**, and both can be true when the other is false. A pod can be Running and healthy while absent from the service that receives queries. From ClickHouse&reg;'s side everything looks fine. From your users' side, that host is doing nothing. Nothing else shows you this.

`draining, still serving` is a third state: the pod shuts down and still answers the queries it already has. Correct behavior, not a problem. `not behind a service` means no service sends traffic to the pod.

When the installation names a Keeper, a **Keeper** panel lists its hosts and namespace.

### The banners

**Troubleshoot mode is on.** The operator has disabled health probes, so a pod can report Ready while ClickHouse&reg; is not serving. Everything on the page is unverified until the flag is removed. This applies to AKOC only, because OCKO has no such mode.

**Hosts are running different versions.** An upgrade stopped part way. Not rare: when a rolling update fails, the operator stops and leaves the hosts it already finished on the new version.

**Replicas sharing a node.** Two copies of the same data on one machine. If you lose the machine, you lose both copies.

**Replicas sharing an availability zone.** Two or more replicas of one shard are in one zone. A zone outage takes more than one copy with it. This banner needs read access to nodes.

**No pod disruption budget.** Routine maintenance can evict several replicas at once.

A disruption budget that allows no disruptions shows a note. Anybody who tries to drain a node is blocked.

---

## Reconcile

What the operator is doing, in its own words. To reconcile means to make reality match your installation description.

**On AKOC** you get a status, a task identifier, host counts, and a **Replica readiness** table. That table is the most useful part after a scale. A new replica must create its tables and then copy the existing data, and until both are done it does not do its share of the work. Without this table, you poll `system.replicas` by hand. Errors that the operator reports show below the table.

**On OCKO** the status is the reason of the Kubernetes `Ready` condition. These are the conditions that OCKO uses:

| Condition | Reason | Meaning |
|---|---|---|
| `Ready` | `AllShardsReady` | Every shard has a ready replica |
| `ClusterSizeAligned` | `UpToDate` | Running replicas match the requested topology |
| `SchemaInSync` | `ReplicasInSync` | Databases exist everywhere and stale metadata is cleaned up |

A scale is complete when all three read those reasons. CHOps shows only the `Ready` reason. To read the other two, use `kubectl describe`. See [Reconcile on OCKO](kubernetes-ocko.md#reconcile).

### The banners

**Not being reconciled.** The installation exists and nothing is acting on it, usually because the operator watches other namespaces. Everything looks fine and no change will ever apply.

**Reconciliation is paused.** Deliberate. The status may read Aborted, which reflects the pause rather than a failure.

**This installation is stopped.** The operator removed the pods and services and kept the volumes. When you start it again, it comes up with its data.

**The operator is not reachable.** Queries keep working and nothing you change is applied.

---

## Keeper

The state of the connection between ClickHouse&reg; and Keeper. Replicated tables need Keeper to accept writes.

| Panel | What it shows |
|---|---|
| Keeper sessions | For each host: the Keeper address, the session uptime, and whether the session is connected or expired |
| Replicated tables | For each host: the number of replicated tables, and how many are read-only |
| Keeper hosts | The Keeper hosts from the installation |

**Read-only tables** is the most important banner. A replicated table goes read-only when its Keeper session is lost, and writes to those tables fail now.

**Expired Keeper sessions** names the hosts that must reconnect before replication recovers.

The data comes from `system.zookeeper_connection` and `system.replicas` on every replica. If CHOps cannot read `system.zookeeper_connection`, the sessions panel does not show. This is normal on a cluster without replication.

---

## Storage

Capacity from Kubernetes joined to free space from ClickHouse&reg;. Neither means much alone.

| Column | Meaning |
|---|---|
| Shard/Replica | The host that uses the volume |
| Requested | What the installation asked for |
| Actual | What the disk really is now |
| Class | The storage class |
| Can grow | Whether it can be expanded in place |
| Resize | Whether an expansion is running |

**The Resize column is where a real problem hides.** `NodeResizePending` looks finished and is not: the control plane has completed and the machine has not, and for many storage drivers the finish needs the pod restarted. Until then the disk is still its old size.

That matters because expansion is an emergency action. Somebody grows a disk because it is filling, sees no error, assumes it worked, and goes home. CHOps raises this at the top of the screen. A failed expansion also shows at the top, because it does not retry on its own.

**Can grow** that reads `no` is correct on K3s, minikube, and kind, whose default storage cannot expand. **Unknown** means CHOps could not check, which happens with a namespace-scoped token, and unknown is a different answer from no.

### Free space

Free space comes from ClickHouse&reg;. Compare it against the capacity above: a disk at 82 percent that cannot be grown is a different problem from one that can. A **Used** value above 80 percent shows in bold.

**Growth per day** and **Full in** come from the `DiskUsed` metric in `system.asynchronous_metric_log` for the last 7 days. CHOps needs at least one hour of history. A disk that is full in 14 days or less shows a warning at the top of the screen.

The section **Worth knowing** lists volumes that cannot grow and volumes that are deleted when their host is removed.

---

## Resources

The CPU and memory of each pod, from Kubernetes and from ClickHouse&reg;.

A **request** is what the scheduler reserves for the pod. A **limit** is where the kernel stops it.

| Column | Meaning |
|---|---|
| CPU request, CPU limit | From the pod specification |
| Memory request, Memory limit | From the pod specification. `none` means the pod has no memory limit |
| ClickHouse memory | The `MemoryTracking` metric from `system.metrics`, with the percent of the memory limit |
| Live CPU, Live memory | The usage now, from the Kubernetes metrics API |

A ClickHouse memory value at 80 percent or more of the limit shows in bold.

### The banners

**Pods without a memory limit.** A pod without a limit can use all the memory of its node.

**max_server_memory_usage is larger than the container memory limit.** ClickHouse&reg; can then use more memory than the container has, and the kernel kills the pod.

Live CPU and live memory need a metrics server in the cluster, for example metrics-server, and read access to pod metrics. Without them, a note says that live usage is unknown.

---

## Network

How queries reach your cluster, and where three views of it disagree.

**The three-way check** is the most valuable thing here. There are three independent descriptions of the same cluster and they should agree: what the installation says should exist, what ClickHouse&reg; has in its own configuration, and what is routable right now.

**Configured but not in ClickHouse** means a host exists in the installation and is missing from `remote_servers`. A reconcile has not propagated.

**In ClickHouse but not routable** means ClickHouse&reg; is configured to send queries to a host that is not receiving traffic. Those queries will fail.

If the check could not run, CHOps says so. It does not show a false all-clear.

**Services** lists the services of the installation, with their type, external address and ports.

**Network policies** restrict which traffic reaches your pods. If one exists and a connection times out with correct credentials, this is almost always why. The symptom otherwise looks like a wrong address.

**Disruption budgets** limit how many pods can be removed at once during maintenance. Zero allowed, with reason `InsufficientPods`, means a drain is blocked right now. No budgets at all is itself a finding.

---

## Configuration

CHOps shows this as YAML, because you write installations in YAML and `kubectl` prints YAML.

**On AKOC** two panels appear: **Written**, the installation as submitted, and **Running**, the form after templates were merged in. They usually differ, and that is expected. This screen exists because "why is my setting not taking effect" almost always has its answer here. CHOps shows the applied templates above the panels.

**On OCKO** the **Running** panel is empty, because that operator does no template merging. What you wrote is what runs.

CHOps removes anything password-shaped on the server, before the data reaches your browser, so a password placed in the installation shows as `[redacted]`.

---

## Events

What Kubernetes recorded about this installation recently: a pod scheduled, a volume provisioned, a container that failed to start. The newest events are at the top.

Warnings show in bold. `(3 times)` means the same thing happened repeatedly, which usually means something retries and fails.

- **warnings only** shows only the warnings.
- **reload every 30 s** reads the events again every 30 seconds.
- A pod name in the **Object** column is a link. Select it to open the logs of that pod in the **Logs** tab.

This is the first place to look when a pod will not start. The message almost always names the actual problem.

---

## Logs

What ClickHouse&reg; itself printed.

Choose a pod, set how many lines to read, and select **Read logs**. Pods that have restarted show their restart count in the dropdown.

**The Previous container switch is the important control.** When a pod crashes, Kubernetes starts a fresh container. A normal read shows you the new one, which has just started and printed almost nothing. That is why log viewing feels useless exactly when you need it. Turn on **Previous container** to read the container that died, which is where the error is.

CHOps prompts you when the selected pod has restarted. Combined with the termination reason on Topology, that is the whole crash diagnosis: why it stopped, and what it printed before it stopped.

### Operator logs

When the Kubernetes connection has an operator namespace, the **Pod** dropdown also lists the operator pod as **Operator: <pod name>**. Select it to read the operator logs. When CHOps cannot find the operator pod, the dropdown shows the reason.

Operator logs need two things:

- The setup script ran with `-o <operator namespace>`.
- The operator namespace is set in the Kubernetes connection. See [Step 1 of 4: Connect](kubernetes-connect.md#step-1-of-4-connect).

### Filtering

**From** reads logs from that time onward. There is no end bound, because the Kubernetes API does not offer one. You cannot choose a time in the future. CHOps disables **From** when you read the previous container, because a container that died forty minutes ago has nothing in the last five.

**Lines** is how many to fetch, from 100 to 10000 in steps of 100. The default is 1000. CHOps keeps the **Lines** and **From** values in your browser for the next visit.

**Search** is case-insensitive and filters what has already been fetched, so typing does not read the logs again. It doubles as a level filter: a search for `error` matches `<Error>`.

**Context lines** keeps surrounding lines around each match, which is what makes a stack trace readable. An exception spans many lines and only the first carries the level, so a plain match returns the header and loses the trace. The choices are 0, 1, 3, 5 and 10. The default is 3.

A counter reads `12 of 1000 lines match` whenever a filter is active, so nobody concludes there were only twelve errors.

---

## How the host list stays current

**The list is not editable.** The installation is the source of truth, and the next refresh would overwrite anything you typed. Credentials, the display name, and the endpoint remain editable, so you can change a password normally.

**It refreshes** every fifteen minutes in the background, and when you press **Refresh**. Fifteen minutes is deliberate: the set of hosts changes only when somebody scales the cluster, which is a decision a person makes. To change the interval, go to **Control panel**, **App Config**, and set **Refresh the host list every**.

**A host that disappears is not deleted immediately.** CHOps removes it only after three consecutive refreshes miss it, roughly forty-five minutes, because pods restart during upgrades and a node drain takes a while. To change the number, set **Missed refreshes before removing a host** in **App Config**. If the cluster is unreachable entirely, CHOps keeps the previous list and shows the last refresh time.

---

## Things that look wrong and are not

- **Storage says volumes cannot be grown.** Correct on K3s, minikube, and kind.
- **Health fails two checks on a fresh AKOC cluster.** Correct: no disruption budget, and volumes deleted on scale-down.
- **Written and running configuration differ on AKOC.** Correct: the operator merges templates into the running form.
- **A host vanishes for a minute during a restart.** Correct, and CHOps deliberately does not act on it.
- **The operator removed a host after a failed scale-out.** This is its default behavior. Nobody deleted your machine.
- **Replication monitoring is empty on ClickHouse&reg; Cloud.** Correct, and CHOps explains it. SharedMergeTree has no replication queue.
- **The Keeper namespace is unknown on AKOC.** Honest rather than broken. A cluster with a custom DNS domain does not follow the usual naming pattern.
- **Replicas spread across zones reads unknown.** The token cannot read nodes, or the nodes have no zone label. Run the setup script again without `-n` to grant read access to nodes.
