# SQL Editor

The SQL Editor is your workspace for writing and running queries against ClickHouse®. It is built to feel familiar if you have used ClickHouse® Play, with a few extra conveniences: a schema explorer you can browse on the left, autocomplete as you type, visual diagrams of how a query will run, and clear stats after each run. The sections below walk through each part.

## Schema Explorer

The panel on the left lets you browse your databases and tables without leaving the editor, so you do not have to remember exact names.

You can drag its right edge to make it wider or narrower, or collapse it down to a thin strip of icons when you want more room for writing queries. The database dropdown lists every database on your cluster, and choosing one shows its tables underneath.

Next to each table is a small icon that hints at the table's engine at a glance, with different icons for views, MergeTree tables, data-lake formats, streaming queues, cloud storage, and external databases. There is also a code icon beside each table that opens its full `CREATE TABLE` definition in a pop-up, complete with a Copy button, which is handy when you want to check a column type or copy the schema. Clicking a table's name drops its fully qualified `database.table` name straight into the editor at your cursor.

## Writing a Query

The center of the screen is where you write. As you type, the editor highlights your SQL and offers autocomplete suggestions drawn from ClickHouse®'s own list of keywords and functions, so you spend less time double-checking syntax.

A few things make writing quicker:

- Press **Ctrl+Enter** at any time to run your query.
- The editor opens at a comfortable height and can be resized to fit longer queries.
- A **Fullscreen** button gives you a distraction-free, full-window editor when you are working on something larger.

## Seeing How a Query Will Run (EXPLAIN)

Before or instead of running a query, you can ask ClickHouse® to explain how it would carry it out. The EXPLAIN button offers several views, from the raw parsed form of your SQL all the way to the detailed execution plan. Most of these appear as readable text tables.

Three of the options are special because CHOps turns them into a visual diagram instead of text:

- **AST (graph)** draws the structure of your query as a tree.
- **PIPELINE (graph)** draws the chain of steps ClickHouse® would run.
- **PLAN (JSON)** shows the execution plan as neatly formatted, indented text you can expand and read.

When ClickHouse® returns one of the graph forms, CHOps reads it and draws it as an interactive, top-to-bottom tree diagram. The diagram opens in fullscreen so you have room to explore it. The boxes are color-coded by the kind of work each step does, such as reading data, filtering, sorting, aggregating, or joining, which makes it easy to follow the flow of the query at a glance. Long technical names are wrapped neatly so they stay readable.

You can zoom in and out, reset the view, and download the diagram as an image using the toolbar. (Zooming is done with the toolbar buttons rather than the mouse wheel, so scrolling the page never zooms the diagram by accident.) When you are done, a Table View button switches back to the raw text version.

## Reading Your Results

What appears after you run a query depends on the kind of query it was:

- For queries that return data, such as SELECT, SHOW, or DESCRIBE, you get a results table. Click any cell to copy its value to your clipboard.
- For commands that change things, such as CREATE, INSERT, ALTER, DROP, or GRANT, you get a clear success message written for that specific action, like "Created successfully" or "Insert executed successfully."
- If something goes wrong, a red banner shows you the full error text so you can see exactly what ClickHouse® reported.

Alongside the results, a status bar summarizes the run: how many rows came back, how many were scanned, how much data was read, how long it took, and how much memory it used.

## Query History

Every query you run is saved automatically to your browser, so you can always get back to something you ran earlier. Open the history panel from the History button in the toolbar to see your recent queries, each showing its SQL text (click to load it back into the editor), the row count and how long it took, a green check or red X for whether it succeeded, and when you ran it.

History keeps your most recent queries and drops the oldest as new ones come in. The Clear button empties it. One thing to note: this history lives in the browser on the device you are using, so it does not follow you to another computer.

## Query Bookmarks

When you have a query you reach for often, you can bookmark it with a name instead of rewriting it each time. Unlike history, bookmarks are saved on the server, so they stay with you across browsers and sessions.

To save one, write your SQL, type a name in the bookmark panel, and click Save. To use one later, click it in the list. To remove one, click the trash icon beside it.

Bookmarks are shared with everyone on your team. This is deliberate: genuinely useful queries, like one that lists table sizes or surfaces slow queries, are worth having on hand for the whole team.

## Exporting Results

After a SELECT query returns, three export buttons appear in the toolbar so you can take the data with you:

- **CSV** saves comma-separated values, correctly handling any commas, quotes, or line breaks inside your data.
- **JSON** saves a neatly formatted JSON array.
- **TSV** saves tab-separated values.

All three exports happen instantly in your browser using the data already on screen, so there is no extra wait and no additional load on your cluster. The file downloads right away.

## Query Cost Estimation

### What It Does

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

## Action Buttons After a Query Runs

Once a query finishes, the status bar summarizes how it went: the number of rows returned, how many were scanned, how much data was read, how long it took, and the peak memory it used. (The memory figure is looked up from ClickHouse®'s query log a moment after the query finishes, so it reflects the true peak.)

Next to those stats, a row of buttons gives you quick ways to dig deeper into the query you just ran:

- **query_id** copies ClickHouse®'s ID for the query to your clipboard, which is useful for looking it up in system tables or passing along to whoever administers your cluster.
- **Flame Graph** opens the Query Profiler with this query already loaded, showing where it spent its time. This is the one to reach for when you need to dig into performance.
- **Pipeline** opens the Processors Profile with the query loaded, showing its execution as a visual diagram so you can see which step took the most time.
- **Metrics** opens the Query Metrics page with the query loaded, showing a second-by-second view of how it used resources while it ran.

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
