// alertTemplates.js - Ready-made alert rules that read the ClickHouse system tables.
// CHOps adds them, disabled, to each cluster. Admins turn them on and tune them on Alert Rules.
// author -> Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data Private Limited

import { and, eq, isNotNull } from "drizzle-orm";
import { db, alertRules, alertRuleChannels, appSettings } from "../db/index.js";
import { alertEvents } from "../db/schema.js";


const EXISTING_CLUSTERS_DONE_KEY = "alerts.templates_added_to_existing_clusters";


export const ALERT_TEMPLATES = [
  {
    id: "cpu-busy",
    category: "Resources",
    name: "CPU busy",
    description: "CPU time spent in user and kernel code, averaged over 5 minutes, as a percent of the CPUs available. Uses the cgroup CPU quota when one is set.",
    tuning: "Lower to 80 for latency-sensitive clusters.",
    note: "Host-wide: other processes on the same machine count too.",
    operator: "gt",
    threshold: 90,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * (avgIf(value, metric = 'OSUserTimeNormalized') + avgIf(value, metric = 'OSSystemTimeNormalized')), 1) AS cpu_busy_percent,
  throwIf(countIf(metric = 'OSUserTimeNormalized') = 0 OR countIf(metric = 'OSSystemTimeNormalized') = 0 OR isNull(cpu_busy_percent) OR NOT isFinite(toFloat64(cpu_busy_percent)),
    'Cannot compute cpu_busy_percent: no recent rows for OSUserTimeNormalized, OSSystemTimeNormalized in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('OSUserTimeNormalized', 'OSSystemTimeNormalized')`,
  },
  {
    id: "cpu-iowait",
    category: "Resources",
    name: "CPU waiting for disk",
    description: "Share of CPU time idle while waiting for disk IO, averaged over 5 minutes. High values mean the disks, not the CPUs, are the bottleneck.",
    tuning: "Network or cloud block storage often runs 5 to 10 percent; set the threshold above your normal level.",
    note: "Host-wide.",
    operator: "gt",
    threshold: 20,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * avgIf(value, metric = 'OSIOWaitTimeNormalized'), 1) AS io_wait_percent,
  throwIf(countIf(metric = 'OSIOWaitTimeNormalized') = 0 OR isNull(io_wait_percent) OR NOT isFinite(toFloat64(io_wait_percent)),
    'Cannot compute io_wait_percent: no recent rows for OSIOWaitTimeNormalized in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('OSIOWaitTimeNormalized')`,
  },
  {
    id: "memory-clickhouse",
    category: "Resources",
    name: "ClickHouse memory near the limit",
    description: "Physical memory used by the ClickHouse process as a percent of the container limit, or of host RAM when there is no limit. Uses the lowest value in 5 minutes, so it fires only when memory stays high.",
    tuning: "Add a second rule at 95 with severity critical.",
    operator: "gt",
    threshold: 85,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * minIf(value, metric = 'MemoryResident')
    / if(argMaxIf(value, event_time, metric = 'CGroupMemoryTotal') > 0,
         argMaxIf(value, event_time, metric = 'CGroupMemoryTotal'),
         argMaxIf(value, event_time, metric = 'OSMemoryTotal')), 1) AS memory_used_percent,
  throwIf(countIf(metric = 'MemoryResident') = 0 OR countIf(metric = 'OSMemoryTotal') = 0 OR isNull(memory_used_percent) OR NOT isFinite(toFloat64(memory_used_percent)),
    'Cannot compute memory_used_percent: no recent rows for MemoryResident, OSMemoryTotal in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('MemoryResident', 'CGroupMemoryTotal', 'OSMemoryTotal')`,
  },
  {
    id: "host-memory-low",
    category: "Resources",
    name: "Host memory low",
    description: "Memory available to programs on the host, as a percent of host RAM. Uses the highest value in 5 minutes, so it fires only when memory stays low.",
    note: "Host-wide. Inside a container this is the node's memory, not the pod's; use ClickHouse memory near the limit for pods.",
    operator: "lt",
    threshold: 10,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * maxIf(value, metric = 'OSMemoryAvailable') / argMaxIf(value, event_time, metric = 'OSMemoryTotal'), 1) AS memory_available_percent,
  throwIf(countIf(metric = 'OSMemoryAvailable') = 0 OR countIf(metric = 'OSMemoryTotal') = 0 OR isNull(memory_available_percent) OR NOT isFinite(toFloat64(memory_available_percent)),
    'Cannot compute memory_available_percent: no recent rows for OSMemoryAvailable, OSMemoryTotal in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('OSMemoryAvailable', 'OSMemoryTotal')`,
  },
  {
    id: "disk-space-low",
    category: "Resources",
    name: "Disk space low (data path)",
    description: "Free space on the volume that holds the ClickHouse data path. Merges need free space, so a full disk stops merges first and inserts soon after.",
    tuning: "Add a second rule at 5 with severity critical.",
    note: "Covers the main data path only. For extra disks and tiered storage use the per-disk template.",
    operator: "lt",
    threshold: 15,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * argMaxIf(value, event_time, metric = 'FilesystemMainPathAvailableBytes')
    / argMaxIf(value, event_time, metric = 'FilesystemMainPathTotalBytes'), 1) AS disk_free_percent,
  throwIf(countIf(metric = 'FilesystemMainPathAvailableBytes') = 0 OR countIf(metric = 'FilesystemMainPathTotalBytes') = 0 OR isNull(disk_free_percent) OR NOT isFinite(toFloat64(disk_free_percent)),
    'Cannot compute disk_free_percent: no recent rows for FilesystemMainPathAvailableBytes, FilesystemMainPathTotalBytes in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('FilesystemMainPathAvailableBytes', 'FilesystemMainPathTotalBytes')`,
  },
  {
    id: "disk-space-low-any-disk",
    category: "Resources",
    name: "Disk space low (any disk)",
    description: "Free space on the fullest disk this server uses, including extra disks and storage tiers. Reads the live system.disks table, because per-disk names in asynchronous_metric_log changed in ClickHouse 26.8.",
    tuning: "Add a second rule at 5 with severity critical.",
    note: "Object storage disks report a very large size and never fire.",
    operator: "lt",
    threshold: 15,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(min(100 * free_space / total_space), 1) AS lowest_disk_free_percent,
  throwIf(count() = 0 OR isNull(lowest_disk_free_percent) OR NOT isFinite(toFloat64(lowest_disk_free_percent)),
    'Cannot compute lowest_disk_free_percent: system.disks reported no disk with a known size.') AS no_data_check
FROM system.disks
WHERE total_space > 0`,
  },
  {
    id: "inodes-low",
    category: "Resources",
    name: "Inodes low (data path)",
    description: "Free inodes on the data volume. With no inodes left, writes fail with 'no space left on device' even when the disk has free bytes.",
    note: "Some filesystems (for example XFS) allocate inodes on demand and rarely run out.",
    operator: "lt",
    threshold: 10,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * argMaxIf(value, event_time, metric = 'FilesystemMainPathAvailableINodes')
    / argMaxIf(value, event_time, metric = 'FilesystemMainPathTotalINodes'), 1) AS inodes_free_percent,
  throwIf(countIf(metric = 'FilesystemMainPathAvailableINodes') = 0 OR countIf(metric = 'FilesystemMainPathTotalINodes') = 0 OR isNull(inodes_free_percent) OR NOT isFinite(toFloat64(inodes_free_percent)),
    'Cannot compute inodes_free_percent: no recent rows for FilesystemMainPathAvailableINodes, FilesystemMainPathTotalINodes in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('FilesystemMainPathAvailableINodes', 'FilesystemMainPathTotalINodes')`,
  },
  {
    id: "logs-volume-low",
    category: "Resources",
    name: "Log volume space low",
    description: "Free space on the volume that holds the server log files. Fix log rotation before the volume fills.",
    note: "Often the same volume as the data path; then this duplicates Disk space low.",
    operator: "lt",
    threshold: 10,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * argMaxIf(value, event_time, metric = 'FilesystemLogsPathAvailableBytes')
    / argMaxIf(value, event_time, metric = 'FilesystemLogsPathTotalBytes'), 1) AS logs_free_percent,
  throwIf(countIf(metric = 'FilesystemLogsPathAvailableBytes') = 0 OR countIf(metric = 'FilesystemLogsPathTotalBytes') = 0 OR isNull(logs_free_percent) OR NOT isFinite(toFloat64(logs_free_percent)),
    'Cannot compute logs_free_percent: no recent rows for FilesystemLogsPathAvailableBytes, FilesystemLogsPathTotalBytes in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('FilesystemLogsPathAvailableBytes', 'FilesystemLogsPathTotalBytes')`,
  },
  {
    id: "memory-maps-limit",
    category: "Resources",
    name: "Memory mappings near the kernel limit",
    description: "Memory mappings used by the server against vm.max_map_count. At the limit, allocations fail.",
    tuning: "Raise vm.max_map_count on the host when this fires.",
    operator: "gt",
    threshold: 90,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  round(100 * argMaxIf(value, event_time, metric = 'VMNumMaps') / argMaxIf(value, event_time, metric = 'VMMaxMapCount'), 1) AS memory_maps_percent,
  throwIf(countIf(metric = 'VMNumMaps') = 0 OR countIf(metric = 'VMMaxMapCount') = 0 OR isNull(memory_maps_percent) OR NOT isFinite(toFloat64(memory_maps_percent)),
    'Cannot compute memory_maps_percent: no recent rows for VMNumMaps, VMMaxMapCount in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('VMNumMaps', 'VMMaxMapCount')`,
  },
  {
    id: "network-errors",
    category: "Resources",
    name: "Network errors",
    description: "Receive and send errors on all network interfaces in the last 5 minutes.",
    note: "Host-wide. Works before and after the ClickHouse 26.8 change to per-interface metric names.",
    operator: "gt",
    threshold: 100,
    unit: "errors",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sumIf(value, startsWith(metric, 'NetworkReceiveErrors') OR startsWith(metric, 'NetworkSendErrors')) AS network_errors,
  throwIf(count() = 0 OR isNull(network_errors) OR NOT isFinite(toFloat64(network_errors)),
    'Cannot compute network_errors: no rows in system.asynchronous_metric_log for the last 5 minutes.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "scheduling-jitter",
    category: "Resources",
    name: "Server stalls (scheduling jitter)",
    description: "Largest delay in 5 minutes between when a server thread should wake and when it did. Normal values are well under a millisecond; large values mean the host stalls (CPU starvation, swapping, noisy neighbours).",
    operator: "gt",
    threshold: 0.5,
    unit: "seconds",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  maxIf(value, metric = 'Jitter') AS max_jitter_seconds,
  throwIf(countIf(metric = 'Jitter') = 0 OR isNull(max_jitter_seconds) OR NOT isFinite(toFloat64(max_jitter_seconds)),
    'Cannot compute max_jitter_seconds: no recent rows for Jitter in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('Jitter')`,
  },
  {
    id: "too-many-parts",
    category: "Storage and replication",
    name: "Too many parts in a partition",
    description: "Highest number of active parts in any single partition. Inserts are delayed and then rejected when this reaches the table's parts_to_delay_insert and parts_to_throw_insert settings.",
    tuning: "Set a critical rule just below your parts_to_delay_insert value.",
    operator: "gt",
    threshold: 300,
    unit: "parts",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  argMaxIf(value, event_time, metric = 'MaxPartCountForPartition') AS max_parts_in_partition,
  throwIf(countIf(metric = 'MaxPartCountForPartition') = 0 OR isNull(max_parts_in_partition) OR NOT isFinite(toFloat64(max_parts_in_partition)),
    'Cannot compute max_parts_in_partition: no recent rows for MaxPartCountForPartition in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('MaxPartCountForPartition')`,
  },
  {
    id: "replication-delay",
    category: "Storage and replication",
    name: "Replica lag",
    description: "How far this replica is behind the newest data, in seconds. Uses the lowest value in 5 minutes, so it fires only on sustained lag.",
    note: "Always 0 on servers without replicated tables.",
    operator: "gt",
    threshold: 300,
    unit: "seconds",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  minIf(value, metric = 'ReplicasMaxAbsoluteDelay') AS replica_delay_seconds,
  throwIf(countIf(metric = 'ReplicasMaxAbsoluteDelay') = 0 OR isNull(replica_delay_seconds) OR NOT isFinite(toFloat64(replica_delay_seconds)),
    'Cannot compute replica_delay_seconds: no recent rows for ReplicasMaxAbsoluteDelay in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('ReplicasMaxAbsoluteDelay')`,
  },
  {
    id: "replication-queue",
    category: "Storage and replication",
    name: "Replication queue backlog",
    description: "Largest replication queue (fetches and merges still to apply) across replicated tables, held for 5 minutes.",
    note: "Always 0 on servers without replicated tables.",
    operator: "gt",
    threshold: 200,
    unit: "tasks",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  minIf(value, metric = 'ReplicasMaxQueueSize') AS replication_queue_size,
  throwIf(countIf(metric = 'ReplicasMaxQueueSize') = 0 OR isNull(replication_queue_size) OR NOT isFinite(toFloat64(replication_queue_size)),
    'Cannot compute replication_queue_size: no recent rows for ReplicasMaxQueueSize in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('ReplicasMaxQueueSize')`,
  },
  {
    id: "server-restarted",
    category: "Storage and replication",
    name: "Server restarted",
    description: "Fires once after the server starts. An unplanned restart often means a crash or an out-of-memory kill.",
    tuning: "Keep the schedule at every 5 minutes; a shorter schedule fires more than once per restart.",
    note: "A restart in the last few seconds before an evaluation can be missed, because the log is written every 7 seconds.",
    operator: "lt",
    threshold: 300,
    unit: "seconds",
    severity: "info",
    schedule: "*/5 * * * *",
    sql: `SELECT
  argMaxIf(value, event_time, metric = 'Uptime') AS uptime_seconds,
  throwIf(countIf(metric = 'Uptime') = 0 OR isNull(uptime_seconds) OR NOT isFinite(toFloat64(uptime_seconds)),
    'Cannot compute uptime_seconds: no recent rows for Uptime in system.asynchronous_metric_log, or the value is not a number.') AS no_data_check
FROM system.asynchronous_metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE
  AND metric IN ('Uptime')`,
  },
  {
    id: "failed-queries",
    category: "Queries and inserts",
    name: "Failed queries",
    description: "Percent of queries that failed in the last 5 minutes. Ignored when fewer than 20 queries ran, so one bad query on an idle server does not page.",
    note: "Counts every failure, including user syntax errors.",
    operator: "gt",
    threshold: 5,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  if(sum(ProfileEvent_Query) < 20, 0,
     round(100 * sum(ProfileEvent_FailedQuery) / sum(ProfileEvent_Query), 1)) AS failed_query_percent,
  throwIf(count() = 0 OR isNull(failed_query_percent) OR NOT isFinite(toFloat64(failed_query_percent)),
    'Cannot compute failed_query_percent: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "failed-inserts",
    category: "Queries and inserts",
    name: "Failed inserts",
    description: "INSERT queries that failed in the last 5 minutes. Data that failed to insert is not in ClickHouse unless the client retries.",
    tuning: "Use 0 when every insert comes from a pipeline that should never fail.",
    operator: "gt",
    threshold: 10,
    unit: "inserts",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_FailedInsertQuery) AS failed_inserts,
  throwIf(count() = 0 OR isNull(failed_inserts) OR NOT isFinite(toFloat64(failed_inserts)),
    'Cannot compute failed_inserts: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "inserts-delayed",
    category: "Queries and inserts",
    name: "Inserts throttled (too many parts)",
    description: "Inserts slowed down on purpose because a partition has too many parts. The step before inserts are rejected.",
    operator: "gt",
    threshold: 0,
    unit: "inserts",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_DelayedInserts) AS delayed_inserts,
  throwIf(count() = 0 OR isNull(delayed_inserts) OR NOT isFinite(toFloat64(delayed_inserts)),
    'Cannot compute delayed_inserts: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "inserts-rejected",
    category: "Queries and inserts",
    name: "Inserts rejected (too many parts)",
    description: "Inserts refused because a partition has too many parts. Data is being lost unless clients retry.",
    operator: "gt",
    threshold: 0,
    unit: "inserts",
    severity: "critical",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_RejectedInserts) AS rejected_inserts,
  throwIf(count() = 0 OR isNull(rejected_inserts) OR NOT isFinite(toFloat64(rejected_inserts)),
    'Cannot compute rejected_inserts: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "memory-limit-hits",
    category: "Queries and inserts",
    name: "Queries stopped by the memory limit",
    description: "Queries that failed with MEMORY_LIMIT_EXCEEDED in the last 5 minutes.",
    tuning: "Raise the threshold if some heavy ad hoc queries are expected to hit the limit.",
    operator: "gt",
    threshold: 0,
    unit: "queries",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_QueryMemoryLimitExceeded) AS memory_limit_hits,
  throwIf(count() = 0 OR isNull(memory_limit_hits) OR NOT isFinite(toFloat64(memory_limit_hits)),
    'Cannot compute memory_limit_hits: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "concurrent-queries",
    category: "Queries and inserts",
    name: "Too many concurrent queries",
    description: "Queries running at the same time, held above the threshold for 5 minutes. New queries are refused at max_concurrent_queries.",
    tuning: "Set to about 80 percent of your max_concurrent_queries setting.",
    operator: "gt",
    threshold: 100,
    unit: "queries",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  min(CurrentMetric_Query) AS concurrent_queries,
  throwIf(count() = 0 OR isNull(concurrent_queries) OR NOT isFinite(toFloat64(concurrent_queries)),
    'Cannot compute concurrent_queries: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "connections-high",
    category: "Queries and inserts",
    name: "Too many client connections",
    description: "Native and HTTP client connections at the peak of the last 5 minutes. New connections are refused at max_connections.",
    tuning: "Set to about 80 percent of your max_connections setting.",
    operator: "gt",
    threshold: 3000,
    unit: "connections",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  max(CurrentMetric_TCPConnection + CurrentMetric_HTTPConnection) AS client_connections,
  throwIf(count() = 0 OR isNull(client_connections) OR NOT isFinite(toFloat64(client_connections)),
    'Cannot compute client_connections: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "readonly-replicas",
    category: "Keeper and cluster",
    name: "Read-only replicated tables",
    description: "Replicated tables that cannot accept writes, held for 5 minutes. Usually a lost Keeper session; inserts into those tables fail.",
    operator: "gt",
    threshold: 0,
    unit: "tables",
    severity: "critical",
    schedule: "*/5 * * * *",
    sql: `SELECT
  min(CurrentMetric_ReadonlyReplica) AS readonly_replicas,
  throwIf(count() = 0 OR isNull(readonly_replicas) OR NOT isFinite(toFloat64(readonly_replicas)),
    'Cannot compute readonly_replicas: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "keeper-connection-lost",
    category: "Keeper and cluster",
    name: "Keeper connection lost",
    description: "How long the connection to Keeper or ZooKeeper has been lost, in seconds. It is 0 while the connection is up. Uses the lowest value in 5 minutes, so it fires only when the connection stays lost.",
    note: "Stays 0 on servers without Keeper, so it is safe to enable everywhere.",
    operator: "gt",
    threshold: 0,
    unit: "seconds",
    severity: "critical",
    schedule: "*/5 * * * *",
    sql: `SELECT
  if(min(CurrentMetric_ZooKeeperConnectionLossStartedTimestampSeconds) > 0,
     toUnixTimestamp(now()) - min(CurrentMetric_ZooKeeperConnectionLossStartedTimestampSeconds), 0) AS keeper_lost_seconds,
  throwIf(count() = 0 OR isNull(keeper_lost_seconds) OR NOT isFinite(toFloat64(keeper_lost_seconds)),
    'Cannot compute keeper_lost_seconds: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "keeper-errors",
    category: "Keeper and cluster",
    name: "Keeper connection errors",
    description: "Network or session errors talking to Keeper in the last 5 minutes. Rising counts come before read-only tables.",
    operator: "gt",
    threshold: 5,
    unit: "errors",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_ZooKeeperHardwareExceptions) AS keeper_errors,
  throwIf(count() = 0 OR isNull(keeper_errors) OR NOT isFinite(toFloat64(keeper_errors)),
    'Cannot compute keeper_errors: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "replica-fetch-failures",
    category: "Keeper and cluster",
    name: "Replica fetch failures",
    description: "Parts this replica failed to download from other replicas in the last 5 minutes.",
    operator: "gt",
    threshold: 20,
    unit: "fetches",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_ReplicatedPartFailedFetches) AS failed_fetches,
  throwIf(count() = 0 OR isNull(failed_fetches) OR NOT isFinite(toFloat64(failed_fetches)),
    'Cannot compute failed_fetches: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "replicated-data-loss",
    category: "Keeper and cluster",
    name: "Replicated data loss",
    description: "A part this replica needed exists on no replica at all. That data is lost.",
    operator: "gt",
    threshold: 0,
    unit: "parts",
    severity: "critical",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_ReplicatedDataLoss) AS lost_parts,
  throwIf(count() = 0 OR isNull(lost_parts) OR NOT isFinite(toFloat64(lost_parts)),
    'Cannot compute lost_parts: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "distributed-backlog",
    category: "Keeper and cluster",
    name: "Distributed insert backlog",
    description: "Files waiting to be sent to remote shards by Distributed tables, held for 5 minutes. A growing backlog means a shard is slow or unreachable.",
    note: "Always 0 without asynchronous inserts into Distributed tables.",
    operator: "gt",
    threshold: 500,
    unit: "files",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  min(CurrentMetric_DistributedFilesToInsert) AS pending_files,
  throwIf(count() = 0 OR isNull(pending_files) OR NOT isFinite(toFloat64(pending_files)),
    'Cannot compute pending_files: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "distributed-broken",
    category: "Keeper and cluster",
    name: "Distributed insert files marked broken",
    description: "Files a Distributed table gave up sending. Their rows did not reach the shard and need manual attention.",
    operator: "gt",
    threshold: 0,
    unit: "files",
    severity: "critical",
    schedule: "*/5 * * * *",
    sql: `SELECT
  max(CurrentMetric_BrokenDistributedFilesToInsert) AS broken_files,
  throwIf(count() = 0 OR isNull(broken_files) OR NOT isFinite(toFloat64(broken_files)),
    'Cannot compute broken_files: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "merge-pool-saturated",
    category: "Keeper and cluster",
    name: "Merge pool saturated",
    description: "Background merge and mutation pool fully busy for 5 minutes. Merges fall behind inserts, and part counts start to climb.",
    operator: "gt",
    threshold: 95,
    unit: "%",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  min(100 * CurrentMetric_BackgroundMergesAndMutationsPoolTask
      / nullIf(CurrentMetric_BackgroundMergesAndMutationsPoolSize, 0)) AS merge_pool_used_percent,
  throwIf(count() = 0 OR isNull(merge_pool_used_percent) OR NOT isFinite(toFloat64(merge_pool_used_percent)),
    'Cannot compute merge_pool_used_percent: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
  {
    id: "s3-errors",
    category: "Keeper and cluster",
    name: "Object storage errors",
    description: "Failed read and write requests to S3-backed disks in the last 5 minutes.",
    note: "Always 0 without S3 disks.",
    operator: "gt",
    threshold: 10,
    unit: "errors",
    severity: "warning",
    schedule: "*/5 * * * *",
    sql: `SELECT
  sum(ProfileEvent_DiskS3ReadRequestsErrors + ProfileEvent_DiskS3WriteRequestsErrors) AS s3_errors,
  throwIf(count() = 0 OR isNull(s3_errors) OR NOT isFinite(toFloat64(s3_errors)),
    'Cannot compute s3_errors: no rows in system.metric_log for the last 5 minutes (is metric_log enabled?), or the value is not a number.') AS no_data_check
FROM system.metric_log
WHERE event_date >= toDate(now() - INTERVAL 5 MINUTE)
  AND event_time >= now() - INTERVAL 5 MINUTE`,
  },
];


function ruleDescription(template) {
  if (!template.tuning) return template.description;
  return `${template.description} Tuning: ${template.tuning}`;
}

export function createTemplateRulesForCluster(clusterId) {
  const clusterRules = db
    .select()
    .from(alertRules)
    .where(eq(alertRules.clusterId, clusterId))
    .all();
  const templateIdsInUse = new Set(clusterRules.map((rule) => rule.templateId));

  let createdCount = 0;
  for (const template of ALERT_TEMPLATES) {
    if (templateIdsInUse.has(template.id)) continue;
    db.insert(alertRules)
      .values({
        name: template.name,
        description: ruleDescription(template),
        sql: template.sql,
        threshold: template.threshold,
        operator: template.operator,
        severity: template.severity,
        schedule: template.schedule,
        enabled: false,
        clusterId,
        templateId: template.id,
        templateEdited: false,
      })
      .run();
    createdCount += 1;
  }
  return createdCount;
}


export function removeTemplateRulesForCluster(clusterId) {
  const unchangedRules = db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.clusterId, clusterId),
        isNotNull(alertRules.templateId),
        eq(alertRules.templateEdited, false),
      ),
    )
    .all();

  for (const rule of unchangedRules) {
    db.delete(alertRuleChannels)
      .where(eq(alertRuleChannels.alertRuleId, rule.id))
      .run();
    db.delete(alertEvents).where(eq(alertEvents.alertRuleId, rule.id)).run();
    db.delete(alertRules).where(eq(alertRules.id, rule.id)).run();
  }
  return unchangedRules.length;
}


export function createTemplateRulesForExistingClusters(clusters) {
  const doneSetting = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, EXISTING_CLUSTERS_DONE_KEY))
    .get();
  if (doneSetting) return 0;

  let createdCount = 0;
  for (const cluster of clusters) {
    createdCount += createTemplateRulesForCluster(cluster.id);
  }
  db.insert(appSettings)
    .values({ key: EXISTING_CLUSTERS_DONE_KEY, value: "true", category: "alerts" })
    .run();
  return createdCount;
}
