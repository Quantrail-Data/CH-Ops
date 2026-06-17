# Processors Profile

## What It Does

The Processors Profile page shows you exactly how ClickHouse® executed a specific query as a visual pipeline diagram.

When you run a query, ClickHouse® does not execute it as a single operation. It breaks the work into a chain of small steps called "processors." For example, a query like `SELECT count() FROM table WHERE x > 10` might flow through these steps:

```
Read data from disk
    |
Filter rows where x > 10
    |
Count the matching rows
    |
Send the result to you
```

In reality, ClickHouse® runs many of these steps in parallel across multiple threads, creating a tree-shaped pipeline with branches that fork and merge. The Processors Profile page renders this full pipeline as an interactive diagram where you can see how long each step took and where the bottleneck is.

## How to Use It

### Step 1: Open the page

Go to **Query Tools > Processors Profile** in the sidebar.

### Step 2: Load queries

The page shows a filter box at the top. The default filter finds SELECT queries that finished in the last 24 hours. Click **Apply** to load matching queries into the dropdown below the filter.

You can change the filter to narrow the results. The filter is a raw ClickHouse® WHERE clause against `system.query_log`. Examples:

| What you want | Filter |
|---------------|--------|
| Last 24 hours (default) | `type = 'QueryFinish' AND query_kind = 'Select' AND event_time > now() - INTERVAL 24 HOUR` |
| Queries by a specific user | `type = 'QueryFinish' AND user = 'analyst' AND event_time > now() - INTERVAL 24 HOUR` |
| Slow queries only | `type = 'QueryFinish' AND query_duration_ms > 5000 AND event_time > now() - INTERVAL 7 DAY` |
| Queries on a specific table | `type = 'QueryFinish' AND query LIKE '%my_table%' AND event_time > now() - INTERVAL 24 HOUR` |

### Step 3: Select a query

Pick a query from the dropdown. Each entry shows: timestamp, user, duration, query ID, and a preview of the SQL.

The pipeline diagram renders automatically. The most recent query is auto-selected when you click Apply.

### Step 4: Read the diagram

The diagram shows the execution pipeline flowing top to bottom:

- **Each box** is one processor (a step in the pipeline)
- **Lines between boxes** show data flow from one step to the next
- **Box color** indicates how long that step took:
  - White = fast
  - Light orange = moderate
  - Deep orange = slow (the bottleneck)
- The **legend bar** in the top-left corner shows the color scale with actual time values

### Step 5: Inspect a processor

Click any box to open the detail panel on the right side. It shows:

| Field | What it means |
|-------|---------------|
| Processor | The processor type name (e.g., ReadFromMergeTree, AggregatingTransform) |
| Uniq ID | The unique identifier for this specific processor instance |
| Step | The execution step this processor belongs to |
| Elapsed | Total time this processor spent doing work |
| Input wait | Time waiting for data from the previous processor |
| Output wait | Time waiting for the next processor to accept data |
| Input rows | Number of rows received |
| Input bytes | Volume of data received |
| Output rows | Number of rows sent to the next processor |
| Output bytes | Volume of data sent |

### Step 6: Navigate large pipelines

For complex queries with many processors:

- **Scroll wheel** to zoom in and out
- **Click and drag** the canvas to pan
- **MiniMap** (bottom-right corner) shows an overview of the full pipeline with heatmap colors. Click anywhere on it to jump to that area.
- **Controls** (bottom-left corner) have zoom in, zoom out, and fit-to-view buttons

## What the Colors Tell You

The heatmap makes bottlenecks visible at a glance. Here are common patterns:

**One deep orange node, everything else white.** A single processor is the bottleneck. Look at its name:
- `ReadFromMergeTree` = slow disk reads. Consider adding an index or using a more selective WHERE clause.
- `AggregatingTransform` = expensive aggregation. Consider pre-aggregating with a materialized view.
- `SortingTransform` = heavy sort. Consider an ORDER BY key that matches your query.

**Multiple orange nodes in a chain.** The pipeline has a sequential bottleneck. Data flows slowly through several stages. Check if the upstream processor is passing too many rows (look at Output rows in the detail panel).

**Orange "wait" values, low "elapsed."** A processor is fast but starved for input. The bottleneck is upstream. Look at the processor feeding data into this one.

**Everything is roughly the same color.** The workload is evenly distributed. There is no single bottleneck. Performance improvement requires reducing the overall data volume (better filtering, sampling, or fewer columns).

## When the Diagram is Empty

If the diagram renders but all nodes are white with no heatmap:

- The query may have run with `log_processors_profiles = 0` (the server setting that enables profiling). Ask your DBA to enable it.
- The profile log entries may have aged out. ClickHouse® rotates `system.processors_profile_log` based on configured retention. Recent queries are more likely to have data.

## Prerequisite: ClickHouse® Settings

For the Processors Profile to show data, the ClickHouse® server needs:

```xml
<profiles>
    <default>
        <log_processors_profiles>1</log_processors_profiles>
    </default>
</profiles>
```

This is enabled by default in ClickHouse® 22.3 and later. If you are running an older version, ask your DBA to add it to the server configuration.

## How It Differs from Query Profiler

CHOps has two profiling tools. They answer different questions:

| | Query Profiler (flame graph) | Processors Profile (pipeline diagram) |
|-|------------------------------|---------------------------------------|
| Data source | `system.trace_log` | `system.processors_profile_log` |
| Shows | Which C++ functions inside ClickHouse® took time | Which logical pipeline steps took time |
| Best for | ClickHouse® developers debugging engine internals | ClickHouse® users and DBAs optimizing queries |
| Example insight | "72% of time in `ReadPoolExecution::read`" | "`ReadFromMergeTree` took 7.2s, `AggregatingTransform` took 0.3s" |
| Actionable for users | Rarely (internal function names are opaque) | Always (processor names map to query plan steps) |

Use the **Processors Profile** first. If it points to a specific processor but you need deeper detail on why that processor is slow, switch to the **Query Profiler** for function-level breakdown.
