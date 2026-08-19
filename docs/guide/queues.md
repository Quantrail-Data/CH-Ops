# Queues

ClickHouse&reg; moves a lot of data through queues: files that stream in from object storage, writes that wait to reach other shards, and replication tasks that wait to be applied.

This page brings them together, so you can see what flows and what backs up. Reach it from **Overview**, then **Queues**.

There are four tabs, each reads a different source:

| Tab | Reads | Shows |
|---|---|---|
| [S3 Queue](#s3-queue-and-azure-queue) | `system.s3queue_log` | Files ingested from S3 |
| [Azure Queue](#s3-queue-and-azure-queue) | `system.azure_queue_log` | The same, from Azure storage |
| [Distribution Queue](#distribution-queue) | `system.distribution_queue` | Writes that wait to reach their shard |
| [Replication Queue](#replication-queue) | `system.replication_queue` | Tasks replicas work through |

Each tab is self-contained, so a problem to read one never blanks out the others.

---

## Contents

1. [Which tab do you need](#1-which-tab-do-you-need)
2. [S3 Queue and Azure Queue](#s3-queue-and-azure-queue)
3. [Investigating ingestion failures](#3-investigating-ingestion-failures)
4. [Distribution Queue](#distribution-queue)
5. [Replication Queue](#replication-queue)
6. [What healthy looks like](#6-what-healthy-looks-like)
7. [When something does not work](#7-when-something-does-not-work)

---

## 1. Which tab do you need

Start from the symptom.

| Symptom | Tab |
|---|---|
| Data from a bucket is not appearing in a table | S3 Queue or Azure Queue |
| Ingestion works but is slower than it was | S3 Queue or Azure Queue |
| Inserts into a `Distributed` table seem to vanish | Distribution Queue |
| A replica serves stale data | Replication Queue |
| Disk fills on a node with no obvious cause | Distribution Queue, check broken files |

### A queue is a buffer, and buffers reveal problems early

Every queue on this page exists because two things happen at different speeds. Work arrives, work is processed, and the queue absorbs the difference.

A queue that stays small means the two speeds match. A queue that grows means arrival has outpaced processing, and it keeps growing until something changes.

That makes these pages an early warning, not an incident report. A growing queue is visible well before anyone notices missing or stale data.

---

## S3 Queue and Azure Queue

These monitor streaming ingestion, from the `S3Queue` and `AzureQueue` table engines, where ClickHouse&reg; continuously pulls new files from a bucket and loads them.

The two tabs look and work the same way. They point at different storage.

**If you do not use these engines**, the tab shows a note rather than an empty screen, so a blank panel never leaves you to guess whether something broke.

### Per-table health

A row per ingesting table, with its success rate, files processed, files failed, rows ingested, and when it was last active.

**Last active is the column to read first.** A table that has not been active for hours has quietly stopped, and nothing else on the page announces that as loudly.

**Success rate** tells you whether it works or limps. Anything below 100 percent means files are failing, and the Failures panel says which.

### Throughput

A chart of the ingestion rate over time.

Steady is good. A decline means something slows down. Flat at zero after a period of activity means it stopped, which pairs with the last active column above.

Compare against your expected file arrival rate. Ingestion that matches arrival is healthy. Ingestion below it means a backlog builds in the bucket, where this page cannot see it.

### Where time goes

A latency breakdown that splits each file's journey into three stages:

| Stage | What happens | Slow usually means |
|---|---|---|
| Fetch | Reading the file from object storage | Network, or object storage throttling |
| Process | Parsing and loading into ClickHouse&reg; | Large files, or a busy server |
| Commit | Recording progress in Keeper | Keeper under pressure or unreachable |

This is the most useful panel when ingestion feels slow, because it tells you which stage to investigate rather than to guess.

**Commit that is slow is the one people do not expect.** It looks like a storage problem but is a coordination one, and the fix is at Keeper rather than at the bucket.

---

## 3. Investigating ingestion failures

A Failures panel lists files that did not load.

**View all failures, or group by error code** to see which problem is most common. To group first is usually faster: one error code that accounts for most failures points at one cause.

**Search by table, by exception text, or by file name.** File name search is the one to use when someone asks about a specific file that should have loaded.

When there are no failures in the selected range, the panel says so plainly.

The **Refresh** button reloads whenever you want the latest.

### Reading a failure

Failures usually fall into three groups.

**Format problems.** The file did not match the expected format. Often a malformed record, or a file that is not the type the table expects.

**Permission problems.** ClickHouse&reg; could not read the object. These arrive in bursts when credentials expire or a bucket policy changes.

**Resource problems.** Memory limits on a large file, or disk pressure. These often succeed on retry, so a low failure rate that never grows may be benign.

---

## Distribution Queue

For `Distributed` tables. When you insert into one, ClickHouse&reg; can buffer the rows locally and forward them to the right shard in the background. Those buffered writes sit in a queue, and this tab shows its state.

### The summary cards

| Card | Meaning |
|---|---|
| Files waiting | Buffered batches not yet sent |
| Bytes waiting | How much data that is |
| Blocked | Batches that cannot currently be sent |
| Broken files | Files set aside because they could not be processed |

Below the cards you see the distributed tables involved and the queue depth per table and replica, with a filter to find a specific one.

If you have no distributed tables, the tab tells you so.

### Reading it

**A queue that grows means writes do not reach their shards as fast as they arrive.** The data is not lost. It sits on the node you inserted into. But it is not queryable from the shard yet, so reads do not see it.

**Blocked is more serious than waiting.** Waiting means work is queued. Blocked means something prevents it, usually an unreachable shard.

**Broken files should be zero.** A non-zero count means data that could not be forwarded and has been set aside. It uses disk and will not resolve itself.

### Why disk can fill here

Buffered writes are files on the node that received the insert. A queue that grows for hours is a disk usage problem as well as a data freshness one, and it is easy to miss because the data belongs to no table on that node.

---

## Replication Queue

The tasks each replica works through to stay in step with the others.

This is the same queue summarised on [Merges & Mutations](merges-mutations.md), shown here in more depth.

### The summary cards

| Card | Meaning |
|---|---|
| Pending tasks | Tasks waiting |
| Executing now | Tasks running right now |
| Oldest task | How long the longest-waiting task has waited |

**Oldest task is the headline.** A queue of two hundred tasks all queued seconds ago is a busy cluster at work. A queue of three tasks where the oldest has waited forty minutes is a stuck cluster.

### Below the cards

**A breakdown by task type**, which tells you what kind of work is queued: fetches, merges, mutations.

**A list ordered with the most-retried first.** This is the fastest way to find a task that keeps failing, and it is why this tab is worth a look rather than a reliance on the summary elsewhere.

**Filters**, and a switch between what executes now and what currently has errors.

An empty queue is reported clearly, and that is what you want. It means replicas are in sync.

### Reading it

**A high retry count is the signal.** A task retried thirty times will not succeed on the thirty-first without intervention. Read its error.

**Task type tells you where to look next.** Fetches that fail point at the network or the source replica. Merges that fail point at resources on this one.

---

## 6. What healthy looks like

Know this, so you can tell normal from wrong at a glance.

**Ingestion tabs.** Success rate at or near 100 percent, last active within the expected file arrival interval, throughput steady, and latency dominated by Process rather than Fetch or Commit.

**Distribution queue.** Small and moving. Blocked at zero, broken files at zero.

**Replication queue.** Near empty, oldest task in seconds, no task with a high retry count.

### What is not a problem

A distribution queue with some files waiting. Batches are buffered and forwarded continuously.

A replication queue with entries during a busy period. It should clear, not stay empty.

Occasional ingestion failures that do not accumulate. Some transient failures retry successfully.

---

## 7. When something does not work

### A tab says n.a.

You do not use that feature. `S3Queue` and `AzureQueue` are specific table engines, and the distribution queue applies only to `Distributed` tables.

This is the tab telling you there is nothing to show, rather than a failure.

### Ingestion stopped and there are no failures

Check last active first. If it is old with no failures, ClickHouse&reg; does not find new files rather than fails on them.

Usual causes are files that arrive in a different prefix from the one the table watches, permissions that change so a listing returns nothing, or the table being detached.

### Ingestion is slow

Read the latency breakdown before anything else. It names the stage.

Fetch slow points at object storage or the network. Process slow points at file size or server load. Commit slow points at Keeper.

### The distribution queue keeps growing

A shard is unreachable or slow. Check the blocked count. Non-zero means something actively prevents sends.

Check that the shards themselves are up and accept writes. This queue grows whenever one is not.

### Broken files in the distribution queue

Data that could not be forwarded. It will not resolve on its own and it uses disk.

Investigate before you delete: the files represent inserts somebody made that never reached their shard.

### The replication queue has a task retried many times

Read its error, because it will not succeed without intervention.

Common causes are a missing part on the source replica, disk space, or Keeper connectivity. A replica that has lost Keeper cannot make progress at all, and it may have gone read-only, which is worth an alert of its own.

### Everything looks empty but the cluster is busy

Check the cluster selected in the navbar.

On a single-node, non-distributed, non-replicated setup, three of the four tabs are legitimately always empty.

---

## Related pages

- [Merges & Mutations](merges-mutations.md) for the replication queue summary alongside merges and mutations
- [Logs](logs.md) for what the server said when a task failed
- [Cluster Overview](cluster-overview.md) for the wider health picture
- [Alert Rules](alerting.md#alert-rules) to be told about a growing queue rather than find it
- [Tables & Parts](tables-and-parts.md) when ingestion creates more parts than merges can handle
