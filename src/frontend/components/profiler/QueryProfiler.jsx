// QueryProfiler - Interactive flame graph for ClickHouse query execution
//
// Generates flame graphs from system.trace_log data showing CPU, Real,
// Memory, or other trace types. Users select a query, choose a trace type,
// and click Generate to see the flame graph. Clicking any bar zooms into
// that call subtree. Supports memory context filtering for Memory traces.
// Built with ECharts custom renderer for icicle/flame layout.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useState, useRef, useEffect, useCallback } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { runQuery } from "../../utils/api.js";
import { initChart, disposeChart } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools, savePng } from "../common/ChartToolbar.jsx";
import { useToast } from "../layout/Toast.jsx";
import { useSearchParams } from "react-router-dom";

// Trace types

const TRACE_TYPES = [
  {
    value: "",
    label: "All Types",
    desc: "All trace types combined (CPU, Real, Memory, etc.)",
    usesSize: false,
  },
  {
    value: "CPU",
    label: "CPU Time",
    desc: "Stack traces sampled by CPU time (excludes idle)",
    usesSize: false,
  },
  {
    value: "Real",
    label: "Wall Clock (Real)",
    desc: "Stack traces sampled by wall-clock time (includes idle/wait)",
    usesSize: false,
  },
  {
    value: "Memory",
    label: "Memory (Watermark)",
    desc: "Allocations that exceeded the memory watermark",
    usesSize: true,
  },
  {
    value: "MemorySample",
    label: "Memory (Sampled)",
    desc: "Random allocation and deallocation samples",
    usesSize: true,
  },
  {
    value: "MemoryPeak",
    label: "Memory Peak",
    desc: "Updates to peak memory usage",
    usesSize: true,
  },
  {
    value: "ProfileEvent",
    label: "Profile Events",
    desc: "Increments of profile event counters (e.g., ReadBufferFromFileDescriptorRead)",
    usesSize: false,
  },
  {
    value: "JemallocSample",
    label: "Jemalloc Samples",
    desc: "jemalloc allocator internal sampling",
    usesSize: true,
  },
  {
    value: "Instrumentation",
    label: "Instrumentation",
    desc: "XRay instrumentation traces (requires SYSTEM INSTRUMENT)",
    usesSize: false,
  },
];

const MEMORY_CONTEXTS = [
  { value: "", label: "All Contexts" },
  { value: "Global", label: "Global (server)" },
  { value: "User", label: "User (user/merge)" },
  { value: "Process", label: "Process (query)" },
  { value: "Thread", label: "Thread" },
];

const QUERY_WARN_THRESHOLD = 200;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

// helpers functions

function toLocalDatetime(date) {
  const d = new Date(date);
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
  if (toMs - fromMs > MAX_INTERVAL_MS)
    return "Maximum interval is 24 hours. Narrow your range.";
  return null;
}

// Check if the selected trace type uses memory columns
function isMemoryTraceType(traceType) {
  const t = TRACE_TYPES.find((tt) => tt.value === traceType);
  return t?.usesSize || false;
}

// Check if memory_context filter applies
function supportsMemoryContext(traceType) {
  return traceType === "Memory" || traceType === "MemoryPeak";
}

// sql build query

function buildQueryListSql(from, to, traceType) {
  const chFrom = toChDatetime(from);
  const chTo = toChDatetime(to);

  let traceFilter = "";
  if (traceType) {
    traceFilter = `\n  AND t.trace_type = '${traceType}'`;
  }

  return `
SELECT
  t.query_id,
  min(t.event_time) AS first_seen,
  count() AS sample_count,
  substring(coalesce(q.query, ''), 1, 300) AS query_preview,
  q.query_duration_ms
FROM system.trace_log AS t
JOIN (
  SELECT query_id, query, query_duration_ms
  FROM system.query_log
  WHERE type = 'QueryFinish'
    AND event_date >= toDate('${chFrom}') - 1
  ORDER BY event_time DESC
  LIMIT 1 BY query_id
) AS q USING (query_id)
WHERE t.query_id != ''
  AND t.event_time >= '${chFrom}'
  AND t.event_time <= '${chTo}'${traceFilter}
GROUP BY t.query_id, q.query, q.query_duration_ms
ORDER BY first_seen DESC
LIMIT 500`.trim();
}

function buildFullQuerySql(queryId) {
  const safeId = queryId.replace(/'/g, "\\'");
  return `SELECT query FROM system.query_log WHERE query_id = '${safeId}' AND type = 'QueryFinish' ORDER BY event_time DESC LIMIT 1`;
}

function buildFlameGraphSql({ traceType, queryId, from, to, memoryContext }) {
  const chFrom = toChDatetime(from);
  const chTo = toChDatetime(to);
  const safeId = queryId.replace(/'/g, "\\'");

  let traceFilter = "";
  if (traceType) {
    traceFilter = `\n  AND trace_type = '${traceType}'`;
  }

  let contextFilter = "";
  if (memoryContext && supportsMemoryContext(traceType)) {
    contextFilter = `\n  AND memory_context = '${memoryContext}'`;
  }
  return `
SELECT
  arrayStringConcat(
    arrayReverse(arrayMap(x -> demangle(addressToSymbol(x)), trace)),
    ';'
  ) AS stack,
  count() AS samples
FROM system.trace_log
WHERE query_id = '${safeId}'
GROUP BY stack
SETTINGS allow_introspection_functions = 1`.trim();
}
// flamegraph parser

function parseFlameGraphRows(rows) {
  const root = { name: "all", value: 0, id: "all", children: [], _cm: {} };

  for (const row of rows) {
    const path = row.stack;
    const count = parseInt(row.samples, 10);
    if (!path || isNaN(count) || count <= 0) continue;

    const frames = path.split(";");
    let cur = root;
    root.value += count;
    let trail = "";

    for (const frame of frames) {
      const name = frame.trim();
      if (!name) continue;
      trail = trail ? trail + ";" + name : name;

      if (!cur._cm[name]) {
        const child = { name, value: 0, id: trail, children: [], _cm: {} };
        cur.children.push(child);
        cur._cm[name] = child;
      }
      cur = cur._cm[name];
      cur.value += count;
    }
  }

  (function strip(n) {
    delete n._cm;
    n.children.forEach(strip);
  })(root);
  return root;
}

// echarts for flame graph

function filterJson(json, id) {
  if (id == null) return json;
  const recur = (item, tid) => {
    if (item.id === tid) return item;
    for (const child of item.children || []) {
      const found = recur(child, tid);
      if (found) {
        item.children = [found];
        item.value = found.value;
        return item;
      }
    }
    return null;
  };
  return recur(json, id) || json;
}

function recursionJson(jsonObj, id) {
  const data = [];
  const filtered = filterJson(structuredClone(jsonObj), id);
  const rootVal = filtered.value || 1;

  const recur = (item, start = 0, level = 0) => {
    data.push({
      name: item.id,
      value: [
        level,
        start,
        start + item.value,
        item.name,
        (item.value / rootVal) * 100,
        item.value,
      ],
      itemStyle: { color: nameToColor(item.name) },
    });
    const sorted = [...(item.children || [])].sort((a, b) => b.value - a.value);
    let cx = start;
    for (const child of sorted) {
      recur(child, cx, level + 1);
      cx += child.value;
    }
  };
  recur(filtered);
  return data;
}

function heightOfJson(json) {
  const recur = (item, lvl = 0) => {
    if (!item.children?.length) return lvl;
    let mx = lvl;
    for (const c of item.children) mx = Math.max(mx, recur(c, lvl + 1));
    return mx;
  };
  return recur(json);
}

function nameToColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h = h & h;
  }
  return `hsl(${10 + Math.abs(h % 40)}, ${60 + Math.abs(h % 30)}%, ${50 + Math.abs(h % 15)}%)`;
}

const renderItem = (params, api) => {
  const level = api.value(0);
  const start = api.coord([api.value(1), level]);
  const end = api.coord([api.value(2), level]);
  const height = ((api.size && api.size([0, 1])) || [0, 20])[1];
  const width = end[0] - start[0];

  return {
    type: "rect",
    transition: ["shape"],
    shape: {
      x: start[0],
      y: start[1] - height / 2,
      width,
      height: height - 2,
      r: 2,
    },
    style: { fill: api.visual("color") },
    emphasis: { style: { stroke: "#000" } },
    textConfig: { position: "insideLeft" },
    textContent: {
      style: {
        text: width > 30 ? api.value(3) : "",
        fontFamily: "var(--font-code, monospace)",
        fontSize: 11,
        fill: "#000",
        width: width - 6,
        overflow: "truncate",
        ellipsis: "..",
        truncateMinChar: 1,
      },
    },
  };
};

function mountFlameGraph(chartDom, tree, traceType) {
  if (!chartDom) return null;

  const maxLevel = heightOfJson(tree);
  chartDom.style.height = Math.max(480, (maxLevel + 2) * 24 + 80) + "px";

  const chart = initChart(chartDom);

  const usesSize = isMemoryTraceType(traceType);
  const countLabel = usesSize ? "bytes" : "samples";

  const option = {
    backgroundColor: "transparent",
    // Controls live in the HTML toolbar above the chart, so only a small top pad
    // is needed. Keep the flame graph near full width.
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: false },
    tooltip: {
      confine: true,
      formatter: (params) => {
        const v = params.value;
        return (
          `${params.marker} <strong style="word-break:break-all">${v[3]}</strong>` +
          `<br>${countLabel}: ${v[5].toLocaleString()} (${(+v[4]).toFixed(2)}%)`
        );
      },
    },
    xAxis: { show: false },
    yAxis: { show: false, max: maxLevel },
    series: [
      {
        type: "custom",
        renderItem,
        encode: { x: [0, 1, 2], y: 0 },
        data: recursionJson(tree),
      },
    ],
  };

  chart.setOption(option, true);

  chart.on("click", (params) => {
    const data = recursionJson(tree, params.data.name);
    if (!data.length) return;
    chart.setOption({
      xAxis: { max: data[0].value[2] },
      yAxis: {
        max: heightOfJson(filterJson(structuredClone(tree), params.data.name)),
      },
      series: [{ data }],
    });
  });

  const resetZoom = () => {
    chart.setOption({
      xAxis: { max: null },
      yAxis: { max: maxLevel },
      series: [{ data: recursionJson(tree) }],
    });
  };
  chart.on("restore", resetZoom);
  chart._flameReset = resetZoom;

  return chart;
}

// query popup

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
              onClick={() => {
                navigator.clipboard.writeText(query.query_id);
                toast.success("Query ID Copied Succesfully");
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
            onClick={() => {
              navigator.clipboard.writeText(
                fullText || query.query_preview || "",
              );
              toast.success("Query Text Copied Succesfully");
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

// Query Profiler

export default function QueryProfiler() {
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

  const [traceType, setTraceType] = useState("CPU");
  const [memoryContext, setMemoryContext] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [generatedSql, setGeneratedSql] = useState("");

  const chartRef = useRef(null);
  const treeRef = useRef(null);
  const flameInst = useRef(null);
  const flameHeightRef = useRef(null);
  const flameTools = useChartTools(() => flameInst.current, { filename: "flame-graph" });

  const [searchParams] = useSearchParams();
  const qidFromUrl = searchParams.get("qid");

  useEffect(() => {
    if (qidFromUrl) {
      setSelectedQueryId(qidFromUrl);
      // loadData(qidFromUrl);
    }
  }, [qidFromUrl]);

  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (treeRef.current && chartRef.current && stats) {
      flameInst.current = mountFlameGraph(chartRef.current, treeRef.current, traceType);
    }
  }, [themeKey]);

  useEffect(() => {
    const dom = chartRef.current;
    if (!dom) return undefined;
    if (flameTools.fullscreen) {
      flameHeightRef.current = dom.style.height;
      dom.style.height = "calc(100vh - 96px)";
    } else if (flameHeightRef.current != null) {
      dom.style.height = flameHeightRef.current;
    }
    const t = setTimeout(() => flameInst.current?.resize(), 150);
    return () => clearTimeout(t);
  }, [flameTools.fullscreen]);

  useEffect(() => {
    return () => {
      disposeChart(chartRef.current);
    };
  }, []);
  useEffect(() => {
    return () => {
      disposeChart(chartRef.current);
    };
  }, [chartRef]);

  const fetchQueries = useCallback(async () => {
    const err = validateRange(fromDt, toDt);
    if (err) {
      setRangeError(err);
      return;
    }
    setRangeError("");
    setQueriesLoading(true);
    setQueriesError("");
    setQueries([]);
    setSelectedQueryId("");
    setPopupQuery(null);
    setSearchText("");

    try {
      const result = await runQuery(buildQueryListSql(fromDt, toDt, traceType));
      const rows = result.rows || [];
      if (rows.length >= 500) {
        setQueriesError(
          "More than 500 queries with trace data. Showing the latest 500. Narrow the range or search.",
        );
      } else if (rows.length > QUERY_WARN_THRESHOLD) {
        setQueriesError(
          `${rows.length} queries found. Consider narrowing the range.`,
        );
      }
      setQueries(rows);
    } catch (e) {
      setQueriesError(e.message || "Failed to load queries from trace_log");
    }
    setQueriesLoading(false);
  }, [fromDt, toDt, traceType]);

  const handleQueryClick = useCallback(async (query) => {
    setPopupQuery(query);
    setPopupQueryText(query.query_preview || "");
    setPopupTextLoading(true);

    try {
      const result = await runQuery(buildFullQuerySql(query.query_id));
      if (result.rows?.[0]?.query) setPopupQueryText(result.rows[0].query);
    } catch {}
    setPopupTextLoading(false);
  }, []);

  const filteredQueries = queries.filter((q) => {
    if (!searchText.trim()) return true;
    const s = searchText.toLowerCase();
    return (
      q.query_id.toLowerCase().includes(s) ||
      (q.query_preview || "").toLowerCase().includes(s)
    );
  });

  const handleGenerate = useCallback(async () => {
    if (!selectedQueryId) {
      setError("Select a query from the list first.");
      return;
    }
    const rangeErr = validateRange(fromDt, toDt);
    if (rangeErr) {
      setError(rangeErr);
      return;
    }

    setError("");
    setStats(null);
    setLoading(true);
    treeRef.current = null;
    disposeChart(chartRef.current);

    const sql = buildFlameGraphSql({
      traceType,
      queryId: selectedQueryId,
      from: fromDt,
      to: toDt,
      memoryContext,
    });
    setGeneratedSql(sql);

    try {
      const result = await runQuery(sql);
      if (!result.rows?.length) {
        setError(
          'No trace data found for this query and trace type. Try a different trace type (e.g., "Real" instead of "CPU"). If none work, the query may have been too fast to sample.',
        );
        setLoading(false);
        return;
      }

      const validRows = result.rows.filter(
        (r) => r.stack && parseInt(r.samples, 10) > 0,
      );
      if (!validRows.length) {
        setError(
          'No trace data found for this query and trace type. Try a different trace type (e.g., "Real" instead of "CPU"). If none work, the query may have been too fast to sample.',
        );
        setLoading(false);
        return;
      }

      const tree = parseFlameGraphRows(validRows);
      treeRef.current = tree;

      setStats({
        totalSamples: tree.value,
        uniqueStacks: validRows.length,
        maxDepth: heightOfJson(tree),
      });

      flameInst.current = mountFlameGraph(chartRef.current, tree, traceType);
    } catch (e) {
      setError(e.message || "Failed to generate flame graph");
    }
    setLoading(false);
  }, [traceType, memoryContext, selectedQueryId, fromDt, toDt]);

  useEffect(() => {
    if (!supportsMemoryContext(traceType)) setMemoryContext("");
  }, [traceType]);

  // -- UI --
  const currentTraceType = TRACE_TYPES.find((t) => t.value === traceType);

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

  const chartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-flame" style={{ color: "var(--accent)" }}></Icon>{" "}
          Query Profiler
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
        Visualize ClickHouse query execution as a flame graph using{" "}
        <code>system.trace_log</code>. Pick a datetime range (max 24 hours),
        select a query, choose a trace type, and click Generate. Click any bar
        to zoom into that call subtree. Use the restore button to reset.
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

          <div className="form-group" style={{ minWidth: 280, flex: "1 1 280px" }}>
            <label className="form-label">
              Query ID
              {queriesLoading && (
                <span className="loading-spinner" style={{ marginLeft: 8, width: 12, height: 12 }}></span>
              )}
              {!queriesLoading && queries.length > 0 && (
                <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
                  ({queries.length} queries with trace data)
                </span>
              )}
            </label>
            <input
              className="form-input"
              placeholder="Search by query text or query_id..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ fontFamily: "var(--font-code)", fontSize: "13px" ,height:39}}
            />
          </div>

          <div
            className="form-group"
            style={{ minWidth: 180, marginLeft: "auto" }}
          >
            <label className="form-label">Trace Type</label>
            <Select
              className="form-input"
              value={traceType}
              onChange={(e) => setTraceType(e.target.value)}
            >
              {TRACE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          {supportsMemoryContext(traceType) && (
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label">Memory Context</label>
              <Select
                className="form-input"
                value={memoryContext}
                onChange={(e) => setMemoryContext(e.target.value)}
              >
                {MEMORY_CONTEXTS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
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
                No queries with trace data found. Click{" "}
                <strong>Load Queries</strong> after selecting a range, or run a
                query first.
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
              }}
            >
              {selectedQueryId}
            </code>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelectedQueryId("");
                setError("");
                setStats(null);
                treeRef.current = null;
                if (chartRef.current) {
                  disposeChart(chartRef.current);
                }
                chartRef.current = null;
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
            onClick={handleGenerate}
            disabled={loading || !selectedQueryId}
            style={{ minWidth: 200 }}
          >
            {loading ? (
              <>
                <span
                  className="loading-spinner"
                  style={{ marginRight: 6 }}
                ></span>{" "}
                Generating...
              </>
            ) : (
              <>
                <Icon className="ti ti-flame" style={{ marginRight: 4 }}></Icon>{" "}
                Generate Flame Graph
              </>
            )}
          </button>
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginLeft: "auto",
            }}
          >
            {currentTraceType?.desc}
          </span>
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

      {error && (
        <div className="alert-banner danger" style={{ marginBottom: 16 }}>
          <Icon className="ti ti-alert-circle"></Icon> {error}
        </div>
      )}

      {stats && (
        <div
          style={{
            display: "flex",
            gap: 24,
            marginBottom: 12,
            fontSize: "13px",
            color: "var(--text-secondary)",
          }}
        >
          <span>
            <strong>{stats.totalSamples.toLocaleString()}</strong> total{" "}
            {isMemoryTraceType(traceType) ? "bytes" : "samples"}
          </span>
          <span>
            <strong>{stats.uniqueStacks.toLocaleString()}</strong> unique stacks
          </span>
          <span>
            <strong>{stats.maxDepth}</strong> max depth
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            Click a bar to zoom. Toolbox restore to reset.
          </span>
        </div>
      )}

      <div
        className="card"
         style={
              flameTools.fullscreen
                ? {
                    position: "fixed",
                    zIndex: 9999,
                    background: "var(--bg-page)",
                    padding: 16,
                    overflow: "auto",
                    top: "0px",
                    left: "0px",
                    width: "100%",
                    height: "100vh",
                  }
                :{ padding: 20, marginBottom: 16, minHeight: 200 }
            }
     
      >
        {!stats && !loading && !error ? (
          <div
            className="empty-state"
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <Icon
              className="ti ti-flame"
              style={{
                fontSize: 48,
                opacity: 0.3,
                display: "block",
                marginBottom: 12,
              }}
            ></Icon>
            Select a query and click <strong>Generate Flame Graph</strong> to
            visualize execution.
          </div>
        ) : (
          <div>
            {stats && (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4,marginBottom:"10px" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => flameInst.current?._flameReset?.()} title="Reset zoom" aria-label="Reset zoom"><Icon className="ti ti-zoom-reset"></Icon></button>
                <ChartToolbar
                  fullscreen={flameTools.fullscreen}
                  onSave={flameTools.save}
                  onToggleFullscreen={flameTools.toggleFullscreen}
                  isWantFeature = {chartControlsFlags}
                />
              </div>
            )}
            <div
              ref={chartRef}
              style={{
                width: "100%",
                minHeight: stats ? 400 : 0,
                padding: "2px",
              }}
            ></div>
          </div>
        )}
      </div>

      {generatedSql && (
        <details style={{ marginBottom: 16 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: "13px",
              color: "var(--text-muted)",
              userSelect: "none",
            }}
          >
            <Icon className="ti ti-code" style={{ marginRight: 4 }}></Icon> View
            Generated SQL
          </summary>
          <pre className="profiler-sql-preview">{generatedSql}</pre>
        </details>
      )}
    </div>
  );
}
