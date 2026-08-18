# Query Metrics

Query Metrics shows a second-by-second timeline of how a query used resources while it ran: memory, CPU, disk IO, cache hits and misses, network, and hundreds of other counters. It shows the resource use of one query over its whole lifetime.

Go to **Tools > Query Metrics**.

---

## What Are Query Metrics?

When a query runs for more than about 1 second, ClickHouse&reg; takes a snapshot of its resource use every second. Each snapshot records hundreds of counters: how much memory the query uses right now, how many bytes it has read from disk so far, how many cache hits and misses occurred, and much more.

ClickHouse&reg; stores these snapshots in the `system.query_metric_log` table. Query Metrics turns the raw data into visual timelines, grouped by category and unit, so you can see exactly how resources were used over the query's lifetime.

**When is this useful?**

- A query uses too much memory and you want to see exactly when the memory spike happens.
- A query is slow and you want to know whether it spends time on disk reads, cache misses, or network waits.
- You want to compare two queries to understand why one is faster than the other.
- You need to tune cache sizes and want to see the hit and miss ratio for a specific workload.

---

## Getting Started

1. Set the **From** and **To** datetime fields. The default is the last 1 hour.
2. Click **Load Queries**. This shows queries that have per-second metric data.
3. Click a query in the list to see its details (query ID, SQL text, duration), then click **Use This Query**.
4. Click **Show Query Metrics**.
5. Charts appear, grouped by category and unit.

Only categories with non-zero data appear. A simple `SELECT 1` might show only Memory and CPU. A complex query with JOINs, disk spilling, and remote reads shows many more groups.

---

## Understanding the Charts

#### Layout

Charts appear **two per row** in a grid. Each chart shows one category of metrics at one unit of measurement. The X axis is time, one data point per second of query execution. The Y axis is the metric value, labeled with the unit.

If a category has metrics with different units, for example Memory has both byte values and count values, they appear as **separate charts**, so the Y axis scale stays meaningful. You see labels like "Memory, Bytes" and "Memory, Count" side by side.

#### Reading the Charts

Each colored line is one metric. The legend at the bottom shows the metric names, with the `ProfileEvent_` prefix stripped for readability. Click a legend item to show or hide that metric.

**Tip:** If a chart has too many lines to read clearly, click legend items to hide the less important ones and focus on what matters.

#### Chart Splitting

When a category has more than 4 metrics of the same unit, CHOps splits them into sub-charts of 4 metrics each. The charts are labeled with part numbers: "In-Memory Caches, Count (1/3)", "(2/3)", "(3/3)". The most active metrics, by total value across the query's lifetime, appear in the first sub-chart.

---

## Reading Patterns

#### Memory Chart

A typical Memory, Bytes chart shows:

- **memory_usage**, the current memory the query has allocated. It goes up and down as the query allocates and releases memory.
- **peak_memory_usage**, the highest memory_usage so far. It only goes up.

| Pattern | What It Tells You |
|---------|------------------|
| Both lines climb steadily | The query accumulates data in memory (a hash table, a sort, an aggregation) |
| memory_usage spikes then drops, peak stays high | A brief memory spike, common with large hash JOINs that allocate a big hash table, use it, then release it |
| Both lines are flat and low | The query uses little memory. It streams data without buffering |
| peak_memory_usage hits the memory limit | The query was killed or throttled for going above `max_memory_usage` |

#### Disk IO Chart

- **OSReadBytes**, bytes read from disk. A steady climb means the query scans data.
- **OSWriteBytes**, bytes written to disk. A spike usually means the query spills intermediate results to disk.
- **DiskReadElapsedMicroseconds**, time spent waiting for disk reads. High values mean IO is the bottleneck.

#### Cache Chart

- **MarkCacheHits** against **MarkCacheMisses**. The ratio tells you whether the mark cache is effective. High misses mean the cache is too small.
- **PageCacheHits** against **PageCacheMisses**. The same, for the uncompressed page cache.

---

## How Units Work

CHOps detects the unit of each metric from its column name, and never mixes metrics with different units in the same chart.

| Column Name Pattern | Unit | Y Axis Label |
|--------------------|------|-------------|
| `*Microseconds` | μs | Time (μs) |
| `*Milliseconds` | ms | Time (ms) |
| `*Nanoseconds` | ns | Time (ns) |
| `*Bytes`, `*BytesSent`, `*BytesReceived`, `*Chars` | bytes | Bytes |
| `*Rows` | rows | Rows |
| Everything else (hits, misses, faults, cycles, counts) | count | Count |
| `memory_usage`, `peak_memory_usage` | bytes | Bytes |

So a category like "CPU & Time" may produce two charts: one for time metrics (μs) and one for count metrics (page faults, context switches). Both are labeled clearly.

---

## Metric Categories

CHOps classifies the hundreds of possible metrics into categories. Only categories with non-zero data appear. Categories are ordered by how commonly they appear.

#### Common Categories (appear for most queries)

| Category | What It Shows | Key Metrics to Watch |
|----------|--------------|---------------------|
| **Memory** | Memory usage, peak, arena allocations, jemalloc stats | `memory_usage` against `peak_memory_usage`, to see spikes |
| **CPU & Time** | Wall-clock time, CPU time, IO wait time, page faults | `RealTimeMicroseconds` against `UserTimeMicroseconds`. If Real is much higher than User, the query waits, it does not compute |
| **Disk IO** | Bytes and time for disk reads and writes, IO buffer allocations | `OSReadBytes`. If high, the query reads a lot from disk |
| **Data Read** | Rows and bytes selected, parts and marks scanned | `SelectedRows`, `SelectedMarks`. High values mean a large scan |
| **In-Memory Caches** | Mark cache, page cache, primary index cache, query cache hits and misses | Hits against Misses. High misses mean the cache is too small |
| **Marks & Index Loading** | Time and count to load mark files and primary index blocks | `WaitMarksLoadMicroseconds`. If high, marks are loaded from disk |
| **Query Execution** | Function calls, JIT compilation, overflow checks | Compilation time and function call counts |
| **Threading & Locks** | Thread pool activity, context switches, lock wait times | High lock wait times mean contention between threads |

#### Write-Path Categories (appear for INSERT queries)

| Category | What It Shows |
|----------|--------------|
| **Data Write** | Rows and bytes inserted, delayed and rejected inserts |
| **Merges & Mutations** | Background merge activity, rows merged, merge duration |

#### Infrastructure Categories (appear based on your setup)

| Category | When It Appears |
|----------|----------------|
| **Filesystem Cache** | When the filesystem cache is enabled in your ClickHouse&reg; config |
| **Network & Connections** | Distributed queries that read from remote shards |
| **S3 / Azure / Remote** | Data stored on S3, Azure Blob Storage, or other remote storage |
| **External Operations** | The query goes above in-memory limits and spills to disk (sort, aggregation, join) |
| **JOIN Operations** | Queries with JOINs (hash table sizes, probe and build counts) |
| **ClickHouse® Keeper** | Operations on replicated tables |

#### Rare Categories

| Category | When It Appears |
|----------|----------------|
| **Kafka** | Kafka engine table reads and writes |
| **Backup** | BACKUP and RESTORE commands |
| **Logging** | Always present but usually low (internal log message counts) |
| **Throttling** | When bandwidth throttling settings are active |
| **Other** | Metrics that do not fit any category |

#### What Appears Per Query Type

Different query types activate different categories. Use this as a quick reference for what to look for.

#### Simple SELECT (for example, `SELECT * FROM table WHERE id = 123`)

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `memory_usage` should stay flat if the query streams | A steady climb means the query buffers too much data |
| CPU & Time, Time (μs) | `RealTimeMicroseconds` against `UserTimeMicroseconds` | Real much higher than User means the query waits on IO, it does not compute |
| Disk IO, Bytes | `OSReadBytes` should be proportional to result size | Reads much higher than result size means the query scans too many parts |
| Disk IO, Time (μs) | `DiskReadElapsedMicroseconds` | High values mean disk is the bottleneck. Check whether the filesystem cache is enabled |
| Data Read, Rows | `SelectedRows`, `SelectedMarks` | A high mark count means many granules scanned. Check whether the WHERE clause matches ORDER BY |
| In-Memory Caches, Count | `MarkCacheHits` against `MarkCacheMisses` | A miss ratio above 10% means the mark cache is cold or too small |

#### SELECT with JOIN

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `peak_memory_usage` may spike during the hash table build | If peak is much higher than steady state, the JOIN hash table is large. Consider `partial_merge_join` |
| JOIN, Rows | `JoinBuildTableRows`, `JoinProbeTableRows` | Build table too large? Move the smaller table to the right side of the JOIN |
| JOIN, Count | `JoinResultRows` | Result much larger than input? Likely a many-to-many join (check the JOIN keys) |
| External Operations, Bytes | `ExternalJoinWritePart` | If present, the JOIN spilled to disk. Increase `max_bytes_in_join` or restructure |

#### SELECT with GROUP BY / ORDER BY

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `ArenaAllocBytes` climbing steadily | Large aggregation state, high-cardinality GROUP BY |
| External Operations, Bytes | `ExternalSortWritePart`, `ExternalAggregationWritePart` | Data spilled to disk. Increase `max_bytes_before_external_sort` or `max_bytes_before_external_group_by` |
| Threading, Count | `ContextSwitches` | High values with many threads. Reduce `max_threads` or check lock contention |

#### INSERT

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Memory, Bytes | `memory_usage` should be low for streaming inserts | High memory means large batches or wide rows |
| Data Write, Rows | `InsertedRows`, `InsertedBytes` | Check that throughput matches expectations |
| Data Write, Count | `DelayedInserts`, `RejectedInserts` | A non-zero `DelayedInserts` means too many parts, merges cannot keep up |
| Merges & Mutations, Rows | `MergedRows` | Large values during INSERT mean background merges compete for resources |
| Merges & Mutations, Time (ms) | `MergeTotalMilliseconds` | Long merge times during INSERT may slow down query performance |

#### Distributed SELECT (across shards)

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Network, Bytes | `NetworkSendBytes`, `NetworkReceiveBytes` | A large transfer means too much data moves between shards. Add PREWHERE or push filters down |
| Network, Time (μs) | `NetworkReceiveElapsedMicroseconds` | High values mean network is the bottleneck. Check inter-node bandwidth |
| Network, Count | `DistributedConnectionMissCount` | Non-zero means connection pool misses, connections opened on every query |

#### Cloud Storage Query (S3 / Azure / GCS)

Everything from Simple SELECT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| S3/Remote, Bytes | `ReadBufferFromS3Bytes`, `S3ReadBytes` | Large reads mean you scan too much remote data. Use projections or local caching |
| S3/Remote, Time (μs) | `S3ReadMicroseconds` | High latency per request. Check region proximity |
| S3/Remote, Count | `S3ReadRequestsCount` | Many small requests. Consider a higher `remote_fs_read_backoff_max_ms` |
| Filesystem Cache, Count | `CachedReadBufferCacheWriteBytes` | If the filesystem cache is active, check the hit rate |

#### Replicated Table Write

Everything from INSERT, plus:

| Category | What to Check | Red Flags |
|----------|--------------|-----------|
| Keeper, Time (μs) | `ZooKeeperWaitMicroseconds` | High values mean ClickHouse&reg; Keeper is slow. Check Keeper node health |
| Keeper, Bytes | `ZooKeeperBytesSent`, `ZooKeeperBytesReceived` | Large payloads to Keeper are unusual. They may mean large part metadata |
| Keeper, Count | `ZooKeeperTransactions` | Many transactions per insert. Check the replication queue depth |

A simple `SELECT 1` might show only Memory (bytes) and CPU (μs).

---

## How Discovery Works

`system.query_metric_log` has over 700 columns, and the list changes between ClickHouse&reg; versions. CHOps does not hard-code column names. Instead:

1. **Fetch all rows** for the selected query with `SELECT *` (typically 1 to 60 rows for a 1 to 60 second query).
2. **Scan every row** to find columns where any row has a non-zero value. This catches metrics that activate mid-query (for example, `ExternalSortWritePart` might be 0 for the first 5 seconds, then spike when the sort spills to disk).
3. **Sort by activity.** The most active metrics (highest total absolute value) come first.
4. **Cap at 100 columns.** If more than 100 are active, CHOps keeps the 100 most active.
5. **Classify** each column by category and unit.
6. **Split** categories with more than 4 metrics of the same unit into sub-charts.
7. **Build charts** directly from the fetched data. There is no second query.

This approach is version-agnostic. It works across all ClickHouse&reg; versions, because `SELECT *` discovers the schema at query time.

---

## Prerequisites

| Requirement | Why | How to Check |
|-------------|-----|-------------|
| ClickHouse&reg; 26.3 LTS or newer | CHOps's minimum supported version | `SELECT version()` |
| `query_metric_log` enabled | ClickHouse&reg; stores the metric snapshots here (on by default on 26.3) | `SELECT count() FROM system.query_metric_log`. An error means the table is off |
| Query duration over about 1 second | ClickHouse&reg; samples once per second by default | Run a longer query if you see "no metric data found" |
| SELECT access on `system.query_metric_log` and `system.query_log` | The ClickHouse&reg; user needs read access | `GRANT SELECT ON system.query_metric_log TO your_user` |

#### Enabling query_metric_log

On ClickHouse&reg; 26.3 LTS (CHOps's minimum supported version), `query_metric_log` is on by default. If the table does not exist, or you want to adjust the collection interval, use the `query_metric_log_interval` **session setting**:

```sql
-- Check whether it is on (default 1000ms)
SELECT getSetting('query_metric_log_interval');

-- Set it for a specific user profile (in users.xml or users.d/)
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

Lower values give more detail but add overhead. A value of `0` disables collection entirely.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "No metric data found" | The query was too short (under 1s), or `query_metric_log` is disabled | Run a longer query, or enable `query_metric_log` in the server config |
| "All metrics are zero" | The query was too simple, for example `SELECT 1` | Run a query that reads data or does computation |
| Only Memory and CPU appear | The query did not use disk, cache, network, and so on | Normal for simple queries. Run a complex query to see more categories |
| Charts show flat lines | The query finished in 1 to 2 seconds (only 1 to 2 data points) | Run a longer query for a more detailed timeline |
| Too many lines in one chart | More than 4 metrics in one category and unit group | Already handled. CHOps splits into sub-charts of 4. Click legend items to hide specific metrics |
| Two charts for the same category | The category has metrics with different units | By design. "Memory, Bytes" and "Memory, Count" are separate, to keep the Y axis scales meaningful |
| Charts look empty after a theme switch | A rare rendering glitch | Charts rebuild on a theme change. If still empty, click Show Query Metrics again |

---

## Tips

#### Compare Two Queries

Analyze the slow query and note which categories have high values. Then analyze the fast query. The difference tells you exactly why one is slower.

For example, if the slow query shows high `MarkCacheMisses` and the fast query shows high `MarkCacheHits`, the slow query reads from disk while the fast one reads from cache. The fix is either to warm the cache or increase `mark_cache_size`.

#### Diagnose Memory Spikes

If a query is killed with "Memory limit exceeded":

1. Find the timestamp where `peak_memory_usage` jumps in the Memory, Bytes chart.
2. Look at what other metrics rise at the same moment in other charts.
3. If `ArenaAllocBytes` rises, the query builds a large aggregation or sort buffer.
4. If the External Operations category appears right after the spike, the query started to spill to disk as a fallback.

#### Check Cache Effectiveness

In the In-Memory Caches, Count charts, compare hits against misses:

| Cache | Healthy Ratio | If Misses Are High |
|-------|--------------|-------------------|
| MarkCache | Over 90% hits | Increase `mark_cache_size` (default 5 GiB) |
| UncompressedCache | Over 80% hits | Increase `uncompressed_cache_size` (default 0, which means disabled) |
| PageCache | Varies | OS-level page cache. Consider more RAM |

#### Detect Disk Spilling

If the **External Operations** category appears, the query went above in-memory limits:

- `ExternalSortWritePart` and `ExternalSortMerge` mean ORDER BY spilled. Increase `max_bytes_before_external_sort`.
- `ExternalAggregationWritePart` and `ExternalAggregationMerge` mean GROUP BY spilled. Increase `max_bytes_before_external_group_by`.
- `ExternalJoinWritePart` and `ExternalJoinMerge` mean JOIN spilled. Consider a different JOIN algorithm or higher memory limits.

Spilling is not an error. It is a safety mechanism. But it is much slower than in-memory processing.

#### Understand Time Metrics

When you see both "CPU & Time, Time (μs)" and "CPU & Time, Count" charts:

- The **Time chart** shows `RealTimeMicroseconds` (wall clock), `UserTimeMicroseconds` (CPU in user mode), and `SystemTimeMicroseconds` (CPU in kernel mode).
- If `RealTime` is much higher than `UserTime + SystemTime`, the query waits (IO, locks, network).
- If `UserTime` dominates, the query is CPU-bound. Consider materialized views or projections to reduce computation.
- The **Count chart** shows `SoftPageFaults`, `HardPageFaults`, and `ContextSwitches`. High hard page faults mean the working set does not fit in RAM.
