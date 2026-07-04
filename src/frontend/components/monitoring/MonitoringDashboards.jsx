// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Real-time monitoring dashboard for tracking heap allocation, memory leaks, and buffer pool consumption.

import React, { useState, useCallback, useRef, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import ChartCard from "../layout/ChartCard.jsx";
import { DateTimePicker } from "../layout/DateTimePicker.jsx";
import { baseChartOption } from "../../utils/echarts.js";
import { runQuery } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";

const pad = (n) => String(n).padStart(2, "0");
const fmtAgo = (h) => {
  const d = new Date(Date.now() - h * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// SQL template helper - replaces {from:String}, {to:String}, {rounding:UInt32}, {seconds:UInt32}
function buildSql(template, from, to, rounding) {
  const seconds = Math.round(
    (new Date(to.replace(" ", "T")).getTime() -
      new Date(from.replace(" ", "T")).getTime()) /
      1000,
  );
  return template
    .replace(/\{from:String\}/g, `'${from}'`)
    .replace(/\{to:String\}/g, `'${to}'`)
    .replace(/\{rounding:UInt32\}/g, String(rounding))
    .replace(/\{seconds:UInt32\}/g, String(seconds));
}

const ml = (field) =>
  `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, avg(${field}) FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`;
const aml = (metric, agg = "avg") =>
  `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, ${agg}(value) FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric = '${metric}' GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`;
// Per-hostname variants
const mlh = (field) =>
  `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, hostname, avg(${field}) FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t, hostname ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`;
const amlh = (metric, agg = "avg") =>
  `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, hostname, ${agg}(value) FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric = '${metric}' GROUP BY t, hostname ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`;
const amlhAll = (metric, agg = "avg") =>
  `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, hostname, ${agg}(value) FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric = '${metric}' GROUP BY ALL ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`;

const TABS = [
  {
    id: "queries",
    label: "Queries",
    icon: "ti-terminal-2",
    charts: [
      { key: "q_sec", label: "Queries/second", sql: ml("ProfileEvent_Query") },
      {
        key: "q_run",
        label: "Queries Running",
        sql: ml("CurrentMetric_Query"),
      },
      {
        key: "sel_bytes",
        label: "Selected Bytes/second",
        sql: ml("ProfileEvent_SelectedBytes"),
      },
      {
        key: "sel_rows",
        label: "Selected Rows/second",
        sql: ml("ProfileEvent_SelectedRows"),
      },
      {
        key: "ins_rows",
        label: "Inserted Rows/second",
        sql: ml("ProfileEvent_InsertedRows"),
      },
      {
        key: "fail_q",
        label: "Failed Queries/second",
        sql: ml("ProfileEvent_FailedQuery"),
      },
      {
        key: "query_mix",
        label: "Query Mix /s (select / insert / other)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, sum(ProfileEvent_SelectQuery) AS Selects, sum(ProfileEvent_InsertQuery) AS Inserts, greatest(sum(ProfileEvent_Query) - sum(ProfileEvent_SelectQuery) - sum(ProfileEvent_InsertQuery), 0) AS Other FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "fail_kind",
        label: "Failures by Kind /s",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, sum(ProfileEvent_FailedSelectQuery) AS "Failed Selects", sum(ProfileEvent_FailedInsertQuery) AS "Failed Inserts" FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "query_mix_pie",
        label: "Query Mix (share over range)",
        kind: "pie",
        spec: { labelCol: "name", valueCol: "value" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT 'Selects' AS name, toFloat64(sum(ProfileEvent_SelectQuery)) AS value FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to UNION ALL SELECT 'Inserts' AS name, toFloat64(sum(ProfileEvent_InsertQuery)) AS value FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to UNION ALL SELECT 'Other' AS name, toFloat64(greatest(sum(ProfileEvent_Query) - sum(ProfileEvent_SelectQuery) - sum(ProfileEvent_InsertQuery), 0)) AS value FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to`,
      },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: "ti-database",
    charts: [
      {
        key: "disk_gauge",
        label: "Disk Used (current)",
        kind: "stat",
        spec: { unit: "pct", warn: 75, danger: 90, icon: "ti-database" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT 100 - 100*anyLast(av)/nullIf(anyLast(tv),0) AS "Disk Used %" FROM (SELECT event_time, avgIf(value, metric='FilesystemMainPathAvailableBytes') AS av, avgIf(value, metric='FilesystemMainPathTotalBytes') AS tv FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric IN ('FilesystemMainPathAvailableBytes','FilesystemMainPathTotalBytes') GROUP BY event_time ORDER BY event_time)`,
      },
      {
        key: "mt_bytes_stat",
        label: "MergeTree Data Size (current)",
        kind: "stat",
        spec: { unit: "bytes" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT anyLast(value) AS v FROM (SELECT value FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric='TotalBytesOfMergeTreeTables' ORDER BY event_time)`,
      },
      {
        key: "bar_tbl_size",
        label: "Largest Tables by Size",
        kind: "bar",
        spec: { labelCol: "tbl", valueCol: "bytes" },
        sql: `SELECT concat(database, '.', table) AS tbl, sum(bytes_on_disk) AS bytes FROM system.parts WHERE active GROUP BY tbl ORDER BY bytes DESC LIMIT 15`,
      },
      {
        key: "bar_tbl_parts",
        label: "Tables by Active Part Count",
        kind: "bar",
        spec: { labelCol: "tbl", valueCol: "parts" },
        sql: `SELECT concat(database, '.', table) AS tbl, count() AS parts FROM system.parts WHERE active GROUP BY tbl ORDER BY parts DESC LIMIT 15`,
      },
      {
        key: "bar_disks",
        label: "Disks by Used %",
        kind: "bar",
        spec: { labelCol: "disk", valueCol: "used_pct" },
        sql: `SELECT name AS disk, round(100*(total_space - free_space)/nullIf(total_space,0), 1) AS used_pct FROM system.disks ORDER BY used_pct DESC LIMIT 15`,
      },
      {
        key: "disk_pct",
        label: "Disk Used (%)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, 100 - 100*avgIf(value, metric='FilesystemMainPathAvailableBytes')/nullIf(avgIf(value, metric='FilesystemMainPathTotalBytes'),0) AS "Disk Used %" FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric IN ('FilesystemMainPathAvailableBytes','FilesystemMainPathTotalBytes') GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "disk_avail",
        label: "Disk Available (bytes)",
        sql: aml("FilesystemMainPathAvailableBytes"),
      },
      {
        key: "disk_inodes",
        label: "Available Inodes",
        sql: aml("FilesystemMainPathAvailableINodes"),
      },
      {
        key: "tbl_bytes",
        label: "MergeTree Data Size (bytes)",
        sql: aml("TotalBytesOfMergeTreeTables"),
      },
      {
        key: "tbl_rows",
        label: "MergeTree Total Rows",
        sql: aml("TotalRowsOfMergeTreeTables"),
      },
    ],
  },
  {
    id: "merges",
    label: "Merges & Parts",
    icon: "ti-arrows-join",
    charts: [
      {
        key: "merges",
        label: "Merges Running",
        sql: ml("CurrentMetric_Merge"),
      },
      {
        key: "parts",
        label: "Total MergeTree Parts",
        sql: aml("TotalPartsOfMergeTreeTables"),
      },
      {
        key: "max_parts",
        label: "Max Parts For Partition",
        sql: aml("MaxPartCountForPartition", "max"),
      },
    ],
  },
  {
    id: "memory",
    label: "Memory",
    icon: "ti-brain",
    charts: [
      {
        key: "mem_tracked",
        label: "Memory(tracked)-(bytes)",
        sql: ml("CurrentMetric_MemoryTracking"),
      },
      {
        key: "mem_merges",
        label: "Memory merges/mutations-(bytes)",
        sql: ml("CurrentMetric_MergesMutationsMemoryTracking"),
      },
      {
        key: "mem_rss",
        label: "Memory by kernel (RSS)-(bytes)",
        sql: aml("MemoryResident"),
      },
      {
        key: "mem_alloc",
        label: "Memory by allocator-(bytes)",
        sql: aml("jemalloc.allocated"),
      },
      {
        key: "mem_resident",
        label: "Resident memory (allocator)-(bytes)",
        sql: aml("jemalloc.resident"),
      },
      {
        key: "pk_mem",
        label: "Primary key memory-(bytes)",
        sql: aml("TotalPrimaryKeyBytesInMemoryAllocated"),
      },
      {
        key: "idx_gran",
        label: "Index Granularity memory-(bytes)",
        sql: aml("TotalIndexGranularityBytesInMemoryAllocated"),
      },
      {
        key: "caches",
        label: "In-Memory Caches-(bytes)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, arraySum([COLUMNS('CurrentMetric_.*CacheBytes') EXCEPT 'CurrentMetric_FilesystemCache.*' APPLY avg]) AS metric FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
    ],
  },
  {
    id: "cpu",
    label: "CPU",
    icon: "ti-cpu",
    charts: [
      {
        key: "cpu_cores",
        label: "CPU Usage (cores)",
        sql: ml("ProfileEvent_OSCPUVirtualTimeMicroseconds / 1000000"),
      },
      {
        key: "io_wait",
        label: "IO Wait",
        sql: ml("ProfileEvent_OSIOWaitMicroseconds / 1000000"),
      },
      {
        key: "cpu_wait",
        label: "CPU Wait",
        sql: ml("ProfileEvent_OSCPUWaitMicroseconds / 1000000"),
      },
      {
        key: "os_user",
        label: "OS CPU Userspace",
        sql: aml("OSUserTimeNormalized"),
      },
      {
        key: "os_kernel",
        label: "OS CPU Kernel",
        sql: aml("OSSystemTimeNormalized"),
      },
      { key: "load15", label: "Load Average 15m", sql: aml("LoadAverage15") },
    ],
  },
  {
    id: "replication",
    label: "Replication",
    icon: "ti-git-merge",
    charts: [
      {
        key: "rep_delay",
        label: "Replica Delay (seconds)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, maxIf(value, metric='ReplicasMaxAbsoluteDelay') AS "Max Absolute Delay (s)", maxIf(value, metric='ReplicasMaxRelativeDelay') AS "Max Relative Delay (s)" FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric IN ('ReplicasMaxAbsoluteDelay','ReplicasMaxRelativeDelay') GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "rep_queue",
        label: "Replication Queue",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, maxIf(value, metric='ReplicasMaxQueueSize') AS "Max Queue Size", maxIf(value, metric='ReplicasSumQueueSize') AS "Sum Queue Size" FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric IN ('ReplicasMaxQueueSize','ReplicasSumQueueSize') GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "rep_backlog",
        label: "Inserts / Merges In Queue",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, maxIf(value, metric='ReplicasMaxInsertsInQueue') AS "Max Inserts In Queue", maxIf(value, metric='ReplicasMaxMergesInQueue') AS "Max Merges In Queue" FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric IN ('ReplicasMaxInsertsInQueue','ReplicasMaxMergesInQueue') GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "rep_readonly",
        label: "Read-only Replicas",
        sql: aml("ReadonlyReplica", "max"),
      },
    ],
  },
  {
    id: "inserts",
    label: "Insert Path",
    icon: "ti-arrow-bar-to-down",
    charts: [
      {
        key: "delayed",
        label: "Delayed Inserts /s",
        sql: ml("ProfileEvent_DelayedInserts"),
      },
      {
        key: "dist_backlog",
        label: "Distributed Insert Backlog",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, max(CurrentMetric_DistributedFilesToInsert) AS "Files To Insert", max(CurrentMetric_BrokenDistributedFilesToInsert) AS "Broken Files" FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "ins_rows2",
        label: "Inserted Rows /s",
        sql: ml("ProfileEvent_InsertedRows"),
      },
    ],
  },
  {
    id: "cache",
    label: "Cache",
    icon: "ti-bolt",
    charts: [
      {
        key: "cache_gauge",
        label: "Mark Cache Hit Ratio (current)",
        kind: "stat",
        spec: { unit: "pct", warn: 80, danger: 50, invert: true, icon: "ti-bolt" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT 100*sum(ProfileEvent_MarkCacheHits)/nullIf(sum(ProfileEvent_MarkCacheHits)+sum(ProfileEvent_MarkCacheMisses),0) AS "Hit %" FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to`,
      },
      {
        key: "cache_ratio",
        label: "Cache Hit Ratio (%)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, 100*sum(ProfileEvent_MarkCacheHits)/nullIf(sum(ProfileEvent_MarkCacheHits)+sum(ProfileEvent_MarkCacheMisses),0) AS "Mark Cache %", 100*sum(ProfileEvent_UncompressedCacheHits)/nullIf(sum(ProfileEvent_UncompressedCacheHits)+sum(ProfileEvent_UncompressedCacheMisses),0) AS "Uncompressed %", 100*sum(ProfileEvent_QueryCacheHits)/nullIf(sum(ProfileEvent_QueryCacheHits)+sum(ProfileEvent_QueryCacheMisses),0) AS "Query Cache %" FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "mark_hm",
        label: "Mark Cache Hits vs Misses /s",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, sum(ProfileEvent_MarkCacheHits) AS Hits, sum(ProfileEvent_MarkCacheMisses) AS Misses FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
    ],
  },
  {
    id: "pools",
    label: "Background Pools",
    icon: "ti-stack-2",
    charts: [
      {
        key: "pool_gauge",
        label: "Merges/Mutations Pool (current)",
        kind: "stat",
        spec: { unit: "pct", warn: 70, danger: 90, icon: "ti-stack-2" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT 100*anyLast(CurrentMetric_BackgroundMergesAndMutationsPoolTask)/nullIf(anyLast(CurrentMetric_BackgroundMergesAndMutationsPoolSize),0) AS "Pool %" FROM (SELECT * FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to ORDER BY event_time)`,
      },
      {
        key: "pool_util",
        label: "Pool Utilisation (%)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, 100*avg(CurrentMetric_BackgroundMergesAndMutationsPoolTask)/nullIf(avg(CurrentMetric_BackgroundMergesAndMutationsPoolSize),0) AS "Merges/Mutations %", 100*avg(CurrentMetric_BackgroundFetchesPoolTask)/nullIf(avg(CurrentMetric_BackgroundFetchesPoolSize),0) AS "Fetches %" FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "pool_tasks",
        label: "Pool Tasks (active)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, avg(CurrentMetric_BackgroundMergesAndMutationsPoolTask) AS "Merges/Mutations", avg(CurrentMetric_BackgroundFetchesPoolTask) AS Fetches, avg(CurrentMetric_BackgroundCommonPoolTask) AS Common, avg(CurrentMetric_BackgroundSchedulePoolTask) AS Schedule FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "pool_flush",
        label: "Flush / Distributed Pools",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, avg(CurrentMetric_BackgroundBufferFlushSchedulePoolTask) AS "Buffer Flush", avg(CurrentMetric_BackgroundDistributedSchedulePoolTask) AS Distributed FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
    ],
  },
  {
    id: "concurrency",
    label: "Concurrency",
    icon: "ti-topology-ring",
    charts: [
      {
        key: "threads",
        label: "Global Threads (total vs active)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, avg(CurrentMetric_GlobalThread) AS Total, avg(CurrentMetric_GlobalThreadActive) AS Active FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "rwlocks",
        label: "RW Lock Activity",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, avg(CurrentMetric_RWLockActiveReaders) AS "Active Readers", avg(CurrentMetric_RWLockActiveWriters) AS "Active Writers", avg(CurrentMetric_RWLockWaitingReaders) AS "Waiting Readers", avg(CurrentMetric_RWLockWaitingWriters) AS "Waiting Writers" FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "preempted",
        label: "Queries Preempted",
        sql: ml("CurrentMetric_QueryPreempted"),
      },
    ],
  },
  {
    id: "coordination",
    label: "Coordination",
    icon: "ti-hierarchy-2",
    charts: [
      {
        key: "kp_sessions",
        label: "Keeper Sessions / Watches",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, max(CurrentMetric_ZooKeeperSession) AS Sessions, max(CurrentMetric_ZooKeeperWatch) AS Watches FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "kp_requests",
        label: "Keeper Requests / Outstanding",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, max(CurrentMetric_ZooKeeperRequest) AS "In-flight Requests", max(CurrentMetric_KeeperOutstandingRequests) AS "Outstanding (server)", max(CurrentMetric_KeeperAliveConnections) AS "Alive Connections" FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
    ],
  },
  {
    id: "network",
    label: "Network",
    icon: "ti-world",
    charts: [
      {
        key: "net_conns",
        label: "Concurrent connections",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, max(CurrentMetric_TCPConnection) AS TCP, max(CurrentMetric_MySQLConnection) AS MySQL, max(CurrentMetric_HTTPConnection) AS HTTP, max(CurrentMetric_InterserverConnection) AS Interserver FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "net_bytes",
        label: "Network Throughput (bytes/s)",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, sumIf(value, startsWith(metric, 'NetworkReceiveBytes_')) AS Receive, sumIf(value, startsWith(metric, 'NetworkSendBytes_')) AS Send FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND (startsWith(metric, 'NetworkReceiveBytes_') OR startsWith(metric, 'NetworkSendBytes_')) GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "net_drops",
        label: "Network Packet Drops",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, sumIf(value, startsWith(metric, 'NetworkReceiveDrop_')) AS "Receive Drops", sumIf(value, startsWith(metric, 'NetworkSendDrop_')) AS "Send Drops" FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND (startsWith(metric, 'NetworkReceiveDrop_') OR startsWith(metric, 'NetworkSendDrop_')) GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
    ],
  },
  {
    id: "disk",
    label: "Disk & IO",
    icon: "ti-device-floppy",
    charts: [
      {
        key: "read_disk",
        label: "Read From Disk",
        sql: ml("ProfileEvent_OSReadBytes"),
      },
      {
        key: "read_fs",
        label: "Read From Filesystem",
        sql: ml("ProfileEvent_OSReadChars"),
      },
    ],
  },
  {
    id: "vitals",
    label: "Server Vitals",
    icon: "ti-heartbeat",
    charts: [
      {
        key: "stat_uptime",
        label: "Uptime (current)",
        kind: "stat",
        spec: { unit: "duration", icon: "ti-clock-play" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT anyLast(value) AS v FROM (SELECT value FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric='Uptime' ORDER BY event_time)`,
      },
      {
        key: "stat_tables",
        label: "Tables (current)",
        kind: "stat",
        spec: { unit: "count", icon: "ti-table" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT anyLast(value) AS v FROM (SELECT value FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric='NumberOfTables' ORDER BY event_time)`,
      },
      {
        key: "stat_dbs",
        label: "Databases (current)",
        kind: "stat",
        spec: { unit: "count", icon: "ti-database" },
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT anyLast(value) AS v FROM (SELECT value FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric='NumberOfDatabases' ORDER BY event_time)`,
      },
      {
        key: "uptime",
        label: "Uptime (seconds)",
        sql: aml("Uptime", "max"),
      },
      {
        key: "obj_counts",
        label: "Databases / Tables",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT AS t, maxIf(value, metric='NumberOfTables') AS Tables, maxIf(value, metric='NumberOfDatabases') AS Databases FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric IN ('NumberOfTables','NumberOfDatabases') GROUP BY t ORDER BY t WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "jitter",
        label: "Async Metric Jitter (s)",
        sql: aml("Jitter", "max"),
      },
    ],
  },
  {
    id: "mem_drift",
    label: "Memory Drift",
    icon: "ti-chart-arrows",
    charts: [
      {
        key: "drift_k",
        label: "ClickHouse® vs Kernel",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT t, metrics.value - async_metrics.value AS drift FROM (SELECT CAST(toStartOfInterval(event_time, toIntervalSecond({rounding:UInt32})), 'INT') AS t, avg(CurrentMetric_MemoryTracking) AS value FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY ALL) AS metrics JOIN (SELECT CAST(toStartOfInterval(event_time, toIntervalSecond({rounding:UInt32})), 'INT') AS t, avg(value) AS value FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric = 'MemoryResident' GROUP BY ALL) AS async_metrics USING (t) ORDER BY t ASC WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
      {
        key: "drift_a",
        label: "ClickHouse® vs Allocator",
        sql: `WITH toDateTimeOrDefault({from:String}, '', now() - {seconds:UInt32}) AS from, toDateTimeOrDefault({to:String}, '', now()) AS to SELECT t, metrics.value - async_metrics.value AS drift FROM (SELECT CAST(toStartOfInterval(event_time, toIntervalSecond({rounding:UInt32})), 'INT') AS t, avg(CurrentMetric_MemoryTracking) AS value FROM merge('system', '^metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to GROUP BY ALL) AS metrics JOIN (SELECT CAST(toStartOfInterval(event_time, toIntervalSecond({rounding:UInt32})), 'INT') AS t, avg(value) AS value FROM merge('system', '^asynchronous_metric_log') WHERE event_date BETWEEN toDate(from) AND toDate(to) AND event_time BETWEEN from AND to AND metric = 'jemalloc.allocated' GROUP BY ALL) AS async_metrics USING (t) ORDER BY t ASC WITH FILL FROM toStartOfInterval(toDateTime({from:String}), INTERVAL {rounding:UInt32} SECOND)::INT TO toStartOfInterval(toDateTime({to:String}), INTERVAL {rounding:UInt32} SECOND)::INT STEP {rounding:UInt32}`,
      },
    ],
  },
  {
    id: "dist_cache",
    label: "Dist Cache",
    icon: "ti-cloud",
    charts: [
      {
        key: "dc_rd",
        label: "DC Read bytes/sec",
        sql: ml("ProfileEvent_DistrCacheReceivedDataPacketsBytes"),
      },
      {
        key: "dc_rr",
        label: "DC Read requests",
        sql: ml("CurrentMetric_DistrCacheReadRequests"),
      },
      {
        key: "dc_wr",
        label: "DC Write requests",
        sql: ml("CurrentMetric_DistrCacheWriteRequests"),
      },
      {
        key: "dc_cn",
        label: "DC Open connections",
        sql: ml("CurrentMetric_DistrCacheOpenedConnections"),
      },
      {
        key: "dc_er",
        label: "DC Read errors",
        sql: ml("ProfileEvent_DistrCacheReadErrors"),
      },
      {
        key: "dc_mr",
        label: "DC Make request errors",
        sql: ml("ProfileEvent_DistrCacheMakeRequestErrors"),
      },
      {
        key: "dc_re",
        label: "DC Receive response errors",
        sql: ml("ProfileEvent_DistrCacheReceiveResponseErrors"),
      },
      {
        key: "dc_up",
        label: "DC Registry updates",
        sql: ml("ProfileEvent_DistrCacheHashRingRebuilds"),
      },
    ],
  },
];

const ALL_CHARTS = TABS.flatMap((t) => t.charts);

// ECharts renders to canvas and does NOT understand CSS custom properties:
// passing "var(--text-primary)" as a colour yields black in every theme. So we
// resolve CSS variables to their concrete computed value at option-build time.
// buildOpt re-runs on theme change (charts remount via themeKey), so colours
// stay correct in both light and dark.
function cssVar(name, fallback) {
  if (typeof window === "undefined" || !document?.documentElement) {
    return fallback;
  }
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

// Theme-resolved colours for axis labels, axis lines, and legend/label text.
function axisLabelStyle() {
  return { color: cssVar("--text-primary", "#1f2937"), fontSize: 11 };
}
function axisLineStyle() {
  return { lineStyle: { color: cssVar("--border-default", "#d1d5db") } };
}
function legendTextStyle() {
  return { color: cssVar("--text-secondary", "#4b5563") };
}

// Explicit, high-contrast series palette. The default ECharts palette can wash
// out in one theme; these mid-tone hues stay legible on both light and dark
// backgrounds (verified for contrast against near-white and near-black).
const SERIES_PALETTE = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
];

// Shared x-axis for all time-series panels: true time spacing, ~3 labels
// (validated to stay within 2-4 across 1h..30d and 360..1000px), formatted
// as yyyy-MM-DD HH:mm.
function timeXAxis(from, to) {
  const fmtLabel = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const min = from ? new Date(from.replace(" ", "T")).getTime() : undefined;
  const max = to ? new Date(to.replace(" ", "T")).getTime() : undefined;
  return {
    type: "time",
    position: "bottom",
    min,
    max,
    splitNumber: 3,
    axisLabel: { ...axisLabelStyle(), formatter: fmtLabel, hideOverlap: true },
    axisLine: axisLineStyle(),
  };
}

// Big-number card for "current value" stats (uptime, table counts, sizes).
// Not an ECharts chart, just a styled value with an optional Tabler icon.
// Error card shown in place of a single chart whose query failed, so one bad
// query does not blank the whole tab.
function ChartErrorCard({ title, message }) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--text-secondary)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          color: "var(--color-danger)",
          fontSize: "13px",
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        <Icon
          className="ti ti-alert-circle"
          style={{ flexShrink: 0, marginTop: 2 }}
        ></Icon>
        <span>{message}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, icon, warn, danger, invert, loading }) {
  const fmt = (v) => {
    if (v == null || isNaN(v)) return "-";
    if (unit === "pct") return `${Math.round(v * 10) / 10}%`;
    if (unit === "bytes") {
      let n = v;
      const u = ["B", "KB", "MB", "GB", "TB", "PB"];
      let i = 0;
      while (n >= 1024 && i < u.length - 1) {
        n /= 1024;
        i++;
      }
      return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
    }
    if (unit === "duration") {
      const s = Math.floor(v);
      const dys = Math.floor(s / 86400);
      const hrs = Math.floor((s % 86400) / 3600);
      const mins = Math.floor((s % 3600) / 60);
      if (dys > 0) return `${dys}d ${hrs}h`;
      if (hrs > 0) return `${hrs}h ${mins}m`;
      return `${mins}m`;
    }
    return Math.round(v).toLocaleString("en-US");
  };

  // Threshold colour for pct cards. Default: higher = worse (disk, pool).
  // invert: higher = better (cache hit ratio).
  let valueColor = "var(--text-primary)";
  if (unit === "pct" && value != null && !isNaN(value) && warn != null) {
    if (invert) {
      valueColor =
        value < danger
          ? "var(--color-danger)"
          : value < warn
            ? "var(--color-warning)"
            : "var(--color-success)";
    } else {
      valueColor =
        value >= danger
          ? "var(--color-danger)"
          : value >= warn
            ? "var(--color-warning)"
            : "var(--color-success)";
    }
  }

  return (
    <div
      className="card"
      style={{
        padding: 20,
        display: "flex",
        alignItems: "center",
        gap: 16,
        minHeight: 100,
      }}
    >
      {icon && (
        <Icon
          className={`ti ${icon}`}
          style={{ fontSize: 32, color: "var(--accent)", opacity: 0.85 }}
        ></Icon>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: 6,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "29px",
            fontWeight: 700,
            color: valueColor,
            lineHeight: 1,
          }}
        >
          {loading ? <span className="loading-spinner"></span> : fmt(value)}
        </div>
      </div>
    </div>
  );
}

export default function MonitoringDashboards() {
  const toast = useToast();
  const { tab: routeTab = TABS[0].id } = useParams();
  const navigate = useNavigate();
  const [from, setFrom] = useState(fmtAgo(24));
  const [to, setTo] = useState(fmtNow());
  const [rounding, setRounding] = useState(60);
  const [duration, setDuration] = useState(24);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fetchErrors, setFetchErrors] = useState(0);
  const [error, setError] = useState("");
  const [results, setResults] = useState({});
  const [activeTab, setActiveTab] = useState(routeTab);
  const [loadedTabs, setLoadedTabs] = useState(new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sectionFullscreen, setSectionFullscreen] = useState(false);
  // The from/to that were active when charts were last loaded. Charts render
  // against THIS range, not live filter state, so changing the quick range or
  // dates does not rescale or refresh anything until Load Charts is pressed.
  const [loadedRange, setLoadedRange] = useState({ from: null, to: null });
  // Bumped whenever the document theme (data-theme) changes, so charts remount
  // and re-read CSS-variable colours (ECharts captures them once at setOption).
  const [themeKey, setThemeKey] = useState(0);
  // Per-chart error messages, keyed by chart key. A failing query shows its
  // exception inside that one chart's slot instead of failing the whole tab.
  const [chartErrors, setChartErrors] = useState({});
  const refreshRef = useRef(0);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    navigate(`/monitoring/dashboards/${newTab}`, { replace: true });
  };

  useEffect(() => {
    if (routeTab !== activeTab && TABS.some((t) => t.id === routeTab)) {
      setActiveTab(routeTab);
    }
  }, [routeTab]);

  // Watch for light/dark theme changes and force charts to re-read colours.
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => obs.disconnect();
  }, []);

  // Section fullscreen: Escape exits, and the page body scroll is locked while
  // the overlay is open so the underlying page does not scroll behind it.
  useEffect(() => {
    if (!sectionFullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSectionFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sectionFullscreen]);

  // function applyDuration(h) { setFrom(fmtAgo(h)); setTo(fmtNow()); setRounding(h <= 1 ? 10 : h <= 6 ? 30 : h <= 24 ? 60 : h <= 72 ? 300 : 900); }
  function applyDuration(h) {
    setFrom(fmtAgo(h));
    setTo(fmtNow());
    setRounding(h <= 1 ? 10 : h <= 6 ? 30 : h <= 24 ? 60 : h <= 72 ? 300 : 900);
    setDuration(h);
  }
  const loadTab = useCallback(
    async (tabId, fromVal, toVal, roundingVal) => {
      const tab = TABS.find((t) => t.id === tabId);
      if (!tab) return;
      const rid = ++refreshRef.current;
      setLoading(true);
      setProgress(0);
      setFetchErrors(0);
      const nr = { ...results };
      const ce = {};
      let errCount = 0;
      for (let i = 0; i < tab.charts.length; i++) {
        if (refreshRef.current !== rid) return; // cancelled
        const m = tab.charts[i];
        try {
          const sql = buildSql(
            m.sql,
            fromVal || from,
            toVal || to,
            roundingVal || rounding,
          );
          const r = await runQuery(sql);
          nr[m.key] = r.rows || [];
          delete ce[m.key];
        } catch (err) {
          ce[m.key] = err.message || "Query failed";
          nr[m.key] = [];
          errCount++;
        }
        setProgress(Math.round(((i + 1) / tab.charts.length) * 100));
        setResults({ ...nr });
        setChartErrors({ ...ce });
      }
      setLoadedTabs((prev) => new Set([...prev, tabId]));
      setLoadedRange({ from: fromVal || from, to: toVal || to });
      setLoading(false);
      setFetchErrors(errCount);
    },
    [from, to, rounding, results],
  );

  function loadAllCurrentTab() {
    loadTab(activeTab);
  }

  function buildOpt(key, label, kind = "line", spec = {}) {
    const d = results[key];
    if (!d?.length) return null;

    // Range frozen at load time, so changing the filter does not rescale axes.
    const axFrom = loadedRange.from || from;
    const axTo = loadedRange.to || to;

    // Theme-resolved colours (computed now; charts remount on theme change).
    const axisLabel = axisLabelStyle();
    const axisLine = axisLineStyle();
    const legendText = legendTextStyle();
    const splitColor = cssVar("--border-default", "#e5e7eb");
    const cardBg = cssVar("--bg-card", "#ffffff");

    // BAR: horizontal top-N snapshot (label column + value column). Each bar
    // gets its own palette colour so the chart is colourful and the bars stay
    // visible (and distinct on hover) in both themes.
    if (kind === "bar") {
      const cols = Object.keys(d[0]);
      const labelCol = spec.labelCol || cols[0];
      const valCol = spec.valueCol || cols.find((c) => c !== labelCol) || cols[1];
      const sorted = [...d].sort(
        (a, b) => (parseFloat(b[valCol]) || 0) - (parseFloat(a[valCol]) || 0),
      );
      return {
        ...baseChartOption(),
        grid: { left: 12, right: 24, top: 12, bottom: 12, containLabel: true },
        tooltip: {
          trigger: "axis",
          confine: true,
          axisPointer: { type: "shadow" },
        },
        xAxis: {
          type: "value",
          axisLabel,
          axisLine,
          splitLine: { lineStyle: { color: splitColor, opacity: 0.4 } },
        },
        yAxis: {
          type: "category",
          inverse: true,
          data: sorted.map((r) => String(r[labelCol])),
          axisLabel: { ...axisLabel, width: 140, overflow: "truncate" },
          axisLine,
        },
        series: [
          {
            type: "bar",
            data: sorted.map((r, i) => ({
              value: parseFloat(r[valCol]) || 0,
              itemStyle: {
                color: SERIES_PALETTE[i % SERIES_PALETTE.length],
                borderRadius: [0, 3, 3, 0],
              },
            })),
            barMaxWidth: 18,
            emphasis: {
              itemStyle: {
                borderColor: cssVar("--text-primary", "#111827"),
                borderWidth: 1,
              },
            },
          },
        ],
      };
    }

    // PIE: part-to-whole snapshot. Slice colours come from the palette; labels
    // and connector lines use the resolved text colour so they are dark on a
    // light theme and light on a dark theme.
    if (kind === "pie") {
      const cols = Object.keys(d[0]);
      const labelCol = spec.labelCol || cols[0];
      const valCol = spec.valueCol || cols.find((c) => c !== labelCol) || cols[1];
      return {
        ...baseChartOption(),
        color: SERIES_PALETTE,
        tooltip: { trigger: "item", confine: true },
        legend: { show: true, bottom: 0, textStyle: legendText },
        series: [
          {
            type: "pie",
            radius: ["45%", "70%"],
            center: ["50%", "45%"],
            itemStyle: { borderColor: cardBg, borderWidth: 2 },
            label: { show: true, formatter: '{b} ({d}%)', color: 'inherit', fontSize: 11 },
            labelLine: { show: true },
            data: d.map((r) => ({
              name: String(r[labelCol]),
              value: parseFloat(r[valCol]) || 0,
            })),
          },
        ],
      };
    }

    // LINE (default): time-series.
    const cols = Object.keys(d[0]);

    // Per-hostname pivot: queries returning (t, hostname, value) become one
    // series PER hostname. WITH FILL on GROUP BY t, hostname produces filler
    // rows with an empty hostname; those must be dropped or they appear as a
    // phantom "(default)" series alongside the real host.
    if (cols.includes("hostname")) {
      const valCol =
        cols.find((c) => c !== "t" && c !== "hostname") || cols[cols.length - 1];
      const realRows = d.filter((r) => r.hostname != null && r.hostname !== "");
      const hosts = [...new Set(realRows.map((r) => r.hostname))];
      const series = hosts.map((h) => ({
        type: "line",
        smooth: true,
        symbol: "none",
        name: h,
        lineStyle: { width: 1.0 },
        data: realRows
          .filter((r) => r.hostname === h)
          .map((r) => [r.t * 1000, parseFloat(r[valCol]) || 0]),
        emphasis: { focus: "series" },
      }));
      return {
        ...baseChartOption(),
        color: SERIES_PALETTE,
        grid: { left: 12, right: 16, bottom: 12, containLabel: true },
        xAxis: timeXAxis(axFrom, axTo),
        yAxis: { type: "value", axisLabel, axisLine },
        legend: {
          show: true,
          top: 0,
          left: 8,
          type: "scroll",
          itemGap: 12,
          textStyle: legendText,
        },
        tooltip: { trigger: "axis", confine: true },
        series,
      };
    }

    // Multi-series (more than 2 columns: t + multiple values). Rendered as
    // clean multi-lines with NO area fill, so overlapping bands stay legible.
    if (cols.length > 2) {
      const series = cols
        .filter((c) => c !== "t")
        .map((c) => ({
          type: "line",
          smooth: true,
          symbol: "none",
          name: c,
          lineStyle: { width: 1.0 },
          data: d.map((r) => [r.t * 1000, parseFloat(r[c]) || 0]),
          emphasis: { focus: "series" },
        }));
      return {
        ...baseChartOption(),
        color: SERIES_PALETTE,
        grid: { left: 12, right: 16, bottom: 12, containLabel: true },
        xAxis: timeXAxis(axFrom, axTo),
        yAxis: { type: "value", axisLabel, axisLine },
        legend: {
          show: true,
          top: 0,
          left: 8,
          type: "scroll",
          itemGap: 12,
          textStyle: legendText,
        },
        tooltip: { trigger: "axis", confine: true },
        series,
      };
    }
    // Single series (light fill is fine when there's only one band)
    const valCol = cols.find((c) => c !== "t") || cols[1];
    return {
      ...baseChartOption(),
      color: SERIES_PALETTE,
      grid: { left: 12, right: 16, bottom: 12, containLabel: true },
      legend: {
        show: true,
        top: 0,
        left: 8,
        type: "scroll",
        itemGap: 12,
        textStyle: legendText,
      },
      xAxis: timeXAxis(axFrom, axTo),
      yAxis: { type: "value", axisLabel, axisLine },
      tooltip: { trigger: "axis", confine: true },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "none",
          name: label,
          lineStyle: { width: 1.0 },
          data: d.map((r) => [r.t * 1000, parseFloat(r[valCol]) || 0]),
          areaStyle: { opacity: 0.1 },
        },
      ],
    };
  }

  // handle the Date change infinity like FROM > TO -->( Kathirdhasan )
  const handleDateOnChange = (date, label) => {
    if (label === "From") {
      setFrom(date);
      if (to && new Date(date) > new Date(to)) {
        setFrom(fmtAgo(24));
        toast.warning("From Date must be earlier than To Date!");
      }
    }

    if (label === "To") {
      setTo(date);
      if (from && new Date(from) > new Date(date)) {
        setTo(fmtNow());
        toast.warning("To date cannot be less than From date!");
      }
    }
  };

  const activeGroup = TABS.find((g) => g.id === activeTab) || TABS[0];

  return (
    <div
      className="page-content"
      style={
        sectionFullscreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "var(--bg-page)",
              padding: 16,
              overflow: "auto",
            }
          : undefined
      }
    >
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-device-analytics"></Icon> Monitoring
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSectionFullscreen((v) => !v)}
            title={
              sectionFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen section"
            }
          >
            <Icon
              className={`ti ${sectionFullscreen ? "ti-minimize" : "ti-maximize"}`}
            ></Icon>{" "}
            {sectionFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Icon
              className={`ti ${filtersOpen ? "ti-chevron-up" : "ti-chevron-down"}`}
            ></Icon>{" "}
            {filtersOpen ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {filtersOpen && (
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 20,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          {/* <div className="form-group"><label className="form-label">Quick</label><div style={{ display: 'flex', gap: 4 }}>{[1, 6, 24, 48, 168, 720].map(h => <button key={h} className="btn btn-secondary btn-sm" onClick={() => applyDuration(h)}>{h <= 48 ? h + 'h' : h === 168 ? '7d' : '30d'}</button>)}</div></div> */}
          <div className="form-group">
            <label className="form-label">Quick</label>
            <div
              style={{
                display: "flex",
                gap: "4px",
                alignItems: "center",
                justifyContent: "start",
              }}
            >
              {[1, 6, 24, 48, 168, 720].map((h) => (
                <button
                  key={h}
                  style={{
                    border:
                      duration === h
                        ? "1px soild transparent "
                        : "1px soild red",
                    padding: "10px",
                    width: "50px ",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  className={`btn btn-sm ${duration === h ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => applyDuration(h)}
                >
                  {h <= 48 ? h + "h" : h === 168 ? "7d" : "30d"}
                </button>
              ))}
            </div>
          </div>
          <DateTimePicker
            label="From"
            value={from}
            onChange={handleDateOnChange}
            name="From"
          />
          <DateTimePicker
            label="To"
            value={to}
            onChange={handleDateOnChange}
            name="To"
          />
          <div className="form-group">
            <label className="form-label">Rounding (s)</label>
            <input
              className="form-input"
              type="number"
              min={5}
              value={rounding}
              onChange={(e) => setRounding(parseInt(e.target.value) || 60)}
              style={{ width: 80 }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={loadAllCurrentTab}
            disabled={loading}
            style={{ minWidth: 140 }}
          >
            <Icon className="ti ti-player-play"></Icon>{" "}
            {loading ? "Loading..." : "Load Charts"}
          </button>
        </div>
      )}

      {loading && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              height: 4,
              background: "var(--bg-active)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: progress + "%",
                height: "100%",
                background: "var(--accent)",
                transition: "width 0.3s",
              }}
            ></div>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginTop: 6,
            }}
          >
            {progress}% - {activeGroup.label}
          </p>
        </div>
      )}
      {fetchErrors > 0 && !loading && (
        <div className="alert-banner danger" style={{ marginBottom: 16 }}>
          <Icon className="ti ti-alert-circle"></Icon>{" "}
          {fetchErrors} of {activeGroup.charts.length} charts failed to load.
          See the affected charts below for details.
        </div>
      )}

      <div className="tab-bar">
        {TABS.map((g) => (
          <div
            key={g.id}
            className={`tab-item ${activeTab === g.id ? "active" : ""}`}
            onClick={() => handleTabChange(g.id)}
          >
            <Icon className={`ti ${g.icon}`}></Icon> {g.label} ({g.charts.length})
          </div>
        ))}
      </div>

      {!loadedTabs.has(activeTab) && !loading && (
        <div className="empty-state">
          <Icon className="ti ti-chart-line"></Icon>
          <p>
            Select a time range and click Load Charts for the{" "}
            {activeGroup.label} tab.
          </p>
        </div>
      )}

      {loadedTabs.has(activeTab) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          {activeGroup.charts.map((m) => {
            const kind = m.kind || "line";

            // Per-chart error: show the exception inside THIS chart's slot only,
            // so one failing query does not blank the whole tab.
            const chErr = chartErrors[m.key];
            if (chErr) {
              return (
                <ChartErrorCard
                  key={`${m.key}-err`}
                  title={m.label}
                  message={chErr}
                />
              );
            }

            // Stat card: latest single value, rendered as a big-number card
            // (not an ECharts chart). Reads the first non-time value column, so
            // it works whether the query aliases the value as `v` or by name.
            if (kind === "stat") {
              const d = results[m.key];
              let raw = null;
              if (d?.length) {
                const last = d[d.length - 1];
                const vcol =
                  Object.keys(last).find((c) => c !== "t") ||
                  Object.keys(last)[0];
                raw = parseFloat(last[vcol]);
              if (isNaN(raw)) raw = null;
            }
            return (
              <StatCard
                key={`${m.key}-${sectionFullscreen ? "fs" : "n"}-${themeKey}`}
                label={m.label}
                value={raw}
                unit={m.spec?.unit}
                icon={m.spec?.icon}
                warn={m.spec?.warn}
                danger={m.spec?.danger}
                invert={m.spec?.invert}
                loading={loading && raw == null}
              />
            );
          }

          const value = buildOpt(m.key, m.label, kind, m.spec || {});

          // Every ECharts chart (line, bar, pie) shares the card's toolbar area
          // (zoom/save/fullscreen), so reserve top space and place the toolbox
          // consistently. Pie has no cartesian grid, so only line/bar get the
          // grid.top clearance.
          const needsGrid = kind === "line" || kind === "bar";
          const opt = {
            ...value,
            ...(needsGrid
              ? { grid: { ...value?.grid, top: "50" } }
              : {}),
            toolbox: { ...value?.toolbox, right: 10, top: "0" },
          };

          return (
            <ChartCard
              key={`${m.key}-${sectionFullscreen ? "fs" : "n"}-${themeKey}`}
              title={m.label}
              option={opt}
              height={340}
              loading={loading && !opt}
              chartType={m.kind}
            />
          );
        })}
        </div>
      )}
    </div>
  );
}
