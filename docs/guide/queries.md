# Queries

The Queries section has three tabs: Current, Analytics, and Query Log.

## Current Queries

Displays all currently running queries from `system.processes`. The table auto-refreshes every 5 seconds.

An informational banner at the top reminds users that some listed queries may have already completed, since ClickHouse® processes queries extremely quickly.

Each row includes action buttons:

- **Kill**: sends a `KILL QUERY` command for the selected query
- **Kill Sync**: sends a `KILL QUERY ... SYNC` command, which waits for the query to terminate before returning

Both buttons use the ClickHouse® credentials from the navbar connection bar.

## Analytics

Provides calendar heatmaps and analytical tables derived from `system.query_log`. Select a time range using the quick range buttons (1h, 6h, 24h, 48h, 7d, 30d) or set custom start and end times using the datetime pickers. Optionally filter by Query Kind.

Click Analyze to load the following:

**Calendar Heatmaps** (single-column layout, 420px height each):
- **Query Count**: number of queries per date/hour bucket
- **Error Count**: queries with non-empty exception per date/hour
- **Median Memory Usage (MB)**: median memory_usage for QueryFinish events
- **Median Query Duration (ms)**: median query_duration_ms for queries >0ms

Heatmaps use a shared `buildHeatmapEchartsOption` function from `LogHeatmap.jsx`. A single amber/orange 1000-step color scale is used on both themes, starting from a faint warm tint and going to deep brown for the highest values. The depth of the color range automatically adapts to data variance. No slider is shown (`visualMap.show: false`). Empty cells default to 0. X-axis date labels auto-thin for readability. Y-axis shows every 3rd hour.

**Tables:**
- **Top 10 Slowest Queries**: table sorted by query_duration_ms
- **Top 10 Memory-Intensive Queries**: table sorted by memory_usage

## Query Log Search

A comprehensive search interface for `system.query_log`. Both start time and end time are mandatory since `event_date` and `event_time` are the index columns for this table.

Available filters:

- **Query Kind**: dropdown populated from distinct values in query_log
- **Type**: QueryStart, QueryFinish, ExceptionWhileProcessing, etc.
- **Exception Code**: dropdown of non-zero exception codes
- **Exception (text)**: free-text partial match on the exception field
- **Is Initial Query**: yes/no/any
- **Initial User**: dropdown of distinct initial_user values

Results can be sorted by any of these fields in ascending or descending order: event_time, query_duration_ms, read_rows, read_bytes, written_rows, written_bytes, result_rows, result_bytes, memory_usage.

The query is built dynamically based on the selected filters and sort options, always using the date and time index for efficient execution.
