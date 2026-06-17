# Indexes & Projections

## Data Skipping Indexes

ECharts tree visualization of all data skipping indexes across databases. View-only page for inspecting existing indexes.

Query: `SELECT database, table, name, type_full, expr, granularity FROM system.data_skipping_indices ORDER BY database, table, name`.

Tree hierarchy: database -> table -> index (with type and expression). Tree nodes use `symbolSize: 12`.

## Projections

Tabs:

### View
Tree visualization from `system.projections` - database -> table -> projection name. Tree nodes use `symbolSize: 12`.

### Add Projection
Form: database dropdown, table dropdown, projection name, select expression, GROUP BY, ORDER BY, ON CLUSTER, IF NOT EXISTS, SETTINGS.

**DISTINCT handling**: ClickHouse® projections don't support `SELECT DISTINCT`. If the user types `DISTINCT col`, it's automatically stripped from the generated SQL. Placeholder text warns about this limitation.

Generated SQL: `ALTER TABLE db.tbl [ON CLUSTER] ADD PROJECTION [IF NOT EXISTS] name ( SELECT expr [GROUP BY ...] [ORDER BY ...] )`

### Drop Projection
Database/table/projection dropdowns, ON CLUSTER, IF EXISTS.

### Materialize Projection
Database/table/projection dropdowns, ON CLUSTER, optional IN PARTITION.

### Clear Projection
Database/table/projection dropdowns, ON CLUSTER, optional IN PARTITION.

## Index Management

Three tabs:

### Create
Create new data-skipping indexes. Supports index types: minmax, set, bloom_filter, ngrambf_v1, tokenbf_v1, full_text (experimental), annoy. Database/table/column dropdowns, granularity, ON CLUSTER, IF NOT EXISTS.

### Materialize
Trigger materialization of an existing index on a specific table. Database/table/index dropdowns, ON CLUSTER, optional IN PARTITION.

### Drop
Drop an existing index. Database/table/index dropdowns, ON CLUSTER. Generates `ALTER TABLE db.tbl [ON CLUSTER] DROP INDEX idx_name`.
