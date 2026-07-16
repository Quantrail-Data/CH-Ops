// QueryMetrics - Per-second resource usage timeline for ClickHouse queries
//
// Visualizes system.query_metric_log data as a time-series dashboard.
// Groups metrics by category (Memory, CPU, Disk IO, Cache, Network, etc.)
// and displays them as individual charts with automatic unit detection.
// Only non-zero metrics are shown. Supports query selection via list
// with search, and a popup dialog for viewing full query text.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import Icon from "../common/Icon.jsx";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { runQuery } from "../../utils/api.js";
import ChartCard from "../layout/ChartCard.jsx";
import { baseChartOption } from "../../utils/echarts.js";
import { useToast } from "../layout/Toast.jsx";
import { useSearchParams } from "react-router-dom";

// HELPERS

function toLocalDatetime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toChDatetime(val) {
  return val.replace("T", " ") + ":00";
}

function validateRange(from, to) {
  if (!from || !to) return "Select both From and To datetimes.";
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (isNaN(fromMs) || isNaN(toMs)) return "Invalid date format.";
  if (fromMs >= toMs) return "From must be before To.";
  if (toMs - fromMs > 24 * 60 * 60 * 1000)
    return "Maximum interval is 24 hours. Narrow your range.";
  return null;
}

// METRIC GROUP DEFINITIONS

const METRIC_GROUPS = [
  {
    key: "zookeeper",
    label: "ZooKeeper / Keeper",
    icon: "ti-hierarchy-2",
    match: (col) => col.includes("ZooKeeper") || col.includes("Keeper"),
  },

  {
    key: "external_ops",
    label: "External Operations (Spill to Disk)",
    icon: "ti-transfer-out",
    match: (col) => col.includes("External"),
  },

  {
    key: "join",
    label: "JOIN Operations",
    icon: "ti-arrows-join-2",
    match: (col) => col.includes("Join"),
  },

  {
    key: "s3_remote",
    label: "S3 / Azure / Remote Storage",
    icon: "ti-cloud",
    match: (col) =>
      col.includes("S3") ||
      col.includes("Azure") ||
      col.includes("RemoteFS") ||
      col.includes("RemoteRead") ||
      col.includes("RemoteWrite") ||
      col.includes("ReadBufferFromS3") ||
      col.includes("WriteBufferFromS3") ||
      col.includes("ReadBufferFromAzure") ||
      (col.includes("Disk") &&
        (col.includes("S3") || col.includes("Azure") || col.includes("Plain"))),
  },

  {
    key: "filesystem_cache",
    label: "Filesystem Cache",
    icon: "ti-database",
    match: (col) =>
      col.includes("CachedReadBuffer") ||
      col.includes("CachedWriteBuffer") ||
      col.includes("FilesystemCache") ||
      col.includes("FileSegment"),
  },

  {
    key: "page_mark_cache",
    label: "In-Memory Caches",
    icon: "ti-stack-2",
    match: (col) =>
      col.includes("PageCache") ||
      col.includes("MarkCache") ||
      col.includes("PrimaryIndexCache") ||
      col.includes("UncompressedCache") ||
      col.includes("QueryCache") ||
      col.includes("QueryConditionCache") ||
      col.includes("OpenedFileCache") ||
      col.includes("MMappedFileCache") ||
      col.includes("RegexpLocalCache") ||
      col.includes("RegexpWithMultipleNeedles") ||
      col.includes("SchemaInferenceCache") ||
      col.includes("DictCache") ||
      col.includes("VectorSimilarityIndexCache") ||
      col.includes("TextIndex") ||
      col.includes("ParquetMetadataCache") ||
      col.includes("IcebergMetadataFilesCache"),
  },

  {
    key: "memory",
    label: "Memory",
    icon: "ti-brain",
    match: (col) =>
      col === "memory_usage" ||
      col === "peak_memory_usage" ||
      col.includes("Memory") ||
      col.includes("Allocat") ||
      col.includes("Malloc") ||
      col.includes("Mmap") ||
      col.includes("Munmap") ||
      col.includes("jemalloc") ||
      col.includes("Arena"),
  },

  {
    key: "cpu_time",
    label: "CPU & Time",
    icon: "ti-cpu",
    match: (col) =>
      col.includes("RealTime") ||
      col.includes("UserTime") ||
      col.includes("SystemTime") ||
      col.includes("OSCPU") ||
      col.includes("OSIOWait") ||
      col.includes("Perf") ||
      col.includes("SoftPageFault") ||
      col.includes("HardPageFault"),
  },

  {
    key: "threading",
    label: "Threading & Locks",
    icon: "ti-topology-ring-3",
    match: (col) =>
      col.includes("ThreadPool") ||
      col.includes("ContextSwitch") ||
      col.includes("ContextLock") ||
      col.includes("ConcurrencyControl") ||
      col.includes("RWLock") ||
      col.includes("PartsLock"),
  },

  {
    key: "network",
    label: "Network & Connections",
    icon: "ti-world",
    match: (col) =>
      col.includes("Network") ||
      col.includes("Interface") ||
      col.includes("DNS") ||
      col.includes("DistributedConnection") ||
      col.includes("Shards") ||
      col.includes("ParallelReplicas") ||
      col.includes("HTTPConnection") ||
      col.includes("StorageConnection") ||
      col.includes("DiskConnection"),
  },

  {
    key: "io_disk",
    label: "Disk IO",
    icon: "ti-device-floppy",
    match: (col) =>
      col.includes("OSRead") ||
      col.includes("OSWrite") ||
      col.includes("DiskRead") ||
      col.includes("DiskWrite") ||
      col.includes("AIO") ||
      col.includes("CreatedReadBuffer") ||
      col.includes("IOBuffer") ||
      col.includes("IOUring") ||
      col.includes("SchedulerIO"),
  },

  {
    key: "selected_read",
    label: "Data Read (Selected)",
    icon: "ti-arrow-bar-down",
    match: (col) => col.includes("Selected") || col.includes("RowsRead"),
  },

  {
    key: "inserted_write",
    label: "Data Write (Inserted)",
    icon: "ti-arrow-bar-up",
    match: (col) =>
      col.includes("Inserted") ||
      (col.includes("Delayed") && col.includes("Insert")) ||
      (col.includes("Rejected") && col.includes("Insert")) ||
      col.includes("Duplicated") ||
      col.includes("MergeTreeDataWriter"),
  },

  {
    key: "merges_mutations",
    label: "Merges & Mutations",
    icon: "ti-arrows-join",
    match: (col) =>
      col.includes("Merge") ||
      col.includes("Mutate") ||
      col.includes("Mutation") ||
      col.includes("Gathering") ||
      col.includes("Replicated") ||
      col.includes("Quorum") ||
      col.includes("DataAfterMerge"),
  },

  {
    key: "marks_indexes",
    label: "Marks & Index Loading",
    icon: "ti-list-search",
    match: (col) =>
      (col.includes("Loaded") &&
        (col.includes("Mark") || col.includes("PrimaryIndex"))) ||
      col.includes("WaitMarksLoad") ||
      (col.includes("Filtering") &&
        (col.includes("PrimaryKey") || col.includes("SecondaryKey"))),
  },

  {
    key: "query_execution",
    label: "Query Execution",
    icon: "ti-terminal-2",
    match: (col) =>
      col.includes("Compile") ||
      col.includes("FunctionExecute") ||
      col.includes("QueryProfiler") ||
      col.includes("Overflow") ||
      col.includes("SlowRead") ||
      col.includes("ReadBackoff") ||
      (col.includes("Filter") && col.includes("Transform")),
  },

  {
    key: "kafka",
    label: "Kafka",
    icon: "ti-brand-docker",
    match: (col) => col.includes("Kafka"),
  },

  {
    key: "backup",
    label: "Backup",
    icon: "ti-archive",
    match: (col) => col.includes("Backup"),
  },

  {
    key: "logging",
    label: "Logging",
    icon: "ti-file-text",
    match: (col) =>
      (col.includes("Log") && !col.includes("Loaded")) ||
      col.includes("AsyncLogging"),
  },

  {
    key: "throttling",
    label: "Throttling",
    icon: "ti-traffic-lights",
    match: (col) => col.includes("Throttler"),
  },
];

const METRIC_GROUP_MAP = new Map(METRIC_GROUPS.map((g) => [g.key, g]));

const GROUP_DISPLAY_ORDER = [
  "memory",
  "cpu_time",
  "io_disk",
  "selected_read",
  "page_mark_cache",
  "marks_indexes",
  "query_execution",
  "threading",
  "inserted_write",
  "merges_mutations",
  "filesystem_cache",
  "network",
  "s3_remote",
  "external_ops",
  "join",
  "zookeeper",
  "kafka",
  "backup",
  "logging",
  "throttling",
  "other",
];

const UNIT_DISPLAY_ORDER = ["μs", "ms", "ns", "bytes", "rows", "count"];

function classifyColumn(colName) {
  const name = colName.replace("ProfileEvent_", "");
  for (const group of METRIC_GROUPS) {
    if (group.match(name)) return group.key;
  }

  for (const group of METRIC_GROUPS) {
    if (group.match(colName)) return group.key;
  }
  return "other";
}

// UNIT DETECTION

const UNIT_SUFFIXES = [
  ["Microseconds", "μs"],
  ["Milliseconds", "ms"],
  ["Nanoseconds", "ns"],
  ["BytesSent", "bytes"],
  ["BytesReceived", "bytes"],
  ["Bytes", "bytes"],
  ["Chars", "bytes"],
  ["Rows", "rows"],
];

const UNIT_LABELS = {
  μs: "Time (μs)",
  ms: "Time (ms)",
  ns: "Time (ns)",
  bytes: "Bytes",
  rows: "Rows",
  count: "Count",
};

function detectUnit(colName) {
  if (colName === "memory_usage" || colName === "peak_memory_usage")
    return "bytes";

  const name = colName.replace("ProfileEvent_", "");
  for (const [suffix, unit] of UNIT_SUFFIXES) {
    if (name.endsWith(suffix)) return unit;
  }
  return "count";
}

// SQL BUILDERS

function buildQueryListSql(from, to) {
  const chFrom = toChDatetime(from);
  const chTo = toChDatetime(to);

  return `
SELECT
  t.query_id,
  min(t.event_time) AS first_seen,
  count() AS sample_count,
  substring(coalesce(q.query, ''), 1, 300) AS query_preview,
  q.query_duration_ms
FROM system.query_metric_log AS t
LEFT JOIN (
  SELECT query_id, query, query_duration_ms
  FROM system.query_log
  WHERE type = 'QueryFinish'
    AND event_date >= toDate('${chFrom}') - 1
  ORDER BY event_time DESC
  LIMIT 1 BY query_id
) AS q USING (query_id)
WHERE t.query_id != ''
  AND t.event_time >= '${chFrom}'
  AND t.event_time <= '${chTo}'
GROUP BY t.query_id, q.query, q.query_duration_ms
ORDER BY first_seen DESC
LIMIT 500`.trim();
}

// Phase 1: Discover non-zero columns for this query_id.

function buildDiscoverySql(queryId) {
  const safeId = queryId.replace(/'/g, "\\'");
  return `SELECT * FROM system.query_metric_log WHERE query_id = '${safeId}' ORDER BY event_time_microseconds`;
}

const SKIP_COLUMNS = new Set([
  "query_id",
  "hostname",
  "event_date",
  "event_time",
  "event_time_microseconds",
]);

// Extract non-zero column names from ALL discovery rows.

function discoverActiveColumns(rows) {
  if (!rows || rows.length === 0) return [];

  const totals = {};

  const firstRow = rows.find((r) => r != null);
  if (!firstRow) return [];
  const allKeys = Object.keys(firstRow);

  for (const row of rows) {
    if (row == null) continue;
    for (const k of allKeys) {
      if (SKIP_COLUMNS.has(k)) continue;
      const v = parseFloat(row[k]);
      if (!isNaN(v) && v !== 0) {
        totals[k] = (totals[k] || 0) + Math.abs(v);
      }
    }
  }

  return Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
}

// Phase 2 (fallback): Fetch specific columns only.

const MAX_ACTIVE_COLUMNS = 100;
const MAX_SERIES_PER_CHART = 4;

function buildMetricsSql(queryId, columns) {
  const safeId = queryId.replace(/'/g, "\\'");
  const safeCols = columns
    .slice(0, MAX_ACTIVE_COLUMNS)
    .map((c) => "`" + c.replace(/`/g, "``") + "`")
    .join(", ");
  return `
SELECT
  event_time_microseconds,
  ${safeCols}
FROM system.query_metric_log
WHERE query_id = '${safeId}'
ORDER BY event_time_microseconds`.trim();
}

// Fetch full query text
function buildFullQuerySql(queryId) {
  const safeId = queryId.replace(/'/g, "\\'");
  return `SELECT query FROM system.query_log WHERE query_id = '${safeId}' AND type = 'QueryFinish' ORDER BY event_time DESC LIMIT 1`;
}

// CHART BUILDER

function buildGroupChart(label, unit, columns, rows) {
  if (!rows?.length || !columns?.length) return null;

  const yAxisLabel = `${label} (${UNIT_LABELS[unit] || unit})`;

  const parsedTs = rows.map((r) => {
    if (r == null) return 0;
    const ts = r.event_time_microseconds;
    if (ts == null) return 0;
    const t = new Date(String(ts).replace(" ", "T")).getTime();
    return isNaN(t) ? 0 : t;
  });

  const series = columns.map((col) => ({
    name: col.replace("ProfileEvent_", ""),
    type: "line",
    smooth: true,
    symbol: "none",
    data: rows
      .map((r, i) => {
        const t = parsedTs[i];
        if (t === 0) return null;
        const v = parseFloat(r?.[col]);
        return [t, isNaN(v) ? 0 : v];
      })
      .filter((d) => d !== null),
    emphasis: { focus: "series" },
  }));

  if (series.every((s) => s.data.length === 0)) return null;

  return {
    ...baseChartOption(),
    grid: { top: 20, right: 16, bottom: 60, left: 50 },
    xAxis: { type: "time", position: "bottom" },
    yAxis: { type: "value", name: yAxisLabel, nameTextStyle: { fontSize: 10 } },
    legend: {
      show: true,
      bottom: 0,
      left: "center",
      type: "scroll",
      textStyle: { fontSize: 10 },
    },
    tooltip: { trigger: "axis", confine: true },
    toolbox: {
      ...baseChartOption().toolbox,
      top: -16,
      itemSize: 10,
      feature: {
        ...baseChartOption().toolbox.feature,
        dataZoom: {
          show: false,
        },
      },
    },
    series,
  };
}

// QUERY DETAIL POPUP (reused from QueryProfiler)

function QueryDetailPopup({ query, fullText, loading, onSelect, onClose }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const toast = useToast();

  if (!query) return null;
  const dur =
    query.query_duration_ms != null ? `${query.query_duration_ms}ms` : "N/A";

  return (
    <div className="profiler-popup-overlay" onClick={onClose}>
      <div className="profiler-popup" onClick={(e) => e.stopPropagation()}>
        <div className="profiler-popup-header">
          <span style={{ fontWeight: 600 }}>Query Details</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icon className="ti ti-x"></Icon>
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label
            className="form-label"
            style={{ fontSize: "12px", marginBottom: 4 }}
          >
            Query ID
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code
              style={{
                flex: 1,
                fontSize: "13px",
                fontFamily: "var(--font-code)",
                color: "var(--accent)",
                wordBreak: "break-all",
              }}
            >
              {query.query_id}
            </code>
            <button
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                try {
                  navigator.clipboard.writeText(query.query_id);
                  toast.success("Query ID Copied Succesfully");
                  e.target.closest("button").title = "Copied!";
                  setTimeout(() => {
                    e.target.closest("button") &&
                      (e.target.closest("button").title = "Copy Query ID");
                  }, 1500);
                } catch {
                  e.target.closest("button").title = "Copy failed";
                }
              }}
              title="Copy Query ID"
            >
              <Icon className="ti ti-copy"></Icon>
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            marginBottom: 14,
            fontSize: "12px",
            color: "var(--text-muted)",
          }}
        >
          <span>
            <strong>Timestamp:</strong> {query.first_seen}
          </span>
          <span>
            <strong>Duration:</strong> {dur}
          </span>
          <span>
            <strong>Samples:</strong> {query.sample_count}
          </span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label
            className="form-label"
            style={{ fontSize: "12px", marginBottom: 4 }}
          >
            Query Text
          </label>
          {loading ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              <span
                className="loading-spinner"
                style={{ marginRight: 6 }}
              ></span>{" "}
              Loading...
            </div>
          ) : (
            <pre className="profiler-popup-code">
              {fullText || query.query_preview || "(query text not available)"}
            </pre>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            className="btn btn-secondary btn-sm"
            onClick={(e) => {
              try {
                navigator.clipboard.writeText(
                  fullText || query.query_preview || "",
                );
                toast.success("Query Text Copied Succesfully");
                e.target.closest("button").textContent = "✓ Copied";
                setTimeout(() => {
                  if (e.target.closest("button"))
                    e.target.closest("button").innerHTML =
                      '<svg class="ti ti-copy chops-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px" aria-hidden="true"><use href="#tabler-copy"></use></svg> Copy Query';
                }, 1500);
              } catch {
                e.target.closest("button").textContent = "Copy failed";
              }
            }}
          >
            <Icon className="ti ti-copy" style={{ marginRight: 4 }}></Icon> Copy Query
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onSelect(query.query_id);
              onClose();
            }}
          >
            <Icon className="ti ti-check" style={{ marginRight: 4 }}></Icon> Use This
            Query
          </button>
        </div>
      </div>
    </div>
  );
}

// MAIN COMPONENT

export default function QueryMetrics() {
  const [fromDt, setFromDt] = useState(() =>
    toLocalDatetime(Date.now() - 3600000),
  );
  const [toDt, setToDt] = useState(() => toLocalDatetime(Date.now()));
  const [rangeError, setRangeError] = useState("");

  const [queries, setQueries] = useState([]);
  const [queriesLoading, setQueriesLoading] = useState(false);
  const [queriesError, setQueriesError] = useState("");
  const [selectedQueryId, setSelectedQueryId] = useState("");
  const [searchText, setSearchText] = useState("");

  const [popupQuery, setPopupQuery] = useState(null);
  const [popupQueryText, setPopupQueryText] = useState("");
  const [popupTextLoading, setPopupTextLoading] = useState(false);

  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [metricsProgress, setMetricsProgress] = useState("");
  const [groupedCharts, setGroupedCharts] = useState([]);

  const fetchIdRef = useRef(0);
  const mountedRef = useRef(true);

  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const [chartLayoutKey, setChartLayoutKey] = useState(0);

  const [searchParams] = useSearchParams();
  const qidFromUrl = searchParams.get("qid");

  const themedCharts = useMemo(() => {
    if (!groupedCharts.length) return groupedCharts;
    return groupedCharts.map((g) => {
      try {
        return {
          ...g,
          option: buildGroupChart(
            g.label,
            g.unit || "count",
            g.columns,
            g._rows,
          ),
        };
      } catch (err) {
        console.warn(`Theme rebuild failed for "${g.label}":`, err.message);
        return g;
      }
    });
  }, [groupedCharts, themeKey]);

  useEffect(() => {
    if (qidFromUrl) {
      setSelectedQueryId(qidFromUrl);
      // loadData(qidFromUrl);
    }
  }, [qidFromUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!themedCharts?.length) return;
    const id = requestAnimationFrame(() => {
      setChartLayoutKey((k) => k + 1);
    });
    return () => cancelAnimationFrame(id);
  }, [themedCharts?.length, themeKey]);

  const fetchQueries = useCallback(async () => {
    const err = validateRange(fromDt, toDt);
    if (err) {
      setRangeError(err);
      return;
    }
    setRangeError("");

    const thisId = ++fetchIdRef.current;
    setQueriesLoading(true);
    setQueriesError("");
    setQueries([]);
    setSelectedQueryId("");
    setPopupQuery(null);
    setSearchText("");

    try {
      const result = await runQuery(buildQueryListSql(fromDt, toDt));
      if (fetchIdRef.current !== thisId || !mountedRef.current) return;
      const rows = result.rows || [];
      if (rows.length >= 500) {
        setQueriesError(
          "More than 500 queries with metric data. Showing the latest 500. Narrow the range or search.",
        );
      } else if (rows.length > 200) {
        setQueriesError(
          `${rows.length} queries found. Consider narrowing the range.`,
        );
      }
      setQueries(rows);
    } catch (e) {
      if (fetchIdRef.current !== thisId || !mountedRef.current) return;
      setQueriesError(
        e.message ||
          "Failed to load queries. The query_metric_log table may not be enabled on this ClickHouse node.",
      );
    }
    if (fetchIdRef.current === thisId && mountedRef.current)
      setQueriesLoading(false);
  }, [fromDt, toDt]);

  const popupFetchRef = useRef(0);
  const handleQueryClick = useCallback(async (query) => {
    const pid = ++popupFetchRef.current;
    setPopupQuery(query);
    setPopupQueryText(query.query_preview || "");
    setPopupTextLoading(true);
    try {
      const result = await runQuery(buildFullQuerySql(query.query_id));
      if (
        popupFetchRef.current === pid &&
        mountedRef.current &&
        result.rows?.[0]?.query
      ) {
        setPopupQueryText(result.rows[0].query);
      }
    } catch (err) {
      if (popupFetchRef.current === pid && mountedRef.current) {
        setPopupQueryText(
          query.query_preview
            ? `${query.query_preview}\n\n--- Full text could not be loaded: ${err.message || "Unknown error"} ---`
            : `(Full query text unavailable: ${err.message || "Unknown error"})`,
        );
      }
    }
    if (popupFetchRef.current === pid && mountedRef.current)
      setPopupTextLoading(false);
  }, []);

  const filteredQueries = useMemo(
    () =>
      queries.filter((q) => {
        if (!searchText.trim()) return true;
        const s = searchText.toLowerCase();
        return (
          q.query_id.toLowerCase().includes(s) ||
          (q.query_preview || "").toLowerCase().includes(s)
        );
      }),
    [queries, searchText],
  );

  const handleShowMetrics = useCallback(async () => {
    if (!selectedQueryId) {
      setMetricsError("Select a query from the list first.");
      return;
    }

    const thisId = ++fetchIdRef.current;
    setMetricsLoading(true);
    setMetricsError("");
    setMetricsProgress("Discovering active metrics...");
    setGroupedCharts([]);

    try {
      let activeColumns;
      let discoveryRows;
      try {
        const discoveryResult = await runQuery(
          buildDiscoverySql(selectedQueryId),
        );
        if (fetchIdRef.current !== thisId || !mountedRef.current) return;

        discoveryRows = discoveryResult.rows || [];
        if (discoveryRows.length === 0) {
          setMetricsError(
            "No metric data found for this query. The query may have been too short (under 1 second) or query_metric_log may not be enabled.",
          );
          setMetricsProgress("");
          setMetricsLoading(false);
          return;
        }
        activeColumns = discoverActiveColumns(discoveryRows);
      } catch (discoveryErr) {
        if (fetchIdRef.current !== thisId || !mountedRef.current) return;
        setMetricsError(`Failed to discover metrics: ${discoveryErr.message}`);
        setMetricsProgress("");
        setMetricsLoading(false);
        return;
      }

      if (fetchIdRef.current !== thisId || !mountedRef.current) return;

      if (activeColumns.length === 0) {
        setMetricsError(
          "All metrics are zero for this query. The query may have been too simple.",
        );
        setMetricsProgress("");
        setMetricsLoading(false);
        return;
      }

      if (activeColumns.length > MAX_ACTIVE_COLUMNS) {
        activeColumns = activeColumns.slice(0, MAX_ACTIVE_COLUMNS);
      }

      setMetricsProgress(`Processing ${activeColumns.length} metrics...`);

      const neededCols = new Set(["event_time_microseconds", ...activeColumns]);
      const rows = discoveryRows.map((r) => {
        const stripped = {};
        for (const k of neededCols) {
          if (k in r) stripped[k] = r[k];
        }
        return stripped;
      });

      setMetricsProgress("Building charts...");

      const grouped = {};
      for (const col of activeColumns) {
        const category = classifyColumn(col);
        const unit = detectUnit(col);
        const chartKey = `${category}__${unit}`;
        if (!grouped[chartKey])
          grouped[chartKey] = { category, unit, columns: [] };
        grouped[chartKey].columns.push(col);
      }

      const charts = [];

      for (const gk of GROUP_DISPLAY_ORDER) {
        const chartKeys = Object.keys(grouped)
          .filter((k) => grouped[k].category === gk)
          .sort((a, b) => {
            const ua = UNIT_DISPLAY_ORDER.indexOf(grouped[a].unit);
            const ub = UNIT_DISPLAY_ORDER.indexOf(grouped[b].unit);
            return (ua === -1 ? 99 : ua) - (ub === -1 ? 99 : ub);
          });

        if (chartKeys.length === 0) continue;

        const groupDef = METRIC_GROUP_MAP.get(gk) || {
          key: "other",
          label: "Other Metrics",
          icon: "ti-chart-dots",
        };

        for (const ck of chartKeys) {
          const { unit, columns: cols } = grouped[ck];

          const hasMultipleUnits = chartKeys.length > 1;
          const baseLabel = hasMultipleUnits
            ? `${groupDef.label} - ${UNIT_LABELS[unit] || unit}`
            : groupDef.label;

          const chunks = [];
          for (let i = 0; i < cols.length; i += MAX_SERIES_PER_CHART) {
            chunks.push(cols.slice(i, i + MAX_SERIES_PER_CHART));
          }

          chunks.forEach((chunkCols, chunkIdx) => {
            const chartLabel =
              chunks.length > 1
                ? `${baseLabel} (${chunkIdx + 1}/${chunks.length})`
                : baseLabel;
            const chartKey =
              chunks.length > 1 ? `${ck}__${chunkIdx}` : ck;

            try {
              const option = buildGroupChart(chartLabel, unit, chunkCols, rows);
              if (option) {
                charts.push({
                  key: chartKey,
                  label: chartLabel,
                  icon: groupDef.icon,
                  columns: chunkCols,
                  unit,
                  option,
                  _rows: rows,
                });
              }
            } catch (chartErr) {
              console.warn(
                `Failed to build chart "${chartLabel}":`,
                chartErr.message,
              );
            }
          });
        }
      }

      if (fetchIdRef.current !== thisId || !mountedRef.current) return;

      setGroupedCharts(charts);
      setMetricsProgress("");
      setChartLayoutKey((k) => k + 1);
      setMetricsLoading(false);
    } catch (err) {
      if (fetchIdRef.current !== thisId || !mountedRef.current) return;
      setMetricsError(err.message || "Failed to fetch query metrics");
      setMetricsProgress("");
      setMetricsLoading(false);
    }
  }, [selectedQueryId]);

  const handleAutoAdjustTODate = (e) => {
    const from = e.target.value;

    const to = new Date(from);
    to.setHours(to.getHours() + 24);

    setFromDt(from);

    const local = new Date(to.getTime() - to.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setToDt(local);
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <Icon
            className="ti ti-chart-line"
            style={{ color: "var(--accent)" }}
          ></Icon>{" "}
          Query Metrics
        </h2>
      </div>

      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 16,
          fontSize: "13px",
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}
      >
        <Icon className="ti ti-info-circle" style={{ marginRight: 6 }}></Icon>
        Drill into per-second metric snapshots from{" "}
        <code>system.query_metric_log</code> for any query. Select a time range,
        pick a query, and click Show Query Metrics to see how memory, CPU, IO,
        cache, and other resources were consumed over the query's lifetime. Only
        metrics with non-zero values are shown, grouped by category.
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "end",
            marginBottom: 14,
          }}
        >
          <div className="form-group" style={{ minWidth: 200 }}>
            <label className="form-label">From</label>
            <input
              className="form-input"
              type="datetime-local"
              value={fromDt}
              onChange={(e) => handleAutoAdjustTODate(e)}
            />
          </div>
          <div className="form-group" style={{ minWidth: 200 }}>
            <label className="form-label">To</label>
            <input
              className="form-input"
              type="datetime-local"
              value={toDt}
              onChange={(e) => setToDt(e.target.value)}
            />
          </div>
          <div className="form-group">
            <button
              className="btn btn-secondary"
              onClick={fetchQueries}
              disabled={queriesLoading}
              style={{ height: 40 }}
            >
              {queriesLoading ? (
                <>
                  <span
                    className="loading-spinner"
                    style={{ marginRight: 6 }}
                  ></span>{" "}
                  Loading...
                </>
              ) : (
                <>
                  <Icon className="ti ti-search" style={{ marginRight: 4 }}></Icon>{" "}
                  Load Queries
                </>
              )}
            </button>
          </div>
        </div>

        {rangeError && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--color-danger, #ef4444)",
              marginBottom: 10,
            }}
          >
            <Icon className="ti ti-alert-circle" style={{ marginRight: 4 }}></Icon>{" "}
            {rangeError}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="form-label">
            Query ID
            {queriesLoading && (
              <span
                className="loading-spinner"
                style={{ marginLeft: 8, width: 12, height: 12 }}
              ></span>
            )}
            {!queriesLoading && queries.length > 0 && (
              <span
                style={{
                  color: "var(--text-muted)",
                  fontWeight: 400,
                  marginLeft: 8,
                }}
              >
                ({queries.length} queries with metric data)
              </span>
            )}
          </label>

          <input
            className="form-input"
            placeholder="Search by query text or query_id..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              marginBottom: 8,
              fontFamily: "var(--font-code)",
              fontSize: "13px",
              width: "100%",
              maxWidth: 480,
            }}
          />

          {queriesError && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-warning, #f59e0b)",
                marginBottom: 8,
              }}
            >
              <Icon
                className="ti ti-alert-triangle"
                style={{ marginRight: 4 }}
              ></Icon>{" "}
              {queriesError}
            </div>
          )}

          {!queriesLoading && filteredQueries.length > 0 && (
            <div className="profiler-query-list">
              {filteredQueries.map((q) => {
                const isSelected = selectedQueryId === q.query_id;
                const preview = q.query_preview
                  ? q.query_preview.substring(0, 100) +
                    (q.query_preview.length > 100 ? "..." : "")
                  : "(no query text)";
                const dur =
                  q.query_duration_ms != null ? `${q.query_duration_ms}ms` : "";
                return (
                  <div
                    key={q.query_id}
                    className={`profiler-query-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleQueryClick(q)}
                  >
                    <div className="profiler-query-item-header">
                      <code className="profiler-query-id">{q.query_id}</code>
                      <span className="profiler-query-meta">
                        {dur && <span>{dur}</span>}
                        <span>{q.sample_count} samples</span>
                        <span>{q.first_seen}</span>
                      </span>
                    </div>
                    <div className="profiler-query-preview">{preview}</div>
                  </div>
                );
              })}
            </div>
          )}

          {!queriesLoading &&
            queries.length === 0 &&
            !queriesError &&
            !rangeError && (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  padding: "12px 0",
                }}
              >
                No queries with metric data found. Click{" "}
                <strong>Load Queries</strong> after selecting a range. Ensure{" "}
                <code>query_metric_log</code> is enabled on the ClickHouse node.
              </div>
            )}
        </div>

        {selectedQueryId && (
          <div
            style={{
              marginBottom: 14,
              fontSize: "13px",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Icon
              className="ti ti-check"
              style={{ color: "var(--color-success, #22c55e)" }}
            ></Icon>
            Selected:{" "}
            <code
              style={{
                fontFamily: "var(--font-code)",
                color: "var(--accent)",
                fontSize: "12px",
                wordBreak: "break-all",
              }}
            >
              {selectedQueryId}
            </code>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelectedQueryId("");
                setMetricsError("");
                setGroupedCharts([]);
                setChartLayoutKey((k) => k + 1);
              }}
              style={{ marginLeft: 4, fontSize: "12px" }}
            >
              <Icon className="ti ti-x"></Icon> Clear
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn btn-primary"
            onClick={handleShowMetrics}
            disabled={metricsLoading || !selectedQueryId}
            style={{ minWidth: 200 }}
          >
            {metricsLoading ? (
              <>
                <span
                  className="loading-spinner"
                  style={{ marginRight: 6 }}
                ></span>{" "}
                {metricsProgress || "Loading..."}
              </>
            ) : (
              <>
                <Icon className="ti ti-chart-line" style={{ marginRight: 4 }}></Icon>{" "}
                Show Query Metrics
              </>
            )}
          </button>
        </div>
      </div>

      {popupQuery && (
        <QueryDetailPopup
          query={popupQuery}
          fullText={popupQueryText}
          loading={popupTextLoading}
          onSelect={(qid) => setSelectedQueryId(qid)}
          onClose={() => setPopupQuery(null)}
        />
      )}

      {metricsError && (
        <div className="alert-banner danger" style={{ marginBottom: 16 }}>
          <Icon className="ti ti-alert-circle"></Icon> {metricsError}
        </div>
      )}

      {themedCharts.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            fontSize: "13px",
            color: "var(--text-muted)",
          }}
        >
          {themedCharts.reduce((sum, g) => sum + g.columns.length, 0)} active
          metrics across {themedCharts.length} charts
        </div>
      )}

      <div
        key={`charts-grid-${chartLayoutKey}-${themedCharts.length}`}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(520px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {themedCharts.map((group, idx) => (
          <div
            key={`${group.key}-${themeKey}-${chartLayoutKey}-${idx}`}
            style={{ minWidth: 0 }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <Icon
                className={`ti ${group.icon}`}
                style={{ fontSize: "15px" }}
              ></Icon>
              {group.label}
              <span
                style={{
                  fontWeight: 400,
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                ({group.columns.length})
              </span>
            </h3>
            <div style={{ minWidth: 0 }}>
              <ChartCard
                key={`chart-card-${group.key}-${themeKey}-${chartLayoutKey}-${idx}`}
                title={group.label}
                option={group.option}
                height={300}
                loading={false}
              />
            </div>
          </div>
        ))}
      </div>

      {themedCharts.length === 0 && !metricsLoading && !metricsError && (
        <div
          className="empty-state"
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <Icon
            className="ti ti-chart-line"
            style={{
              fontSize: 48,
              opacity: 0.3,
              display: "block",
              marginBottom: 12,
            }}
          ></Icon>
          Select a query and click <strong>Show Query Metrics</strong> to
          visualize its resource usage over time.
        </div>
      )}
    </div>
  );
}
