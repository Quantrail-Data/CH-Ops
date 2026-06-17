# Memory Allocator

## What This Page Shows

The Memory Allocator page shows how ClickHouse®'s internal memory manager (jemalloc) is performing. Every byte of memory ClickHouse® uses goes through jemalloc. This page tells you whether memory is being used efficiently, where waste is happening, and whether the allocator itself is causing performance problems.

You do not need to understand jemalloc internals to use this page. Every chart and metric uses plain language with hover tooltips that explain what each number means.

---

## Health Cards (Top of Page)

Eight cards show the key memory metrics. Cards with green left borders are healthy. Amber means something deserves attention. Red means there is a problem.

#### Used by Queries

The total bytes actively in use by ClickHouse® queries, caches, and internal data structures. This is the "useful" memory.

**What to look for:** Compare this to Physical RAM. If Used by Queries is a small fraction of Physical RAM, the server has plenty of headroom. If it is close to Physical RAM, the server is under memory pressure.

#### Given to Allocator

The total bytes in pages that jemalloc has marked as "active." This is always larger than Used by Queries because jemalloc allocates memory in pages (usually 4 KB each), and a partially used page counts its full size here.

**What to look for:** The gap between this and Used by Queries is the internal fragmentation. A small gap (under 15%) is normal. A large gap (over 25%) means jemalloc is holding onto more page space than necessary.

#### Internal Fragmentation

The percentage of allocator-active memory that is wasted inside pages. Formula: (Given to Allocator - Used by Queries) / Used by Queries.

| Value | Meaning | Card border |
|-------|---------|-------------|
| Below 15% | Healthy. Normal for most workloads. | Green |
| 15% to 25% | Elevated. Not urgent but worth monitoring. | Amber |
| Above 25% | High. Queries may be using allocation sizes that cause poor packing. | Red |

**What causes high fragmentation:** Workloads that allocate many small objects of varying sizes. Hash tables used by GROUP BY with high cardinality are a common cause. The allocation size does not always match a jemalloc size class exactly, so some space in each slab goes unused.

#### Memory Efficiency

The inverse of fragmentation. What percentage of the allocator's active pages are actually used by queries. Formula: Used by Queries / Given to Allocator.

| Value | Meaning | Card border |
|-------|---------|-------------|
| Above 85% | Healthy | Green |
| 75% to 85% | Moderate | Amber |
| Below 75% | Poor | Red |

#### Physical RAM

Total physical memory (RAM) occupied by the ClickHouse® process as reported by the operating system. This is the number that matters for capacity planning and OOM risk assessment.

#### Virtual Memory

Total virtual address space mapped by jemalloc. This can be significantly larger than Physical RAM because jemalloc maps memory regions lazily. Pages are reserved in virtual address space but may not be backed by physical RAM until actually used. A large Virtual Memory value with a much smaller Physical RAM value is normal and not a concern.

#### Reclaimable

Memory pages that jemalloc has freed internally but has not yet returned to the operating system. jemalloc holds onto these pages for efficiency: returning memory to the OS (via `madvise`) is expensive, and the same pages will likely be needed again soon.

**What to look for:** A large Reclaimable value after a period of high memory usage is normal. It means jemalloc freed the memory internally but is waiting before returning it to the OS. The pages will be reused by future allocations or gradually purged by jemalloc's background thread.

#### Bookkeeping

Memory used by jemalloc itself to track its internal data structures: arena metadata, bin tracking, extent records, thread caches. Typically under 1% of total memory. If this grows disproportionately, it may indicate too many arenas or an unusually high number of active allocation size classes.

---

## Memory Breakdown Bar

A single horizontal stacked bar that shows how Physical RAM is divided into four categories:

- **Green segment (Used by Queries):** The useful memory
- **Amber segment (Internal Waste):** The gap between Used by Queries and Given to Allocator
- **Orange segment (Reclaimable):** Pages freed internally but not returned to OS
- **Gray segment (Bookkeeping):** jemalloc's own metadata

**How to interpret:**

If the green segment fills most of the bar, memory is being used efficiently. If the amber segment is large, internal fragmentation is high. If the orange segment is large after a workload spike, jemalloc is holding freed pages for reuse, which is normal behavior.

Hover over the bar to see exact byte values for each segment.

---

## Thread Distribution and Pool Load Balance

jemalloc divides memory into independent pools (called arenas). Each pool has its own locks, free lists, and thread caches. The purpose of multiple pools is to reduce lock contention when many threads allocate memory simultaneously.

#### Thread Distribution (left heatmap)

Shows how many threads are assigned to each pool. Ideally, threads are distributed evenly. A highly uneven distribution (one pool with 80% of threads) can cause that pool to become a bottleneck.

**Bar colors:**
- Green: Pool has a proportional share of threads
- Amber: Pool has more threads than average
- Red: Pool has a disproportionately large share

The line at the bottom shows the total thread count and the ideal balanced percentage per pool.

#### Pool Load Balance (right heatmap)

Shows the allocation request rate (allocations per second) for each pool. Even if threads are distributed evenly, one pool might handle a much higher allocation rate if those threads are doing more memory-intensive work.

**Bar colors:**
- Green: Low load relative to the busiest pool
- Amber: Moderate load
- Red: Highest load (this pool is doing the most work)

**What to look for:** If one pool consistently has 3x or more the request rate of others, the workload is unbalanced. This is usually not actionable (jemalloc manages pool assignment automatically), but it explains why one pool might show higher fragmentation.

---

## Pool Comparison Table

A sortable table showing per-pool metrics. Click any column header to sort.

| Column | What it means |
|--------|---------------|
| Pool | The arena (pool) number |
| Used by Queries | Bytes actively used in this pool |
| Given to Allocator | Active bytes (includes waste) |
| Physical RAM | Resident memory for this pool |
| Fragmentation | Per-pool fragmentation percentage. Color-coded: green < 15%, amber 15-25%, red > 25% |
| Threads | Number of threads assigned to this pool |

**What to look for:** If one pool has significantly higher fragmentation than others, the threads assigned to it may be running queries with poor allocation patterns (e.g., many small varying-size allocations). Cross-reference with the load balance heatmap to see if this pool is also the busiest.

---

## Busiest Sizes and Most Wasteful Sizes

Two side-by-side heatmaps showing the top 15 allocation size classes by activity and waste.

#### Busiest Sizes (left)

Shows which allocation sizes have the highest request rate (allocations per second). jemalloc groups small allocations (8 bytes to ~14 KB) into fixed-size "bins." Each bin handles one size class.

**What to look for:**
- If one size dominates (e.g., 64 bytes at 50K req/s while everything else is under 1K), that size class is under heavy pressure. This is common for hash table entries in GROUP BY operations.
- Very high allocation rates for small sizes (8-64 bytes) can indicate excessive temporary object creation.

#### Most Wasteful Sizes (right)

Shows which size classes have the lowest slot usage (utilization). Slot Usage is the fraction of allocated slots in a slab that are actually in use. Low utilization means the slab has reserved space that is sitting empty.

**Bar colors:**
- Red: Slot Usage below 50% (severe waste)
- Amber: Slot Usage 50-70% (moderate waste)
- Green: Slot Usage above 70% (healthy)

**What to look for:** A size class with low utilization and high allocated bytes is wasting significant memory. For example, a 4 KB bin with 38% utilization and 2.1 MB waste means 2.1 MB of slab space is reserved but empty.

This is usually not directly actionable (you cannot control which sizes ClickHouse® allocates), but it explains where memory overhead comes from. If waste is extreme, consider:
- Reducing `max_threads` to lower the number of thread caches
- Tuning `max_bytes_before_external_group_by` to spill large GROUP BY operations to disk instead of growing hash tables in memory

---

## Lock Contention (Conditional Section)

This section only appears when jemalloc's internal locks show non-zero contention. On healthy systems, it is hidden entirely.

Each row represents one internal mutex. The columns:

| Column | What it means |
|--------|---------------|
| Lock Name | The internal jemalloc mutex (e.g., `background_thread`, `ctl`, `prof`) |
| Lock Ops | Total lock acquisitions. High numbers are normal. |
| Spin Waits | Times a thread had to spin-wait (busy-wait) to acquire the lock. Non-zero means contention. Shown in amber. |
| Blocked | Times a thread had to sleep-wait for the lock. Worse than spin waits. Shown in red. |
| Total Wait | Cumulative nanoseconds all threads spent waiting for this lock |
| Worst Wait | The single longest wait in nanoseconds. Indicates worst-case latency impact. |

**What to look for:**
- `background_thread` mutex contention: The background purging thread is competing with allocation threads. Usually harmless.
- `ctl` mutex contention: The stats collection itself is causing lock contention. This happens when stats are polled too frequently.
- `prof` mutex contention: The profiler is interfering with allocations. Only relevant when global profiling is enabled.

If Total Wait or Worst Wait is in the millisecond range (1,000,000+ ns), the allocator is adding noticeable latency to memory operations.

---

## Collapsed Detail Sections

Five sections at the bottom of the page. All collapsed by default. Click the section title to expand.

#### All Allocation Sizes

The full table of every bin (allocation size class) with 10 columns. This is a simplified view of the 43-column internal jemalloc data, showing only the most commonly needed fields:

| Column | What it means |
|--------|---------------|
| Size | The allocation size class (e.g., 8 B, 64 B, 256 B, 4 KB) |
| Allocated | Total bytes currently allocated in this size class |
| Alloc Rate | Allocation requests per second |
| Current Count | Number of active (not freed) objects of this size |
| Active Slabs | Number of slab pages holding objects of this size |
| Slot Usage | Fraction of slab slots in use (higher = less waste) |
| Total Allocs | Cumulative malloc count since server start |
| Total Frees | Cumulative free count since server start |
| Cache Fills | Times a thread-local cache was refilled from the shared pool |
| Cache Flushes | Times a thread-local cache was flushed back to the shared pool |

#### Large Allocations

Allocations larger than ~14 KB. These are managed differently from small allocations (one extent per allocation, no slabs).

#### Memory Regions (extents)

Shows how memory pages are distributed by state: dirty (recently freed), muzzy (advised to OS), retained (held in reserve). This is the low-level view of jemalloc's page management.

#### Per-Pool Drill-down

Select a specific pool (arena) from the dropdown to see its allocation breakdown (small/large/total) and counts.

#### Raw jemalloc Output

The complete unprocessed text from `system.jemalloc_stats`. Use the Copy or Save buttons to export it for sharing with ClickHouse® support or for analysis with external tools.

---

## Common Scenarios

#### "Physical RAM is 32 GB but Used by Queries is only 8 GB"

This is normal if the workload is light. The server has 24 GB of headroom. Check Reclaimable: if it is large (say 6 GB), that means jemalloc previously used more memory and is holding freed pages for reuse. The OS still counts those pages in the process's resident set size.

#### "Fragmentation is above 30%"

High fragmentation usually comes from GROUP BY queries on high-cardinality keys. The hash table allocates many entries of slightly different sizes, causing poor slab packing. Actionable steps:

1. Check the Busiest Sizes heatmap. If one size dominates, that is the hot allocation path.
2. Check the Most Wasteful Sizes heatmap. If the same size appears here with low utilization, it is the primary waste source.
3. Consider setting `max_bytes_before_external_group_by` to limit in-memory hash table growth.
4. Consider reducing `max_threads` to lower the number of concurrent allocators competing for slabs.

#### "One pool has 3x the load of others"

jemalloc assigns threads to arenas using a round-robin strategy at thread creation time. If certain threads are more allocation-heavy than others, their assigned arena gets more load. This is not directly fixable but explains uneven fragmentation across pools.

#### "Lock contention appeared after enabling profiling"

The `prof` mutex contention is expected when `jemalloc_enable_global_profiler` is turned on. The profiler intercepts every allocation to record a stack trace, which requires locking. If the contention is causing visible query latency, consider:
- Using per-query profiling (`jemalloc_enable_profiler = 1` in query SETTINGS) instead of global profiling
- Increasing the profiling sample rate to reduce frequency

#### "Reclaimable is very large (multiple GB) and not shrinking"

jemalloc's background thread purges reclaimable pages at a configured interval (typically every second). If Reclaimable stays large, the background thread may not be running. Check the Background Threads count in the Lock Contention section (if visible) or in the Raw Output. If `Background threads: 0`, the thread is disabled. This can be configured in ClickHouse® server settings.

#### "No data on the page"

Three possible causes:
1. `system.jemalloc_stats` does not exist. This table was added in ClickHouse® 23.x. Older versions do not have it.
2. The ClickHouse® user configured in CHOps does not have SELECT permission on `system.jemalloc_stats`.
3. The ClickHouse® build does not use jemalloc (some custom builds use a different allocator).

---

## Tips

- **Check after workload changes.** Memory allocation patterns change when query patterns change. After deploying new queries or changing table schemas, review the Memory Allocator page to see if fragmentation increased.
- **Compare pools.** If one pool consistently shows higher fragmentation, the threads assigned to it are running a more allocation-heavy workload. This is informational, not actionable, but it helps explain memory behavior.
- **Use Raw Output for support.** When filing a ClickHouse® issue about memory usage, attach the Raw jemalloc Output. It contains everything the ClickHouse® team needs to diagnose allocator-level problems.
- **Reclaimable is not a leak.** Large Reclaimable values after a spike are normal. jemalloc intentionally delays returning memory to the OS for performance. It will reuse those pages for future allocations.
