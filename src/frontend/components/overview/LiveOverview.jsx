// Copyright (C) 2026 Quantrail™ Data Private Limited
// The live section of the Cluster Overview page.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import { runQuery } from "../../utils/api.js";
import { buildChartOption } from "../dashboards/chartTypes.js";
import { ChartCard, KpiStrip, HealthStrip, GaugeGroup, Section } from "./OverviewCards.jsx";
import { fmtBytes } from "../../utils/costEstimator.js";
import {
  METRIC_KEYS,
  ASYNC_KEYS,
  EVENT_KEYS,
  ALL_LOG_LEVELS,
  TIME_BREAKDOWN,
  BACKGROUND_POOLS,
  HEALTH_CHIPS,
} from "./overviewMetrics.js";
import {
  NO_VALUE,
  ratio,
  difference,
  toValues,
  toDescriptions,
  toCategoryRows,
  stamp,
  detectRestart,
  rate,
  rateOfSum,
  pairRatio,
  pairRatioOfSums,
  threadEquivalents,
} from "./overviewMath.js";

const INTERVALS = [5, 10, 30, 60];
const LS_LIVE = "chops_overview_live";
const LS_INTERVAL = "chops_overview_interval";

const METRIC_SQL = "SELECT metric, value, description FROM system.metrics";
const ASYNC_SQL = "SELECT metric, value, description FROM system.asynchronous_metrics";
const EVENT_SQL = "SELECT event, value, description FROM system.events";

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function useLiveOverview() {
  const [live, setLive] = useState(() => readStored(LS_LIVE, true));
  const [interval, setIntervalSeconds] = useState(() => readStored(LS_INTERVAL, 5));
  const [m, setM] = useState({}); // system.metrics, gauges
  const [a, setA] = useState({}); // system.asynchronous_metrics, gauges
  // Exactly two counter samples. Not a buffer: the previous reading is kept
  // only so the current one can be turned into a rate.
  const [prev, setPrev] = useState(null);
  const [curr, setCurr] = useState(null);
  const [restarted, setRestarted] = useState(false);
  const [descriptions, setDescriptions] = useState({});
  const [lastAt, setLastAt] = useState(null);
  const [error, setError] = useState(null);

  const inFlight = useRef(false);
  const metricKeys = useMemo(() => new Set(METRIC_KEYS), []);
  const asyncKeys = useMemo(() => new Set(ASYNC_KEYS), []);
  const eventKeys = useMemo(() => new Set(EVENT_KEYS), []);

  const poll = useCallback(async () => {
    // Skip rather than queue. A slow server should not build a backlog of
    // requests that all land at once when it recovers.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [metricsRes, asyncRes, eventsRes] = await Promise.all([
        runQuery(METRIC_SQL),
        runQuery(ASYNC_SQL),
        runQuery(EVENT_SQL),
      ]);

      setM(toValues(metricsRes.rows, "metric", metricKeys));
      setA(toValues(asyncRes.rows, "metric", asyncKeys));

      // Counters. A key absent from system.events has simply not fired yet, so
      // toValues leaving it out is correct and the rate helpers read it as zero.
      const sample = stamp(toValues(eventsRes.rows, "event", eventKeys));
      setCurr((previousCurrent) => {
        if (previousCurrent) {
          if (detectRestart(previousCurrent.values, sample.values, EVENT_KEYS)) {
            // Counters reset. The previous reading belongs to a different server
            // lifetime, so drop it rather than differencing across the restart.
            setPrev(null);
            setRestarted(true);
          } else {
            setPrev(previousCurrent);
            setRestarted(false);
          }
        }
        return sample;
      });

      setDescriptions((prevDesc) => ({
        ...prevDesc,
        ...toDescriptions(metricsRes.rows, "metric"),
        ...toDescriptions(asyncRes.rows, "metric"),
        ...toDescriptions(eventsRes.rows, "event"),
      }));
      setLastAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err?.message || "Failed to read the system tables");
    } finally {
      inFlight.current = false;
    }
  }, [metricKeys, asyncKeys, eventKeys]);

  // Polling, paused while the tab is hidden. Without this a dashboard left on a
  // second monitor overnight is around seventeen thousand queries.
  useEffect(() => {
    if (!live) return undefined;
    let timer = null;
    const start = () => {
      poll();
      timer = setInterval(poll, interval * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else if (!timer) start(); // fetch at once, so returning never shows a stale number
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live, interval, poll]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LIVE, JSON.stringify(live));
      localStorage.setItem(LS_INTERVAL, JSON.stringify(interval));
    } catch {
      // A browser refusing local storage is not a reason to break the page.
    }
  }, [live, interval]);

  const loaded = Object.keys(m).length > 0;


  // Every value below covers the last refresh interval

  const hasPair = Boolean(prev && curr);

  const ev = useMemo(() => {
    const r = (k) => (hasPair ? rate(prev, curr, k) : NO_VALUE);
    const pr = (n, d) => (hasPair ? pairRatio(prev, curr, n, d) : NO_VALUE);
    const prs = (n, d) => (hasPair ? pairRatioOfSums(prev, curr, n, d) : NO_VALUE);
    const te = (keys, scale) => (hasPair ? threadEquivalents(prev, curr, keys, scale) : NO_VALUE);
    const invert = (v) => (v === NO_VALUE ? NO_VALUE : 1 - v);

    return {
      // cpu, as cores rather than a percentage, because the machine percentage
      // already has its own gauge from asynchronous_metrics
      ch_cpu_cores: te(["UserTimeMicroseconds", "SystemTimeMicroseconds"]),
      cpu_blocked: invert(prs(["UserTimeMicroseconds", "SystemTimeMicroseconds"], ["RealTimeMicroseconds"])),
      kernel_share: prs(["SystemTimeMicroseconds"], ["UserTimeMicroseconds", "SystemTimeMicroseconds"]),
      cpu_starvation: pr("OSCPUWaitMicroseconds", "RealTimeMicroseconds"),
      cpu_steal: invert(pr("OSCPUVirtualTimeMicroseconds", "RealTimeMicroseconds")),

      // efficiency
      page_cache_miss: pr("OSReadBytes", "OSReadChars"),
      file_reopen_rate: prs(["OpenedFileCacheMisses"], ["OpenedFileCacheHits", "OpenedFileCacheMisses"]),
      unsorted_inserts: invert(pr("MergeTreeDataWriterBlocksAlreadySorted", "MergeTreeDataWriterBlocks")),
      queueing_overhead: pr("LocalThreadPoolJobWaitTimeMicroseconds", "LocalThreadPoolBusyMicroseconds"),
      merge_stall: invert(pr("MergeExecuteMilliseconds", "MergeTotalMilliseconds")),
      error_share: prs(["LogError"], ALL_LOG_LEVELS),
      http_new_connections: prs(["HTTPServerConnectionsCreated"], ["HTTPServerConnectionsCreated", "HTTPServerConnectionsReused"]),

      // amplification and shape
      read_amplification: pr("RowsReadByMainReader", "SelectedRows"),
      write_amplification: pr("MergedRows", "InsertedRows"),
      rows_per_part: pr("MergeTreeDataWriterRows", "MergeTreeDataWriterBlocks"),
      parts_per_merge: pr("MergeSourceParts", "Merge"),
      bytes_per_row: pr("SelectedBytes", "SelectedRows"),
      read_compression: pr("CompressedReadBufferBytes", "ReadCompressedBytes"),
      insert_compression: pr("MergeTreeDataWriterUncompressedBytes", "MergeTreeDataWriterCompressedBytes"),
      avg_query_latency: (() => {
        const v = pr("QueryTimeMicroseconds", "Query");
        return v === NO_VALUE ? NO_VALUE : v / 1000;
      })(),

      // throughput
      query_rate: r("Query"),
      rows_read_rate: r("SelectedRows"),
      rows_written_rate: r("InsertedRows"),
      disk_read_rate: r("OSReadBytes"),
      disk_write_rate: r("OSWriteBytes"),
      net_in_rate: r("NetworkReceiveBytes"),
      net_out_rate: r("NetworkSendBytes"),
      errors_rate: r("LogError"),
      keeper_exceptions_rate: r("ZooKeeperHardwareExceptions"),
      merge_throughput: (() => {
        const v = pr("MergedRows", "MergeExecuteMilliseconds");
        return v === NO_VALUE ? NO_VALUE : v * 1000;
      })(),
      // MergeExecuteMilliseconds is in milliseconds, so it needs the scale
      // factor or the answer is a thousand times too small.
      merge_concurrency: te(["MergeExecuteMilliseconds"], 1000),
    };
  }, [hasPair, prev, curr]);

  // Where the time goes, as a bar of current thread-equivalents rather than a
  // time series.
  const timeBreakdown = useMemo(() => {
    if (!hasPair) return null;
    const rows = TIME_BREAKDOWN.map((item) => ({
      k: item.label,
      v: threadEquivalents(prev, curr, item.keys, item.scale ?? 1),
    }))
      .filter((r) => Number.isFinite(r.v) && r.v > 0.0005)
      .sort((x, y) => y.v - x.v);
    if (!rows.length) return null;
    return buildChartOption(
      "bar",
      "horizontal_bar",
      rows,
      { category: "k", value: "v" },
      "Where the time goes",
      { showLegend: false },
    );
  }, [hasPair, prev, curr]);

  // gauges

  const gauges = useMemo(() => {
    const machine = [
      {
        key: "cpu_used",
        // OSIdleTimeNormalized is already divided by core count, so one minus it
        // is whole-machine utilization without needing to know the core count.
        value: Number.isFinite(a.OSIdleTimeNormalized)
          ? Math.max(0, Math.min(1, 1 - a.OSIdleTimeNormalized))
          : NO_VALUE,
      },
      {
        key: "memory_used",
        value: Number.isFinite(a.OSMemoryTotal) && Number.isFinite(a.OSMemoryAvailable)
          ? ratio(a.OSMemoryTotal - a.OSMemoryAvailable, a.OSMemoryTotal)
          : NO_VALUE,
      },
      { key: "ch_memory_share", value: ratio(a.MemoryResident, a.OSMemoryTotal) },
      { key: "thread_pool_used", value: ratio(m.GlobalThreadActive, m.GlobalThread) },
      { key: "cpu_slots", value: ratio(m.ConcurrencyControlAcquired, m.ConcurrencyControlSoftLimit) },
      {
        key: "fs_cache_used",
        value: ratio(m.FilesystemCacheSize, m.FilesystemCacheSizeLimit),
        show: Number(m.FilesystemCacheSizeLimit) > 0,
      },
    ];

    // Percentages that come from counters. Same gauge, same grouping, and the
    // reader does not need to know which table each one came from.
    const efficiency = [
      { key: "cpu_blocked", value: ev.cpu_blocked },
      { key: "page_cache_miss", value: ev.page_cache_miss },
      { key: "file_reopen_rate", value: ev.file_reopen_rate },
      { key: "unsorted_inserts", value: ev.unsorted_inserts },
      { key: "queueing_overhead", value: ev.queueing_overhead },
      { key: "merge_stall", value: ev.merge_stall },
      { key: "http_new_connections", value: ev.http_new_connections },
      { key: "error_share", value: ev.error_share },
      { key: "kernel_share", value: ev.kernel_share },
      { key: "cpu_starvation", value: ev.cpu_starvation },
      { key: "cpu_steal", value: ev.cpu_steal },
    ];

    return { machine, efficiency };
  }, [m, a, ev]);

  //charts

  const charts = useMemo(() => {
    const bar = (rows, title, showLegend = false) =>
      rows.length
        ? buildChartOption("bar", "simple_bar", rows, { category: "k", value: "v" }, title, {
            showLegend,
          })
        : null;

    // In use against limit, per pool. These are counts rather than percentages,
    // so a dial would be reading something into them that is not there: eight
    // tasks means eight, and what matters is the headroom left beside it.
    const poolRows = BACKGROUND_POOLS.filter((pool) => Number(m[pool.size]) > 0).flatMap((pool) => [
      { k: pool.label, s: "In use", v: m[pool.task] ?? 0 },
      { k: pool.label, s: "Limit", v: m[pool.size] ?? 0 },
    ]);

    return {
      pools: poolRows.length
        ? buildChartOption(
            "bar",
            "grouped_bar",
            poolRows,
            { category: "k", series: "s", value: "v" },
            "Background pools",
            { showLegend: true },
          )
        : null,
      queryActivity: bar(
        toCategoryRows(m, [
          ["All queries", "Query"],
          ["User queries", "QueryNonInternal"],
          ["Query threads", "QueryThread"],
          ["Preempted", "QueryPreempted"],
        ]),
        "Query activity",
      ),
      backgroundActivity: bar(
        toCategoryRows(m, [
          ["Merges", "Merge"],
          ["Merge parts", "MergeParts"],
          ["Mutations", "PartMutation"],
          ["Moves", "Move"],
          ["Repl fetch", "ReplicatedFetch"],
          ["Repl send", "ReplicatedSend"],
          ["Repl checks", "ReplicatedChecks"],
        ]),
        "Background activity",
      ),
      io: bar(
        toCategoryRows(m, [
          ["Read", "Read"],
          ["Write", "Write"],
          ["Remote read", "RemoteRead"],
          ["Open read", "OpenFileForRead"],
          ["Open write", "OpenFileForWrite"],
          ["Net receive", "NetworkReceive"],
          ["Net send", "NetworkSend"],
        ]),
        "I/O in flight",
      ),
      locks: bar(
        toCategoryRows(m, [
          ["Readers", "RWLockActiveReaders"],
          ["Writers", "RWLockActiveWriters"],
          ["Waiting readers", "RWLockWaitingReaders"],
          ["Waiting writers", "RWLockWaitingWriters"],
          ["Context lock", "ContextLockWait"],
        ]),
        "Locks",
      ),
      threads: bar(
        toCategoryRows(m, [
          ["Total", "GlobalThread"],
          ["Active", "GlobalThreadActive"],
          ["Scheduled", "GlobalThreadScheduled"],
        ]),
        "Threads",
      ),
      parts: bar(
        toCategoryRows(m, [
          ["Active", "PartsActive"],
          ["Outdated", "PartsOutdated"],
          ["Pre-active", "PartsPreActive"],
          ["Temporary", "PartsTemporary"],
          ["Deleting", "PartsDeleting"],
        ]),
        "Parts by state",
      ),
      partFormat:
        m.PartsWide === undefined
          ? null
          : buildChartOption(
              "pie",
              "donut",
              [
                { k: "Wide", v: m.PartsWide ?? 0 },
                { k: "Compact", v: m.PartsCompact ?? 0 },
              ],
              { category: "k", value: "v" },
              "Part format",
              { showLegend: true },
            ),
      objects: bar(
        toCategoryRows(m, [
          ["Databases", "AttachedDatabase"],
          ["Tables", "AttachedTable"],
          ["Views", "AttachedView"],
          ["Replicated", "AttachedReplicatedTable"],
          ["Dictionaries", "AttachedDictionary"],
        ]),
        "Attached objects",
      ),
      memory: bar(
        toCategoryRows(m, [
          ["Server", "MemoryTracking"],
          ["Merges", "MergesMutationsMemoryTracking"],
          ["Mapped files", "MMappedFileBytes"],
        ]),
        "Memory",
      ),
      caches: (() => {
        const rows = toCategoryRows(m, [
          ["Mark", "MarkCacheBytes"],
          ["Primary index", "PrimaryIndexCacheBytes"],
          ["Uncompressed", "UncompressedCacheBytes"],
          ["Query", "QueryCacheBytes"],
          ["Query condition", "QueryConditionCacheBytes"],
          ["Page", "PageCacheBytes"],
          ["Compiled expr", "CompiledExpressionCacheBytes"],
          ["Filesystem", "FilesystemCacheSize"],
          ["Vector index", "VectorSimilarityIndexCacheBytes"],
        ]).filter((r) => r.v > 0); // a zero cache is not worth a slice
        if (!rows.length) return null;
        return buildChartOption(
          "pie",
          "donut",
          rows,
          { category: "k", value: "v" },
          "Caches",
          { showLegend: true },
        );
      })(),
      // Conditional subsystems. Only rendered when in use
      tempFiles: (() => {
        const rows = toCategoryRows(m, [
          ["Sort", "TemporaryFilesForSort"],
          ["Aggregation", "TemporaryFilesForAggregation"],
          ["Join", "TemporaryFilesForJoin"],
          ["Merge", "TemporaryFilesForMerge"],
          ["Unknown", "TemporaryFilesUnknown"],
        ]);
        return rows.some((r) => r.v > 0) ? bar(rows, "Temporary files") : null;
      })(),
      distributed: (() => {
        const rows = toCategoryRows(m, [
          ["Sending", "DistributedSend"],
          ["Files queued", "DistributedFilesToInsert"],
          ["Files broken", "BrokenDistributedFilesToInsert"],
        ]);
        return rows.some((r) => r.v > 0) ? bar(rows, "Distributed inserts") : null;
      })(),
      asyncInserts: (() => {
        const rows = toCategoryRows(m, [
          ["Queue size", "AsynchronousInsertQueueSize"],
          ["Pending", "PendingAsyncInsert"],
        ]);
        return rows.some((r) => r.v > 0) ? bar(rows, "Async inserts") : null;
      })(),
      kafka: (() => {
        const rows = toCategoryRows(m, [
          ["Consumers", "KafkaConsumers"],
          ["Producers", "KafkaProducers"],
          ["Partitions", "KafkaAssignedPartitions"],
          ["Writes", "KafkaWrites"],
        ]);
        return rows.some((r) => r.v > 0) ? bar(rows, "Kafka") : null;
      })(),
      replication: (() => {
        const rows = [
          { k: "Queue size", v: a.ReplicasSumQueueSize ?? 0 },
          { k: "Inserts queued", v: a.ReplicasSumInsertsInQueue ?? 0 },
          { k: "Merges queued", v: a.ReplicasSumMergesInQueue ?? 0 },
        ];
        return rows.some((r) => r.v > 0) ? bar(rows, "Replication queue") : null;
      })(),
    };
  }, [m, a]);

  // kpis

  const kpis = useMemo(
    () => [
      { key: "part_churn", value: ratio(m.PartsOutdated, m.PartsActive) },
      {
        key: "wide_part_share",
        value: ratio(m.PartsWide, (m.PartsWide ?? 0) + (m.PartsCompact ?? 0)),
      },
      { key: "ddl_lag", value: difference(m.MaxPushedDDLEntryID, m.MaxDDLEntryID) },
      { key: "max_part_count", value: a.MaxPartCountForPartition ?? NO_VALUE },
      { key: "replica_delay", value: a.ReplicasMaxAbsoluteDelay ?? NO_VALUE },
      { key: "replica_queue", value: a.ReplicasSumQueueSize ?? NO_VALUE },
      { key: "load_average", value: a.LoadAverage1 ?? NO_VALUE },
    ],
    [m, a],
  );

  const healthChips = HEALTH_CHIPS.map((chip) => ({
    ...chip,
    value: Number(m[chip.key]) || 0,
    hint: descriptions[chip.key] ? `${chip.hint} Server says: ${descriptions[chip.key]}` : chip.hint,
  })).concat([
    // Both of these are only meaningful as rates, so they come from counters
    // rather than from a gauge. Rounded to two decimals so a trickle still
    // shows rather than rounding away to zero.
    {
      key: "errors_rate",
      label: "Errors/s",
      severity: "danger",
      hint: "The server is writing error-level log messages right now.",
      value: Math.round((ev.errors_rate || 0) * 100) / 100,
    },
    {
      key: "keeper_exceptions_rate",
      label: "Keeper exceptions/s",
      severity: "danger",
      hint: "Network-level exceptions talking to Keeper. Replication depends on this being zero.",
      value: Math.round((ev.keeper_exceptions_rate || 0) * 100) / 100,
    },
  ]);

  const failingChecks = healthChips.filter((c) => c.value > 0).length;
  const ageSeconds = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;

  return {
    live, setLive, interval, setIntervalSeconds,
    m, a, ev, hasPair, restarted, error, lastAt, loaded,
    gauges, charts, kpis, timeBreakdown, healthChips, failingChecks,
  };
}

// Node name, live toggle and refresh interval.

export function LiveControlBar({ nodeName, live: s }) {
  const { live, setLive, interval, setIntervalSeconds, lastAt, error, restarted } = s;
  const ageSeconds = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;

  return (
      <div
        className="card"
        style={{
          padding: "10px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.125rem", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon className="ti ti-heartbeat" />
          {nodeName || "Live overview"}
        </h2>

        <button
          type="button"
          className={`btn btn-sm ${live ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setLive((v) => !v)}
        >
          <Icon className={`ti ti-player-${live ? "pause" : "play"}`} />
          {live ? "Live" : "Paused"}
        </button>

        <Select
          value={interval}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          style={{ width: 120 }}
          title="Refresh interval"
        >
          {INTERVALS.map((s) => (
            <option key={s} value={s}>
              every {s}s
            </option>
          ))}
        </Select>

        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {ageSeconds === null ? "no reading yet" : `updated ${ageSeconds}s ago`}
        </span>

        {error && (
          <span style={{ fontSize: "0.75rem", color: "var(--color-danger)" }}>
            <Icon className="ti ti-alert-circle" /> {error}
          </span>
        )}

        {restarted && (
          <span style={{ fontSize: "0.75rem", color: "var(--color-warning)" }}>
            <Icon className="ti ti-alert-triangle" /> Server restarted, rates resuming
          </span>
        )}

        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginLeft: "auto" }}>
          Readings are current; rates cover the last {interval}s
        </span>
      </div>
  );
}

// The machine gauges, on their own so the page can put them directly under the
// stat cards.
 
export function MachineGauges({ live: s }) {
  const { loaded, gauges } = s;
  if (!loaded) return null;
  return (
    <Section id="machine" icon="ti-cpu" title="Machine and server">
      <GaugeGroup items={gauges.machine} />
    </Section>
  );
}

// The rest of the live charts. Controls and machine gauges sit above. 
export default function LiveOverview({ live: s }) {
  const {
    interval, loaded, ev, gauges, charts, kpis, timeBreakdown, healthChips, failingChecks, hasPair,
  } = s;

  return (
    <div style={{ marginBottom: 20 }}>
      {!loaded ? (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <span className="loading-spinner" /> Reading system tables...
        </div>
      ) : (
        <>
          <Section
            id="health"
            icon="ti-shield-check"
            title="Health checks"
            defaultOpen={false}
            summary={
              failingChecks > 0
                ? `${failingChecks} failing`
                : `all ${healthChips.length} clear`
            }
          >
            <HealthStrip chips={healthChips} />
          </Section>

          {/* Every percentage on the page, in one place. Comparing them side by
              side is the point: a saturated pool stands out because everything
              around it does not. */}
          <Section
            id="efficiency-gauges"
            icon="ti-chart-arrows"
            title="Efficiency"
            summary={`over the last ${interval}s`}
           defaultOpen={false}>
            <GaugeGroup items={gauges.efficiency} />
          </Section>

          <Section id="pools" icon="ti-stack-2" title="Background pools" summary="in use against limit" defaultOpen={false}>
            <ChartCard
              metricKey="pool_utilization"
              title="Background pools, in use against limit"
              option={charts.pools}
              type="bar"
              format="count"
              height={260}
              emptyMessage="No background pools reported"
            />
          </Section>

          <Section id="throughput" icon="ti-bolt" title="Throughput" summary={`last ${interval}s`} defaultOpen={false}>
          <KpiStrip
            items={[
              { key: "query_rate", value: ev.query_rate },
              { key: "avg_query_latency", value: ev.avg_query_latency },
              { key: "rows_read_rate", value: ev.rows_read_rate },
              { key: "rows_written_rate", value: ev.rows_written_rate },
              { key: "disk_read_rate", value: ev.disk_read_rate },
              { key: "disk_write_rate", value: ev.disk_write_rate },
              { key: "net_in_rate", value: ev.net_in_rate },
              { key: "net_out_rate", value: ev.net_out_rate },
              { key: "ch_cpu_cores", value: ev.ch_cpu_cores },
              { key: "merge_concurrency", value: ev.merge_concurrency },
              { key: "merge_throughput", value: ev.merge_throughput },
              { key: "bytes_per_row", value: ev.bytes_per_row },
            ]}
          />
          </Section>

          <Section id="shape" icon="ti-chart-bar" title="Efficiency and shape" summary={`last ${interval}s`} defaultOpen={false}>
          <KpiStrip
            items={[
              { key: "read_amplification", value: ev.read_amplification },
              { key: "write_amplification", value: ev.write_amplification },
              { key: "rows_per_part", value: ev.rows_per_part },
              { key: "parts_per_merge", value: ev.parts_per_merge },
              { key: "read_compression", value: ev.read_compression },
              { key: "insert_compression", value: ev.insert_compression },
            ]}
          />
          </Section>

          <Section id="time" icon="ti-clock" title="Where the time goes" summary={`last ${interval}s`} defaultOpen={false}>
          <ChartCard
            metricKey="time_breakdown"
            option={timeBreakdown}
            type="bar"
            format="threads"
            height={300}
            emptyMessage={hasPair ? "Nothing measurable in the last interval" : "Waiting for a second reading"}
          />
          </Section>

          <Section id="activity" icon="ti-activity-heartbeat" title="Activity right now" defaultOpen={false}>
          <Grid>
            <ChartCard metricKey="query_activity" option={charts.queryActivity} type="bar" format="count" />
            <ChartCard metricKey="background_activity" option={charts.backgroundActivity} type="bar" format="count" />
            <ChartCard metricKey="io_in_flight" option={charts.io} type="bar" format="count" />
            <ChartCard metricKey="locks" option={charts.locks} type="bar" format="count" />
            <ChartCard title="Threads" option={charts.threads} type="bar" format="count" />
            <ChartCard metricKey="memory_breakdown" option={charts.memory} type="bar" format="bytes" />
          </Grid>
          </Section>

          <Section id="storage" icon="ti-database" title="Storage" defaultOpen={false}>
          <Grid>
            <ChartCard metricKey="parts_by_state" option={charts.parts} type="bar" format="count" />
            <ChartCard title="Part format" option={charts.partFormat} type="pie" format="count" />
            <ChartCard metricKey="caches" option={{
                      ...charts.caches,
                      series: [
                        {
                          ...charts.caches.series[0],
                          label: {
                            position: "outside",
                            formatter: "{b}\n{d}%",
                            show: true
                          },
                          labelLayout: {
                            hideOverlap: false, 
                            moveOverlap: "shiftY"
                          }
                        }
                      ]
                    }}
                    type="pie" format="bytes" emptyMessage="All caches are empty"  />
            <ChartCard metricKey="attached_objects" option={charts.objects} type="bar" format="count" />
          </Grid>
          </Section>

          <Section id="data-health" icon="ti-list-check" title="Data health" defaultOpen={false}>
            <KpiStrip items={kpis} />
          </Section>

          {(charts.tempFiles ||
            charts.distributed ||
            charts.asyncInserts ||
            charts.kafka ||
            charts.replication) && (
            <Section id="in-use" icon="ti-plug" title="In use on this node" defaultOpen={false}>
              <Grid>
                {charts.replication && (
                  <ChartCard title="Replication queue" option={charts.replication} type="bar" format="count" />
                )}
                {charts.tempFiles && (
                  <ChartCard title="Temporary files" option={charts.tempFiles} type="bar" format="count" />
                )}
                {charts.distributed && (
                  <ChartCard title="Distributed inserts" option={charts.distributed} type="bar" format="count" />
                )}
                {charts.asyncInserts && (
                  <ChartCard title="Async inserts" option={charts.asyncInserts} type="bar" format="count" />
                )}
                {charts.kafka && (
                  <ChartCard title="Kafka" option={charts.kafka} type="bar" format="count" />
                )}
              </Grid>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Grid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}
