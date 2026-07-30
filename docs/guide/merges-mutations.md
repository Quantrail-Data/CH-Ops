# Merges, Mutations, and Replication

ClickHouse® does a lot of work quietly in the background. This page shows three
kinds of it: merges combining parts, mutations rewriting data, and replication
keeping replicas in step.

All three are normally invisible. This page is where you look when something is
slow, stuck, or not happening at all.

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
| Merge | Combines small parts into larger ones | ClickHouse®, automatically |
| Mutation | Rewrites existing data | You, with `ALTER UPDATE` or `ALTER DELETE` |
| Replication | Applies another replica's changes | Any write, on a replicated table |

They interact. A mutation creates work that merges then tidy up. Replication
carries both to other replicas. A cluster with a stuck merge often has a growing
replication queue as a consequence, so read the three together rather than
separately.

---

## 2. Summary cards

Three numbers at the top: merges running, mutations active, and items in the
replication queue.

**All three low is what you want.** Not zero. Zero merges on a cluster receiving
inserts would be strange, since inserts create parts and parts need merging.

A number that stays high while you watch is the signal. One that rises and falls
is the system working.

---

## Merges

A merge combines several parts into one larger part. It runs constantly and is
healthy: it is how ClickHouse® keeps part counts down and queries fast.

Read from `system.merges`.

| Column | Meaning |
|---|---|
| Database, table | What is being merged |
| Elapsed | How long this merge has been running |
| Progress | Percentage complete |
| Rows read, rows written | Volume being processed |
| Memory | Memory this merge is using |

When nothing is merging, the page says so.

### Reading it

**Progress moving is the thing to check.** A merge at 4 percent that was at 4
percent a minute ago is stuck. A merge at 80 percent is fine however long it has
been running.

**Large merges take a long time and that is normal.** Merging two 100GB parts
moves 200GB of data. Elapsed time on its own says nothing; progress does.

**Rows written lower than rows read** is expected on `ReplacingMergeTree` and
`CollapsingMergeTree`, where merging is when duplicates are actually removed.
That is the engine doing its job.

**Memory matters when it is large.** Merges compete with queries for memory, and
a big merge on a busy cluster can be what pushed a query over its limit.

### When merges are not keeping up

The symptom appears on [Tables & Parts](tables-and-parts.md) as a climbing
active part count, not here. Here you see whether merges are running at all.

Merges not running while parts accumulate usually means one of: the server is
short of memory or disk, merges are hitting an error and retrying, or inserts
are arriving faster than merging can ever catch up.

---

## Mutations

A mutation is a change to existing data: `ALTER TABLE ... UPDATE` or
`ALTER TABLE ... DELETE`.

**Mutations are not like SQL updates in other databases.** They do not modify
rows in place. ClickHouse® rewrites every affected part, which on a large table
means reading and writing a great deal of data. A mutation that looks like a
one-line statement can run for hours.

Read from `system.mutations`.

| Column | Meaning |
|---|---|
| Database, table | What is being changed |
| Mutation ID | Its identifier |
| Command | The statement it is carrying out |
| Parts remaining | How many parts still to process |
| Latest fail reason | Why it last failed, if it has |

### Parts remaining is the progress bar

It counts down. Watch it over a minute: falling means progress, static means
stuck.

### The fail reason column is the important one

**A failing mutation retries indefinitely.** It does not give up, and it does
not go away. It also blocks mutations queued behind it on the same table.

So a populated fail reason is not a historical note, it is a live problem. Read
it and act.

Common reasons: a type conversion that cannot work on some rows, a column that
no longer exists, or memory limits on a large part.

### Killing a mutation

The **Kill** button stops one.

Use it when a mutation is failing repeatedly, or was started by mistake, or is
blocking others behind it.

**Killing does not undo what it already did.** Parts already rewritten stay
rewritten. A killed `ALTER DELETE` leaves rows deleted in the parts it finished
and present in the rest, so the table is in a partial state until you decide
what to do.

That is a reason to think before starting a large mutation, not a reason to
avoid killing a stuck one.

### Before running a mutation

On a large table, consider whether you need it. Alternatives that avoid the
rewrite entirely:

- A `TTL` clause, if you are deleting by age
- `DROP PARTITION`, if the rows you want gone align with a partition
- Filtering in the query, if the wrong rows only need to be invisible rather
  than absent

Each is far cheaper than rewriting parts.

---

## Replication Queue

On a replicated table, each replica works through a queue of tasks to stay in
step with the others. This shows what is waiting.

Read from `system.replication_queue`.

| Column | Meaning |
|---|---|
| Database, table | Which table |
| Replica, node | Which replica the task belongs to |
| Type | What kind of operation |
| Created | When it was queued |
| Minutes pending | How long it has waited |

An empty queue means replicas are in sync, and the page says so.

### Minutes pending is the number that matters

A queue with tasks pending for seconds is working. Tasks pending for many
minutes are not.

A growing queue means a replica is falling behind. The data is still safe, but
queries against that replica return stale results, and nothing about that is
visible to whoever is running them.

### Common causes of a growing queue

**A large merge or mutation in progress**, blocking the tasks behind it. Check
the other two sections on this page first.

**Keeper connectivity problems.** Replication coordinates through Keeper, so
losing it stops progress. A replica can also go read-only, which is worth
alerting on.

**Network or disk pressure** on the replica that is behind.

**A task failing and retrying.** The [Queues](queues.md) page shows the
replication queue in more depth, including a list ordered by retry count, which
is the fastest way to find one that keeps failing.

---

## 6. Refreshing

All three tables refresh on their own every 30 seconds, so the page can be left
open while you watch activity ebb and flow.

The **Refresh** button in the section header reloads everything immediately.

Thirty seconds is well suited to this: merges and mutations move on the scale of
minutes, so faster polling would add load without showing you anything new.

---

## 7. What healthy looks like

Worth knowing, so you can tell normal from wrong.

**A few merges running at any time** on a cluster taking inserts. Progress
moving. Some finishing while you watch.

**No mutations**, most of the time. Mutations are things you start, so an idle
cluster has none.

**An empty or near-empty replication queue.** Tasks appearing and clearing
within seconds.

**All three cards low and moving.** Movement is the sign of health; a static
number is what deserves a look.

### What is not a problem

Merges running constantly. That is the engine working.

A mutation taking hours on a large table. That is the cost of the operation, not
a fault.

A replication queue with a few items. Tasks are queued and cleared continuously.

---

## 8. When something does not work

### A merge has not progressed in several minutes

Check server memory and disk space first: merges need both, and shortage of
either stalls them.

Then check the [Error Log](logs.md#error-log) and
[Text Log](logs.md#text-log) for merge errors around that time.

### A mutation shows a fail reason

Read it, because the mutation will retry forever and block anything queued
behind it on that table.

Fix the cause if you can. If you cannot, kill the mutation, since leaving it
achieves nothing and holds up others.

### A mutation is not progressing but has no fail reason

It may be waiting behind another mutation on the same table, since they process
in order. Or it is genuinely working on a very large part, in which case parts
remaining will eventually fall.

Watch parts remaining for a minute. Static with no error usually means waiting;
falling slowly means working.

### The replication queue keeps growing

Look at merges and mutations first, since a long-running one blocks the tasks
behind it.

Then check Keeper connectivity. A replica that has lost Keeper cannot make
progress, and it may have gone read-only, which is worth an alert of its own.

[Queues](queues.md) shows the same queue with retry counts and error state,
which finds a repeatedly failing task faster than this page does.

### Everything shows zero but the cluster is busy

If nothing at all appears, check that you are looking at the right cluster in
the navbar.

On a non-replicated setup the replication queue is legitimately always empty.

### I killed a mutation and the data looks half-changed

Expected. Killing stops further work; it does not reverse what was already done.

Decide whether to complete the change with a corrected mutation, or restore from
a [backup](backups.md) if the partial state is not acceptable.

---

## Related pages

- [Tables & Parts](tables-and-parts.md) for the part counts merges are managing
- [Queues](queues.md) for the replication queue in more depth
- [Logs](logs.md) for what the server said when something failed
- [Alert Rules](alerting.md#alert-rules) for being told about a growing queue
  rather than finding it
- [Cluster Overview](cluster-overview.md) for the wider health picture
