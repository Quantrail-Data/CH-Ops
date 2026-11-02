# Merges and Mutations

ClickHouse&reg; does a lot of work quietly in the background. This page shows two kinds of it: merges that combine parts, and mutations that rewrite data. To open it, go to **Overview**, **Merges & Mutations**.

Both are normally invisible. This page is where you look when something is slow, stuck, or not happening at all.

The replication queue is on the [Queues](queues.md#replication-queue) page.

---

## Contents

1. [The three activities](#1-the-three-activities)
2. [Summary cards](#2-summary-cards)
3. [Merges](#merges)
4. [Mutations](#mutations)
5. [Replication Queue](#replication-queue)
6. [Refreshing](#6-refreshing)
7. [What healthy looks like](#7-what-healthy-looks-like)
8. [When something does not work](#8-when-something-does-not-work)

---

## 1. The three activities

| Activity | What it does | Triggered by | Where to look |
|---|---|---|---|
| Merge | Combines small parts into larger ones | ClickHouse&reg;, automatically | This page |
| Mutation | Rewrites existing data | You, with `ALTER UPDATE` or `ALTER DELETE` | This page |
| Replication | Applies another replica's changes | Any write, on a replicated table | [Queues](queues.md#replication-queue) |

They interact. A mutation creates work that merges then tidy up. Replication carries both to other replicas. A cluster with a stuck merge often has a growing replication queue as a result, so read them together rather than separately.

---

## 2. Summary cards

There are two numbers at the top: **Active Merges** and **Active Mutations**.

**Both low is what you want.** Not zero. Zero merges on a cluster that takes inserts would be strange, because inserts create parts and parts need merging.

A number that stays high while you watch is the signal. One that rises and falls is the system at work.

---

## Merges

A merge combines several parts into one larger part. Merges run constantly, and that is healthy: it is how ClickHouse&reg; keeps part counts down and queries fast.

This table reads from `system.merges`.

| Column | Meaning |
|---|---|
| database, table | What is being merged |
| elapsed | How long this merge has run, in seconds |
| progress_pct | Percentage complete |
| rows_read, rows_written | Volume being processed |
| memory | Memory this merge uses |

When nothing is merging, the table shows `No active merges. Your data is well-organized.`

### Reading it

**Progress that moves is the thing to check.** A merge at 4 percent that was at 4 percent a minute ago is stuck. A merge at 80 percent is fine, however long it has run.

**Large merges take a long time, and that is normal.** A merge of two 100GB parts moves 200GB of data. Elapsed time on its own says nothing. Progress does.

**Rows written lower than rows read** is expected on `ReplacingMergeTree` and `CollapsingMergeTree`, where a merge is when duplicates are actually removed. That is the engine at work.

**Memory matters when it is large.** Merges compete with queries for memory, and a big merge on a busy cluster can be what pushed a query over its limit.

### When merges are not keeping up

The symptom appears on [Tables & Parts](tables-and-parts.md) as a climbing active part count, not here. Here you see whether merges run at all.

If merges do not run while parts accumulate, it usually means one of these: the server is short of memory or disk, merges hit an error and retry, or inserts arrive faster than merging can ever catch up.

---

## Mutations

A mutation is a change to existing data: `ALTER TABLE ... UPDATE` or `ALTER TABLE ... DELETE`.

**Mutations are not like SQL updates in other databases.** They do not change rows in place. ClickHouse&reg; rewrites every affected part, which on a large table means a read and a write of a great deal of data. A mutation that looks like a one-line statement can run for hours.

This table reads from `system.mutations` and shows only the mutations that are not done and not killed.

| Column | Meaning |
|---|---|
| database, table | What is being changed |
| mutation_id | Its identifier |
| command | The statement it carries out |
| parts_to_do | How many parts still to process |
| latest_fail_reason | Why it last failed, if it has |

When no mutation is active, the table shows `No active mutations. Smooth sailing.`

### Parts remaining is the progress bar

The **parts_to_do** column counts down. Watch it over a minute: a fall means progress, static means stuck.

### The fail reason column is the important one

**A failing mutation retries without end.** It does not give up, and it does not go away. It also blocks mutations queued behind it on the same table.

So a populated fail reason is not a historical note. It is a live problem. Read it and act.

Common reasons: a type conversion that cannot work on some rows, a column that no longer exists, or memory limits on a large part.

### Stopping a mutation

There is no kill button on this page. To stop a mutation, run `KILL MUTATION WHERE mutation_id = '...'` in the [SQL Editor](sql-editor.md).

Stop one when a mutation fails repeatedly, was started by mistake, or blocks others behind it.

**Stopping a mutation does not undo what it already did.** Parts already rewritten stay rewritten. A stopped `ALTER DELETE` leaves rows deleted in the parts it finished and present in the rest, so the table is in a partial state until you decide what to do.

That is a reason to think before you start a large mutation. It is not a reason to keep a stuck one.

### Before you run a mutation

On a large table, consider whether you need it. These alternatives avoid the rewrite entirely:

- A `TTL` clause, if you delete by age.
- `DROP PARTITION`, if the rows you want gone align with a partition.
- A filter in the query, if the wrong rows only need to be invisible rather than absent.

Each is far cheaper than a rewrite of parts.

---

## Replication Queue

This page does not show the replication queue. To see it, go to **Overview**, **Queues**, and use the **Replication Queue** tab. See [Queues](queues.md#replication-queue).

A growing replication queue often comes from a large merge or mutation that blocks the tasks behind it. So check the merges and mutations on this page first.

---

## 6. Refreshing

Both tables refresh on their own every 30 seconds, so you can leave the page open while you watch activity ebb and flow. There is no refresh button. To reload at once, open the page again.

Thirty seconds suits this well. Merges and mutations move on the scale of minutes, so faster polling would add load without new information.

---

## 7. What healthy looks like

Know this, so you can tell normal from wrong.

**A few merges running at any time** on a cluster that takes inserts. Progress moves. Some finish while you watch.

**No mutations**, most of the time. Mutations are things you start, so an idle cluster has none.

**Both cards low and moving.** Movement is the sign of health. A static number is what deserves a look.

### What is not a problem

Merges that run constantly. That is the engine at work.

A mutation that takes hours on a large table. That is the cost of the operation, not a fault.

---

## 8. When something does not work

### A merge has not progressed in several minutes

Check server memory and disk space first. Merges need both, and a shortage of either stalls them.

Then check the [Error Log](logs.md#error-log) and [Text Log](logs.md#text-log) for merge errors around that time.

### A mutation shows a fail reason

Read it, because the mutation retries forever and blocks anything queued behind it on that table.

Fix the cause if you can. If you cannot, stop the mutation with `KILL MUTATION`. A failing mutation achieves nothing and holds up others.

### A mutation is not progressing but has no fail reason

It may be waiting behind another mutation on the same table, because ClickHouse&reg; processes them in order. Or it is genuinely working on a very large part, in which case **parts_to_do** will eventually fall.

Watch **parts_to_do** for a minute. Static with no error usually means it is waiting, and a slow fall means it is working.

### The replication queue keeps growing

Look at merges and mutations on this page first, because a long-running one blocks the tasks behind it.

Then go to [Queues](queues.md#replication-queue). It shows the queue with retry counts and error state, which finds a repeatedly failing task fastest. Also check Keeper connectivity. A replica that has lost Keeper cannot make progress, and it may have gone read-only.

### Everything shows zero but the cluster is busy

If nothing at all appears, check that you are looking at the right cluster in the navbar.

### I stopped a mutation and the data looks half-changed

This is expected. Stopping a mutation stops further work, but it does not reverse what the mutation already did.

Decide whether to complete the change with a corrected mutation, or restore from a [backup](backups.md) if the partial state is not acceptable.

---

## Related pages

- [Tables & Parts](tables-and-parts.md) for the part counts merges manage
- [Queues](queues.md) for the replication queue
- [Logs](logs.md) for what the server said when something failed
- [Alert Rules](alerting.md#alert-rules) to be told about a growing queue rather than find it
- [Cluster Overview](cluster-overview.md) for the wider health picture
