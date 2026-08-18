# Memory Allocator

## What This Page Shows

The Memory Allocator page shows how ClickHouse&reg;'s internal memory manager (jemalloc) performs. Every byte of memory ClickHouse&reg; uses goes through jemalloc. This page tells you whether memory is used efficiently, where waste happens, and whether the allocator itself causes performance problems.

You do not need to understand jemalloc internals to use this page. Every chart and metric uses plain language, with hover tooltips that explain what each number means.

---

## Health Cards (Top of Page)

Eight cards show the key memory metrics. Cards with green left borders are healthy. Amber means something deserves attention. Red means there is a problem.

#### Used by Queries

The total bytes actively in use by ClickHouse&reg; queries, caches, and internal data structures. This is the "useful" memory.

**What to look for:** compare this to Physical RAM. If Used by Queries is a small fraction of Physical RAM, the server has plenty of headroom. If it is close to Physical RAM, the server is under memory pressure.

#### Given to Allocator

The total bytes in pages that jemalloc has marked as "active." This is always larger than Used by Queries, because jemalloc allocates memory in pages (usually 4 KB each), and a partially used page counts its full size here.

**What to look for:** the gap between this and Used by Queries is the internal fragmentation. A small gap (under 15%) is normal. A large gap (over 25%) means jemalloc holds more page space than necessary.

#### Internal Fragmentation

The percentage of allocator-active memory that is wasted inside pages. Formula: (Given to Allocator - Used by Queries) / Used by Queries.

| Value | Meaning | Card border |
|-------|---------|-------------|
| Below 15% | Healthy. Normal for most workloads. | Green |
| 15% to 25% | Elevated. Not urgent but worth a watch. | Amber |
| Above 25% | High. Queries may use allocation sizes that cause poor packing. | Red |

**What causes high fragmentation:** workloads that allocate many small objects of varying sizes. Hash tables used by GROUP BY with high cardinality are a common cause. The allocation size does not always match a jemalloc size class exactly, so some space in each slab goes unused.

#### Memory Efficiency

The inverse of fragmentation. The percentage of the allocator's active pages that queries actually use. Formula: Used by Queries / Given to Allocator.

| Value | Meaning | Card border |
|-------|---------|-------------|
| Above 85% | Healthy | Green |
| 75% to 85% | Moderate | Amber |
| Below 75% | Poor | Red |

#### Physical RAM

The total physical memory (RAM) that the ClickHouse&reg; process occupies, as reported by the operating system. This is the number that matters for capacity planning and OOM risk assessment.

#### Virtual Memory

The total virtual address space that jemalloc mapped. This can be much larger than Physical RAM, because jemalloc maps memory regions lazily. Pages are reserved in virtual address space but may not be backed by physical RAM until they are actually used. A large Virtual Memory value with a much smaller Physical RAM value is normal and not a concern.

#### Reclaimable

Memory pages that jemalloc has freed internally but has not yet returned to the operating system. jemalloc holds these pages for efficiency. To return memory to the OS (with `madvise`) is expensive, and the same pages will likely be needed again soon.

**What to look for:** a large Reclaimable value after a period of high memory use is normal. It means jemalloc freed the memory internally but waits before it returns it to the OS. Future allocations will reuse the pages, or jemalloc's background thread will purge them gradually.

#### Bookkeeping

Memory that jemalloc itself uses to track its internal data structures: arena metadata, bin tracking, extent records, thread caches. Typically under 1% of total memory. If this grows out of proportion, it may mean too many arenas or an unusually high number of active allocation size classes.

---

## Memory Breakdown Bar

A single horizontal stacked bar that shows how Physical RAM divides into four categories:

- **Green segment (Used by Queries):** the useful memory.
- **Amber segment (Internal Waste):** the gap between Used by Queries and Given to Allocator.
- **Orange segment (Reclaimable):** pages freed internally but not returned to the OS.
- **Gray segment (Bookkeeping):** jemalloc's own metadata.

**How to interpret it:**

If the green segment fills most of the bar, memory is used efficiently. If the amber segment is large, internal fragmentation is high. If the orange segment is large after a workload spike, jemalloc holds freed pages for reuse, which is normal.

Hover over the bar to see the exact byte values for each segment.

---

## Thread Distribution and Pool Load Balance

jemalloc divides memory into independent pools (called arenas). Each pool has its own locks, free lists, and thread caches. The purpose of multiple pools is to reduce lock contention when many threads allocate memory at the same time.

#### Thread Distribution (left heatmap)

Shows how many threads are assigned to each pool. Ideally, threads are spread evenly. A highly uneven spread (one pool with 80% of threads) can make that pool a bottleneck.

**Bar colors:**

- Green: the pool has a proportional share of threads.
- Amber: the pool has more threads than average.
- Red: the pool has a disproportionately large share.

The line at the bottom shows the total thread count and the ideal balanced percentage per pool.

#### Pool Load Balance (right heatmap)

Shows the allocation request rate (allocations per second) for each pool. Even if threads are spread evenly, one pool might handle a much higher allocation rate if those threads do more memory-intensive work.

**Bar colors:**

- Green: low load relative to the busiest pool.
- Amber: moderate load.
- Red: the highest load (this pool does the most work).

**What to look for:** if one pool consistently has 3x or more the request rate of others, the workload is unbalanced. This is usually not actionable (jemalloc manages pool assignment automatically), but it explains why one pool might show higher fragmentation.

---

## Pool Comparison Table

A sortable table with per-pool metrics. Click any column header to sort.

| Column | What it means |
|--------|---------------|
| Pool | The arena (pool) number |
| Used by Queries | Bytes actively used in this pool |
| Given to Allocator | Active bytes (includes waste) |
| Physical RAM | Resident memory for this pool |
| Fragmentation | Per-pool fragmentation percentage. Color-coded: green under 15%, amber 15 to 25%, red over 25% |
| Threads | The number of threads assigned to this pool |

**What to look for:** if one pool has much higher fragmentation than others, the threads assigned to it may run queries with poor allocation patterns (for example, many small varying-size allocations). Cross-reference with the load balance heatmap to see whether this pool is also the busiest.

---

## Busiest Sizes and Most Wasteful Sizes

Two side-by-side heatmaps that show the top 15 allocation size classes by activity and by waste.

#### Busiest Sizes (left)

Shows which allocation sizes have the highest request rate (allocations per second). jemalloc groups small allocations (8 bytes to about 14 KB) into fixed-size "bins." Each bin handles one size class.

**What to look for:**

- If one size dominates (for example, 64 bytes at 50K req/s while everything else is under 1K), that size class is under heavy pressure. This is common for hash table entries in GROUP BY operations.
- Very high allocation rates for small sizes (8 to 64 bytes) can mean excessive temporary object creation.

#### Most Wasteful Sizes (right)

Shows which size classes have the lowest slot usage (utilization). Slot Usage is the fraction of allocated slots in a slab that are actually in use. Low utilization means the slab has reserved space that sits empty.

**Bar colors:**

- Red: Slot Usage below 50% (severe waste).
- Amber: Slot Usage 50 to 70% (moderate waste).
- Green: Slot Usage above 70% (healthy).

**What to look for:** a size class with low utilization and high allocated bytes wastes significant memory. For example, a 4 KB bin with 38% utilization and 2.1 MB waste means 2.1 MB of slab space is reserved but empty.

This is usually not directly actionable (you cannot control which sizes ClickHouse&reg; allocates), but it explains where memory overhead comes from. If waste is extreme, consider:

- A lower `max_threads` to reduce the number of thread caches.
- A tune of `max_bytes_before_external_group_by` to spill large GROUP BY operations to disk instead of a growth of hash tables in memory.

---

## Lock Contention (Conditional Section)

This section only appears when jemalloc's internal locks show non-zero contention. On healthy systems, it is hidden entirely.

Each row is one internal mutex. The columns:

| Column | What it means |
|--------|---------------|
| Lock Name | The internal jemalloc mutex (for example, `background_thread`, `ctl`, `prof`) |
| Lock Ops | Total lock acquisitions. High numbers are normal. |
| Spin Waits | Times a thread had to spin-wait (busy-wait) to acquire the lock. Non-zero means contention. Shown in amber. |
| Blocked | Times a thread had to sleep-wait for the lock. Worse than spin waits. Shown in red. |
| Total Wait | Cumulative nanoseconds all threads spent to wait for this lock |
| Worst Wait | The single longest wait in nanoseconds. Shows the worst-case latency impact. |

**What to look for:**

- `background_thread` mutex contention: the background purging thread competes with allocation threads. Usually harmless.
- `ctl` mutex contention: the stats collection itself causes lock contention. This happens when stats are polled too frequently.
- `prof` mutex contention: the profiler interferes with allocations. Only relevant when global profiling is on.

If Total Wait or Worst Wait is in the millisecond range (1,000,000+ ns), the allocator adds noticeable latency to memory operations.

---

## Collapsed Detail Sections

There are five sections at the bottom of the page. All are collapsed by default. Click the section title to expand it.

#### All Allocation Sizes

The full table of every bin (allocation size class) with 10 columns. This is a simplified view of the 43-column internal jemalloc data, and shows only the most commonly needed fields:

| Column | What it means |
|--------|---------------|
| Size | The allocation size class (for example, 8 B, 64 B, 256 B, 4 KB) |
| Allocated | Total bytes currently allocated in this size class |
| Alloc Rate | Allocation requests per second |
| Current Count | The number of active (not freed) objects of this size |
| Active Slabs | The number of slab pages that hold objects of this size |
| Slot Usage | The fraction of slab slots in use (higher means less waste) |
| Total Allocs | Cumulative malloc count since server start |
| Total Frees | Cumulative free count since server start |
| Cache Fills | Times a thread-local cache was refilled from the shared pool |
| Cache Flushes | Times a thread-local cache was flushed back to the shared pool |

#### Large Allocations

Allocations larger than about 14 KB. These are managed differently from small allocations (one extent per allocation, no slabs).

#### Memory Regions (extents)

Shows how memory pages are distributed by state: dirty (recently freed), muzzy (advised to the OS), and retained (held in reserve). This is the low-level view of jemalloc's page management.

#### Per-Pool Drill-down

Select a specific pool (arena) from the dropdown to see its allocation breakdown (small, large, total) and counts.

#### Raw jemalloc Output

The complete unprocessed text from `system.jemalloc_stats`. Use the Copy or Save buttons to export it, to share with ClickHouse&reg; support or to analyze with external tools.

---

## Common Scenarios

#### "Physical RAM is 32 GB but Used by Queries is only 8 GB"

This is normal if the workload is light. The server has 24 GB of headroom. Check Reclaimable: if it is large (say 6 GB), that means jemalloc previously used more memory and holds freed pages for reuse. The OS still counts those pages in the process's resident set size.

#### "Fragmentation is above 30%"

High fragmentation usually comes from GROUP BY queries on high-cardinality keys. The hash table allocates many entries of slightly different sizes, which causes poor slab packing. Actionable steps:

1. Check the Busiest Sizes heatmap. If one size dominates, that is the hot allocation path.
2. Check the Most Wasteful Sizes heatmap. If the same size appears here with low utilization, it is the primary waste source.
3. Consider setting `max_bytes_before_external_group_by` to limit in-memory hash table growth.
4. Consider a lower `max_threads` to reduce the number of concurrent allocators that compete for slabs.

#### "One pool has 3x the load of others"

jemalloc assigns threads to arenas with a round-robin strategy at thread creation time. If certain threads are more allocation-heavy than others, their assigned arena gets more load. This is not directly fixable, but it explains uneven fragmentation across pools.

#### "Lock contention appeared after I enabled profiling"

The `prof` mutex contention is expected when `jemalloc_enable_global_profiler` is on. The profiler intercepts every allocation to record a stack trace, which requires a lock. If the contention causes visible query latency, consider:

- Per-query profiling (`jemalloc_enable_profiler = 1` in query SETTINGS) instead of global profiling.
- A higher profiling sample interval, to reduce the frequency.

#### "Reclaimable is very large (multiple GB) and not shrinking"

jemalloc's background thread purges reclaimable pages at a configured interval (typically every second). If Reclaimable stays large, the background thread may not be running. Check the Background Threads count in the Lock Contention section (if visible) or in the Raw Output. If `Background threads: 0`, the thread is disabled. You can configure this in ClickHouse&reg; server settings.

#### "No data on the page"

There are three possible causes:

1. `system.jemalloc_stats` does not exist. This table was added in ClickHouse&reg; 23.x. Older versions do not have it.
2. The ClickHouse&reg; user configured in CHOps does not have SELECT permission on `system.jemalloc_stats`.
3. The ClickHouse&reg; build does not use jemalloc (some custom builds use a different allocator).

---

## Tips

- **Check after workload changes.** Memory allocation patterns change when query patterns change. After you deploy new queries or change table schemas, review the Memory Allocator page to see whether fragmentation increased.
- **Compare pools.** If one pool consistently shows higher fragmentation, the threads assigned to it run a more allocation-heavy workload. This is informational, not actionable, but it helps explain memory behavior.
- **Use Raw Output for support.** When you file a ClickHouse&reg; issue about memory use, attach the Raw jemalloc Output. It contains everything the ClickHouse&reg; team needs to diagnose allocator-level problems.
- **Reclaimable is not a leak.** Large Reclaimable values after a spike are normal. jemalloc intentionally delays the return of memory to the OS for performance. It reuses those pages for future allocations.
