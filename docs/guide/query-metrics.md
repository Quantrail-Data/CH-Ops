# Query Metrics

Query Metrics shows a second-by-second timeline of how a query consumed resources during its execution: memory, CPU, disk IO, cache hits and misses, network, and hundreds of other counters. Think of it as a heart rate monitor for a single query.

Navigate to **Tools > Query Metrics** to get started.

---

## What Are Query Metrics?

When a query runs for more than about 1 second, ClickHouse® takes a snapshot of its resource usage every second. Each snapshot records hundreds of counters: how much memory the query is using right now, how many bytes it has read from disk so far, how many cache hits and misses occurred, and much more.

These snapshots are stored in the `system.query_metric_log` table. Query Metrics turns this raw data into visual timelines, grouped by category and unit, so you can see exactly how resources were consumed over the query's lifetime.

**When is this useful?**

- A query uses too much memory and you want to see exactly when the memory spike happens
- A query is slow and you want to know if it's spending time on disk reads, cache misses, or network waits
- You want to compare two queries to understand why one is faster than the other
- You need to tune cache sizes and want to see the hit/miss ratio for a specific workload

---

## Getting Started

1. Set the **From** and **To** datetime fields (default: last 1 hour)
2. Click **Load Queries**. This shows queries that have per-second metric data
3. Click a query in the list to see its details (query ID, SQL text, duration), then click **Use This Query**
4. Click **Show Query Metrics**
5. Charts appear, grouped by category and unit

Only categories with non-zero data appear. A simple `SELECT 1` might show only Memory and CPU. A complex query with JOINs, disk spilling, and remote reads will show many more groups.

---

## Understanding the Charts

#### Layout

Charts are displayed **two per row** in a grid layout. Each chart shows one category of metrics at a specific unit of measurement. The X axis is time (one data point per second of query execution). The Y axis is the metric value, labeled with the unit.

If a category has metrics with different units (for example, Memory has both byte values and count values), they appear as **separate charts** so the Y axis scale is meaningful. You'll see labels like "Memory, Bytes" and "Memory, Count" side by side.

#### Reading the Charts

Each colored line represents one metric. The legend at the bottom shows the metric names (with the `ProfileEvent_` prefix stripped for readability). Click a legend item to show or hide that metric.

**Tip:** If a chart has too many lines to read clearly, click legend items to hide the less important ones and focus on what matters.

#### Chart Splitting

When a category has more than 4 metrics of the same unit, CHOps splits them into multiple sub-charts of 4 metrics each. The charts are labeled with part numbers: "In-Memory Caches, Count (1/3)", "(2/3)", "(3/3)". The most active metrics (by total value across the query's lifetime) appear in the first sub-chart.

---

## Reading Patterns

#### Memory Chart

A typical Memory, Bytes chart shows:

- **memory_usage**, current memory allocated by the query. Goes up and down as the query allocates and releases memory.
- **peak_memory_usage**, the highest memory_usage seen so far. Only goes up.

| Pattern | What It Tells You |
|---------|------------------|
| Both lines climb steadily | The query is accumulating data in memory (building a hash table, sorting, aggregating) |
| memory_usage spikes then drops, peak stays high | A brief memory spike, common with large hash JOINs that allocate a big hash table, use it, then release it |
| Both lines are flat and low | The query uses minimal memory, it's streaming data without buffering |
| peak_memory_usage hits the memory limit | The query was killed or throttled for exceeding `max_memory_usage` |

#### Disk IO Chart

- **OSReadBytes**, bytes read from disk. A steadily climbing line means the query is scanning data.
- **OSWriteBytes**, bytes written to disk. A spike usually means the query is spilling intermediate results to disk.
- **DiskReadElapsedMicroseconds**, time spent waiting for disk reads. High values mean IO is the bottleneck.

#### Cache Chart

- **MarkCacheHits** vs **MarkCacheMisses**, the ratio tells you if the mark cache is effective. High misses mean the cache is too small.
- **PageCacheHits** vs **PageCacheMisses**, same for the uncompressed page cache.

---

## How Units Work

CHOps automatically detects the unit of each metric from its column name and ensures metrics with different units are **never mixed** in the same chart.

| Column Name Pattern | Unit | Y Axis Label |
|--------------------|------|-------------|
| `*Microseconds` | μs | Time (μs) |
| `*Milliseconds` | ms | Time (ms) |
| `*Nanoseconds` | ns | Time (ns) |
| `*Bytes`, `*BytesSent`, `*BytesReceived`, `*Chars` | bytes | Bytes |
| `*Rows` | rows | Rows |
| Everything else (hits, misses, faults, cycles, counts) | count | Count |
| `memory_usage`, `peak_memory_usage` | bytes | Bytes |

This means a category like "CPU & Time" may produce two charts: one for time metrics (μs) and one for count metrics (page faults, context switches). Both are labeled clearly.

---

## Metric Categories

CHOps classifies the hundreds of possible metrics into categories. Only categories with non-zero data appear. Categories are ordered by how commonly they appear.

#### Common Categories (appear for most queries)

| Category | What It Shows | Key Metrics to Watch |
|----------|--------------|---------------------|
| **Memory** | Memory usage, peak, arena allocations, jemalloc stats | `memory_usage` vs `peak_memory_usage`, compare to see if there are spikes |
| **CPU & Time** | Wall-clock time, CPU time, IO wait time, page faults | `RealTimeMicroseconds` vs `UserTimeMicroseconds`, if Real >> User, the query is waiting, not computing |
| **Disk IO** | Bytes and time for disk reads/writes, IO buffer allocations | `OSReadBytes`, if high, the query is reading a lot from disk |
| **Data Read** | Rows and bytes selected, parts and marks scanned | `SelectedRows`, `SelectedMarks`, high values mean a large scan |
| **In-Memory Caches** | Mark cache, page cache, primary index cache, query cache hits and misses | Hits vs Misses ratio, high misses mean the cache is too small |
| **Marks & Index Loading** | Time and count for loading mark files and primary index blocks | `WaitMarksLoadMicroseconds`, if high, marks are being loaded from disk |
| **Query Execution** | Function calls, JIT compilation, overflow checks | Compilation time and function call counts |
| **Threading & Locks** | Thread pool activity, context switches, lock wait times | High lock wait times indicate contention between threads |

#### Write-Path Categories (appear for INSERT queries)

| Category | What It Shows |
|----------|--------------|
| **Data Write** | Rows and bytes inserted, delayed/rejected inserts |
| **Merges & Mutations** | Background merge activity, rows merged, merge duration |

#### Infrastructure Categories (appear based on your setup)

| Category | When It Appears |
|----------|----------------|
| **Filesystem Cache** | When filesystem cache is enabled in your ClickHouse® config |
| **Network & Connections** | Distributed queries that read from remote shards |
| **S3 / Azure / Remote** | Data stored on S3, Azure Blob Storage, or other remote storage |
| **External Operations** | Query exceeds in-memory limits and spills to disk (sort, aggregation, join) |
| **JOIN Operations** | Queries with JOINs (hash table sizes, probe/build counts) |
| **ClickHouse® Keeper** | Operations on replicated tables |

#### Rare Categories

| Category | When It Appears |
|----------|----------------|
| **Kafka** | Kafka engine table reads/writes |
| **Backup** | BACKUP/RESTORE commands |
| **Logging** | Always present but usually low (internal log message counts) |
| **Throttling** | When bandwidth throttling settings are active |
| **Other** | Metrics that don't fit any category |

#### What Appears Per Query Type

Different query types activate different categories. Use this as a quick reference to know what to look for.

#### Simple SELECT (e.g., `SELECT * FROM table WHERE id = 123`)

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `memory_usage` should stay flat if streaming | Steady climb means the query is buffering too much data |
| CPU & Time, Time (μs) | `RealTimeMicroseconds` vs `UserTimeMicroseconds` | Real >> User means the query is waiting on IO, not computing |
| Disk IO, Bytes | `OSReadBytes` should be proportional to result size | Reads >> result size means the query is scanning too many parts |
| Disk IO, Time (μs) | `DiskReadElapsedMicroseconds` | High values mean disk is the bottleneck, check if filesystem cache is enabled |
| Data Read, Rows | `SelectedRows`, `SelectedMarks` | High mark count means many granules scanned, check if WHERE clause aligns with ORDER BY |
| In-Memory Caches, Count | `MarkCacheHits` vs `MarkCacheMisses` | Miss ratio > 10% means mark cache is cold or too small |

#### SELECT with JOIN

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `peak_memory_usage` may spike during hash table build | If peak >> steady state, the JOIN hash table is large, consider `partial_merge_join` |
| JOIN, Rows | `JoinBuildTableRows`, `JoinProbeTableRows` | Build table too large? Move the smaller table to the right side of JOIN |
| JOIN, Count | `JoinResultRows` | Result much larger than input? Likely a many-to-many join (check JOIN keys) |
| External Operations, Bytes | `ExternalJoinWritePart` | If present, the JOIN spilled to disk, increase `max_bytes_in_join` or restructure |

#### SELECT with GROUP BY / ORDER BY

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `ArenaAllocBytes` climbing steadily | Large aggregation state, high-cardinality GROUP BY |
| External Operations, Bytes | `ExternalSortWritePart`, `ExternalAggregationWritePart` | Data spilled to disk, increase `max_bytes_before_external_sort` / `max_bytes_before_external_group_by` |
| Threading, Count | `ContextSwitches` | High values with many threads, reduce `max_threads` or check lock contention |

#### INSERT

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `memory_usage` should be low for streaming inserts | High memory means large batches or wide rows |
| Data Write, Rows | `InsertedRows`, `InsertedBytes` | Check throughput matches expectations |
| Data Write, Count | `DelayedInserts`, `RejectedInserts` | Non-zero `DelayedInserts` means too many parts, merges can't keep up |
| Merges & Mutations, Rows | `MergedRows` | Large values during INSERT mean background merges are competing for resources |
| Merges & Mutations, Time (ms) | `MergeTotalMilliseconds` | Long merge times during INSERT may slow down query performance |

#### Distributed SELECT (across shards)

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Network, Bytes | `NetworkSendBytes`, `NetworkReceiveBytes` | Large transfer means too much data moving between shards, add PREWHERE or push down filters |
| Network, Time (μs) | `NetworkReceiveElapsedMicroseconds` | High values mean network is the bottleneck, check inter-node bandwidth |
| Network, Count | `DistributedConnectionMissCount` | Non-zero means connection pool misses, connections being established on every query |

#### Cloud Storage Query (S3 / Azure / GCS)

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| S3/Remote, Bytes | `ReadBufferFromS3Bytes`, `S3ReadBytes` | Large reads mean scanning too much remote data, use projections or local caching |
| S3/Remote, Time (μs) | `S3ReadMicroseconds` | High latency per request, check region proximity |
| S3/Remote, Count | `S3ReadRequestsCount` | Many small requests, consider increasing `remote_fs_read_backoff_max_ms` |
| Filesystem Cache, Count | `CachedReadBufferCacheWriteBytes` | If filesystem cache is active, check hit rate |

#### Replicated Table Write

Everything from INSERT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Keeper, Time (μs) | `ZooKeeperWaitMicroseconds` | High values mean ClickHouse® Keeper is slow, check Keeper node health |
| Keeper, Bytes | `ZooKeeperBytesSent`, `ZooKeeperBytesReceived` | Large payloads to Keeper, unusual, may indicate large part metadata |
| Keeper, Count | `ZooKeeperTransactions` | Many transactions per insert, check replication queue depth |

A simple `SELECT 1` might show only Memory (bytes) and CPU (μs).

---

## How Discovery Works

`system.query_metric_log` has over 700 columns, and the list changes between ClickHouse® versions. CHOps does not hardcode column names. Instead:

1. **Fetch all rows** for the selected query with `SELECT *` (typically 1-60 rows for a 1-60 second query)
2. **Scan every row** to find columns where any row has a non-zero value. This catches metrics that activate mid-query (for example, `ExternalSortWritePart` might be 0 for the first 5 seconds, then spike when the sort spills to disk)
3. **Sort by activity**, the most active metrics (highest total absolute value) come first
4. **Cap at 100 columns**, if more than 100 are active, the 100 most active are kept
5. **Classify** each column by category and unit
6. **Split** categories with more than 4 metrics of the same unit into sub-charts
7. **Build charts** directly from the fetched data (no second query needed)

This approach is version-agnostic, it works across all ClickHouse® versions because `SELECT *` discovers the schema at query time.

---

## Prerequisites

| Requirement | Why | How to Check |
|-------------|-----|-------------|
| ClickHouse® 26.3 LTS or newer | CHOps's minimum supported version | `SELECT version()` |
| `query_metric_log` enabled | Metric snapshots are stored here (enabled by default on 26.3) | `SELECT count() FROM system.query_metric_log`, if it errors, the table is disabled |
| Query duration > ~1 second | ClickHouse® samples once per second by default | Run a longer query if you see "no metric data found" |
| SELECT access on `system.query_metric_log` and `system.query_log` | The ClickHouse® user needs permission | `GRANT SELECT ON system.query_metric_log TO your_user` |

#### Enabling query_metric_log

On ClickHouse® 26.3 LTS (CHOps's minimum supported version), `query_metric_log` is enabled by default. If the table doesn't exist or you want to adjust the collection interval, use the `query_metric_log_interval` **session setting**:

```sql
-- Check if it's enabled (default 1000ms)
SELECT getSetting('query_metric_log_interval');

-- Set for a specific user profile (in users.xml or users.d/)
```

```xml
<!-- /etc/clickhouse-server/users.d/query_metric_log.xml -->
<clickhouse>
  <profiles>
    <default>
      <!-- Collect interval in milliseconds (default 1000). Set to 0 to disable. -->
      <query_metric_log_interval>1000</query_metric_log_interval>
    </default>
  </profiles>
</clickhouse>
```

Lower values give more granularity but increase overhead. Setting to `0` disables collection entirely.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "No metric data found" | Query was too short (< 1s) or `query_metric_log` is disabled | Run a longer query, or enable `query_metric_log` in server config |
| "All metrics are zero" | The query was too simple (e.g., `SELECT 1`) | Run a query that actually reads data or does computation |
| Only Memory and CPU appear | The query didn't use disk, cache, network, etc. | Normal for simple queries, run a complex query to see more categories |
| Charts show flat lines | The query finished in 1-2 seconds (only 1-2 data points) | Run a longer query for more detailed timelines |
| Too many lines in one chart | More than 4 metrics in a category×unit group | Already handled: CHOps splits into sub-charts of 4. Click legend items to hide specific metrics. |
| Two charts for the same category | The category has metrics with different units | By design, "Memory, Bytes" and "Memory, Count" are separate to keep Y axis scales meaningful |
| Charts look empty after theme switch | Rare rendering glitch | Charts auto-rebuild on theme change. If still empty, click Show Query Metrics again. |

---

## Tips

#### Compare Two Queries

Analyze the slow query and note which categories have high values. Then analyze the fast query. The difference tells you exactly why one is slower.

For example: if the slow query shows high `MarkCacheMisses` and the fast query shows high `MarkCacheHits`, the slow query is reading from disk while the fast one reads from cache. The fix is either to warm the cache or increase `mark_cache_size`.

#### Diagnose Memory Spikes

If a query is killed with "Memory limit exceeded":

1. Find the timestamp where `peak_memory_usage` jumps in the Memory, Bytes chart
2. Look at what other metrics are rising at the same moment in other charts
3. If `ArenaAllocBytes` is rising, the query is building a large aggregation or sort buffer
4. If the External Operations category appears right after the spike, the query started spilling to disk as a fallback

#### Check Cache Effectiveness

In the In-Memory Caches, Count charts, compare hits vs misses:

| Cache | Healthy Ratio | If Misses Are High |
|-------|--------------|-------------------|
| MarkCache | > 90% hits | Increase `mark_cache_size` (default 5 GiB) |
| UncompressedCache | > 80% hits | Increase `uncompressed_cache_size` (default 0, meaning disabled) |
| PageCache | Varies | OS-level page cache, consider adding more RAM |

#### Detect Disk Spilling

If the **External Operations** category appears, the query exceeded in-memory limits:

- `ExternalSortWritePart` / `ExternalSortMerge` means ORDER BY spilled. Increase `max_bytes_before_external_sort`.
- `ExternalAggregationWritePart` / `ExternalAggregationMerge` means GROUP BY spilled. Increase `max_bytes_before_external_group_by`.
- `ExternalJoinWritePart` / `ExternalJoinMerge` means JOIN spilled. Consider a different JOIN algorithm or increase memory limits.

Spilling is not an error, it's a safety mechanism. But it is significantly slower than in-memory processing.

#### Understand Time Metrics

When you see both "CPU & Time, Time (μs)" and "CPU & Time, Count" charts:

- The **Time chart** shows `RealTimeMicroseconds` (wall clock), `UserTimeMicroseconds` (CPU in user mode), `SystemTimeMicroseconds` (CPU in kernel mode)
- If `RealTime` >> `UserTime + SystemTime`, the query is waiting (IO, locks, network)
- If `UserTime` is dominant, the query is CPU-bound (consider materialized views or projections to reduce computation)
- The **Count chart** shows `SoftPageFaults`, `HardPageFaults`, `ContextSwitches`, high hard page faults mean the working set doesn't fit in RAM
