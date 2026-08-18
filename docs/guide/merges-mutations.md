# Merges, Mutations, and Replication

ClickHouse&reg; does a lot of work quietly in the background. This page shows three kinds of it: merges that combine parts, mutations that rewrite data, and replication that keeps replicas in step.

All three are normally invisible. This page is where you look when something is slow, stuck, or not happening at all.

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

| Activity | What it does | Triggered by |
|---|---|---|
| Merge | Combines small parts into larger ones | ClickHouse&reg;, automatically |
| Mutation | Rewrites existing data | You, with `ALTER UPDATE` or `ALTER DELETE` |
| Replication | Applies another replica's changes | Any write, on a replicated table |

They interact. A mutation creates work that merges then tidy up. Replication carries both to other replicas. A cluster with a stuck merge often has a growing replication queue as a result, so read the three together rather than separately.

---

## 2. Summary cards

There are three numbers at the top: merges running, mutations active, and items in the replication queue.

**All three low is what you want.** Not zero. Zero merges on a cluster that takes inserts would be strange, because inserts create parts and parts need merging.

A number that stays high while you watch is the signal. One that rises and falls is the system at work.

---

## Merges

A merge combines several parts into one larger part. It runs constantly and is healthy. It is how ClickHouse&reg; keeps part counts down and queries fast.

It reads from `system.merges`.

| Column | Meaning |
|---|---|
| Database, table | What is being merged |
| Elapsed | How long this merge has run |
| Progress | Percentage complete |
| Rows read, rows written | Volume being processed |
| Memory | Memory this merge uses |

When nothing is merging, the page says so.

### Reading it

**Progress that moves is the thing to check.** A merge at 4 percent that was at 4 percent a minute ago is stuck. A merge at 80 percent is fine, however long it has run.

**Large merges take a long time, and that is normal.** To merge two 100GB parts moves 200GB of data. Elapsed time on its own says nothing. Progress does.

**Rows written lower than rows read** is expected on `ReplacingMergeTree` and `CollapsingMergeTree`, where a merge is when duplicates are actually removed. That is the engine at work.

**Memory matters when it is large.** Merges compete with queries for memory, and a big merge on a busy cluster can be what pushed a query over its limit.

### When merges are not keeping up

The symptom appears on [Tables & Parts](tables-and-parts.md) as a climbing active part count, not here. Here you see whether merges run at all.

Merges that do not run while parts accumulate usually means one of these: the server is short of memory or disk, merges hit an error and retry, or inserts arrive faster than merging can ever catch up.

---

## Mutations

A mutation is a change to existing data: `ALTER TABLE ... UPDATE` or `ALTER TABLE ... DELETE`.

**Mutations are not like SQL updates in other databases.** They do not change rows in place. ClickHouse&reg; rewrites every affected part, which on a large table means a read and a write of a great deal of data. A mutation that looks like a one-line statement can run for hours.

It reads from `system.mutations`.

| Column | Meaning |
|---|---|
| Database, table | What is being changed |
| Mutation ID | Its identifier |
| Command | The statement it carries out |
| Parts remaining | How many parts still to process |
| Latest fail reason | Why it last failed, if it has |

### Parts remaining is the progress bar

It counts down. Watch it over a minute: a fall means progress, static means stuck.

### The fail reason column is the important one

**A failing mutation retries without end.** It does not give up, and it does not go away. It also blocks mutations queued behind it on the same table.

So a populated fail reason is not a historical note. It is a live problem. Read it and act.

Common reasons: a type conversion that cannot work on some rows, a column that no longer exists, or memory limits on a large part.

### Stopping a mutation

There is no kill button on this page. To stop a mutation, run `KILL MUTATION WHERE mutation_id = '...'` in the [SQL Editor](sql-editor.md).

Stop one when a mutation fails repeatedly, was started by mistake, or blocks others behind it.

**To stop a mutation does not undo what it already did.** Parts already rewritten stay rewritten. A stopped `ALTER DELETE` leaves rows deleted in the parts it finished and present in the rest, so the table is in a partial state until you decide what to do.

That is a reason to think before you start a large mutation, not a reason to avoid a stop of a stuck one.

### Before you run a mutation

On a large table, consider whether you need it. These alternatives avoid the rewrite entirely:

- A `TTL` clause, if you delete by age.
- `DROP PARTITION`, if the rows you want gone align with a partition.
- A filter in the query, if the wrong rows only need to be invisible rather than absent.

Each is far cheaper than a rewrite of parts.

---

## Replication Queue

On a replicated table, each replica works through a queue of tasks to stay in step with the others. This shows what is waiting.

It reads from `system.replication_queue`.

| Column | Meaning |
|---|---|
| Database, table | Which table |
| Replica | Which replica the task belongs to |
| Type | What kind of operation |
| Created | When it was queued |

An empty queue means replicas are in sync, and the page says so.

### How long a task has waited

The **Created** column shows when the task was queued. A task queued seconds ago is normal. A task queued many minutes ago and still here means a replica is behind.

A growing queue means a replica falls behind. The data is still safe, but queries against that replica return stale results, and nothing about that is visible to whoever runs them.

### Common causes of a growing queue

**A large merge or mutation in progress**, which blocks the tasks behind it. Check the other two sections on this page first.

**Keeper connectivity problems.** Replication coordinates through Keeper, so to lose it stops progress. A replica can also go read-only, which is worth an alert.

**Network or disk pressure** on the replica that is behind.

**A task that fails and retries.** The [Queues](queues.md) page shows the replication queue in more depth, including a list ordered by retry count, which is the fastest way to find one that keeps failing.

---

## 6. Refreshing

All three tables refresh on their own every 30 seconds, so you can leave the page open while you watch activity ebb and flow.

The **Refresh** button in the section header reloads everything at once.

Thirty seconds suits this well. Merges and mutations move on the scale of minutes, so faster polling would add load without new information.

---

## 7. What healthy looks like

Know this, so you can tell normal from wrong.

**A few merges running at any time** on a cluster that takes inserts. Progress moves. Some finish while you watch.

**No mutations**, most of the time. Mutations are things you start, so an idle cluster has none.

**An empty or near-empty replication queue.** Tasks appear and clear within seconds.

**All three cards low and moving.** Movement is the sign of health. A static number is what deserves a look.

### What is not a problem

Merges that run constantly. That is the engine at work.

A mutation that takes hours on a large table. That is the cost of the operation, not a fault.

A replication queue with a few items. Tasks are queued and cleared continuously.

---

## 8. When something does not work

### A merge has not progressed in several minutes

Check server memory and disk space first. Merges need both, and a shortage of either stalls them.

Then check the [Error Log](logs.md#error-log) and [Text Log](logs.md#text-log) for merge errors around that time.

### A mutation shows a fail reason

Read it, because the mutation retries forever and blocks anything queued behind it on that table.

Fix the cause if you can. If you cannot, stop the mutation with `KILL MUTATION`, because to leave it achieves nothing and holds up others.

### A mutation is not progressing but has no fail reason

It may wait behind another mutation on the same table, because they process in order. Or it is genuinely at work on a very large part, in which case parts remaining will eventually fall.

Watch parts remaining for a minute. Static with no error usually means it waits. A slow fall means it works.

### The replication queue keeps growing

Look at merges and mutations first, because a long-running one blocks the tasks behind it.

Then check Keeper connectivity. A replica that has lost Keeper cannot make progress, and it may have gone read-only, which is worth an alert of its own.

[Queues](queues.md) shows the same queue with retry counts and error state, which finds a repeatedly failing task faster than this page does.

### Everything shows zero but the cluster is busy

If nothing at all appears, check that you look at the right cluster in the navbar.

On a non-replicated setup, the replication queue is legitimately always empty.

### I stopped a mutation and the data looks half-changed

This is expected. To stop a mutation stops further work. It does not reverse what was already done.

Decide whether to complete the change with a corrected mutation, or restore from a [backup](backups.md) if the partial state is not acceptable.

---

## Related pages

- [Tables & Parts](tables-and-parts.md) for the part counts merges manage
- [Queues](queues.md) for the replication queue in more depth
- [Logs](logs.md) for what the server said when something failed
- [Alert Rules](alerting.md#alert-rules) to be told about a growing queue rather than find it
- [Cluster Overview](cluster-overview.md) for the wider health picture
