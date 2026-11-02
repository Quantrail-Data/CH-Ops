# Queues

ClickHouse&reg; moves a lot of data through queues: files that stream in from object storage, writes that wait to reach other shards, and replication tasks that wait to be applied.

This page brings them together, so you can see what flows and what backs up. Reach it from **Overview > Queues** in the sidebar.

There are four tabs, and each reads a different source:

| Tab | Reads | Shows |
|---|---|---|
| [S3 Queue](#s3-queue-and-azure-queue) | `system.s3queue_log` | Files ingested from S3 |
| [Azure Queue](#s3-queue-and-azure-queue) | `system.azure_queue_log` | The same, from Azure storage |
| [Distribution Queue](#distribution-queue) | `system.distribution_queue` | Writes that wait to reach their shard |
| [Replication Queue](#replication-queue) | `system.replication_queue` | Tasks replicas work through |

Each tab is self-contained, so a problem reading one never blanks out the others.

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

Every queue on this page exists because two things happen at different speeds. Work arrives, ClickHouse&reg; processes it, and the queue absorbs the difference.

A queue that stays small means the two speeds match. A queue that grows means arrival has outpaced processing, and it keeps growing until something changes.

That makes these pages an early warning, not an incident report. A growing queue is visible well before anyone notices missing or stale data.

---

## S3 Queue and Azure Queue

These monitor streaming ingestion, from the `S3Queue` and `AzureQueue` table engines, where ClickHouse&reg; continuously pulls new files from a bucket and loads them.

The two tabs look and work the same way, but point at different storage.

**If you do not use these engines**, the tab shows a note, for example "S3Queue is not in use on this server", rather than an empty screen.

Choose the time range with the **1h**, **6h**, **24h**, and **7d** buttons. Click the refresh icon to load the latest data.

### Summary cards

Five cards sum up the range: **Success rate**, **Files processed**, **Rows ingested**, **Failed files**, and **Last activity**.

### Per-table health

A row per ingesting table, with its success rate, failed files, rows ingested, and last activity. This panel shows only when more than one queue table exists.

**Last activity is the column to read first.** A table that has not been active for hours has quietly stopped, and nothing else on the page announces that as loudly.

**Success rate** tells you whether it works or limps. Anything below 100 percent means files are failing, and the Failures panel says which.

### Throughput

A chart of the ingestion rate over time.

Steady is good. A decline means something slows down. Flat at zero after a period of activity means it stopped, which pairs with the last activity column above.

Compare against your expected file arrival rate. Ingestion that matches arrival is healthy. Ingestion below it means a backlog builds in the bucket, where this page cannot see it.

### Where time goes

A latency breakdown that splits each file's journey into three stages, at p50 and p95. If the data for a stage is not available, the chart labels the stage instead of showing zero.

| Stage | What happens | Slow usually means |
|---|---|---|
| Fetch (object storage) | Reading the file from object storage | Network, or object storage throttling |
| Process (ClickHouse&reg;) | Parsing and loading into ClickHouse&reg; | Large files, or a busy server |
| Commit (Keeper) | Recording progress in Keeper | Keeper under pressure or unreachable |

This is the most useful panel when ingestion feels slow, because it tells you which stage to investigate instead of leaving you to guess.

**Commit that is slow is the one people do not expect.** It looks like a storage problem but is a coordination one, and the fix is at Keeper rather than at the bucket.

---

## 3. Investigating ingestion failures

A Failures panel lists files that did not load.

**Click All failures, or By error code** to see which problem is most common. Grouping first is usually faster: one error code that accounts for most failures points at one cause. The grouped view shows the error code, first seen, last seen, affected tables, and a sample exception.

**Click Search files to search by table, by file name, or by exception text.** Fill in **Table (db.table)**, **File name contains**, or **Exception contains**, then click **Search**. File name search is the one to use when someone asks about a specific file that should have loaded.

When there are no failures in the selected range, the panel shows "No failures in this range.".

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

Below the cards, the **Distributed tables** table shows one row per table, with its blocked state, files waiting, bytes waiting, broken files, error count, and last exception.

If you have no distributed tables, the tab shows "No distributed tables".

The Distribution Queue and Replication Queue tabs refresh every 30 seconds. A card can show the change since the last refresh, for example "+18".

### Reading it

**A queue that grows means writes do not reach their shards as fast as they arrive.** The data is not lost, because it sits on the node you inserted into. It is not queryable from the shard yet, though, so reads do not see it.

**Blocked is more serious than waiting.** Waiting means work is queued. Blocked means something prevents it, usually an unreachable shard.

**Broken files should be zero.** A non-zero count means data that ClickHouse&reg; could not forward and has set aside. It uses disk and will not resolve itself.

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

**Depth per table / replica**, which shows how many tasks wait for each table and replica.

**Task types**, a breakdown that tells you what kind of work is queued: fetches, merges, mutations.

**Tasks (most retried first).** This is the fastest way to find a task that keeps failing. Use the **Filter tasks...** box to find a task. Click **Executing** or **With errors** to show only the tasks that run now or only the tasks that have errors.

If the server has no replicated tables, the tab shows "No replicated tables".

### Reading it

**A high retry count is the signal.** A task retried thirty times will not succeed on the thirty-first without intervention. Read its error.

**Task type tells you where to look next.** Fetches that fail point at the network or the source replica. Merges that fail point at resources on this one.

---

## 6. What healthy looks like

Knowing this lets you tell normal from wrong at a glance.

**Ingestion tabs.** Success rate at or near 100 percent, last activity within the expected file arrival interval, throughput steady, and latency dominated by Process rather than Fetch or Commit.

**Distribution queue.** Small and moving. Blocked at zero, broken files at zero.

**Replication queue.** Near empty, oldest task in seconds, no task with a high retry count.

### What is not a problem

A distribution queue with some files waiting. ClickHouse&reg; buffers and forwards batches continuously.

A replication queue with entries during a busy period. It should clear, not stay empty.

Occasional ingestion failures that do not accumulate. Some transient failures retry successfully.

---

## 7. When something does not work

### A tab says it is not in use, or a panel says n.a.

If the tab says the engine is not in use, or that there are no distributed or replicated tables, you do not use that feature. `S3Queue` and `AzureQueue` are specific table engines, and the distribution queue applies only to `Distributed` tables.

If one panel says "unavailable (n.a.)", CHOps could not read the data for that panel. The other panels still work.

### Ingestion stopped and there are no failures

Check last activity first. If it is old with no failures, ClickHouse&reg; is not finding new files, rather than failing on them.

Usual causes are files that arrive in a different prefix from the one the table watches, permissions that change so a listing returns nothing, or the table being detached.

### Ingestion is slow

Read the latency breakdown before anything else, because it names the stage.

Fetch slow points at object storage or the network. Process slow points at file size or server load. Commit slow points at Keeper.

### The distribution queue keeps growing

A shard is unreachable or slow. Check the blocked count: a non-zero value means something actively prevents sends.

Check that the shards themselves are up and accept writes. This queue grows whenever one is not.

### Broken files in the distribution queue

This is data that ClickHouse&reg; could not forward. It will not resolve on its own and it uses disk.

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
- [Alert Rules](alerting.md#alert-rules) to get an alert about a growing queue rather than find it
- [Tables & Parts](tables-and-parts.md) when ingestion creates more parts than merges can handle
