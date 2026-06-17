# Tables and Parts

The Tables and Parts section has two tabs.

## Parts

Displays summary cards for active parts, inactive parts, detached parts, and broken parts. Broken parts are identified as detached parts whose reason starts with "broken" or whose name starts with "broken".

If broken parts are detected, an alert banner appears and a table lists the affected databases and tables with their broken part counts. This indicates possible disk corruption and should be investigated immediately.

## Table Sizes

Shows a sortable table of all MergeTree tables with the following columns:

- **database** and **table**: the fully qualified table name
- **compressed**: total compressed data size on disk
- **uncompressed**: total uncompressed data size
- **compression_pct**: compression percentage, calculated as `(compressed / uncompressed) * 100`
- **ratio**: compression ratio (uncompressed / compressed)
- **engine**: the table engine (MergeTree, ReplicatedMergeTree, etc.)
- **pk_size**: primary key size in memory
- **active_parts** and **inactive_parts**: part counts
- **total_rows**: total row count across all parts

Tables are sorted by compressed size descending by default.
