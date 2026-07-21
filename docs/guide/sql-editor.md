# SQL Editor

The SQL Editor is where you write queries and run them against your ClickHouse® cluster, right from the browser. If you have used the `clickhouse-client` command line or ClickHouse® Play, it will feel familiar, but it adds the things those tools make you do by hand: a schema explorer you can click through, autocomplete that knows your tables, a one-click cost estimate before you run anything expensive, visual diagrams of how a query executes, an optional AI helper that turns a plain-English question into SQL, and clear statistics after every run.

This page walks through every part of the editor, from the very first thing you have to do (connect) to the more advanced tools power users reach for daily. If you are new to ClickHouse®, read it top to bottom. If you are experienced, the section headings and the [keyboard shortcuts](#keyboard-shortcuts) table will get you where you need to go.

---

## First: connect with your ClickHouse® credentials

Before you can browse schemas or run anything, the editor asks you to connect using **your own ClickHouse® username and password**. This is a deliberate design choice, and it is worth understanding because it shapes how everything else behaves.

Look at the toolbar just above the editor. Until you connect, you will see a small **user** and **password** box with a **Connect** button, the schema explorer on the left shows a padlock with "Connect to browse databases," and the Run and Estimate buttons are disabled.

Type the ClickHouse® user you want to work as, enter that user's password, and click **Connect** (or press Enter in either box). CHOps validates the credentials immediately by running a trivial `SELECT 1` as that user. Only if that succeeds does it unlock the editor. If the credentials are wrong or the node is unreachable, the error appears right there in the toolbar so you can fix it.

**Why a separate login when I already logged in to CHOps?** Because the SQL Editor runs every query as *you*, the ClickHouse® user, not as some shared service account. Whatever that ClickHouse® account is allowed to do is exactly what you can do in the editor: if your account is read-only, writes will be refused by ClickHouse® itself; if it has full privileges, you have full privileges. This keeps the audit trail honest and means CHOps never quietly hands you more access than your database account grants.

**What happens to my password?** The browser sends it exactly once, to connect. From then on it is encrypted (AES‑256‑GCM) and held on the CHOps server, tied to your current login session, and the browser never keeps it. Every later query is executed using that stored credential, so you never re-type the password. A few practical consequences:

- **The connection survives a page reload.** If you refresh, CHOps restores the connected state automatically, so you do not have to reconnect every time.
- **The session lasts about two hours**, matching your CHOps login. After that (or if you log out), the stored credential is cleared, and the editor will ask you to reconnect. If a query suddenly returns a "session expired, please reconnect" message, this is why: just enter your password again.
- **Disconnecting is one click.** Once connected, the toolbar shows a green plug icon with your username and node (for example `analyst @ ch-node-1:8123`) and a **logout** button beside it. Clicking it clears the stored credential and the loaded schema so nothing stale is left behind.

Switching nodes or clusters from the navbar keeps you connected: your credentials carry across the switch, and the explorer simply reloads the schema for the new target.

---

## The layout at a glance

The editor is split into three areas:

- **Left: the Schema Explorer.** Browse databases and tables, peek at a table's definition, or drop a table name straight into your query.
- **Center: the editor and toolbar.** Where you write SQL, choose how to run it, and reach the history, bookmarks, export, fullscreen, and AI controls.
- **Bottom: the results panel.** Where your rows, success messages, cost estimates, execution diagrams, and errors appear, along with a statistics bar and quick links into the profiling tools.

You can resize the explorer, collapse the editor to make more room for results, or blow the whole thing up to fullscreen. More on each below.

---

## Schema Explorer

The panel on the left lets you look through your databases and tables without leaving the editor, so you never have to remember an exact name.

Choose a database and it expands to list its tables underneath. Click a table's **name** and its fully qualified `database.table` name is dropped into the editor at your cursor, a fast way to build a query without typing (or misspelling) identifiers.

**Reading a table at a glance.** Next to every table is a small icon that hints at its engine, so you can tell types apart without opening anything: a table icon for MergeTree and log families, an eye for views (regular, materialized, and window views), stacked layers for data-lake formats (Iceberg, Hudi, Delta Lake, Hive), a broadcast icon for streaming queues (Kafka, RabbitMQ, NATS), a cloud for object storage (S3, GCS, Azure Blob, HDFS), an import icon for external databases (MySQL, PostgreSQL, MongoDB, Redis, SQLite, ODBC/JDBC), a ring for Distributed tables, a book for dictionaries, and more. Hovering a table shows its exact engine in a tooltip.

**Seeing the full definition (DDL).** Beside each table is a small code icon. Click it and CHOps runs `SHOW CREATE TABLE` for you and opens the complete `CREATE TABLE` statement in a pop-up, with a **Copy** button. This is the quickest way to check a column's type, confirm the sorting key, or copy a schema to reuse elsewhere.

**Adjusting the panel.** Drag the panel's right edge to make it wider or narrower (it remembers a comfortable range), or click **Collapse** to tuck it away when you want the maximum space for writing. The **refresh** icon in the explorer header reloads the database list, which is handy after someone creates or drops a database.

**The sparkles icon (AI database).** You will also see a small sparkles icon to the left of each database. That is part of the AI SQL feature and is explained under [Generating SQL with AI](#generating-sql-with-ai). You can ignore it entirely if you are not using AI.

---

## Writing a query

The center of the screen is the editor. As you type, your SQL is syntax-highlighted, line numbers run down the left, and the editor keeps a comfortable working height that you can grow into.

### Autocomplete

Start typing (two characters is enough) and a suggestion menu appears. The suggestions are pulled live from *your own* cluster the moment you connect, so they reflect what actually exists:

- **Keywords** and **functions** straight from ClickHouse®'s own `system.keywords` and `system.functions`.
- **Table and database names**, including fully qualified `database.table` forms, from `system.tables`.

Navigate the menu with the **Up/Down** arrows, accept a suggestion with **Enter** or **Tab**, and dismiss it with **Escape**. Because table names are included, you can type the first few letters of a table and complete it without a trip to the explorer.

### Handy editing behaviors

- **Ctrl+Enter** (or **Cmd+Enter** on a Mac) runs your query from anywhere in the editor.
- **Tab** inserts two spaces for indentation (when the autocomplete menu is not open).
- A hint line under the editor reminds you: *Ctrl+Enter to run · Ctrl+B bookmarks.*
- **Collapse SQL** hides the editor so you can give the whole screen to your results, then expand it again when you want to edit.
- **Fullscreen** gives you a distraction-free, full-window editor for larger work. Press **Escape** to exit fullscreen.

> **Size limit.** A single query is capped at 100 KB of SQL. That is enormous for hand-written queries; you will only ever hit it with machine-generated statements, and if you do, the editor tells you clearly rather than failing silently.

---

## Running a query

There are three ways to send your SQL to ClickHouse®, sitting together at the bottom-right of the editor.

### The Run button and the run-mode dropdown

Next to **Run** is a dropdown that controls *how* the query runs. It defaults to **GENERAL RUN**, which simply executes your query as written. Clicking **Run** does the same thing.

The other entries in that dropdown are **EXPLAIN** variants: instead of executing your query, they ask ClickHouse® to describe how it *would* run it. Choosing any of them runs immediately (you do not also have to click Run). These are covered in detail under [Understanding a query with EXPLAIN](#understanding-a-query-with-explain).

Because the editor executes under your ClickHouse® credentials, what a query is allowed to do is governed entirely by that account. A read-only account will have writes rejected by ClickHouse®; an account with write privileges can create, insert, alter, and drop.

### The Estimate button

**Estimate** analyzes a `SELECT` without running it, so you can see how much work it would cause before you commit to it. See [Estimating query cost](#estimating-query-cost).

### The Generate SQL button

The purple **Generate SQL** button turns a plain-English question into a query using AI. See [Generating SQL with AI](#generating-sql-with-ai).

---

## Generating SQL with AI

If your cluster has an AI provider configured (see [AI API Keys](ai-api-keys.md)), the editor can write ClickHouse® SQL for you from a question in ordinary language. It is a two-step flow.

**1. Point the assistant at a database.** In the explorer, click the **sparkles** icon next to the database you want to ask about. The first time you do this for a database, CHOps connects it to the AI service and builds an understanding of its schema; this can take a moment, and the icon spins while it works. Once ready, the icon highlights to show that database is the active one for AI. You only do this once per database, and your choice is remembered per cluster and node.

**2. Ask your question.** Type your question in plain language into the editor (for example, *"total sales by month for the last year"*), then click **Generate SQL**. While it thinks, the editor shows a rotating set of status messages. When it finishes, it replaces the contents of the editor with a tidy, formatted ClickHouse® query, preceded by a short comment block recording the question you asked and the database it targeted:

```sql
/*

--QUESTION : total sales by month for the last year?
--DATABASE_NAME : analytics

*/

SELECT ...
```

You can then read the query, tweak it, and click **Run** or **Estimate** as usual. ClickHouse® ignores the `/* ... */` comment, so you can run the result as-is.

The assistant is scoped to databases: it is built to answer questions about the connected schema and to generate ClickHouse® SQL, and it will politely decline off-topic requests. Because it replaces the editor's contents when it generates, copy anything you were working on before you click **Generate SQL** if you want to keep it.

---

## Understanding a query with EXPLAIN

Before you run something (or to learn why it behaves the way it does), you can ask ClickHouse® to explain how it would carry the query out. Pick one of the EXPLAIN entries from the run-mode dropdown next to Run. They fall into two groups.

### Text explanations

Most options return a readable text table:

| Option | What it shows |
|--------|---------------|
| **EXPLAIN** | The default plan overview. |
| **SYNTAX** | Your query after ClickHouse®'s syntax-level rewrites and optimizations. |
| **QUERY TREE** | The analyzed query tree (the newer analyzer's representation). |
| **PLAN** | The step-by-step execution plan as text. |
| **PIPELINE** | The chain of processing steps as text. |
| **ESTIMATE** | Row, part, and mark estimates per table (the same numbers the Estimate button surfaces in a friendlier layout). |

### Visual diagrams

Three options are special: CHOps reads ClickHouse®'s output and draws it as an interactive picture instead of text.

- **AST (graph)**: the structure of your query drawn as a tree.
- **PIPELINE (graph)**: the chain of execution steps drawn as a tree.
- **PLAN (JSON)**: the execution plan as neatly formatted, indented JSON you can read and expand.

When you pick one of the graph options, the diagram opens in fullscreen so you have room to explore. It is laid out top-to-bottom, and the boxes are **color-coded by the kind of work each step does** (reading data, filtering, sorting or limiting, aggregating, joining, transforming, or writing output), which makes the flow easy to follow at a glance. Long technical names are wrapped so they stay readable, and you can collapse or expand branches by clicking them.

A small toolbar sits with the diagram:

- **Zoom in / Zoom out / Reset zoom**: adjust the view. (Zoom is on buttons rather than the mouse wheel, so scrolling the page never zooms the diagram by accident.)
- **Download PNG**: save the diagram as an image.
- **View SQL**: see the exact query that produced this diagram, with a Copy button.
- **Fullscreen toggle**: expand or collapse the diagram view.

The **PLAN (JSON)** option opens a formatted JSON panel instead of a tree, for when you want the raw, precise plan.

---

## Estimating query cost

The **Estimate** button is the "measure twice, cut once" of the SQL Editor. It looks at a `SELECT` and reports how much work ClickHouse® would do, all **without touching your data**. On a large cluster this is the difference between catching a ten-billion-row scan in advance and accidentally tying up a node.

### How to use it

1. Write a `SELECT` query (plain `SELECT` or `WITH ... SELECT`; cost estimation is only available for these).
2. Click **Estimate**. CHOps runs three analyses in parallel, none of which read your table data.
3. Read the results in the panel below.

### What the estimate tells you

**Cost estimate** gives one row per table the query touches:

| Column | Meaning |
|--------|---------|
| Database | The database containing the table. |
| Table | The table name. |
| Parts | How many data parts ClickHouse® would open. Fewer is faster. |
| Est. Rows | Estimated rows ClickHouse® would read. **This is the number to watch.** |
| Marks | Index marks to scan. Each mark covers 8,192 rows by default. |

If the query joins several tables, each gets its own row, with a total at the bottom.

**Existing indexes** shows what each table already has to help it go fast:

- **ORDER BY (sorting key)**: determines which filters let ClickHouse® skip whole parts. If your `WHERE` filters on columns at the front of the ORDER BY, ClickHouse® can prune aggressively.
- **PRIMARY KEY**: usually the same as ORDER BY; when different, it is a prefix of it.
- **Data-skipping indexes**: `minmax`, `set`, `bloom_filter`, `tokenbf`, and friends, each shown with its name, type, the expression it covers, and its granularity. If a table has none, it says so, which is not necessarily a problem, since a good ORDER BY key often does the job.

**Execution plan** shows the tree of operations ClickHouse® would perform, so you can see where the heavy lifting happens: `ReadFromMergeTree` with a `Prewhere`/`Where` note means filtering happens early (good), `AggregatingTransform` is your `GROUP BY`, `SortingTransform` is your `ORDER BY`, and `Expression` nodes compute intermediate values.

### Deciding whether to run

If **Est. Rows** is in the billions but you expected thousands, your `WHERE` clause probably is not aligned with the table's ORDER BY key, so check the Existing Indexes section. If the estimate looks sensible, click **Run**: the estimate clears and normal results appear.

---

## Reading your results

What you see after a run depends on the kind of query.

- **Queries that return data** (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`, and so on) produce a **results table**. Click any cell to copy its value to your clipboard. If a query returns nothing, you get a clear "0 row(s) returned" rather than a misleading success message.
- **Commands that change things** (`CREATE`, `INSERT`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `SYSTEM`, `OPTIMIZE`, `TRUNCATE`, `KILL`) produce a **success message written for that specific action**: "Created successfully," "Insert executed successfully," "Dropped successfully," and so on. When ClickHouse® reports how many rows were written or affected, that count is appended too.
- **Errors** appear in a **red banner** showing the full text ClickHouse® returned, wrapped so even long messages stay readable. The exact database error is the fastest way to see what went wrong.

### The statistics bar

Alongside the results, a status bar summarizes the run:

- **Rows returned** (or rows written, for write statements).
- **Rows scanned** and **data read**: how much work it actually took.
- **Elapsed time**, in seconds.
- **Peak memory**: looked up from ClickHouse®'s query log a fraction of a second after the query finishes, so it reflects the true high-water mark rather than a guess. (If a query is extremely fast or a newer query starts first, the memory figure may be omitted.)

---

## Digging deeper: action buttons after a run

Once a query finishes and ClickHouse® has assigned it a query ID, a row of buttons appears in the statistics bar to take you straight into the profiling tools for *that exact query*:

- **query_id**: copies ClickHouse®'s ID for the query to your clipboard, useful for looking it up in system tables or handing to whoever administers the cluster.
- **Flame Graph**: opens the [Query Profiler](query-profiler.md) with this query loaded, showing where it spent its time. Reach for this first when something is slow.
- **Pipeline**: opens the [Processors Profile](processors-profile.md) with the query loaded, rendering its execution as a diagram so you can see which step dominated.
- **Metrics**: opens [Query Metrics](query-metrics.md) with the query loaded, showing a second-by-second view of how it used resources while it ran.

If the buttons do not appear, the run did not capture a query ID (occasionally the case for very fast queries); you can still find the query in the profiling tools by its text or time range.

---

## Query history

Every query you run is saved automatically, so you can always get back to something from earlier. Open the panel from the **History** button in the toolbar. Each entry shows:

- Its **SQL text**: click to load it back into the editor.
- The **row count** and **how long it took**.
- A green check or red X for **success or failure** (with the error text on failures).
- **When** you ran it.

History keeps your most recent queries and drops the oldest as new ones arrive. The **Clear** button empties it.

> **One thing to know:** history is stored in your browser, on the device you are using. It does not follow you to another computer, and clearing your browser data clears it. For queries you want to keep and share, use **Bookmarks** instead.

---

## Bookmarks

When there is a query you reach for often, bookmark it with a name instead of rewriting it each time.

- **Save one:** write your SQL, type a name in the bookmark panel, and click **Save**.
- **Use one:** click it in the list to load it into the editor.
- **Remove one:** click the trash icon beside it.
- **Shortcut:** **Ctrl+B** (or **Cmd+B**) toggles the bookmarks panel.

Unlike history, **bookmarks live on the server**, so they stay with you across browsers, devices, and sessions, and they are **shared with everyone on your team**. That is deliberate: a genuinely useful query, like one that lists table sizes or surfaces slow queries, is worth having on hand for the whole team.

---

## Exporting results

After a query returns rows, an **Export** dropdown appears in the toolbar with three formats:

- **CSV**: comma-separated values, correctly escaping any commas, quotes, or line breaks inside your data.
- **JSON**: a neatly formatted JSON array.
- **TSV**: tab-separated values.

Exports are built **in your browser from the data already on screen**, so there is no extra wait and no additional load on your cluster. Your browser opens a **save dialog** so you can choose where the file goes (on browsers that support the modern save-file picker); pick a location and the file is written. If you close the dialog without choosing, nothing is saved and no error is shown.

---

## Regular and Comparison modes

Beside the connect control is a small **mode** dropdown with two options:

- **Regular**: the editor described on this page.
- **Comparison**: a side-by-side view for running two queries and comparing their results and performance directly.

Switching to Comparison swaps the page for the comparison tool, which shares the same editing experience (highlighting, autocomplete, shortcuts). It is documented separately under [Query Comparison](query-comparison.md).

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl / Cmd + Enter** | Run the current query |
| **Ctrl / Cmd + B** | Toggle the Bookmarks panel |
| **Tab** | Insert two spaces (when autocomplete is closed) |
| **Up / Down** | Move through autocomplete suggestions |
| **Enter / Tab** | Accept the highlighted suggestion |
| **Escape** | Close autocomplete, or exit fullscreen |

---

## Common scenarios and troubleshooting

**"The editor is locked and asking me to connect."**
The SQL Editor runs under your own ClickHouse® credentials. Enter your ClickHouse® username and password in the toolbar and click Connect. Nothing (explorer, Run, Estimate) unlocks until that trivial `SELECT 1` validation succeeds.

**"My session expired / please reconnect."**
The stored credential lives for about two hours (matching your CHOps login) and is cleared on logout. When it lapses, just re-enter your password. This is expected behavior, not a bug: CHOps intentionally does not keep your ClickHouse® password around indefinitely.

**"Estimated rows is huge, but my WHERE clause should filter most of them."**
Your filter columns are probably not at the front of the table's ORDER BY key, so ClickHouse® cannot prune parts. Check the Existing Indexes section. If the filter column is not in ORDER BY, consider a data-skipping index: `minmax` for ranges, `bloom_filter` for equality on strings, `set` for `IN` lists.

**"Estimated rows is low, but the query is still slow."**
The bottleneck is processing, not scanning. Run the query, then use the **Pipeline** action button to see which step took the most time, usually heavy aggregation, a large join, or complex expressions.

**"The estimate says 0 parts / 0 rows."**
The table may be empty, partition pruning may have eliminated everything, or the table uses a Distributed engine (estimates are not available for the underlying shards).

**"EXPLAIN ESTIMATE failed but EXPLAIN PLAN works."**
Some patterns are not supported by EXPLAIN ESTIMATE, notably table functions like `url()`, `s3()`, and `remote()`. The plan and index sections still render.

**"Action buttons did not appear after Run."**
They need a query ID from ClickHouse®. If the query was very fast or the ID was not captured, they may be skipped. Find the query in the profiling tools by text or time range instead.

**"Generate SQL isn't doing anything / errors out."**
Make sure an AI provider is configured (see [AI API Keys](ai-api-keys.md)) and that you have selected a database for AI first by clicking its sparkles icon in the explorer. Also note that generating replaces whatever is currently in the editor.

---

## Tips

- **Estimate before you Run** on large tables. Catching a ten-billion-row scan before it starts saves everyone's afternoon.
- **Compare two versions.** Write two variants of the same query and Estimate both; the one with fewer estimated rows is usually faster. For a closer look, use Comparison mode.
- **Re-check indexes after schema changes.** If someone alters an ORDER BY key or drops an index, a query that used to be fast may now scan everything, and the Existing Indexes section makes that visible.
- **Use the action buttons for post-mortems.** After a slow query, Flame Graph and Pipeline give you profiling data instantly, without navigating away or remembering the query ID.
- **Bookmark team queries, don't rely on history.** History is per-device and disposable; bookmarks are shared and permanent.

---

## Related tools

The Tools section includes three companion pages that pair naturally with the SQL Editor. After running a query, the action buttons take you straight into them for the query you just ran:

- **[Query Profiler](query-profiler.md)**: flame-graph analysis of where a query spent its time.
- **[Query Metrics](query-metrics.md)**: a second-by-second resource timeline for a single query.
- **[Processors Profile](processors-profile.md)**: the execution pipeline of a query as a processor graph.
- **[Query Comparison](query-comparison.md)**: run two queries side by side and compare results and performance.
