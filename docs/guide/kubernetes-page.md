# The Kubernetes Page

Once a Kubernetes cluster is connected, CHOps shows eight screens about it under **Overview**, **Kubernetes Insights**. This page explains what each one is for, what the numbers mean, and which readings should worry you.

It assumes little Kubernetes knowledge. Terms are explained on first use.

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

**Overview**, then **Kubernetes Insights** in the sidebar.

If more than one Kubernetes cluster exists, a picker appears. It follows the cluster selected in the navbar when that cluster is one of its own, so this screen agrees with the rest of the app.

Cluster Management handles configuration. This page handles monitoring.

---

## Health

The screen to open first, and the one worth a check daily.

Eight checks with a count, such as `6 of 8 checks passing`. Each has a plain sentence that explains what it means.

| Check | What it asks |
|---|---|
| Operator reachable | If the operator is down, the cluster serves queries fine and nothing you change is ever applied |
| All hosts ready | Whether each host is ready |
| All hosts in rotation | Whether each host is actually receiving queries |
| No version skew | Whether every host runs the same image |
| Health signals trustworthy | Whether the operator's troubleshoot mode is on, which disables probes |
| Protected against node drains | Whether a pod disruption budget exists |
| No stalled volume expansion | Whether a disk resize is stuck |
| Data survives a scale-down | Whether volumes are kept when a host is removed |

A check can also read **unknown**, which means it could not run. That is not a failure and is excluded from the count. To report "data does not survive a scale-down" when the honest answer is unknown would be worse than to report nothing.

**A failing check is not an outage.** None of these stops your cluster from a serve of queries now. They are the things that turn into an incident later, when somebody drains a node or a disk fills up.

On a fresh AKOC cluster, expect two failures: no disruption budget, and volumes deleted on scale-down. Both are correct answers about a default installation. On OCKO both normally pass, because that operator creates budgets per shard and retains volumes.

Below the checks, a section lists anything unavailable on this deployment and says why, rather than a leave of an empty screen.

---

## Topology

The shape of your cluster, and where it does not match what you would expect.

A **shard** is a slice of your data. A **replica** is a copy of a shard. A **pod** is one running ClickHouse&reg; server. So 2 shards by 2 replicas is 4 pods: two copies each of two slices.

Each box shows the pod name, whether it is ready, whether it is in rotation, and its restart count with the reason it last stopped. A red background means the host is not ready or not in rotation.

**Ready and in rotation are different**, and both can be true when the other is false. A pod can be Running and healthy while absent from the service that receives queries. From ClickHouse&reg;'s side everything looks fine. From your users' side, that host is doing nothing. Nothing else shows you this.

`draining, still serving` is a third state: shutting down and still an answer to the queries it already has. Correct behavior, not a problem.

### The banners

**Troubleshoot mode is on.** The operator has disabled health probes, so a pod can report Ready while ClickHouse&reg; is not serving. Everything on the page is unverified until the flag is removed. AKOC only. OCKO has no such mode.

**Hosts are running different versions.** An upgrade stopped part way. Not rare: when a rolling update fails, the operator stops and leaves the hosts it already finished on the new version.

**Replicas sharing a node.** Two copies of the same data on one machine. To lose it loses both.

**No pod disruption budget.** Routine maintenance can evict several replicas at once.

---

## Reconcile

What the operator is doing, in its own words. To reconcile means to make reality match your installation description.

**On AKOC** you get a status, a task identifier, host counts, and a replica readiness table. That table is the most useful part after a scale: a new replica has to have its tables created and then copy the existing data, and until both are done it runs without a carry of its weight. Without this you poll `system.replicas` by hand.

**On OCKO** you get Kubernetes conditions instead, each with a documented reason:

| Condition | Reason | Meaning |
|---|---|---|
| `Ready` | `AllShardsReady` | Every shard has a ready replica |
| `ClusterSizeAligned` | `UpToDate` | Running replicas match the requested topology |
| `SchemaInSync` | `ReplicasInSync` | Databases exist everywhere and stale metadata is cleaned up |

A scale is complete when all three read those reasons.

### The banners

**Not being reconciled.** The installation exists and nothing is acting on it, usually because the operator watches other namespaces. Everything looks fine and no change will ever apply.

**Reconciliation is paused.** Deliberate. The status may read Aborted, which reflects the pause rather than a failure.

**The operator is not reachable.** Queries keep working and nothing you change is applied.

---

## Storage

Capacity from Kubernetes joined to free space from ClickHouse&reg;. Neither means much alone.

| Column | Meaning |
|---|---|
| Requested | What the installation asked for |
| Actual | What the disk really is now |
| Can grow | Whether it can be expanded in place |
| Resize | Whether an expansion is running |

**The Resize column is where a real problem hides.** `NodeResizePending` looks finished and is not: the control plane has completed and the machine has not, and for many storage drivers the finish needs the pod restarted. Until then the disk is still its old size.

That matters because expansion is an emergency action. Somebody grows a disk because it is filling, sees no error, assumes it worked, and goes home. CHOps raises this at the top of the screen.

**Can grow** that reads `no` is correct on K3s, minikube, and kind, whose default storage cannot expand. **Unknown** means CHOps could not check, which happens with a namespace-scoped token, and unknown is a different answer from no.

Free space comes from ClickHouse&reg;. Compare it against the capacity above: a disk at 82 percent that cannot be grown is a different problem from one that can.

---

## Network

How queries reach your cluster, and where three views of it disagree.

**The three-way check** is the most valuable thing here. There are three independent descriptions of the same cluster and they should agree: what the installation says should exist, what ClickHouse&reg; has in its own configuration, and what is routable right now.

**Configured but not in ClickHouse** means a host exists in the installation and is missing from `remote_servers`. A reconcile has not propagated.

**In ClickHouse but not routable** means ClickHouse&reg; is configured to send queries to a host that is not receiving traffic. Those queries will fail.

If the check could not run, CHOps says so rather than a show of a false all-clear.

**Network policies** restrict which traffic reaches your pods. If one exists and a connection times out with correct credentials, this is almost always why. The symptom otherwise looks like a wrong address.

**Disruption budgets** limit how many pods can be removed at once during maintenance. Zero allowed, with reason `InsufficientPods`, means a drain is blocked right now. No budgets at all is itself a finding.

---

## Configuration

Shown as YAML, because installations are written in YAML and `kubectl` prints YAML.

**On AKOC** two panels appear: what was written, and what is running after templates were merged in. They usually differ, and that is expected. This screen exists because "why is my setting not taking effect" almost always has its answer here.

**On OCKO** one panel, because that operator does no template merging: what you wrote is what runs.

Anything password-shaped is removed before this leaves the server, so a password placed in the installation shows as `[redacted]`. The strip happens on the server, not in your browser.

---

## Events

What Kubernetes recorded about this installation recently: a pod scheduled, a volume provisioned, a container that failed to start.

Warnings are bold. `(3 times)` means the same thing happened repeatedly, which usually means something retries and fails.

This is the first place to look when a pod will not start. The message almost always names the actual problem.

---

## Logs

What ClickHouse&reg; itself printed.

Choose a pod, set how many lines to read, and select **Read logs**. Pods that have restarted show their restart count in the dropdown.

**The previous container checkbox is the important control.** When a pod crashes, Kubernetes starts a fresh container. To read logs normally shows you the new one, which has just started and printed almost nothing. That is why log viewing feels useless exactly when you need it. To tick this reads the container that died, which is where the error is.

CHOps prompts you when the selected pod has restarted. Combined with the termination reason on Topology, that is the whole crash diagnosis: why it stopped, and what it printed before it stopped.

### Filtering

**From** reads logs from that time onward. There is no end bound, because the Kubernetes API does not offer one. It is disabled when you read the previous container, because a container that died forty minutes ago has nothing in the last five.

**Lines** is how many to fetch, from 100 to 10000. It persists, as does From.

**Search** is case-insensitive and filters what has already been fetched, so a type costs nothing. It doubles as a level filter: a search for `error` matches `<Error>`.

**Context lines** keeps surrounding lines around each match, which is what makes a stack trace readable. An exception spans many lines and only the first carries the level, so a plain match returns the header and loses the trace.

A counter reads `12 of 1000 lines match` whenever a filter is active, so nobody concludes there were only twelve errors.

---

## How the host list stays current

**The list is not editable.** The installation is the source of truth, and anything you typed would be overwritten on the next refresh. Credentials, the display name, and the endpoint remain editable, so a rotation of a password works normally.

**It refreshes** when you open the screen, every fifteen minutes in the background, and when you press Refresh. Fifteen minutes is deliberate: the set of hosts changes only when somebody scales the cluster, which is a decision a person makes.

**A host that disappears is not deleted immediately.** It is removed only after three consecutive refreshes miss it, roughly forty-five minutes, because pods restart during upgrades and a node drain takes a while. If the cluster is unreachable entirely, the previous list stays and the last refresh time is shown.

---

## Things that look wrong and are not

- **Storage says volumes cannot be grown.** Correct on K3s, minikube, and kind.
- **Health fails two checks on a fresh AKOC cluster.** Correct: no disruption budget, and volumes deleted on scale-down.
- **Written and running configuration differ on AKOC.** Correct: templates are merged into the running form.
- **A host vanishes for a minute during a restart.** Correct, and CHOps deliberately does not act on it.
- **The operator removed a host after a failed scale-out.** Its default behavior, not somebody a delete of your machine.
- **Replication monitoring is empty on ClickHouse&reg; Cloud.** Correct, and CHOps explains it. SharedMergeTree has no replication queue.
- **The Keeper namespace is unknown on AKOC.** Honest rather than broken. A cluster with a custom DNS domain does not follow the usual naming pattern.
