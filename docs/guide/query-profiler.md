# Query Profiler

The Query Profiler generates interactive flame graphs that show where a query spent its time. Think of it as an X-ray of query execution, it reveals which internal functions ran, how long each took, and where the bottlenecks are.

Navigate to **Tools > Query Profiler** to get started.

---

## What Is a Flame Graph?

A flame graph is a visualization of a program's call stack. It answers the question: "where did my query spend its time?"

- The **bottom** of the chart is where execution starts (the entry point)
- Each **bar** represents a function that was called during the query
- The **width** of a bar shows how much time (or memory) that function used, wider bars mean more time
- Bars **stacked on top** of each other show the call chain: "function A called function B, which called function C"
- **Towers** (narrow tall stacks) mean the query had many parallel code paths. **Wide bars** mean one function dominated execution time.

You don't need to understand C++ or ClickHouse® internals to use flame graphs. Look for the widest bars, those are where your query is spending the most time. If the widest bar says something with "Read" or "Disk", your query is IO-bound. If it says "Hash" or "Aggregate", it's doing heavy computation.

---

## Getting Started

1. Set the **From** and **To** datetime fields to a range where you ran the query you want to analyze (default: last 1 hour)
2. Click **Load Queries**
3. A list appears showing queries that have profiling data. Each entry shows:
   - The query ID (a unique identifier ClickHouse® assigns to every query)
   - A preview of the SQL text
   - How long the query ran
   - How many profiling samples were collected
4. Click on a query to see its full details in a popup. Click **Use This Query** to select it.
5. Choose a **Trace Type** (start with "CPU Time", the most common choice)
6. Click **Generate Flame Graph**

The flame graph appears below. Hover over any bar to see the function name and its percentage of total time. Click a bar to zoom into that subtree (everything above it fills the full width). Use the Reset zoom button in the toolbar above the graph to zoom back out.

---

## Trace Types

ClickHouse® collects different kinds of profiling data. Each trace type answers a different question:

| Trace Type | What It Answers | When to Use |
|-----------|-----------------|-------------|
| **All Types** | "Show me everything" | Good starting point for a general overview |
| **CPU Time** | "Where is my query burning CPU cycles?" | The most common choice. Use when a query is slow and you suspect computation is the bottleneck. |
| **Wall Clock (Real)** | "Where is my query spending wall-clock time, including waits?" | Use when a query is slow but CPU usage is low. This reveals time spent waiting for disk, network, or locks. |
| **Memory (Watermark)** | "What caused the biggest memory allocations?" | Use when a query is killed for exceeding memory limits. |
| **Memory (Sampled)** | "What's the statistical distribution of memory usage?" | Use for a broader view of memory allocation patterns. |
| **Memory Peak** | "What caused peak memory usage?" | Use to find the exact function responsible for the memory highwater mark. |
| **Profile Events** | "Which internal counters incremented the most?" | Advanced. Correlates with specific ProfileEvent counters. |
| **Jemalloc Samples** | "What's happening inside the memory allocator?" | Advanced. Useful for debugging memory fragmentation. |
| **Instrumentation** | "What do XRay instrumentation traces show?" | Advanced. Requires `SYSTEM INSTRUMENT` to be enabled. |

**Tip:** Start with **CPU Time**. If the flame graph is narrow (few wide bars), the query is CPU-bound in a specific function. If you see many thin bars spread wide, try **Wall Clock** to see if the query is actually waiting on IO.

---

## Memory Context Filter

When using **Memory (Watermark)** or **Memory Peak** trace types, an additional dropdown appears that lets you filter by which part of the system allocated the memory:

| Context | What It Filters To |
|---------|-------------------|
| All Contexts | No filter, shows all memory allocations |
| Global | Only server-level allocations (shared across all queries) |
| User | Only user/merge context allocations |
| Process | Only this query's allocations (most useful for per-query analysis) |
| Thread | Only thread-level allocations within this query |

**Tip:** Choose **Process** to isolate your query's memory usage from background server activity.

---

## Reading the Flame Graph

Here's how to interpret what you see:

#### Scenario 1: One Very Wide Bar Near the Top

The query is dominated by a single function. Read the function name, it tells you the bottleneck. Common examples:

- `ReadBufferFromFileDescriptor` means the query is reading from disk (IO-bound). Consider adding indexes or projections to reduce the amount of data scanned.
- `HashTable::insert` means the query is building a hash table for GROUP BY or JOIN (memory/CPU-bound). Consider reducing the cardinality of the GROUP BY keys or using a different JOIN algorithm.
- `MergeTreeDataSelectExecutor` means the query is scanning MergeTree data. Check if the WHERE clause aligns with the table's ORDER BY for efficient index usage.

#### Scenario 2: Many Narrow Towers

The query calls many functions, none dominating. This is typical of complex queries with JOINs, subqueries, and multiple aggregations. Look for the widest bar across all towers, that's still the biggest opportunity for optimization.

#### Scenario 3: Hex Addresses Like `0x00007f109aa53b7b`

These are system-level functions (libc, kernel) without debug symbols. The named functions above them (like `DB::MergeTreeDataSelectExecutor`) are ClickHouse®'s own code and are always readable.

To resolve the hex addresses into names, install the debug symbols package on your ClickHouse® server:

```bash
# Debian/Ubuntu
apt install clickhouse-common-static-dbg

# RHEL/CentOS
yum install clickhouse-common-static-dbg
```

After installing, new queries will have fully resolved function names. Existing trace data cannot be retroactively resolved.

---

## Flame Graph Controls

| Action | How |
|--------|-----|
| See function details | Hover over any bar |
| Zoom into a subtree | Click any bar (that function becomes the full width) |
| Zoom out / reset | Click the Reset zoom button in the toolbar above the graph |
| Download as image | Click the Save button in the toolbar above the graph |
| Full screen | Click the Full screen button in the toolbar above the graph |

---

## How It Works Under the Hood

ClickHouse® samples running queries at approximately 1000Hz (1000 times per second). Each sample captures the full call stack as an array of memory addresses. These samples are stored in the `system.trace_log` table.

When you click Generate Flame Graph, CHOps runs this SQL:

```sql
SELECT
  arrayStringConcat(
    arrayReverse(arrayMap(x -> demangle(addressToSymbol(x)), trace)),
    ';'
  ) AS stack,
  count() AS samples
FROM system.trace_log
WHERE query_id = '...'
  AND trace_type = 'CPU'
  AND event_time >= '...' AND event_time <= '...'
GROUP BY stack
SETTINGS allow_introspection_functions = 1
```

What each part does:

| Function | Purpose |
|----------|---------|
| `addressToSymbol(x)` | Converts a memory address to a C++ symbol name |
| `demangle(...)` | Converts mangled C++ names to human-readable form |
| `arrayReverse(...)` | Puts the root function at position 0 (bottom of flame graph) |
| `arrayStringConcat(..., ';')` | Joins the stack into a semicolon-delimited string |
| `GROUP BY stack` | Counts how many samples had each exact call chain |
| `allow_introspection_functions = 1` | Required setting, passed automatically |

The result is a set of folded stacks like `DB::executeQuery;DB::InterpreterSelectQuery;...;ReadBufferFromFileDescriptor 42`. CHOps parses these into a tree and renders the flame graph using ECharts.

---

## Prerequisites

| Requirement | Why | How to Check |
|-------------|-----|-------------|
| `trace_log` enabled | Profiling samples are stored here | `SELECT count() FROM system.trace_log`, if it errors, the table is disabled |
| `allow_introspection_functions` | Needed for `addressToSymbol` and `demangle` | CHOps passes this automatically |
| SELECT access on `system.trace_log` and `system.query_log` | The ClickHouse® user needs permission | `GRANT SELECT ON system.trace_log TO your_user` |
| `clickhouse-common-static-dbg` (optional) | Resolves hex addresses to function names | `dpkg -l clickhouse-common-static-dbg` on Debian/Ubuntu |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "No trace data found" | Query was too fast (< 100ms), so ClickHouse® collected zero samples | Run a heavier query. ClickHouse® samples at ~1000Hz, so queries under 1ms may not register. |
| All bars show hex addresses | Debug symbols not installed on the ClickHouse® server | Install `clickhouse-common-static-dbg` |
| Flame graph is flat (no towers) | Single linear call stack, the query used only one code path | Try CPU or Real trace type on a query with parallelism (e.g., a large SELECT with multiple threads) |
| No queries in the list | No queries with trace data in the selected time range | Widen the time range, or run a query that lasts at least 100ms |
| "More than 500 queries" warning | Many queries with trace data | Narrow the time range or use the search box to find a specific query |

---

## Tips

- **Short queries (< 100ms)** may have zero trace samples. Run a heavier query to generate meaningful flame graphs.
- **CPU vs Real**: if the CPU flame graph looks narrow but Real is wide, the query is spending time waiting (IO, locks, network). Compare both to understand whether the bottleneck is computation or waiting.
- **Memory flame graph**: use the **Process** context filter to isolate the query's own allocations from server-level noise.
- **Try "All Types" first** for a combined view across all trace types, then narrow to specific types once you know what you're looking for.
- **Compare before and after**: generate flame graphs for a query before and after optimization (e.g., adding an index). The difference in bar widths shows the impact.
