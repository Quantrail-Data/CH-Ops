// Copyright (C) 2026 Quantrail™ Data Private Limited
// Registry for every number on the Cluster Overview live section.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

export const METRICS = {
  // saturation gauges

  cpu_used: {
    label: "CPU",
    unit: "%",
    source: "async",
    formula: "1 - OSIdleTimeNormalized",
    what: "Share of the machine's CPU capacity in use, across all cores.",
    read:
      "Already normalised per core by the server, so 100 percent means every core is busy rather " +
      "than one of them. Sustained near the top means CPU is the limit and adding query " +
      "concurrency will not help.",
    better: "lower",
  },

  memory_used: {
    label: "OS memory",
    unit: "%",
    source: "async",
    formula: "(OSMemoryTotal - OSMemoryAvailable) / OSMemoryTotal",
    what: "Share of the machine's memory in use, by everything on the box.",
    read:
      "Includes the page cache, so a high figure is normal and healthy on a server that has been " +
      "running a while. What matters is available memory falling toward zero, not used memory " +
      "being high.",
    better: "lower",
  },

  ch_memory_share: {
    label: "ClickHouse memory",
    unit: "%",
    source: "async",
    formula: "MemoryResident / OSMemoryTotal",
    what: "Share of machine memory held by the ClickHouse process itself.",
    read:
      "Compare against max_server_memory_usage. Climbing steadily with no matching query load " +
      "usually means an unbounded cache or a leak rather than real work.",
    better: "lower",
  },

  thread_pool_used: {
    label: "Thread pool",
    unit: "%",
    source: "metrics",
    formula: "GlobalThreadActive / GlobalThread",
    what: "Share of pooled threads currently running a task.",
    read:
      "Reads high even on an idle server, because background executors hold threads permanently " +
      "rather than returning them. Treat a change as the signal, not the absolute number.",
    better: "lower",
  },

  cpu_slots: {
    label: "CPU slots",
    unit: "%",
    source: "metrics",
    formula: "ConcurrencyControlAcquired / ConcurrencyControlSoftLimit",
    what: "Share of the concurrency control budget currently handed out.",
    read:
      "At the limit, queries share threads rather than getting the parallelism they asked for. " +
      "Raising the limit only helps if the CPU gauge has headroom.",
    better: "lower",
  },

  fs_cache_used: {
    label: "Filesystem cache",
    unit: "%",
    source: "metrics",
    formula: "FilesystemCacheSize / FilesystemCacheSizeLimit",
    what: "How full the local cache of remote object storage data is.",
    read:
      "Only meaningful when a disk backed by object storage is configured. A full cache is not a " +
      "problem in itself; it is the eviction rate that costs you, and that is not visible here.",
    better: "lower",
  },

  wide_part_share: {
    label: "Wide parts",
    unit: "%",
    source: "metrics",
    formula: "PartsWide / (PartsWide + PartsCompact)",
    what: "Share of parts stored one file per column rather than all columns in one file.",
    read:
      "Small parts are written compact and larger ones wide. A sharp move usually means part sizes " +
      "crossed min_bytes_for_wide_part, which changes read behaviour for every query against that " +
      "table. Shown as a number rather than a dial because neither end of the range is good or bad.",
    better: null,
  },

  // pool saturation

  pool_utilization: {
    label: "Background pools",
    unit: "%",
    source: "metrics",
    formula: "PoolTask / PoolSize, for each background pool",
    what: "How full each background pool is.",
    read:
      "The most useful early warning on this page. A saturated merge pool means parts stop being " +
      "consolidated, part count climbs, inserts start being delayed, and eventually they fail " +
      "outright.",
    better: "lower",
  },

  // activity

  query_activity: {
    label: "Query activity",
    unit: "",
    source: "metrics",
    formula: "Query, QueryNonInternal, QueryThread, QueryPreempted",
    read:
      "Query counts everything, including work ClickHouse starts for itself. QueryNonInternal is " +
      "the subset a user actually asked for and is usually the more interesting number.",
    better: null,
  },

  background_activity: {
    label: "Background activity",
    unit: "",
    source: "metrics",
    formula: "Merge, MergeParts, PartMutation, Move, ReplicatedFetch, ReplicatedSend, ReplicatedChecks",
    read:
      "What the server is doing when nobody is querying it. Replication counters sitting non-zero " +
      "for long periods point at a replica struggling to keep up rather than at healthy activity.",
    better: null,
  },

  io_in_flight: {
    label: "I/O in flight",
    unit: "",
    source: "metrics",
    formula: "Read, Write, RemoteRead, OpenFileForRead, OpenFileForWrite, NetworkReceive, NetworkSend",
    read:
      "Syscalls and network operations in progress at this instant, not a throughput figure. A " +
      "high read count with low query activity usually means merges rather than users.",
    better: null,
  },

  locks: {
    label: "Locks",
    unit: "",
    source: "metrics",
    formula: "RWLockActiveReaders, RWLockActiveWriters, RWLockWaitingReaders, RWLockWaitingWriters",
    what: "Threads holding or waiting for table locks right now.",
    read:
      "Active locks are normal. Waiting locks are the signal: anything above zero for more than a " +
      "moment means work is queued behind a DDL statement or a mutation.",
    better: "lower",
  },

  // storage

  parts_by_state: {
    label: "Parts by state",
    unit: "parts",
    source: "metrics",
    formula: "PartsActive, PartsOutdated, PartsPreActive, PartsTemporary, PartsDeleting",
    read:
      "Outdated parts are merged-away parts still visible to running queries. Briefly exceeding " +
      "active is normal after a merge. Sustained high means the cleaner is behind and disk will " +
      "grow even though the table has not.",
    better: null,
  },

  attached_objects: {
    label: "Attached objects",
    unit: "",
    source: "metrics",
    formula: "AttachedDatabase, AttachedTable, AttachedView, AttachedReplicatedTable, AttachedDictionary",
    read:
      "The fastest way to notice a table did not come back after a restart. Compare against what " +
      "you expect rather than watching it move.",
    better: null,
  },

  caches: {
    label: "Caches by size",
    unit: "bytes",
    source: "metrics",
    formula: "MarkCacheBytes, PrimaryIndexCacheBytes, UncompressedCacheBytes, and the rest",
    what: "Memory held by each of the server's caches.",
    read:
      "Relative size matters more than absolute. A mark cache dwarfing everything else is normal; " +
      "an uncompressed cache doing so usually means it is enabled and should not be.",
    better: null,
  },

  memory_breakdown: {
    label: "Memory",
    unit: "bytes",
    source: "metrics",
    formula: "MemoryTracking, MergesMutationsMemoryTracking",
    read:
      "Server total against the share held by merges and mutations. Merges taking a large slice " +
      "while queries are slow is a scheduling problem rather than a query problem.",
    better: null,
  },


  // counters, last interval

  ch_cpu_cores: {
    label: "ClickHouse CPU",
    unit: "cores",
    source: "events",
    formula: "(delta(UserTimeMicroseconds) + delta(SystemTimeMicroseconds)) / interval",
    what: "Cores the ClickHouse process itself kept busy over the last interval.",
    read:
      "Read next to the machine CPU gauge. A large gap between them means something other than " +
      "ClickHouse is using the box. This counts only ClickHouse's own processing threads.",
    better: null,
  },

  cpu_blocked: {
    label: "CPU blocked",
    unit: "%",
    source: "events",
    formula: "1 - (delta(UserTime) + delta(SystemTime)) / delta(RealTimeMicroseconds)",
    what: "Of the time processing threads were alive, the share spent waiting rather than executing.",
    read:
      "Low is normal. A rise means threads exist but are blocked, usually on disk, a lock or the " +
      "network. When it climbs, the thread-equivalents chart below shows what they are waiting on. " +
      "Shown as blocked rather than efficient so that, like every other dial here, low is good.",
    better: "lower",
  },

  kernel_share: {
    label: "Kernel share",
    unit: "%",
    source: "events",
    formula: "delta(SystemTime) / (delta(UserTime) + delta(SystemTime))",
    what: "Share of CPU time spent in the kernel rather than in ClickHouse's own code.",
    read:
      "A high share points at syscall-heavy work: many small reads, heavy network traffic, or " +
      "memory pressure causing page faults.",
    better: "lower",
  },

  cpu_starvation: {
    label: "Starvation",
    unit: "%",
    source: "events",
    formula: "delta(OSCPUWaitMicroseconds) / delta(RealTimeMicroseconds)",
    what: "Share of thread time spent ready to run but waiting for the OS to schedule it.",
    read:
      "Non-trivial values mean the machine is oversubscribed: something else is competing for " +
      "CPU, or a container CPU limit is being hit. Adding ClickHouse threads will not help.",
    better: "lower",
  },

  cpu_steal: {
    label: "Steal",
    unit: "%",
    source: "events",
    formula: "1 - delta(OSCPUVirtualTime) / delta(RealTimeMicroseconds)",
    what: "Share of CPU time taken by the hypervisor rather than this guest.",
    read:
      "Non-zero on a virtual machine means a noisy neighbour or an oversubscribed host, and is " +
      "outside your control from inside the guest. Zero on bare metal.",
    better: "lower",
  },

  page_cache_miss: {
    label: "Page cache miss",
    unit: "%",
    source: "events",
    formula: "delta(OSReadBytes) / delta(OSReadChars)",
    what: "Share of filesystem reads that had to reach the device rather than being served from memory.",
    read:
      "Near zero is normal on a warm server. A sustained rise means the working set no longer fits " +
      "in RAM and reads are hitting disk, which shows up as slower queries before it shows up " +
      "anywhere else on this page.",
    better: "lower",
  },

  file_reopen_rate: {
    label: "File reopens",
    unit: "%",
    source: "events",
    formula: "delta(OpenedFileCacheMisses) / (delta(Hits) + delta(Misses))",
    what: "Share of file opens that had to open the file again rather than reuse a cached descriptor.",
    read:
      "High means files are being reopened constantly and the descriptor cache is not earning its " +
      "place. Worth checking against its size setting, though on some workloads a high rate is " +
      "simply expected.",
    better: "lower",
  },

  unsorted_inserts: {
    label: "Unsorted inserts",
    unit: "%",
    source: "events",
    formula: "1 - delta(BlocksAlreadySorted) / delta(Blocks)",
    what: "Share of inserted blocks that arrived out of the table's sort order and had to be sorted.",
    read:
      "Blocks already in ORDER BY order skip the sort entirely, so a low value here is free " +
      "performance. If it is high and you control the writer, sorting before inserting is usually " +
      "a cheap win.",
    better: "lower",
  },

  queueing_overhead: {
    label: "Queueing overhead",
    unit: "%",
    source: "events",
    formula: "delta(LocalThreadPoolJobWaitTime) / delta(LocalThreadPoolBusyMicroseconds)",
    what: "How long a thread pool job waited, as a share of how long the work itself took.",
    read:
      "Low means jobs start almost as soon as they are submitted. Rising means the pool is " +
      "saturated. Unlike a thread count this means the same thing whether the server is busy or " +
      "idle, which is why it is here and the active-threads figure is only informational.",
    better: "lower",
  },

  merge_stall: {
    label: "Merge stall",
    unit: "%",
    source: "events",
    formula: "1 - delta(MergeExecuteMilliseconds) / delta(MergeTotalMilliseconds)",
    what: "Time merges spent scheduled but not executing.",
    read:
      "Near zero is healthy. Rising means merges are held up, commonly by pool saturation or disk " +
      "contention rather than by the merge work itself.",
    better: "lower",
  },

  error_share: {
    label: "Error share of log",
    unit: "%",
    source: "events",
    formula: "delta(LogError) / delta(all log levels)",
    what: "Errors as a proportion of everything the server logged in the last interval.",
    read:
      "More robust than a raw error count, which rises simply because a server is busy. A step " +
      "change here is a real signal even when the absolute count looks unremarkable.",
    better: "lower",
  },

  http_new_connections: {
    label: "New HTTP connections",
    unit: "%",
    source: "events",
    formula: "delta(Created) / (delta(Created) + delta(Reused))",
    what: "Share of HTTP requests that opened a fresh connection instead of reusing one.",
    read:
      "High means clients are not using keep-alive. Every fresh connection costs a handshake and " +
      "shows up as latency. Usually fixed on the client side rather than on the server.",
    better: "lower",
  },

  read_amplification: {
    label: "Read amplification",
    unit: "rows/row",
    source: "events",
    formula: "delta(RowsReadByMainReader) / delta(SelectedRows)",
    what: "Rows the reader scanned for every row your queries returned.",
    read:
      "Near 1 means the primary key is filtering almost perfectly. In the tens or hundreds, most " +
      "of what was read is being discarded, which usually points at a primary key that does not " +
      "match how the table is queried. Normal and expected for full scans and for aggregations " +
      "over whole partitions.",
    better: "lower",
  },

  write_amplification: {
    label: "Write amplification",
    unit: "rows/row",
    source: "events",
    formula: "delta(MergedRows) / delta(InsertedRows)",
    what: "Rows rewritten by background merges for every row inserted.",
    read:
      "MergeTree rewrites data repeatedly as it consolidates small parts, so this is always above " +
      "1. Tens is normal. Hundreds means parts are being created faster than they can be merged, " +
      "and the usual cause is small frequent inserts. Check rows per part next.",
    better: "lower",
  },

  avg_query_latency: {
    label: "Avg query time",
    unit: "ms",
    source: "events",
    formula: "delta(QueryTimeMicroseconds) / delta(Query)",
    what: "Mean wall-clock time per query over the last interval.",
    read:
      "A mean, so one slow query in a quiet interval moves it a long way. Read it alongside the " +
      "query rate: high latency at a low rate is a query problem, high latency at a high rate is " +
      "a capacity problem.",
    better: "lower",
  },

  rows_per_part: {
    label: "Rows per part",
    unit: "rows/part",
    source: "events",
    formula: "delta(MergeTreeDataWriterRows) / delta(MergeTreeDataWriterBlocks)",
    what: "Average rows in each part an insert created.",
    read:
      "Every insert creates at least one part and every part must later be merged. Large batches " +
      "make few big parts and cheap merges. Under about a thousand with a steady insert rate is " +
      "the classic symptom of inserting row by row, and it is the biggest lever on write " +
      "amplification.",
    better: "higher",
  },

  parts_per_merge: {
    label: "Parts per merge",
    unit: "parts",
    source: "events",
    formula: "delta(MergeSourceParts) / delta(Merge)",
    what: "Source parts each background merge combined.",
    read:
      "Higher is more efficient: one merge over ten parts costs far less than three merges over " +
      "three. Persistently low with a high merge rate suggests merges are triggering eagerly.",
    better: "higher",
  },

  bytes_per_row: {
    label: "Bytes per row",
    unit: "B/row",
    source: "events",
    formula: "delta(SelectedBytes) / delta(SelectedRows)",
    what: "Average uncompressed width of the rows being read.",
    read: "Useful for capacity arithmetic, and for spotting a query that started selecting wide columns it does not need.",
    better: null,
  },

  read_compression: {
    label: "Read compression",
    unit: "x",
    source: "events",
    formula: "delta(CompressedReadBufferBytes) / delta(ReadCompressedBytes)",
    what: "Bytes after decompression for every byte read from disk.",
    read:
      "Higher means less disk traffic per row. A fall usually means new data compresses worse, " +
      "often because a column's cardinality or ordering changed.",
    better: "higher",
  },

  insert_compression: {
    label: "Insert compression",
    unit: "x",
    source: "events",
    formula: "delta(WriterUncompressedBytes) / delta(WriterCompressedBytes)",
    what: "Compression achieved on data as it is first written.",
    read:
      "Expect this far below the read ratio. Freshly written parts have not been merged into long " +
      "sorted runs yet, so they compress poorly. The gap between the two measures what merging " +
      "buys you.",
    better: "higher",
  },

  query_rate: {
    label: "Queries",
    unit: "/s",
    source: "events",
    formula: "delta(Query) / interval",
    what: "Queries started per second over the last interval.",
    read:
      "Throughput rather than concurrency: twenty fast queries and one slow one look very " +
      "different here and identical on the queries-in-flight chart. Pair it with average query " +
      "time to tell them apart.",
    better: null,
  },

  rows_read_rate: {
    label: "Rows read",
    unit: "/s",
    source: "events",
    formula: "delta(SelectedRows) / interval",
    what: "Rows returned to queries per second.",
    read:
      "Rows returned, not rows scanned. Compare against read amplification below: a modest figure " +
      "here alongside a large one there means the engine is doing far more work than the answer " +
      "requires.",
    better: null,
  },
  rows_written_rate: {
    label: "Rows inserted",
    unit: "/s",
    source: "events",
    formula: "delta(InsertedRows) / interval",
    what: "Rows inserted into all tables per second.",
    read:
      "Read alongside rows per part. The same insert rate arriving in large batches costs a " +
      "fraction of what it costs arriving row by row, because every part created has to be merged " +
      "later.",
    better: null,
  },
  disk_read_rate: {
    label: "Disk read",
    unit: "B/s",
    source: "events",
    formula: "delta(OSReadBytes) / interval",
    what: "Bytes read from the block device per second.",
    read:
      "What actually reached the disk. The gap between this and the filesystem figure is the page " +
      "cache doing its job; when the two converge, reads are missing cache.",
    better: null,
  },
  disk_write_rate: {
    label: "Disk write",
    unit: "B/s",
    source: "events",
    formula: "delta(OSWriteBytes) / interval",
    what: "Bytes written to the block device per second.",
    read:
      "Includes merges as well as inserts, and on a busy MergeTree table merges usually dominate. " +
      "Compare against write amplification if this looks disproportionate to what you are inserting.",
    better: null,
  },
  net_in_rate: {
    label: "Network in",
    unit: "B/s",
    source: "events",
    formula: "delta(NetworkReceiveBytes) / interval",
    what: "Bytes received per second, counting only ClickHouse's own traffic.",
    read:
      "Inserts arriving, and data pulled from other nodes during distributed queries and " +
      "replication. Traffic from third party libraries is not included.",
    better: null,
  },
  net_out_rate: {
    label: "Network out",
    unit: "B/s",
    source: "events",
    formula: "delta(NetworkSendBytes) / interval",
    what: "Bytes sent per second, counting only ClickHouse's own traffic.",
    read:
      "Query results going back to clients, plus parts sent to replicas. A high figure with low " +
      "query activity usually means replication rather than users.",
    better: null,
  },

  merge_throughput: {
    label: "Merge throughput",
    unit: "/s",
    source: "events",
    formula: "delta(MergedRows) / delta(MergeExecuteMilliseconds) * 1000",
    what: "Rows merged per second while merges are actually running.",
    read: "Deliberately not averaged over idle time, so it does not collapse to zero on a quiet server.",
    better: "higher",
  },

  merge_concurrency: {
    label: "Merge CPU",
    unit: "cores",
    source: "events",
    formula: "delta(MergeExecuteMilliseconds) / interval",
    what: "Cores consumed by background merges over the last interval.",
    read:
      "Pairs with the merge pool gauge. The gauge shows how many slots are taken, this shows how " +
      "much CPU those merges are eating. Both high at once is the clearest signal that merges are " +
      "the bottleneck.",
    better: null,
  },

  errors_rate: {
    label: "Errors",
    unit: "/s",
    source: "events",
    formula: "delta(LogError) / interval",
    what: "Error-level log messages per second.",
    read: "Anything sustained above zero deserves a look at the server log.",
    better: "lower",
  },

  keeper_exceptions_rate: {
    label: "Keeper exceptions",
    unit: "/s",
    source: "events",
    formula: "delta(ZooKeeperHardwareExceptions) / interval",
    what: "Network-level exceptions talking to Keeper, per second.",
    read: "Replication and cluster DDL both depend on this being zero.",
    better: "lower",
  },

  time_breakdown: {
    label: "Where the time goes",
    unit: "threads",
    source: "events",
    formula: "each elapsed-time counter divided by the interval",
    what:
      "How many threads were busy or blocked on each activity, on average, over the last interval.",
    read:
      "A value of 8 means the equivalent of eight threads spent the whole interval doing that. " +
      "These bars are NOT a partition and must not be added up: disk read wait includes reads " +
      "served from page cache, merge execution includes its own CPU time, and different counters " +
      "cover different thread populations. Compare their heights, not their sum.",
    better: null,
  },

  // derived from gauges

  part_churn: {
    label: "Part churn",
    unit: "x",
    source: "metrics",
    formula: "PartsOutdated / PartsActive",
    what: "Outdated parts for every active part.",
    read:
      "Rises briefly after merges and settles. Sustained above roughly 2 means the cleaner is " +
      "behind, and disk usage will grow even though the table has not.",
    better: "lower",
  },

  ddl_lag: {
    label: "DDL lag",
    unit: "entries",
    source: "metrics",
    formula: "MaxPushedDDLEntryID - MaxDDLEntryID",
    what: "Cluster DDL entries pushed to Keeper but not yet applied on this node.",
    read:
      "Non-zero means an ON CLUSTER statement is queued. Persistently non-zero means this node is " +
      "not keeping up, and the cause is almost always Keeper rather than the DDL itself.",
    better: "lower",
  },

  max_part_count: {
    label: "Max parts per partition",
    unit: "parts",
    source: "async",
    formula: "MaxPartCountForPartition",
    what: "The largest number of active parts in any single partition.",
    read:
      "This is the number that triggers the too-many-parts insert failure. The default threshold " +
      "is 300 for a warning and 3000 for a hard stop, so watch it climbing rather than waiting " +
      "for the error.",
    better: "lower",
  },

  replica_delay: {
    label: "Replica delay",
    unit: "s",
    source: "async",
    formula: "ReplicasMaxAbsoluteDelay",
    what: "How far behind the most delayed replicated table on this node is.",
    read:
      "Seconds. Small values are normal under load. A figure that keeps growing means this replica " +
      "cannot keep up with its queue, and reads from it are returning stale data.",
    better: "lower",
  },

  replica_queue: {
    label: "Replica queue",
    unit: "entries",
    source: "async",
    formula: "ReplicasSumQueueSize",
    what: "Total pending replication tasks across every replicated table on this node.",
    read: "Should drain. A queue that only grows is the same problem as replica delay, seen earlier.",
    better: "lower",
  },

  load_average: {
    label: "Load average",
    unit: "",
    source: "async",
    formula: "LoadAverage1",
    what: "Operating system one-minute load average.",
    read:
      "Compare against the core count. Above it means processes are queued for CPU, and that " +
      "includes everything on the box rather than ClickHouse alone.",
    better: "lower",
  },

};

// Curated keys. Anything not listed is dropped on arrival.


export const METRIC_KEYS = [
  // memory and threads
  "MemoryTracking", "MergesMutationsMemoryTracking",
  "GlobalThread", "GlobalThreadActive", "GlobalThreadScheduled",
  "MMappedFiles", "MMappedFileBytes",
  // query activity
  "Query", "QueryNonInternal", "QueryThread", "QueryPreempted",
  // background activity
  "Merge", "MergeParts", "PartMutation", "Move",
  "ReplicatedFetch", "ReplicatedSend", "ReplicatedChecks", "EphemeralNode",
  // io in flight
  "Read", "Write", "RemoteRead", "OpenFileForRead", "OpenFileForWrite",
  "NetworkReceive", "NetworkSend",
  // parts and objects
  "PartsActive", "PartsOutdated", "PartsPreActive", "PartsTemporary", "PartsDeleting",
  "PartsWide", "PartsCompact",
  "AttachedDatabase", "AttachedTable", "AttachedView", "AttachedReplicatedTable",
  "AttachedDictionary",
  // locks
  "RWLockActiveReaders", "RWLockActiveWriters", "RWLockWaitingReaders", "RWLockWaitingWriters",
  "ContextLockWait",
  // caches
  "MarkCacheBytes", "PrimaryIndexCacheBytes", "UncompressedCacheBytes", "QueryCacheBytes",
  "QueryConditionCacheBytes", "PageCacheBytes", "CompiledExpressionCacheBytes",
  "FilesystemCacheSize", "FilesystemCacheSizeLimit", "VectorSimilarityIndexCacheBytes",
  // limits and ddl
  "ConcurrencyControlAcquired", "ConcurrencyControlSoftLimit",
  "MaxDDLEntryID", "MaxPushedDDLEntryID",
  // health chips
  "ReadonlyReplica", "ZooKeeperSessionExpired", "DelayedInserts",
  "BrokenDistributedFilesToInsert", "ReadonlyDisks", "BrokenDisks", "IsServerShuttingDown",
  "TotalTemporaryFiles", "TablesToDropQueueSize", "DiskS3NoSuchKeyErrors",
  "AddressesBanned", "StartupScriptsExecutionState",
  // conditional subsystems
  "TemporaryFilesForSort", "TemporaryFilesForAggregation", "TemporaryFilesForJoin",
  "TemporaryFilesForMerge", "TemporaryFilesUnknown",
  "DistributedSend", "DistributedFilesToInsert", "DistributedBytesToInsert",
  "AsynchronousInsertQueueSize", "AsynchronousInsertQueueBytes", "PendingAsyncInsert",
  "KafkaConsumers", "KafkaProducers", "KafkaAssignedPartitions", "KafkaWrites",
  "KeeperAliveConnections", "KeeperOutstandingRequests",
  "S3Requests", "RefreshableViews", "RefreshingViews",
  "DictCacheRequests", "CacheDictionaryUpdateQueueKeys",
  "ZooKeeperSession", "ZooKeeperWatch", "ZooKeeperRequest",
  // background pools
  "BackgroundMergesAndMutationsPoolTask", "BackgroundMergesAndMutationsPoolSize",
  "BackgroundFetchesPoolTask", "BackgroundFetchesPoolSize",
  "BackgroundCommonPoolTask", "BackgroundCommonPoolSize",
  "BackgroundMovePoolTask", "BackgroundMovePoolSize",
  "BackgroundSchedulePoolTask", "BackgroundSchedulePoolSize",
  "BackgroundBufferFlushSchedulePoolTask", "BackgroundBufferFlushSchedulePoolSize",
  "BackgroundDistributedSchedulePoolTask", "BackgroundDistributedSchedulePoolSize",
  "BackgroundMessageBrokerSchedulePoolTask", "BackgroundMessageBrokerSchedulePoolSize",
];

// system.asynchronous_metrics. These are the machine-level readings that
// system.metrics does not carry at all: it has no CPU metric, no memory total,
// no disk capacity and no replication lag.
export const ASYNC_KEYS = [
  "OSIdleTimeNormalized", "OSUserTimeNormalized", "OSSystemTimeNormalized",
  "OSIOWaitTimeNormalized", "OSStealTimeNormalized",
  "LoadAverage1", "LoadAverage5", "LoadAverage15",
  "OSMemoryTotal", "OSMemoryAvailable", "OSMemoryFreePlusCached", "MemoryResident",
  "MaxPartCountForPartition",
  "ReplicasMaxAbsoluteDelay", "ReplicasMaxRelativeDelay", "ReplicasSumQueueSize",
  "ReplicasMaxQueueSize", "ReplicasSumInsertsInQueue", "ReplicasSumMergesInQueue",
  "NumberOfTables", "NumberOfDatabases", "Uptime",
];


// system.events. Counters
export const EVENT_KEYS = [
  "Query", "SelectQuery", "InsertQuery", "QueryTimeMicroseconds",
  "SelectedRows", "SelectedBytes", "InsertedRows", "InsertedBytes", "RowsReadByMainReader",
  "MergeTreeDataWriterRows", "MergeTreeDataWriterBlocks", "MergeTreeDataWriterBlocksAlreadySorted",
  "MergeTreeDataWriterUncompressedBytes", "MergeTreeDataWriterCompressedBytes",
  "Merge", "MergeSourceParts", "MergedRows", "MergedUncompressedBytes",
  "MergeTotalMilliseconds", "MergeExecuteMilliseconds",
  "MergeMutateBackgroundExecutorTaskExecuteStepMicroseconds",
  "ReadCompressedBytes", "CompressedReadBufferBytes",
  "ReadBufferFromFileDescriptorRead", "ReadBufferFromFileDescriptorReadBytes",
  "OSReadBytes", "OSWriteBytes", "OSReadChars", "OSWriteChars",
  "NetworkReceiveBytes", "NetworkSendBytes",
  "NetworkReceiveElapsedMicroseconds", "NetworkSendElapsedMicroseconds",
  "OpenedFileCacheHits", "OpenedFileCacheMisses",
  "UserTimeMicroseconds", "SystemTimeMicroseconds", "RealTimeMicroseconds",
  "OSCPUWaitMicroseconds", "OSCPUVirtualTimeMicroseconds",
  "DiskReadElapsedMicroseconds", "DiskWriteElapsedMicroseconds", "WaitMarksLoadMicroseconds",
  "ContextLockWaitMicroseconds", "LocalThreadPoolLockWaitMicroseconds",
  "GlobalThreadPoolLockWaitMicroseconds", "SharedPartsLockWaitMicroseconds",
  "PartsLockWaitMicroseconds", "QueryPlanOptimizeMicroseconds",
  "GlobalThreadPoolJobs", "GlobalThreadPoolJobWaitTimeMicroseconds",
  "LocalThreadPoolJobs", "LocalThreadPoolJobWaitTimeMicroseconds",
  "LocalThreadPoolBusyMicroseconds", "LocalThreadPoolExpansions", "LocalThreadPoolShrinks",
  "LogTrace", "LogDebug", "LogInfo", "LogWarning", "LogError", "LoggerElapsedNanoseconds",
  "ZooKeeperHardwareExceptions", "DNSError",
  "HTTPServerConnectionsCreated", "HTTPServerConnectionsReused",
];

/** Every log level, for the error share denominator. */
export const ALL_LOG_LEVELS = ["LogTrace", "LogDebug", "LogInfo", "LogWarning", "LogError"];

/** Lock wait counters, summed into one thread-equivalents series. */
export const LOCK_WAIT_KEYS = [
  "ContextLockWaitMicroseconds",
  "LocalThreadPoolLockWaitMicroseconds",
  "GlobalThreadPoolLockWaitMicroseconds",
  "SharedPartsLockWaitMicroseconds",
  "PartsLockWaitMicroseconds",
];


export const TIME_BREAKDOWN = [
  { label: "CPU user", keys: ["UserTimeMicroseconds"] },
  { label: "CPU kernel", keys: ["SystemTimeMicroseconds"] },
  { label: "Disk read", keys: ["DiskReadElapsedMicroseconds"] },
  { label: "Disk write", keys: ["DiskWriteElapsedMicroseconds"] },
  { label: "Mark load", keys: ["WaitMarksLoadMicroseconds"] },
  { label: "Lock wait", keys: LOCK_WAIT_KEYS },
  { label: "Network", keys: ["NetworkReceiveElapsedMicroseconds", "NetworkSendElapsedMicroseconds"] },
  { label: "Merge exec", keys: ["MergeMutateBackgroundExecutorTaskExecuteStepMicroseconds"] },
  { label: "Query plan", keys: ["QueryPlanOptimizeMicroseconds"] },
  { label: "Logging", keys: ["LoggerElapsedNanoseconds"], scale: 0.001 },
];

/** The eight background pools, as task and limit pairs. */
export const BACKGROUND_POOLS = [
  { label: "Merges", task: "BackgroundMergesAndMutationsPoolTask", size: "BackgroundMergesAndMutationsPoolSize" },
  { label: "Fetches", task: "BackgroundFetchesPoolTask", size: "BackgroundFetchesPoolSize" },
  { label: "Common", task: "BackgroundCommonPoolTask", size: "BackgroundCommonPoolSize" },
  { label: "Moves", task: "BackgroundMovePoolTask", size: "BackgroundMovePoolSize" },
  { label: "Schedule", task: "BackgroundSchedulePoolTask", size: "BackgroundSchedulePoolSize" },
  { label: "Buffer flush", task: "BackgroundBufferFlushSchedulePoolTask", size: "BackgroundBufferFlushSchedulePoolSize" },
  { label: "Distributed", task: "BackgroundDistributedSchedulePoolTask", size: "BackgroundDistributedSchedulePoolSize" },
  { label: "Message broker", task: "BackgroundMessageBrokerSchedulePoolTask", size: "BackgroundMessageBrokerSchedulePoolSize" },
];


// Health chips. Every one should read zero on a healthy server. whole strip collapses to a single quiet line when nothing is wrong.

export const HEALTH_CHIPS = [
  { key: "ReadonlyReplica", label: "Readonly replicas", severity: "danger", hint: "Replicated tables are in readonly. Replication is broken." },
  { key: "ZooKeeperSessionExpired", label: "Keeper expired", severity: "danger", hint: "The Keeper session was lost. Replication and cluster DDL will stall." },
  { key: "DelayedInserts", label: "Delayed inserts", severity: "danger", hint: "Inserts are being throttled because too many parts exist. This is the step before inserts fail outright." },
  { key: "BrokenDistributedFilesToInsert", label: "Broken distributed", severity: "danger", hint: "Distributed inserts failed and their files are parked on disk." },
  { key: "ReadonlyDisks", label: "Readonly disks", severity: "danger", hint: "A disk was marked readonly during a disk check." },
  { key: "BrokenDisks", label: "Broken disks", severity: "danger", hint: "A disk was marked broken during a disk check." },
  { key: "IsServerShuttingDown", label: "Shutting down", severity: "danger", hint: "The server is in the process of shutting down." },
  { key: "DiskS3NoSuchKeyErrors", label: "S3 missing keys", severity: "danger", hint: "Object storage returned NoSuchKey, which means disk metadata and the bucket disagree." },
  { key: "RWLockWaitingWriters", label: "Lock waiters", severity: "warning", hint: "Something is blocked waiting for a write lock, usually behind a DDL or a mutation." },
  { key: "TotalTemporaryFiles", label: "Spilling to disk", severity: "warning", hint: "Queries are writing temporary files. Legitimate, but far slower than staying in memory." },
  { key: "QueryPreempted", label: "Preempted queries", severity: "warning", hint: "Queries paused by the priority setting." },
  { key: "TablesToDropQueueSize", label: "Drop queue", severity: "warning", hint: "Dropped tables waiting for background data removal. A number that keeps growing means something is stuck." },
  { key: "AddressesBanned", label: "Banned addresses", severity: "warning", hint: "A remote address has been marked faulty by a connection pool." },
];
