# Custom Dashboards

## Chart Builder

4-panel collapsible workspace (SQL & Results top, Config & Preview bottom).

> Not sure how to write the SQL? Qurioz, the built-in AI assistant, turns a plain-English question into ClickHouse® SQL that drops straight into this workspace. An administrator enables it by adding a provider key on the [AI API Keys](ai-api-keys.md) page.

**Features:**
- A wide range of chart types and subtypes with column type validation
- X/Y axis labels (auto-populated by chart type)
- Legend toggle (auto-enabled for multi-series)
- Fullscreen mode
- Gauge min/max fields
- ECharts toolbox on every chart: zoom, reset, save image

### Edit Mode
Clicking Edit in All Charts navigates to Chart Builder with all params prefilled: SQL, chart type, subtype, column mapping, name, dashboard. Update button calls PUT instead of POST.

### Auto-Fill Grid
When saving to a dashboard, the chart is automatically placed in the next empty grid position (left->right, then next row). No manual row/col input needed.

## Dashboards

Create dashboards with configurable grid columns (1-4).

### Drag-and-Drop
Drag charts to swap positions. Changes are local until **Save Layout** is clicked, which persists all grid positions via API.

### Chart Tiles
Each tile has: chart title, fullscreen toggle, delete button. SQL executes against current ClickHouse® connection.

## All Charts

Separate sidebar section (`custom/charts`) listing all charts in a table with: name, type/subtype, dashboard assignment. Click a row to preview. Edit button navigates to Chart Builder with prefilled params.

## Persistence
SQLite tables: `dashboard` (id, name, columns), `chart` (id, name, dashboard_id FK, grid_row, grid_col, sql_query, chart_type, chart_subtype, config JSON).
