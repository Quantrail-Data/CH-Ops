# Query Profiler

The Query Profiler makes interactive flame graphs. A flame graph shows where a query spent its time. It shows which internal functions ran, how long each one took, and where the slow parts are.

Go to **Tools > Query Profiler**.

---

## What is a flame graph?

A flame graph is a picture of a program's call stack. It answers one question: where did the query spend its time?

- The **bottom** bar is where execution starts. This is the entry point.
- Each **bar** is a function that ran during the query.
- The **width** of a bar shows how much time or memory that function used. A wider bar means more time.
- Bars **stacked on top** of each other show the call chain. Function A called function B, and function B called function C.
- **Narrow tall stacks** mean the query had many parallel code paths. A **wide bar** means one function used most of the time.

You do not need to know C++ or ClickHouse&reg; internals to read a flame graph. Look for the widest bars. Those are where the query spends the most time. If the widest bar has "Read" or "Disk" in its name, the query is IO-bound. If it has "Hash" or "Aggregate", the query does heavy computation.

---

## Getting started

1. Set the **From** and **To** datetime fields to the range when you ran the query. The default is the last 1 hour.
2. Click **Load Queries**.
3. A list shows the queries that have profiling data. Each entry shows the query ID, a preview of the SQL, how long the query ran, and how many profiling samples CHOps collected.
4. Click a query to see its full details. Click **Use This Query** to select it.
5. Choose a **Trace Type**. Start with **CPU Time**.
6. Click **Generate Flame Graph**.

The flame graph appears below. Hover over a bar to see the function name and its share of total time. Click a bar to zoom into that part. Click **Reset zoom** in the toolbar to zoom out.

---

## Trace types

ClickHouse&reg; collects different kinds of profiling data. Each trace type answers a different question.

| Trace Type | What it answers | When to use |
|-----------|-----------------|-------------|
| **All Types** | Show everything. | A good start for a general view. |
| **CPU Time** | Where does the query use CPU? | The most common choice. Use it when a query is slow and you think computation is the cause. |
| **Wall Clock (Real)** | Where does the query spend clock time, including waits? | Use it when a query is slow but CPU use is low. This shows time spent waiting for disk, network, or locks. |
| **Memory (Watermark)** | What caused the largest memory allocations? | Use it when a query is killed for too much memory. |
| **Memory (Sampled)** | What is the distribution of memory use? | Use it for a wider view of memory allocation. |
| **Memory Peak** | What caused the peak memory use? | Use it to find the function at the memory high point. |
| **Profile Events** | Which internal counters increased the most? | Advanced. It relates to specific ProfileEvent counters. |
| **Jemalloc Samples** | What happens inside the memory allocator? | Advanced. It helps you debug memory fragmentation. |
| **Instrumentation** | What do the XRay instrumentation traces show? | Advanced. It needs `SYSTEM INSTRUMENT` enabled. |

Start with **CPU Time**. If the flame graph has a few wide bars, the query is CPU-bound in one function. If it has many thin bars, try **Wall Clock (Real)** to see if the query waits on IO.

---

## Memory context filter

For the **Memory (Watermark)** and **Memory Peak** trace types, an extra dropdown appears. It filters by which part of the system allocated the memory.

| Context | What it shows |
|---------|-------------------|
| All Contexts | No filter. It shows all memory allocations. |
| Global (server) | Only server-level allocations, shared across all queries. |
| User (user/merge) | Only user and merge allocations. |
| Process (query) | Only this query's allocations. This is the most useful for one query. |
| Thread | Only thread-level allocations in this query. |

Choose **Process (query)** to separate your query's memory use from background server activity.

---

## How to read the flame graph

**One very wide bar near the top.** One function controls the query. Read the function name. It tells you the slow part. For example:

- `ReadBufferFromFileDescriptor`: the query reads from disk, so it is IO-bound. Add indexes or projections to read less data.
- `HashTable::insert`: the query builds a hash table for GROUP BY or JOIN. Reduce the number of GROUP BY keys, or use a different JOIN algorithm.
- `MergeTreeDataSelectExecutor`: the query scans MergeTree data. Check that the WHERE clause matches the table ORDER BY, so the query uses the index.

**Many narrow towers.** The query calls many functions, and none controls it. This is normal for complex queries with JOINs, subqueries, and several aggregations. Look for the widest bar across all towers. That is still the biggest chance to improve the query.

**Hex addresses such as `0x00007f109aa53b7b`.** These are system functions (libc, kernel) with no debug symbols. The named functions above them, such as `DB::MergeTreeDataSelectExecutor`, are ClickHouse&reg; code and are always readable. To turn the hex addresses into names, install the debug symbols on your ClickHouse&reg; server:

```bash
# Debian/Ubuntu
apt install clickhouse-common-static-dbg

# RHEL/CentOS
yum install clickhouse-common-static-dbg
```

After you install them, new queries have full function names. CHOps cannot resolve old trace data.

---

## Flame graph controls

| Action | How |
|--------|-----|
| See function details | Hover over a bar. |
| Zoom into a part | Click a bar. That function fills the full width. |
| Zoom out | Click **Reset zoom** in the toolbar. |
| Download as an image | Click **Save** in the toolbar. |
| Full screen | Click **Full screen** in the toolbar. |

---

## How it works

ClickHouse&reg; samples running queries about 1000 times per second. Each sample records the full call stack as an array of memory addresses. ClickHouse&reg; stores the samples in the `system.trace_log` table.

The **From** and **To** range and the **Trace Type** control which queries appear in the list. When you generate a flame graph, CHOps reads the samples for the selected query and runs this SQL:

```sql
SELECT
  arrayStringConcat(
    arrayReverse(arrayMap(x -> demangle(addressToSymbol(x)), trace)),
    ';'
  ) AS stack,
  count() AS samples
FROM system.trace_log
WHERE query_id = '...'
GROUP BY stack
SETTINGS allow_introspection_functions = 1
```

What each part does:

| Part | Purpose |
|----------|---------|
| `addressToSymbol(x)` | Turns a memory address into a C++ symbol name. |
| `demangle(...)` | Turns a mangled C++ name into a readable name. |
| `arrayReverse(...)` | Puts the root function first, at the bottom of the flame graph. |
| `arrayStringConcat(..., ';')` | Joins the stack into one string, separated by semicolons. |
| `GROUP BY stack` | Counts how many samples had each call chain. |
| `allow_introspection_functions = 1` | A required setting. CHOps passes it. |

CHOps parses the folded stacks into a tree. It renders the flame graph with ECharts.

---

## Prerequisites

| Requirement | Why | How to check |
|-------------|-----|-------------|
| `system.trace_log` enabled | ClickHouse&reg; stores the samples here. | Run `SELECT count() FROM system.trace_log`. An error means the table is off. |
| `allow_introspection_functions` | Needed for `addressToSymbol` and `demangle`. | CHOps passes it. |
| SELECT access on `system.trace_log` and `system.query_log` | The ClickHouse&reg; user needs read access. | `GRANT SELECT ON system.trace_log TO your_user`. |
| `clickhouse-common-static-dbg` (optional) | Turns hex addresses into function names. | `dpkg -l clickhouse-common-static-dbg` on Debian/Ubuntu. |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "No trace data found" | The query was too fast (under 100 ms), so ClickHouse&reg; collected no samples. | Run a heavier query. Queries under 1 ms may not register. |
| All bars show hex addresses | The debug symbols are not on the ClickHouse&reg; server. | Install `clickhouse-common-static-dbg`. |
| The flame graph is flat, with no towers | The query used one code path. | Try the CPU or Real trace type on a query with parallelism, for example a large SELECT with many threads. |
| No queries in the list | No queries have trace data in the time range. | Widen the time range, or run a query that lasts at least 100 ms. |
| "More than 500 queries" warning | Many queries have trace data. | Narrow the time range, or use the search box to find one query. |

---

## Tips

- Short queries (under 100 ms) may have no trace samples. Run a heavier query to get a useful flame graph.
- CPU against Real: if the CPU flame graph is narrow but Real is wide, the query waits on IO, locks, or network. Compare both to see if the cause is computation or waiting.
- For a memory flame graph, use the **Process (query)** context to separate the query's own allocations from server activity.
- Try **All Types** first for a combined view. Then narrow to one type when you know what to look for.
- Compare before and after: make a flame graph before and after a change, such as a new index. The change in bar widths shows the effect.
