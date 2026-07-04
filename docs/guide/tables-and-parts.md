# Tables and Parts

ClickHouse® stores every table as a collection of smaller pieces on disk called parts. This section gives you two views into that storage: a health check on the parts themselves, and a breakdown of how much space each table is taking up. It is organized into two tabs.

## Parts

The Parts tab opens with a set of summary cards counting your active parts, inactive parts, detached parts, and broken parts. Active parts are the ones in normal use. Inactive and detached parts are pieces that have been set aside, which is usually routine. Broken parts are the ones to care about: CHOps flags a detached part as broken when its name or its reason for being set aside begins with the word "broken."

If any broken parts turn up, an alert banner appears and a table lists which databases and tables are affected and how many broken parts each one has. Broken parts can be a sign of disk corruption, so it is worth investigating right away rather than letting it sit.

## Table Sizes

The Table Sizes tab shows a sortable table of all your MergeTree tables, so you can see at a glance which ones are consuming the most space and how well their data is compressing. By default it is sorted with the largest tables first.

Each row gives you:

- **database** and **table**, the full name of the table.
- **compressed**, how much space the data actually takes on disk.
- **uncompressed**, how much space it would take without compression.
- **compression_pct**, the compressed size as a percentage of the uncompressed size.
- **ratio**, how many times smaller compression has made the data.
- **engine**, the table engine, such as MergeTree or ReplicatedMergeTree.
- **pk_size**, how much memory the primary key uses.
- **active_parts** and **inactive_parts**, the number of each kind of part.
- **total_rows**, the total number of rows across all parts.

The compression numbers are often the most interesting here. A strong compression ratio means ClickHouse® is storing your data efficiently, and a weak one can be a hint that a table's design or data types are worth a second look.
