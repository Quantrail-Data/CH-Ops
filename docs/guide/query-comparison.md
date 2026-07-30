# Query Comparison

Query Comparison puts two SELECT queries side by side so you can see which
performs better before committing to a rewrite.

The left pane holds what you have now. The right pane holds the version you are
considering. You can estimate either, run either, or compare both on the same
footing.

---

## Contents

1. [When to use it](#1-when-to-use-it)
2. [Connecting](#2-connecting)
3. [The two panes](#3-the-two-panes)
4. [Estimate against Execute](#4-estimate-against-execute)
5. [Comparing both](#5-comparing-both)
6. [Reading the metrics](#6-reading-the-metrics)
7. [Only SELECT is allowed](#7-only-select-is-allowed)
8. [How to compare fairly](#8-how-to-compare-fairly)
9. [When something does not work](#9-when-something-does-not-work)

---

## 1. When to use it

Any time you are about to change a query and want evidence rather than a
feeling.

Typical moments:

- You rewrote a subquery as a join, or the other way round
- You added a filter and want to know how much it actually skips
- Someone suggested an alternative and you want to check the claim
- You added an index and want to see whether the query now uses it
- You are choosing between two ways of aggregating

### Where it fits alongside the other tools

**Query Comparison** answers "is B better than A".

The [Query Profiler](query-profiler.md) answers "where does the time go in this
one query". Use it when you know a query is slow and do not yet know why.

[Query Metrics](query-metrics.md) answers "what is the cluster doing right now".

Comparison is the one to reach for when you already have a candidate rewrite.

---

## 2. Connecting

Query Comparison runs under its own ClickHouse® credentials, entered in a
compact connect step at the top.

This is separate from the main SQL Editor's connection on purpose. You can
compare queries as one user while the editor is connected as another, which
matters when you are checking how a query behaves for a specific account's
permissions or settings profile.

**Disconnect** when you are finished. There is also a fullscreen mode, which is
worth using: two query panes and a metrics table want the room.

---

## 3. The two panes

Each pane is an independent editor with its own actions. Nothing is shared
between them except the connection.

The editor uses the connected server's own keyword and function lists for
highlighting, so it reflects the version you are actually querying rather than a
generic ClickHouse® dialect.

**A convention worth keeping:** left is the current query, right is the
candidate. When you come back to a comparison later, or show it to someone else,
that consistency saves explaining.

---

## 4. Estimate against Execute

Two different actions, and the difference matters.

### Estimate

Shows that query's cost estimate without running it.

Fast, and it touches nothing. Use it freely, including on queries you would not
want to actually run.

An estimate is ClickHouse® reasoning about what the query would have to read
based on table metadata. It is good at "this reads a hundred times more than
that" and less good at exact numbers.

### Execute

Actually runs the query on the cluster and shows the results.

The result table keeps the first N rows in view and tells you when output was
truncated from a larger total, so you know you are looking at a sample rather
than everything.

**Execute really runs.** On a large query that means real load on your cluster.
Estimate first, and only execute when you need the real timing or want to see
the rows.

### Which to trust

**Estimate for how much data a query must read.** That is what an index or a
better filter changes, and it is stable regardless of what else the cluster is
doing.

**Execute for actual duration and memory.** Those depend on caches, concurrency
and hardware, so they are the truth about right now rather than about the query
in isolation.

A rewrite that halves rows read is genuinely better. A rewrite that ran faster
once may only have benefited from a warm cache.

---

## 5. Comparing both

The **Compare** action estimates both queries together and shows a side by side
metric comparison.

Because both are estimated in the same operation, they are judged on the same
footing: the same table statistics, the same moment, no interference from one
having run first and warmed something.

This is the action to use for the actual decision. The individual Estimate and
Execute buttons are for exploring one side.

---

## 6. Reading the metrics

Ten metrics, in two groups.

### From the estimate

| Metric | Means |
|---|---|
| Estimated rows read | How many rows ClickHouse® expects to read |
| Parts touched | How many data parts must be opened |
| Marks touched | How many index marks are involved |
| Tables involved | How many tables the query reads |

**Estimated rows read is the headline.** Most query performance is about not
reading things, so a rewrite that reads far less is almost always better,
whatever the timing says on any given run.

**Parts touched** tells you whether a filter is letting ClickHouse® skip parts.
A query filtering on the sort key should touch few parts; one touching all of
them is scanning.

**Marks touched** is the finer-grained version of the same idea. A large drop in
marks usually means an index started being used.

### From execution

| Metric | Means |
|---|---|
| Result rows | Rows returned |
| Rows read | Rows actually read |
| Data read | Bytes actually read |
| Duration | Wall clock time |
| Memory, peak | The highest memory the query used |
| Rows written | Rows written, for queries that write |

**Rows read against result rows** is the most informative ratio here. Reading
ten million rows to return ten means the work is in finding them, and that is
where an index or a better filter helps.

**Duration** is what people look at first and the least stable number on the
page. It moves with cache state and cluster load. Use it to confirm a
conclusion, not to reach one.

**Memory peak** matters when a query is close to a limit. A rewrite that is
slightly slower but uses much less memory is often the better choice on a busy
cluster, because it is the one that will not fail under concurrency.

### What a good result looks like

Fewer rows read, fewer parts touched, similar result rows. That combination
means the rewrite finds the same answer by reading less, which holds up
regardless of what the cluster is doing.

Be suspicious when result rows differ. See below.

---

## 7. Only SELECT is allowed

Query Comparison accepts SELECT queries only.

That is because Execute really runs the statement. A comparison tool that
executes whatever you type would be one careless paste away from running a
`DROP` on a production cluster.

To compare something that writes, compare the SELECT that produces the rows.
That is where the cost is anyway.

---

## 8. How to compare fairly

The tool makes this easy to get right, and easy to get wrong.

**Compare the same result.** If the two queries return different rows, you are
not comparing implementations, you are comparing questions. Check result rows
match before believing anything else.

**Estimate before you execute.** It costs nothing and often decides the matter.

**Do not trust a single execution.** The first run of either query may pay for
cold caches. If duration is what you care about, run each a few times.

**Watch for a cache advantage.** Executing A then B gives B whatever A warmed.
If they touch the same data, that alone can make B look faster. Compare
estimates to sidestep this entirely.

**Change one thing.** A rewrite that changes the join, the filter and the
aggregation tells you the combination is better without telling you which part
mattered.

**Check it still uses your index.** After adding an index, compare the query
before and after. If parts and marks touched do not drop, the index is not being
used, and [Indexes and Projections](indexes.md) explains the usual reasons.

---

## 9. When something does not work

### It says only SELECT queries are allowed

By design. See [section 7](#7-only-select-is-allowed).

### The two queries return different row counts

They are not equivalent. Fix that before comparing performance, because a query
returning fewer rows will usually look faster for the wrong reason.

Common causes are a join changing from inner to left, a filter applied at a
different point, or a `LIMIT` on one side only.

### The results table looks incomplete

It keeps the first N rows in view and says when output was truncated from a
larger total. That is the tool telling you it is showing a sample.

For the full result, run the query in the [SQL Editor](sql-editor.md), which is
built for working with results.

### The estimate and the execution disagree

Normal. An estimate is based on table metadata; execution is what actually
happened.

A large disagreement is itself informative, and usually means the data is
distributed differently from what the metadata suggests. Recently inserted data
that has not merged yet is a common cause.

### Duration varies a lot between runs

Cache state and cluster load. Compare estimates instead, or run each query
several times and use the pattern rather than a single number.

### I cannot connect

The connect step needs valid ClickHouse® credentials, separate from the main
editor's. If those work in the editor and not here, check they are being entered
in full: this step does not inherit the editor's connection.

---

## Related pages

- [SQL Editor](sql-editor.md) for writing and running queries normally
- [Query Profiler](query-profiler.md) for where the time goes inside one query
- [Query Metrics](query-metrics.md) for what the cluster is doing now
- [Indexes and Projections](indexes.md) when the answer is to read less
