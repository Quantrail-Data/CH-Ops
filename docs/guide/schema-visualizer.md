# Schema Visualizer

## What This Page Shows

The Schema Visualizer displays a visual map of your ClickHouse® database schema. Every table, materialized view, dictionary, and distributed table appears as a card on the canvas. Lines between cards show how data flows between them.

This page is read-only. It does not create, modify, or delete any tables.

---

## Getting Started

The Schema Visualizer does not draw anything until you tell it what to look at. This is deliberate: rendering an entire production schema at once is slow and overwhelming, so the page starts focused and lets you expand from there.

1. When the page loads, you see a single database dropdown and an empty canvas with the prompt "Select a database to begin."
2. Select a database. A second dropdown appears, listing every table, view, materialized view, and dictionary in that database, sorted alphabetically with its engine kind in parentheses (for example, "events (mt)" or "events_mv (mv)").
3. Select a table. The page performs a breadth-first traversal starting from that table, following every relationship in both directions, and draws only the connected subgraph. The view auto-fits to frame the result.

This focused approach answers the most common question directly: "what is connected to this table, and how does data flow through it?"

To reset, set the table dropdown back to "Select a table" or the database dropdown back to "Select a database." The canvas clears.

---

## Understanding the Canvas

### Top-to-Bottom Flow

The graph flows from top to bottom. Parent tables (sources) appear at the top, materialized views and other dependent objects sit below them, and target tables land at the bottom. A multi-stage pipeline cascades down the canvas: source table, then the MV that reads it, then the target table the MV writes to, then any further MVs that read that target, and so on. Following the arrows downward traces the path data takes through your schema.

### Relationships Cross Database Boundaries

The breadth-first traversal is not restricted to the database you selected. If a table in database `staging` feeds a materialized view in database `analytics` that writes to a target in database `reporting`, all three appear together on one canvas with edges connecting them. Every node header shows the fully qualified `database.table` name, so you can always see which database an object belongs to. This is the primary way to discover cross-database dependencies that are invisible when you inspect one database at a time.

#### Node Cards

Each card represents one ClickHouse® table (or view, MV, dictionary, etc.). A card has:

**Header bar:** Colored by engine type (see color reference below). Contains:
- An icon indicating the engine category
- The table name (truncated with "..." if too long; hover to see the full qualified name)
- The engine abbreviation (e.g., "MV" for MaterializedView, "RMV" for Refreshable MV)
- A row count chip showing the approximate number of rows (e.g., "1.2M"). Hover to see exact rows and bytes.
- A heatmap badge (only on MVs when the heatmap is enabled) showing the INSERT load metric value

**Column list (toggleable):** Shows up to 14 columns with their names and types. Key columns (part of the primary key or sorting key) are shown in red bold text. Columns with default expressions are shown in green. If the table has more than 14 columns, a "... N more" message appears at the bottom.

#### Node Colors

| Header Color | Engine Type | What It Is |
|-------------|------------|------------|
| **Green** | MergeTree family | The main ClickHouse® storage engine. Includes MergeTree, ReplacingMergeTree, AggregatingMergeTree, SummingMergeTree, CollapsingMergeTree, VersionedCollapsingMergeTree, and others. |
| **Lilac / Purple** | MaterializedView | A continuously-updating query. When data is inserted into the source table, the MV automatically runs its query and writes results to a target table. |
| **Pink** | Refreshable MaterializedView | A materialized view that runs on a schedule (cron), not on every INSERT. Introduced in ClickHouse® 23.x. |
| **Blue** | Dictionary | An in-memory key-value lookup table. Typically loaded from another ClickHouse® table, PostgreSQL, MySQL, HTTP, or a file. |
| **Amber / Orange** | Distributed | A virtual table that routes queries and INSERTs to shards across a cluster. Points to a local table on each shard node. |
| **Light Gray** | View | A saved query (SELECT statement). Does not store data. Evaluated on every read. |
| **Warm Gray** | Other | Any engine not in the categories above (Memory, Buffer, Null, File, URL, Join, Set, and so on). |

The palette is tuned separately for dark and light themes so the colors stay vivid and readable on both backgrounds. When you toggle the theme, the node colors, edge colors, and minimap update automatically within the same session.

#### Edge Lines

Lines (edges) between cards show relationships. They flow from the bottom of the parent (source) node to the top of the child (target) node, following the top-to-bottom layout.

| Line Color | Relationship Type | What It Means |
|-----------|------------------|---------------|
| **Purple / Lilac** | MV flow | A materialized view reads from the source table (above) and writes to the target table (below). This is the most common edge type. |
| **Blue** | Dictionary source | A dictionary loads its data from this source table. |
| **Amber / Orange** | Distributed shard | A distributed table routes to this local table. |
| **Gray** | Other dependency | Any other dependency relationship tracked by ClickHouse®. |

Each line ends with a filled triangular arrowhead at the target (child) node, showing the direction of data flow. The arrow color matches the edge color.

---

## Controls

#### Search

Type a table name or column name. After a brief delay (200ms), non-matching nodes and their edges dim to near-invisible. Matching column names inside nodes are highlighted with a yellow background.

The search matches against the full qualified name (database.table) and all column names. It is case-insensitive.

#### Database and Table Dropdowns

The first dropdown lists all databases with table counts in parentheses. Selecting one reveals the second dropdown, which lists the tables in that database sorted alphabetically with their engine kind. Selecting a table draws its connected subgraph (see [Getting Started](#getting-started)).

These two dropdowns are the primary way to navigate. Rather than scrolling a giant graph, you pick a starting table and the page shows exactly its connected component, however many databases it spans.

#### Columns Toggle

Click the "Columns" button to show or hide column lists inside node cards. When columns are hidden, nodes are compact (header only), giving a high-level overview of the schema structure. When columns are shown, you can see the column names, types, and key indicators inside each node.

#### Load Period (Heatmap)

The heatmap shows how much work each materialized view performed during a time window. Select a period:

| Option | Behavior |
|--------|----------|
| **Load: off** | No heatmap. All edges and nodes use their default colors. |
| **Last 1 day** | Shows INSERT pipeline activity from the last 24 hours. |
| **Last 7 days** | Shows activity from the last week. This is the default. |
| **Last 30 days** | Shows activity from the last month. |

When the heatmap is on, MV nodes that processed INSERTs during the window get a colored badge in their header. The badge color ranges from cool blue (low activity) through green and amber to hot red (highest activity among all MVs). Edge lines from MVs to their target tables are also colored and thickened proportionally.

The status line at the bottom of the controls bar shows the result: "INSERT load: 5 MVs over 7d" or "No INSERT load data for last 7d" (if `system.query_views_log` is empty or disabled).

#### Metric Dropdown

When the heatmap is on, this dropdown selects which metric the colors represent:

| Metric | What It Measures |
|--------|-----------------|
| **View duration** | Total milliseconds the MV spent processing INSERTs. Good for finding slow MVs. |
| **Rows written** | Total rows written to the target table. Good for finding high-volume pipelines. |
| **Bytes written** | Total bytes written. Good for finding large data movers. |
| **Rows read** | Total rows read from the source table. |
| **Bytes read** | Total bytes read from the source table. |
| **Peak memory** | Sum of peak memory usage across all executions. Good for finding memory-hungry MVs. |
| **Executions** | Number of times the MV fired. Good for finding frequently-triggered MVs. |

The heatmap uses logarithmic scaling because INSERT volumes typically span many orders of magnitude. A view processing 10M rows and one processing 100 rows would both appear mid-range on a linear scale. Log-scale makes both visually distinct.

#### Re-layout

Recomputes positions for every visible node using the layout algorithm, then fits the result to the viewport. Use it after dragging nodes around when you want to return to the clean algorithmic arrangement. Re-layout moves the nodes.

#### Fit

Zooms and scrolls so all visible nodes fit in the viewport, without moving any node. Fit moves the camera, not the nodes. If you dragged a node into a corner, Fit zooms out to include it where it sits.

#### Zoom Controls (bottom-left corner)

| Button | Action |
|--------|--------|
| **+** | Zoom in (see details) |
| **-** | Zoom out (see more of the canvas) |
| **Fit icon** | Auto-zoom and scroll to fit all visible nodes in the viewport |

You can also zoom with the mouse wheel or a trackpad pinch, and pan by dragging the canvas background. A minimap in the bottom-right corner shows the whole graph with a viewport rectangle; click it to jump to any area.

---

## Interacting with Nodes

#### Clicking

Click a node to select it. Three things happen:
1. The **sidebar** opens on the right with full details about the table
2. All **unrelated nodes** dim to near-invisible
3. All **connected nodes** (one hop in either direction) stay bright
4. **Connected edges** stay fully visible; unrelated edges dim

Click the same node again, click the background, or press **Escape** to deselect.

#### Dragging

Click and drag a node to move it. Connected edges follow in real-time. When you release, the layout snaps to the new position. Other nodes stay where they are.

Dragging does NOT trigger a click (the click event is suppressed when drag distance exceeds 4 pixels).

#### Sidebar Details

The sidebar shows everything known about the selected table:

| Section | Contents |
|---------|----------|
| **Engine** | Full engine name with parameters (e.g., `ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/events', '{replica}')`) |
| **Partition by** | Partition key expression |
| **Order by** | Sorting key (ORDER BY from CREATE statement) |
| **Primary key** | Primary key (shown only if different from sorting key) |
| **Rows / Bytes** | Current row count and storage size |
| **Comment** | Table comment (if set) |
| **Dict source** | Dictionary source definition (for dictionary tables) |
| **Reads from** | Clickable list of tables this node reads from. Click to navigate. |
| **Writes to** | Clickable list of tables this node writes to or is depended on by. Click to navigate. |
| **CREATE Statement** | The complete CREATE TABLE/VIEW/DICTIONARY statement |

---

## Common Scenarios

#### "I want to understand how a specific MV pipeline works"

1. Type the MV name in the search box
2. Click the highlighted MV node
3. The sidebar shows "Reads from" (the source table) and "Writes to" (the target table)
4. The canvas dims everything except the pipeline: source -> MV -> target
5. Click on connected tables in the sidebar to navigate through the pipeline

#### "Which MVs are the most expensive?"

1. Set the Load dropdown to "Last 7 days"
2. Set the Metric dropdown to "View duration"
3. Look for the reddest badges in the MV node headers
4. The thickest, reddest edges show the busiest INSERT pipelines
5. Click the hottest MV to see detailed stats in the sidebar

#### "I want to find all tables that use a specific column name"

1. Type the column name (e.g., "user_id") in the search box
2. All tables containing that column stay visible; others dim
3. Inside each visible table, the matching column row has a yellow background
4. Scroll through the results to see which tables share the column

#### "The graph is too large and I cannot find my table"

1. Use the database and table dropdowns to focus on a single table's connected subgraph instead of the whole schema
2. Turn off Columns (click the Columns button) for a compact, header-only overview
3. Click "Fit" to auto-zoom to the visible nodes
4. Use the search box to highlight a specific table (matching nodes stay bright, the rest dim)

#### "I have a table and want to know what depends on it"

1. Click the table node
2. The sidebar shows "Writes to / depended on by" with clickable links
3. Each listed table is a materialized view, dictionary, or distributed table that references your table
4. Click any entry to navigate to it and see its dependencies in turn

#### "I want to share the schema diagram with my team"

Currently the Schema Visualizer does not have an export button. You can:
- Take a screenshot (Cmd+Shift+4 on Mac, Win+Shift+S on Windows)
- Use the browser's built-in "Save as PDF" feature (Cmd+P / Ctrl+P, then "Save as PDF")
- Zoom out first (click "-" or "Fit") to capture the full schema

#### "The heatmap shows no data"

This means `system.query_views_log` has no entries for the selected time window. Possible causes:
- No materialized views have fired during the window
- `query_views_log` is disabled in the ClickHouse® server config (check `log_query_views` setting)
- The ClickHouse® user configured in CHOps does not have SELECT permission on `system.query_views_log`

The status line at the bottom of the controls shows "No INSERT load data for last Nd" to confirm this.

#### "I selected a table but only one node appeared"

If a table has no tracked dependencies, its connected subgraph is just the table itself, so a single node renders. This is normal for standalone fact tables, staging tables, and utility tables. It can also happen when:
- The MV or dependency was created after the schema was last loaded. Refresh the browser page to re-fetch the schema.
- The dependency runs through a table function (for example, `remote()` or `url()`), which ClickHouse® does not track in the `system.tables.dependencies_*` arrays.
- The related table lives in a system database, which is filtered out by design.

---

## Tips

- **Columns toggle is your complexity dial.** Turn columns off for a bird's eye view. Turn them on to inspect specific tables. This is the fastest way to navigate between overview and detail.

- **The heatmap answers "is this MV worth optimizing?"** If one MV has 10x the view duration of all others, that is where to focus performance work. If you are deciding between optimizing MV-A or MV-B, the heatmap gives you data.

- **Cross-database edges** indicate cross-database materialized views or distributed table mappings. These are common in sharded and multi-tenant setups. Because the traversal crosses database boundaries automatically, you see the full pipeline even when it spans several databases.

- **A single node is not a bug.** If selecting a table shows just one card, that table simply has no tracked dependencies. Standalone fact tables, staging tables, and utility tables commonly behave this way.

- **Refreshable MVs (pink nodes)** run on a schedule, not on every INSERT. Their heatmap load may show bursty patterns corresponding to the refresh interval rather than continuous activity.

- **The row count chip** in the node header shows approximate current rows. Hover over it to see the exact count and byte size. This updates when the page loads (not in real-time).

- **Key columns** (red bold text in the column list) are columns that are part of the primary key or sorting key. These determine how ClickHouse® stores and queries the data. They are the most important columns for query performance.

- **Default columns** (green text) have a DEFAULT, MATERIALIZED, or ALIAS expression. They are computed automatically and may not appear in INSERT statements.

---

## Font Reference

| Element | Font | Purpose |
|---------|------|---------|
| Table names, column names, engine labels | Red Hat Mono (`--font-code`) | Monospace for identifiers and code |
| Row counts, byte sizes, heatmap values | Red Hat Mono (`--font-chart`) | Tabular numbers for metrics |
| Section labels, control labels, legend text | Plus Jakarta Sans (`--font-ui`) | UI text (inherited from body) |
| CREATE statement in sidebar | Red Hat Mono (`--font-code`) | Code block |
