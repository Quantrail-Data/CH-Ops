# Query Comparison

Query Comparison puts two read-only queries side by side, so you can see which performs better before you commit to a rewrite.

The left pane, **Current query**, holds what you have now. The right pane, **Experimental query**, holds the version you are considering. You can estimate either, run either, or compare the estimates of both.

To open it, go to **SQL Tools > SQL Editor** and select **Comparison** in the editor mode list at the left of the toolbar.

---

## Contents

1. [When to use it](#1-when-to-use-it)
2. [Connecting](#2-connecting)
3. [The two panes](#3-the-two-panes)
4. [Estimate against Execute](#4-estimate-against-execute)
5. [Comparing both](#5-comparing-both)
6. [Reading the metrics](#6-reading-the-metrics)
7. [Only read-only queries are allowed](#7-only-read-only-queries-are-allowed)
8. [How to compare fairly](#8-how-to-compare-fairly)
9. [When something does not work](#9-when-something-does-not-work)

---

## 1. When to use it

Use it any time you are about to change a query and want evidence rather than a feeling.

Typical moments:

- You rewrote a subquery as a join, or the other way round.
- You added a filter and want to know how much it actually skips.
- Someone suggested an alternative and you want to check the claim.
- You added an index and want to see whether the query now uses it.
- You are choosing between two ways to aggregate.

### Where it fits alongside the other tools

**Query Comparison** answers "is B better than A".

The [Query Profiler](query-profiler.md) answers "where does the time go in this one query". Use it when you know a query is slow and do not yet know why.

[Query Metrics](query-metrics.md) answers "how did this one query use resources, second by second".

Comparison is the one to reach for when you already have a candidate rewrite.

---

## 2. Connecting

Query Comparison runs under your ClickHouse&reg; credentials.

If the SQL Editor is already connected, Comparison mode uses the same connection, so you do not have to connect again.

If not, connect in the toolbar:

1. Type your ClickHouse&reg; user in the **user** box.
2. Type the password in the **password** box.
3. Click **Go**, or press Enter in either box.

CHOps checks the credentials with `SELECT 1` on the node selected in the navbar. If the check fails, the error appears next to the **Go** button.

To disconnect, click the logout icon next to your user. Its tooltip is "Disconnect and clear credentials". This also clears the stored credentials of the SQL Editor and Qurioz.

Click **Fullscreen** to give the two panes and the metrics table more room. Click **Exit Fullscreen** or press Escape to go back.

---

## 3. The two panes

Each pane is an independent editor with its own **Estimate** and **Execute** buttons. They share nothing except the connection.

The **Experimental query** pane also has the **DB Schema/Estimate** and **Generate SQL** buttons. They work as in the SQL Editor. See [Generating SQL with AI](sql-editor.md#generating-sql-with-ai).

The editor uses the connected server's own keyword and function lists for highlighting, so it reflects the version you actually query, not a generic ClickHouse&reg; dialect.

**A convention worth keeping:** left is the current query, right is the candidate. When you come back to a comparison later, or show it to someone else, that consistency saves an explanation.

---

## 4. Estimate against Execute

These are two different actions, and the difference matters.

### Estimate

Shows that query's cost estimate without a run.

It is fast and it touches nothing. Use it freely, including on queries you would not want to actually run.

An estimate is ClickHouse&reg; reasoning about what the query would have to read, based on table metadata. It is good at "this reads a hundred times more than that" and less good at exact numbers.

### Execute

Runs the query on the cluster and shows the results.

The result table shows the first 100 rows. If the query returns more, a note says "Results truncated to the first 100 rows" with the total.

**Execute really runs.** On a large query, that means real load on your cluster. Estimate first, and execute only when you want to see the rows.

### Which to trust

**Estimate for how much data a query must read.** That is what an index or a better filter changes, and it is stable whatever else the cluster does.

**Run in the SQL Editor for actual duration and memory.** Comparison mode does not show them, but the statistics bar of the SQL Editor does after each run. They depend on caches, concurrency, and hardware, so they tell you about now, not about the query alone.

A rewrite that halves rows read is genuinely better. A rewrite that ran faster once may only have benefited from a warm cache.

---

## 5. Comparing both

The **Compare** button in the toolbar estimates both queries together. It shows the table **Comparison (Estimated)**, with the columns **Left (current)** and **Right (experimental)**. **Compare** is available when you are connected and both panes contain SQL.

Because CHOps estimates both at the same time, it judges them on the same footing: the same table statistics, the same moment, and no interference from one that ran first and warmed something.

This is the action to use for the actual decision. The **Estimate** and **Execute** buttons of each pane are for exploring one side.

---

## 6. Reading the metrics

The **Comparison (Estimated)** table shows four metrics.

### From the estimate

| Metric | Means |
|---|---|
| Estimated rows read | How many rows ClickHouse&reg; expects to read |
| Parts touched | How many data parts must be opened |
| Marks touched | How many index marks are involved |
| Tables involved | How many tables the query reads |

**Estimated rows read is the headline.** Most query performance is about not reading things, so a rewrite that reads far less is almost always better, whatever the timing says on any given run.

**Parts touched** tells you whether a filter lets ClickHouse&reg; skip parts. A query that filters on the sort key should touch few parts. One that touches all of them is scanning.

**Marks touched** is the finer-grained version of the same idea. A large drop in marks usually means an index started to be used.

### From execution

Comparison mode does not show execution metrics. To compare rows read, duration, and memory, run each query in the [SQL Editor](sql-editor.md) and read its statistics bar.

**Rows read against rows returned** is the most informative ratio. If a query reads ten million rows to return ten, the work is in finding them, and that is where an index or a better filter helps.

**Duration** is the least stable number. It moves with cache state and cluster load. Use it to confirm a conclusion, not to reach one.

**Peak memory** matters when a query is close to a limit. A rewrite that is slightly slower but uses much less memory is often the better choice on a busy cluster.

### What a good result looks like

Fewer rows read, fewer parts touched, the same result. That combination means the rewrite finds the same answer by a smaller read, which holds up whatever the cluster does.

Be suspicious when result rows differ. See below.

---

## 7. Only read-only queries are allowed

Query Comparison accepts read-only queries only: `SELECT`, and its read-only relatives `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`, and `EXISTS`. It blocks anything that writes.

This is because Execute really runs the statement. A blocked statement shows "Comparison mode only supports read-only queries (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, EXISTS). Other statements are blocked here for safety."

To compare something that writes, compare the SELECT that produces the rows. That is where the cost is anyway.

---

## 8. How to compare fairly

The tool makes this easy to get right, and easy to get wrong.

**Compare the same result.** If the two queries return different rows, you are not comparing implementations. You are comparing questions. Execute both and check that the results match before you believe anything else.

**Estimate before you execute.** It costs nothing and often decides the matter.

**Do not trust a single execution.** The first run of either query may pay for cold caches. If duration is what you care about, run each a few times in the SQL Editor.

**Watch for a cache advantage.** If you execute A and then B, B gets whatever A warmed. If they touch the same data, that alone can make B look faster. Compare estimates to sidestep this entirely.

**Change one thing.** A rewrite that changes the join, the filter, and the aggregation tells you the combination is better without it telling you which part mattered.

**Check it still uses your index.** After you add an index, compare the query before and after. If parts and marks touched do not drop, the query is not using the index, and [Indexes and Projections](indexes.md) explains the usual reasons.

---

## 9. When something does not work

### It says only read-only queries are allowed

This is by design. Comparison mode runs the statement, so it blocks writes. See [section 7](#7-only-read-only-queries-are-allowed).

### The two queries return different row counts

They are not equivalent. Fix that before you compare performance, because a query that returns fewer rows usually looks faster for the wrong reason.

Common causes are a join changed from inner to left, a filter applied at a different point, or a `LIMIT` on one side only.

### The results table looks incomplete

It shows the first 100 rows and says when the output was truncated from a larger total.

For the full result, run the query in the [SQL Editor](sql-editor.md), which is built for work with results.

### The estimate and the execution disagree

This is normal. An estimate is based on table metadata. Execution is what actually happened.

A large disagreement is itself informative, and it usually means the data is distributed differently from what the metadata suggests. Recently inserted data that has not merged yet is a common cause.

### Duration varies a lot between runs

Cache state and cluster load. Compare estimates instead, or run each query several times and use the pattern rather than a single number.

### I cannot connect

The connect step needs valid ClickHouse&reg; credentials for the node selected in the navbar. Read the error next to the **Go** button. If the SQL Editor is connected, Comparison mode uses that connection. Disconnect and connect again to use a different user.

---

## Related pages

- [SQL Editor](sql-editor.md) to write and run queries normally
- [Query Profiler](query-profiler.md) for where the time goes inside one query
- [Query Metrics](query-metrics.md) for how one query used resources over time
- [Indexes and Projections](indexes.md) when the answer is to read less
