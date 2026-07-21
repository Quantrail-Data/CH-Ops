# Schema Studio

Schema Studio is a guided wizard that designs a ClickHouse® table from your own data and creates it, so you do not have to hand-write the `CREATE TABLE`. You point it at a data file (or an object-storage reference), it infers the columns and gathers per-column statistics, and it walks you through choosing an engine and the table clauses. At the end it composes the exact DDL, lets you review and validate it, and runs it. You will find it under **Tools > Schema Studio**.

The important thing to understand up front: Schema Studio designs and creates the table structure. It does not load your data. Your source file is only read to infer the schema and compute statistics; the only write it ever performs is the final, confirmed `CREATE TABLE`.

## Before you start

Schema Studio runs under your own ClickHouse® credentials, the same model as the SQL Editor. It uses the cluster and node selected in the top navbar, and on entry it either restores an existing connected session (so a page reload keeps you connected) or shows a compact connect panel.

- The connect panel is prefilled from the navbar connection. You confirm or edit the ClickHouse® username and password to use for the session.
- Your password is sent once, validated with a trivial query, then held only by the server, encrypted. The browser keeps just the app token, never the ClickHouse® password.
- If no cluster and node are selected in the navbar, pick them there first, then return.
- Read-only CHOps accounts cannot use Schema Studio. Because the wizard can create a table, the read-only app role is blocked from both connecting and creating, regardless of which ClickHouse® user it would connect as.
- The optional AI review on the last step needs an active AI provider key. See [AI API Keys](ai-api-keys.md). Everything else works without one.

The wizard has four steps, shown as a numbered strip: Source, Schema, Engine, Generate. You can click back to any completed step.

## Step 1: Source

Choose the data to model, in one of two ways.

**Upload a file.** Drag a file onto the drop zone or click to browse. Supported formats are CSV and TSV (each with a header row), JSON, NDJSON/JSONL, Parquet, and ORC.

**Object storage.** Point at a file already in the cloud. For S3, give the S3 URL, access key ID, and secret access key. For Azure, give the connection string, container, and blob path. Then pick the file format (Parquet, ORC, CSV with header, TSV with header, or JSON/NDJSON) and infer.

How the inference works is worth knowing, because it affects large files. ClickHouse® reads a sample of the source to infer the structure. For text formats, only a leading sample (about 2 MB, trimmed to the last complete line) is sent. For binary formats (Parquet and ORC) the whole file is sent, because the schema lives in the file footer. Uploads are capped at 100 MB. Object-storage keys are used only for this read and are not stored.

When inference succeeds, Schema Studio moves to the next step with the inferred columns and a set of per-column statistics.

## Step 2: Schema

Review the columns ClickHouse® inferred. Each row shows the column name and type, with an approximate distinct-value count drawn from the sample so you can gauge cardinality. You can edit any name or type inline.

Expand a column to reach its advanced options, which apply to that existing column:

- **Nullability**: by default the type controls it (for example `Nullable(String)`); override only to force NULL or NOT NULL.
- **Codec**: per-column compression, for example `ZSTD(3)` in general, `Delta, ZSTD` for monotonic integers and timestamps, or `Gorilla, ZSTD` for slowly changing floats. Low-cardinality strings are better wrapped as `LowCardinality(String)` in the type itself.
- **Statistics**: lightweight per-part statistics that help the optimizer, such as `TDigest` for percentiles or `Uniq` for distinct-count estimates.
- **Per-column TTL**: for example `d + INTERVAL 30 DAY`.
- **Comment**.

You can also **add derived columns**, which are new columns you define rather than ones inferred from the data. A derived column has a name, an optional type, a kind, and an expression over other columns (for example `price * quantity` or `toStartOfDay(event_time)`). The kind controls how it is computed:

- **DEFAULT**: value used when none is supplied on insert; stored.
- **MATERIALIZED**: computed on insert, not accepted in `INSERT`; stored.
- **ALIAS**: computed on read; not stored.
- **EPHEMERAL**: only feeds other defaults; not stored.

For MATERIALIZED and ALIAS you may leave the type empty and let ClickHouse® infer it.

## Step 3: Engine

Here you choose the engine and fill in the table clauses that the wizard turns into the DDL.

**Target**: the destination database and table name, and an optional `ON CLUSTER` name.

**MergeTree variant**: the engine behavior, which controls what happens to rows with the same sorting key when parts merge. The choices are plain `MergeTree`, `ReplacingMergeTree` (deduplicate, with optional version and is-deleted columns), `CoalescingMergeTree` (column upsert), `SummingMergeTree` and `AggregatingMergeTree` (rollups), `CollapsingMergeTree` and `VersionedCollapsingMergeTree` (sign-based cancellation, the versioned form tolerating out-of-order inserts), and `GraphiteMergeTree`. Variants that need parameters (a version column, a sign column, columns to sum, a config section, and so on) reveal the right fields when selected.

**Table clauses** feed the deterministic DDL composer:

- **ORDER BY (sorting key)**: how rows are ordered within each part, and also the primary key unless you set a separate one. Order matters; put low-cardinality, frequently filtered columns first. Leave empty for no sorting (`tuple()`).
- **PRIMARY KEY (optional)**: set only when you want a shorter index than the sorting key. It must be a prefix of ORDER BY, common with Summing and Aggregating engines.
- **PARTITION BY (optional)**: for example `toYYYYMM(event_date)`.
- **SAMPLE BY (optional)**: enables `SAMPLE` queries; must be an expression contained in the primary key that returns an unsigned integer, for example `intHash32(user_id)`.
- **Table TTL (optional)**: for example `event_date + INTERVAL 90 DAY`.
- **Settings (optional)**: engine settings as comma-separated `name = value`, for example `index_granularity = 8192`.

**Data-skipping indexes** (repeatable): each has a name, a type, an expression, optional parameters, and a granularity. The available types are `minmax`, `set(max_rows)`, `bloom_filter(false_positive)`, `ngrambf_v1`, `tokenbf_v1`, `text`, and `vector_similarity`. Match the type to how you filter the column: minmax for value ranges, set for a small number of distinct values, bloom_filter for equality and IN, tokenbf_v1 or ngrambf_v1 for substring search, text for full-text, and vector_similarity for nearest-neighbour.

**Projections** (repeatable): each has a name and a SELECT.

**Replicated** (toggle): switches the engine to its `Replicated` form, with a ZooKeeper/Keeper path and a replica macro (default `{replica}`).

**Distributed** (toggle): creates a Distributed table over a cluster. Pick the cluster (populated from `system.clusters`), the local table name, and a sharding key (from presets or typed in). A distributed setup produces two statements: the local MergeTree table and the Distributed table on top of it.

## Step 4: Generate

The `CREATE TABLE` is composed deterministically from everything you chose, with no AI authoring, so what you see is exactly what will run. It appears in an editable SQL editor. For a distributed setup you get two editors: the local table (created on each shard) and the Distributed table.

On this step you can:

- **Rebuild from form**: recompose the DDL from your Step 3 choices. This discards any manual edits you made in the editor.
- **Edit** the DDL by hand for anything the form does not cover.
- **Review with AI** (optional): the assistant assesses the DDL given your columns, statistics, and intent, and returns an assessment plus suggestions and warnings. It only reviews; it never rewrites the DDL. This needs an active AI provider key; without one, review is unavailable and everything else still works.
- **Validate**: a server-side `EXPLAIN AST` parse check that catches syntax errors without executing anything.
- **Create**: runs the statements. The server parse-checks all of them first, allows only a single `CREATE TABLE` per statement, and for a distributed setup creates the local table before the Distributed one. No data is loaded; only the table or tables are created.

## What it does and does not do

- It creates the table structure only. It never loads your data; the source is read solely to infer the schema and compute statistics.
- Everything before the final Create is read-only against your cluster.
- Requests can only reach nodes in your configured cluster; the target node is re-validated on every call, so the source read and the create cannot be pointed at an arbitrary host.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Not connected" / prompted to connect | No active Schema Studio session | Enter your ClickHouse® username and password in the connect panel. |
| "Read-only accounts cannot use Schema Studio" | Your CHOps role is read-only | Schema Studio needs an editor-level role or above; ask an administrator. |
| Connect panel says no cluster and node are selected | Nothing chosen in the navbar | Select a cluster and node in the top navbar, then return. |
| "No columns inferred from the source" | The format or sample could not be parsed | Check the file format (CSV and TSV need a header), and for object storage confirm the selected format matches the file. |
| Distinct counts or stats are blank | Statistics are advisory and can fail on exotic types | The columns still load; proceed without the stats. |
| AI review is unavailable | No active AI provider key | Add and activate a key on the [AI API Keys](ai-api-keys.md) page, or skip review. |
| Validation shows an error | The composed or edited DDL failed the parse check | Fix the reported issue, or use Rebuild from form to start again from your choices. |
| Create fails | ClickHouse® rejected the statement (permissions, existing table, invalid clause) | Read the returned error; confirm the connecting ClickHouse® user may create the table in the target database. |

## Related

- [SQL Editor](sql-editor.md) for running queries and ad hoc DDL under the same per-session credential model.
- [Schema Visualizer](schema-visualizer.md) to explore existing tables and relationships.
- [AI API Keys](ai-api-keys.md) to enable the optional AI review.
