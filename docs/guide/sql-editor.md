## SQL Editor

ClickHouse® Play-inspired query workspace with resizable schema explorer, autocomplete, EXPLAIN tree visualization, and query stats.

## Schema Explorer (Left Panel)

- **Resizable**: drag the right edge of the explorer panel to resize (160px-500px). Collapsible to a 36px icon-only strip.
- **Database dropdown**: populated from `system.databases`
- **Table list**: fetched from `system.tables` with `name` and `engine` fields
- **Engine icons**: 60+ icons mapped by `engine` field (not table name). Priority order: Views -> MergeTree/Log -> Data Lake (Iceberg/Delta/Hudi) -> Queues (Kafka/RabbitMQ/S3Queue) -> Cloud (S3/GCS/Azure) -> External DB -> others
- **View DDL button**: code icon next to each table. Opens modal with `SHOW CREATE TABLE` output, Copy button
- Click table name to insert `db.table` into editor

## Query Editor (Center)

- Custom textarea+pre overlay with syntax highlighting (zero external deps)
- **Autocomplete**: from `system.keywords` and `system.functions`, triggered on typing
- **Ctrl+Enter** to run
- **Fullscreen mode**: toggle with labeled button
- Default 10-line height, resizable

## EXPLAIN Button

Dropdown with 9 EXPLAIN types:

| Option | ClickHouse® Query | CHOps Rendering |
|--------|-----------------|-------------------|
| AST | `EXPLAIN AST SELECT ...` | Text table |
| SYNTAX | `EXPLAIN SYNTAX SELECT ...` | Text table |
| QUERY TREE | `EXPLAIN QUERY TREE SELECT ...` | Text table |
| PLAN | `EXPLAIN PLAN SELECT ...` | Text table |
| PIPELINE | `EXPLAIN PIPELINE SELECT ...` | Text table |
| ESTIMATE | `EXPLAIN ESTIMATE SELECT ...` | Text table |
| **AST (graph)** | `EXPLAIN AST graph = 1 SELECT ...` | **ECharts top-to-bottom tree** |
| **PIPELINE (graph)** | `EXPLAIN PIPELINE graph = 1 SELECT ...` | **ECharts top-to-bottom tree** |
| **PLAN (JSON)** | `EXPLAIN json = 1, description = 0 SELECT ...` | **Pretty-printed JSON tree** |

#### DOT Graph Rendering

When ClickHouse® returns DOT language output (`digraph { ... }`), CHOps parses it into nodes and edges and renders an interactive ECharts tree chart. The graph auto-enters fullscreen mode when detected and is only visible in fullscreen (exiting fullscreen hides it).

Features:
- Top-to-bottom orientation (`orient: 'TB'`), polyline edges
- Category-based colors using golden-angle hue spacing (ReadFrom, Filter, Sort/Limit, Aggregate, Join, Transform, Output, Other)
- Tree built from DAG: finds root nodes (no incoming edges), then DFS traversal
- `wrapLabel()` splits PascalCase names at camelCase boundaries and wraps at ~18 chars (e.g. `ReadFromMergeTree` becomes two lines). Labels sit below each node, center-aligned.
- Auto-sized via `treeSizeTB()`: width = `leaves * 160 + 200`, height = `depth * 120 + 280`
- Chart centered in scroll container with horizontal and vertical scrollbars
- Button zoom scales chart pixel dimensions and `symbolSize` together. Toolbar: zoom %, +, -, reset, download PNG, fullscreen exit.
- No mouse wheel zoom (interferes with page scroll). No ECharts roam.
- "Table View" button to switch to raw text

#### JSON Tree Rendering

When ClickHouse® returns JSON output, it's displayed as formatted, indented JSON in a scrollable code block. Fallback parsing unescapes `\n`/`\t` before re-parsing.

## Results Area

- **SELECT/SHOW/DESCRIBE/EXPLAIN**: DataTable with clickable cells (copies to clipboard)
- **DDL/DML** (CREATE, INSERT, ALTER, DROP, GRANT, REVOKE, SYSTEM, OPTIMIZE, TRUNCATE, KILL): Success message with context-aware text (e.g., "Created successfully.", "Insert executed successfully.")
- **Errors**: red banner with full error text
- **Query stats**: read_rows, written_rows, read_bytes, elapsed time (from X-ClickHouse®-Summary header)
- Row count displayed in status bar

## Query Proxying

All queries go through `/api/query` -> backend ClickHouse® proxy. `FORMAT JSONEachRow` is appended only to data queries (SELECT, SHOW, DESCRIBE, EXPLAIN, EXISTS, WITH).

## Query History

Every query you run is automatically saved to your browser's local storage. The history panel (accessible via the History button in the toolbar) shows your most recent queries with:

- The SQL text (click to reload into the editor)
- Row count and elapsed time
- Status indicator (green check for success, red X for errors)
- Timestamp

History is capped at 100 entries (oldest dropped first). The Clear button removes all entries. History is per-browser and per-device - it does not sync across machines.

## Query Bookmarks

Save frequently-used queries with a name for quick access. Bookmarks are stored on the server (in the app_settings table) so they persist across browsers and sessions.

To save a bookmark: write your SQL, type a name in the bookmark panel, click Save. To load a bookmark: click it in the list. To delete: click the trash icon.

Bookmarks are shared across all users (stored as a single JSON array). This is intentional - useful queries like "table sizes" or "slow queries" benefit everyone on the team.

## Export Results

After a successful SELECT query, three export buttons appear in the toolbar:

- **CSV** - comma-separated values with RFC 4180 escaping (handles commas, quotes, and newlines in values)
- **JSON** - pretty-printed JSON array with 2-space indentation
- **TSV** - tab-separated values (tabs in values replaced with spaces)

All exports happen client-side in the browser. The data is already in memory from the query response, so there is no additional server request. Files download immediately.

# Query Cost Estimation

## What It Does

The SQL Editor has two buttons for working with queries:

**Run** executes the query and returns results.

**Estimate** analyzes the query without executing it. It shows how much work ClickHouse® would do: how many rows it would scan, how many data parts it would touch, what indexes exist on the target tables, and what the execution plan looks like.

After a query finishes running, the editor also shows action buttons that link directly to profiling tools for that specific query.

---

## Using the Estimate Button

### Step 1: Write your query

Write a SELECT query in the SQL Editor as usual.

### Step 2: Click Estimate

Click the **Estimate** button (next to Run). The editor runs three analyses in parallel without touching your data:

1. **Cost Estimate** - how many rows, parts, and marks ClickHouse® would read
2. **Existing Indexes** - what primary key and data skipping indexes exist on each table
3. **Execution Plan** - the tree of operations ClickHouse® would perform

The results appear in the results panel below the editor.

### Step 3: Read the results

**Cost Estimate** shows one row per table involved in the query:

| Column | Meaning |
|--------|---------|
| Database | The database containing the table |
| Table | The table name |
| Parts | Number of data parts ClickHouse® would open. Fewer = faster. |
| Est. Rows | Estimated rows ClickHouse® would read. This is the key number. |
| Marks | Number of index marks to scan. Each mark covers 8,192 rows by default. |

If the query involves multiple tables (JOINs), each table gets its own row with a total at the bottom.

**Existing Indexes** shows what indexes each table already has:

- **ORDER BY** (sorting key): determines which queries benefit from primary key pruning. If your WHERE clause filters on columns in the ORDER BY, ClickHouse® can skip irrelevant data parts entirely.
- **PRIMARY KEY**: usually the same as ORDER BY. If different, it is a prefix of the sorting key.
- **Data Skipping Indexes** (bloom_filter, minmax, set, tokenbf): help ClickHouse® skip granules within a data part. Each index shows its name, type, the expression it covers, and its granularity.

If a table has no data skipping indexes, it says "No data skipping indexes." This is not necessarily a problem. Tables with a good ORDER BY key may not need them.

**Execution Plan** shows the tree of operations ClickHouse® would perform:

- `ReadFromMergeTree` with a `Prewhere` or `Where` note means ClickHouse® is filtering early (good)
- `AggregatingTransform` shows where GROUP BY happens
- `SortingTransform` shows where ORDER BY happens
- `Expression` nodes compute intermediate values

### Step 4: Decide whether to run

If Est. Rows is in the billions and you expected thousands, your WHERE clause might not match the table's ORDER BY key. Check the Existing Indexes section.

If the estimate looks reasonable, click **Run**. The Estimate panel clears and normal results appear.

---

## Action Buttons After Execution

After a query finishes running, the stats bar shows:

```
[ti-check] 2.4M rows returned | 15.2M scanned | 186.4 MB | 1.243s | Mem: 84.2 MB
[ti-copy query_id] [ti-flame Flame Graph] [ti-git-branch Pipeline] [ti-chart-line Metrics]
```

**Memory usage** is fetched from `system.query_log` shortly after execution. It shows peak memory consumption.

**query_id** copies the ClickHouse® query ID to your clipboard. Useful for looking up the query in system tables or sharing with your DBA.

**Flame Graph** opens the Query Profiler with this query pre-loaded. Shows which internal functions consumed time. Best for deep performance debugging.

**Pipeline** opens the Processors Profile with this query pre-loaded. Shows the execution pipeline as an interactive DAG diagram with heatmap coloring. Best for understanding where in the query plan time was spent.

**Metrics** opens the Query Metrics page with this query pre-loaded. Shows per-second metric timelines during query execution.

---

## Common Scenarios

### "Estimated rows is huge but my WHERE clause should filter most of them"

Your WHERE clause columns are probably not in the table's ORDER BY key. ClickHouse® can only use the primary key for partition and granule pruning. Check the Existing Indexes section:

- If your filter column is in ORDER BY, the estimate should already be low. If it is still high, your filter value might span many partitions.
- If your filter column is NOT in ORDER BY, consider adding a data skipping index. The type depends on the filter: minmax for ranges, bloom_filter for equality on strings, set for IN lists.

### "Estimated rows is low but the query is still slow"

The bottleneck is not data scanning but processing. Use the Pipeline action button after running the query to see which execution step took the most time. Common culprits: heavy aggregation, large JOINs, or complex expressions.

### "The estimate says 0 parts / 0 rows"

The table might be empty, or the partition pruning eliminated all parts. This can also happen with TTL expiration or if the table uses a Distributed engine (estimates are not available for the underlying shards).

### "EXPLAIN ESTIMATE failed but EXPLAIN PLAN works"

Some query patterns are not supported by EXPLAIN ESTIMATE. This includes queries using table functions like `url()`, `s3()`, or `remote()`. The plan and index sections still render normally.

### "Action buttons do not appear after Run"

The action buttons require a query_id from ClickHouse®. If the query was very fast or the response header was not captured, the buttons may not appear. You can still find the query in the profiling tools manually using the query text or the time range filter.

---

## Tips

- **Estimate before you Run.** For ad-hoc queries on large tables, click Estimate first. A query that scans 10 billion rows will tie up your ClickHouse® node. Catching it before execution saves time.
- **Compare estimates.** Write two versions of the same query (different WHERE clauses or JOINs) and Estimate both. The version with fewer estimated rows will usually be faster.
- **Check indexes after schema changes.** If someone changed a table's ORDER BY key or dropped an index, your previously fast query might now scan everything. The Existing Indexes section makes this visible.
- **Use action buttons for post-mortems.** After a slow query finishes, the Pipeline and Flame Graph buttons give you immediate access to profiling data without navigating away or remembering the query_id.


---

## Related Tools

The Tools section includes three companion pages that work hand in hand with the SQL Editor:

- **[Query Profiler](query-profiler.md)**: flame-graph analysis of where a query spent its time.
- **[Query Metrics](query-metrics.md)**: a second-by-second resource timeline for a single query.
- **[Processors Profile](processors-profile.md)**: the execution pipeline of a query rendered as a processor graph.

After running a slow query in the editor, the action buttons take you straight into these tools for the query you just ran.
