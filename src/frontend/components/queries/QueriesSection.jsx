// QueriesSection - Multi-tab query management with current, analytics, and log views
//
// Three views for query monitoring: Current (running queries with kill buttons),
// Analytics (throughput and error rate, latency percentiles, duration distribution,
// and top-N tables over time), and Query Log (searchable history with filters for
// kind, type, exception, user, and sorting).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useEffect, useState, useCallback, useRef } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { runQuery } from "../../utils/api.js";
import DataTable from "../layout/DataTable.jsx";
import ChartCard from "../layout/ChartCard.jsx";
import { initChart, disposeChart, withZoomable } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";
import { DateTimePicker } from "../layout/DateTimePicker.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import { useToast } from "../layout/Toast.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };
const pad = (n) => String(n).padStart(2, "0");
const fmtNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtAgo = (h) => {
  const d = new Date(Date.now() - h * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const toDatePart = (v) => (v ? v.slice(0, 10) : "");

// Formatting helpers for the analytics summary cards
const fmtMs = (ms) => {
  const n = Number(ms) || 0;
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
};
const fmtBytes = (b) => {
  let n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    n /= 1024;
    ++i;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(2)} ${units[i]}`;
};
const errorRatePct = (succeeded, errored) => {
  const s = Number(succeeded) || 0;
  const e = Number(errored) || 0;
  const denom = s + e;
  return denom === 0 ? 0 : Math.round((e / denom) * 1000) / 10;
};

// Analytics SQL builders
//
// All series share the same population semantics so they line up on common
// axes: QueryStart = submitted, QueryFinish = succeeded, the two Exception
// types = errored. Percentiles and the histogram use QueryFinish only, since
// only completed queries carry a real duration and memory figure.

function buildThroughputSql(from, to, kindFilter) {
  return `
    SELECT
      toStartOfHour(event_time) AS t,
      countIf(type = 'QueryStart') AS submitted,
      countIf(type = 'QueryFinish') AS succeeded,
      countIf(type IN ('ExceptionBeforeStart','ExceptionWhileProcessing')) AS errored
    FROM system.query_log
    WHERE event_time BETWEEN '${from}' AND '${to}'${kindFilter}
    GROUP BY t
    ORDER BY t ASC
    WITH FILL FROM toStartOfHour(toDateTime('${from}')) TO toStartOfHour(toDateTime('${to}')) STEP toIntervalHour(1)`;
}

function buildPercentilesSql(from, to, kindFilter) {
  return `
    SELECT
      toStartOfHour(event_time) AS t,
      round(quantile(0.5)(query_duration_ms), 0) AS p50,
      round(quantile(0.9)(query_duration_ms), 0) AS p90,
      round(quantile(0.99)(query_duration_ms), 0) AS p99
    FROM system.query_log
    WHERE type = 'QueryFinish' AND query_duration_ms >= 0
      AND event_time BETWEEN '${from}' AND '${to}'${kindFilter}
    GROUP BY t
    ORDER BY t ASC
    WITH FILL FROM toStartOfHour(toDateTime('${from}')) TO toStartOfHour(toDateTime('${to}')) STEP toIntervalHour(1)`;
}

function buildHistogramSql(from, to, kindFilter) {
  return `
    SELECT bucket, count() AS cnt FROM (
      SELECT multiIf(
        query_duration_ms < 100, '1: <100ms',
        query_duration_ms < 1000, '2: 100ms-1s',
        query_duration_ms < 10000, '3: 1-10s',
        query_duration_ms < 60000, '4: 10-60s',
        query_duration_ms < 300000, '5: 1-5m',
        '6: >5m') AS bucket
      FROM system.query_log
      WHERE type = 'QueryFinish'
        AND event_time BETWEEN '${from}' AND '${to}'${kindFilter}
    )
    GROUP BY bucket
    ORDER BY bucket ASC`;
}

function buildSummarySql(from, to, kindFilter) {
  return `
    SELECT
      countIf(type = 'QueryStart') AS total_submitted,
      countIf(type = 'QueryFinish') AS total_succeeded,
      countIf(type IN ('ExceptionBeforeStart','ExceptionWhileProcessing')) AS total_errored,
      round(quantileIf(0.99)(query_duration_ms, type = 'QueryFinish'), 0) AS p99_dur_ms,
      quantileIf(0.99)(memory_usage, type = 'QueryFinish') AS p99_mem_bytes
    FROM system.query_log
    WHERE event_time BETWEEN '${from}' AND '${to}'${kindFilter}`;
}

// ECharts option builders

// Shared x-axis label config for the hourly time-series charts. Shows about 5
// labels regardless of how many hourly buckets there are, formatted as
// "YYYY-MM-DD HH:mm" (the ClickHouse DateTime string with seconds trimmed).
function timeAxisLabel(n) {
  const interval = n > 5 ? Math.ceil(n / 5) - 1 : 0;
  return {
    interval,
    hideOverlap: true,
    formatter: (v) => (typeof v === "string" ? v.slice(0, 16) : v),
  };
}

function throughputOption(rows) {
  const t = rows.map((r) => r.t);
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["Succeeded", "Errored", "Error rate %"], top: 0 },
    grid: { left: 48, right: 56, top: 44, bottom: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: t,
      axisLabel: timeAxisLabel(t.length),
    },
    yAxis: [
      { type: "value", name: "Queries" },
      { type: "value", name: "Error %", max: 100, position: "right" },
    ],
    series: [
      {
        name: "Succeeded",
        type: "line",
        stack: "vol",
        areaStyle: { opacity: 0.25 },
        showSymbol: false,
        data: rows.map((r) => Number(r.succeeded) || 0),
      },
      {
        name: "Errored",
        type: "line",
        stack: "vol",
        areaStyle: { opacity: 0.5 },
        showSymbol: false,
        data: rows.map((r) => Number(r.errored) || 0),
      },
      {
        name: "Error rate %",
        type: "line",
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { type: "dashed" },
        data: rows.map((r) => errorRatePct(r.succeeded, r.errored)),
      },
    ],
  };
}

function percentilesOption(rows) {
  const t = rows.map((r) => r.t);
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["p50", "p90", "p99"], top: 0 },
    grid: { left: 56, right: 24, top: 44, bottom: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: t,
      axisLabel: timeAxisLabel(t.length),
    },
    yAxis: { type: "value", name: "ms" },
    series: [
      { name: "p50", type: "line", showSymbol: false, data: rows.map((r) => Number(r.p50) || 0) },
      { name: "p90", type: "line", showSymbol: false, data: rows.map((r) => Number(r.p90) || 0) },
      { name: "p99", type: "line", showSymbol: false, data: rows.map((r) => Number(r.p99) || 0) },
    ],
  };
}

function histogramOption(rows) {
  const labels = rows.map((r) => String(r.bucket).replace(/^\d+:\s*/, ""));
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 56, right: 24, top: 24, bottom: 40 },
    xAxis: { type: "category", data: labels },
    yAxis: { type: "value", name: "Queries" },
    series: [{ type: "bar", data: rows.map((r) => Number(r.cnt) || 0) }],
  };
}

// Numeric duration + memory pairs for the scatter. This is the slowest N over
// the window (a tail view), not the full population, which could be millions of
// points and is not meaningful to scatter.
function buildScatterSql(from, to, fd, td, kindFilter) {
  return `SELECT query_id, query_duration_ms AS dur_ms, memory_usage AS mem_bytes, substring(query,1,80) AS q FROM system.query_log WHERE type='QueryFinish' AND event_date BETWEEN '${fd}' AND '${td}' AND event_time BETWEEN '${from}' AND '${to}'${kindFilter} ORDER BY query_duration_ms DESC LIMIT 200`;
}

function scatterOption(rows) {
  const data = rows.map((r) => [
    Number(r.dur_ms) || 0,
    Math.round(((Number(r.mem_bytes) || 0) / 1048576) * 100) / 100,
    r.query_id,
    r.q,
  ]);
  return {
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p) => {
        const v = p.value;
        return `${fmtMs(v[0])} &middot; ${v[1].toLocaleString("en-US")} MB<br/><span style="font-family:var(--font-code,monospace);font-size:12px">${v[2]}</span><br/><span style="font-size:11px;opacity:0.7">Click to view query</span>`;
      },
    },
    grid: { left: 70, right: 24, top: 24, bottom: 50 },
    xAxis: {
      type: "value",
      name: "Duration (ms)",
      nameLocation: "middle",
      nameGap: 30,
    },
    yAxis: {
      type: "value",
      name: "Memory (MB)",
      nameLocation: "middle",
      nameGap: 50,
    },
    series: [
      { type: "scatter", symbolSize: 8, itemStyle: { opacity: 0.6 }, data },
    ],
  };
}

// Inline magnitude bar for a metric cell, scaled to the max in its set.
function MetricBar({ label, value, max, color }) {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  const pct = m <= 0 || v <= 0 ? 0 : Math.max(2, Math.round((v / m) * 100));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 150,
      }}
    >
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--bg-sunken, rgba(255,255,255,0.07))",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color || "var(--accent)",
            borderRadius: 3,
          }}
        ></div>
      </div>
      <span
        style={{
          fontFamily: "var(--font-code, monospace)",
          fontSize: "13px",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// Destinations a query_id can be opened in. All three pages read ?qid= from the
// URL (HashRouter), so each link is /<route>?qid=<id>.
const OPEN_IN_DESTINATIONS = [
  { key: "profiler", label: "Query Profiler", icon: "ti-flame", route: "tools/profiler" },
  { key: "pipeline", label: "Processors Profile", icon: "ti-hierarchy-2", route: "tools/pipeline" },
  { key: "metrics", label: "Query Metrics", icon: "ti-chart-line", route: "tools/metrics" },
];

// Per-row "Open in..." menu. The popover is fixed-position (anchored to the
// trigger via getBoundingClientRect) so the table's overflow does not clip it.
function OpenInMenu({ queryId }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", close);
    };
  }, [open]);

  function toggle(e) {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) });
    setOpen((v) => !v);
  }

  function go(route) {
    navigate(`/${route}?qid=${encodeURIComponent(queryId)}`);
    setOpen(false);
  }

  return (
    <>
      <button ref={btnRef} className="btn btn-secondary btn-sm" onClick={toggle}>
        <Icon className="ti ti-external-link"></Icon> Open in...
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 1200,
            width: 210,
            height: "auto",
            maxHeight: "none",
            display: "flex",
            flexDirection: "column",
            padding: 4,
            background: "var(--glass-bg, rgba(24,28,38,0.85))",
            backdropFilter: "blur(12px) saturate(140%)",
            WebkitBackdropFilter: "blur(12px) saturate(140%)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.14))",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            overflow: "visible",
          }}
        >
          {OPEN_IN_DESTINATIONS.map((d) => (
            <button
              key={d.key}
              className="btn btn-ghost btn-sm"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                justifyContent: "flex-start",
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
              onClick={() => go(d.route)}
            >
              <Icon className={`ti ${d.icon}`}></Icon> {d.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function buildFullQuerySql(queryId) {
  const safeId = String(queryId).replace(/'/g, "\\'");
  return `SELECT query FROM system.query_log WHERE query_id = '${safeId}' AND type = 'QueryFinish' ORDER BY event_time DESC LIMIT 1`;
}

// Modal showing the full query text for a clicked scatter point.
function QueryTextPopup({ queryId, preview, fullText, loading, onClose }) {
  const toast = useToast();
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!queryId) return null;
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 820, width: "92%" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            gap: 8,
          }}
        >
          <code
            style={{
              fontFamily: "var(--font-code, monospace)",
              fontSize: "13px",
              color: "var(--accent)",
              wordBreak: "break-all",
            }}
          >
            {queryId}
          </code>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(fullText || preview || "");
                  toast.success("Query text copied");
                } catch {
                  /* clipboard unavailable */
                }
              }}
            >
              <Icon className="ti ti-copy"></Icon> Copy
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <Icon className="ti ti-x"></Icon>
            </button>
          </div>
        </div>
        {loading ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <span className="loading-spinner" style={{ marginRight: 6 }}></span>{" "}
            Loading...
          </div>
        ) : (
          <pre
            className="profiler-popup-code"
            style={{
              maxHeight: "55vh",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {fullText || preview || "(query text not available)"}
          </pre>
        )}
      </div>
    </div>
  );
}

// Standalone scatter with its own ECharts instance, so it can carry a click
// handler (ChartCard does not forward chart events). Clicking a point opens the
// full query text. The query_id stays in the hover tooltip.
function ScatterChart({ rows, title, note }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const tools = useChartTools(() => chartRef.current, { filename: title || "scatter" });
  const [popup, setPopup] = useState(null);
  const [fullText, setFullText] = useState("");
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    if (!elRef.current) return;
    chartRef.current = initChart(elRef.current);
    chartRef.current.setOption(withZoomable({ ...scatterOption(rows), toolbox: { show: false } }), true);
    chartRef.current.on("click", (p) => {
      if (!p?.value) return;
      const queryId = p.value[2];
      const preview = p.value[3];
      setPopup({ queryId, preview });
    });
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    setTimeout(() => chartRef.current?.resize(), 50);
    return () => {
      window.removeEventListener("resize", onResize);
      disposeChart(elRef.current);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(withZoomable({ ...scatterOption(rows), toolbox: { show: false } }), true);
      setTimeout(() => chartRef.current?.resize(), 50);
    }
  }, [rows]);

  useEffect(() => {
    const t = setTimeout(() => chartRef.current?.resize(), 150);
    return () => clearTimeout(t);
  }, [tools.fullscreen]);

  useEffect(() => {
    if (!popup?.queryId) return;
    let alive = true;
    setLoadingText(true);
    setFullText("");
    runQuery(buildFullQuerySql(popup.queryId))
      .then((r) => {
        if (alive && r.rows?.[0]?.query) setFullText(r.rows[0].query);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingText(false);
      });
    return () => {
      alive = false;
    };
  }, [popup?.queryId]);

  return (
    <div style={{ marginBottom: "20px" }}>
      <div className="card" style={tools.fullscreen ? { padding: "16px", position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-page)", display: "flex", flexDirection: "column" } : { padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>{title}</span>
          <ChartToolbar
            zoomable
            fullscreen={tools.fullscreen}
            onZoomIn={tools.zoomIn}
            onZoomOut={tools.zoomOut}
            onZoomReset={tools.zoomReset}
            onSave={tools.save}
            onToggleFullscreen={tools.toggleFullscreen}
          />
        </div>
        <div ref={elRef} style={{ width: "100%", height: tools.fullscreen ? "calc(100vh - 96px)" : 420, flex: tools.fullscreen ? 1 : undefined }} />
      </div>
      {note && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          {note}
        </div>
      )}
      {popup && (
        <QueryTextPopup
          queryId={popup.queryId}
          preview={popup.preview}
          fullText={fullText}
          loading={loadingText}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}

export default function QueriesSection({ sidebar }) {
  const { tab: routeTab = "current" } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/overview/queries/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-terminal-2"></Icon> Queries
        </h2>
      </div>
      <div className="tab-bar">
        {[
          { id: "current", label: "Current", icon: "ti-player-play" },
          { id: "analytics", label: "Analytics", icon: "ti-chart-bar" },
          { id: "search", label: "Query Log", icon: "ti-search" },
        ].map((t) => (
          <div
            key={t.id}
            className={`tab-item ${routeTab === t.id ? "active" : ""}`}
            onClick={() => handleTabChange(t.id)}
          >
            <Icon className={`ti ${t.icon}`}></Icon> {t.label}
          </div>
        ))}
      </div>
      {routeTab === "current" && <CurrentQueries />}
      {routeTab === "analytics" && <QueryAnalytics />}
      {routeTab === "search" && <QueryLogSearch sidebar={sidebar} />}
    </div>
  );
}

function CurrentQueries() {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const q = useQuery();
  const [killModal, setKillModal] = useState(null);
  const [killResult, setKillResult] = useState(null);
  const load = useCallback(() => {
    q.execute(
      "SELECT query_id, user, toString(elapsed) AS elapsed, read_rows, formatReadableSize(read_bytes) AS read_bytes, formatReadableSize(memory_usage) AS memory_usage, substring(query,1,200) AS query_preview FROM system.processes ORDER BY elapsed DESC",
    );
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function killQuery(qid, sync) {
    try {
      await runQuery(
        `KILL QUERY WHERE query_id='${qid}'${sync ? " SYNC" : ""}`,
      );
      setKillResult({ ok: true, msg: `Query ${qid} killed` });
      load();
    } catch (e) {
      setKillResult({ ok: false, msg: e.message });
    }
    setKillModal(null);
  }

  return (
    <div>
      <div className="alert-banner info" style={{ marginBottom: "16px" }}>
        <Icon className="ti ti-info-circle"></Icon>
        <span>
          Some queries here are already history. ClickHouse® is so fast that
          this monitor works like a telescope: you are observing the universe as
          it was a moment ago, even as new stars are still igniting.
        </span>
      </div>
      {killResult && (
        <div
          className={`alert-banner ${killResult.ok ? "success" : "danger"}`}
          style={{ marginBottom: "12px" }}
        >
          <Icon className={`ti ${killResult.ok ? "ti-check" : "ti-x"}`}></Icon>{" "}
          {killResult.msg}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setKillResult(null)}
          >
            <Icon className="ti ti-x"></Icon>
          </button>
        </div>
      )}
      <DataTable
        rows={q.data || []}
        columns={[
          "query_id",
          "user",
          "elapsed",
          "read_rows",
          "read_bytes",
          "memory_usage",
          "query_preview",
        ]}
        emptyMessage="No queries currently running."
        variant="single"
        actions={(row) => (
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setKillModal({ qid: row.query_id, sync: false })}
              disabled={!isAdmin}
              style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
            >
              <Icon className="ti ti-player-stop"></Icon> Kill
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setKillModal({ qid: row.query_id, sync: true })}
              disabled={!isAdmin}
              style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
            >
              <Icon className="ti ti-player-stop"></Icon> Kill Sync
            </button>
          </div>
        )}
      />
      {killModal && (
        <ConfirmModal
          title="Kill Query"
          message={`Kill query ${killModal.qid}${killModal.sync ? " with SYNC" : ""}?`}
          onConfirm={() => killQuery(killModal.qid, killModal.sync)}
          onCancel={() => setKillModal(null)}
          danger
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, danger }) {
  return (
    <div
      className="card"
      style={{ padding: "16px", flex: 1, minWidth: 140 }}
    >
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
          fontSize: "1.5rem",
          fontWeight: 600,
          color: danger ? "var(--color-danger)" : "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function QueryAnalytics() {
  const [from, setFrom] = useState(fmtAgo(168));
  const [to, setTo] = useState(fmtNow());
  const [duration, setDuration] = useState("7d");
  const [queryKind, setQueryKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [queryKinds, setQueryKinds] = useState([]);
  const [summary, setSummary] = useState(null);
  const [throughput, setThroughput] = useState(null);
  const [percentiles, setPercentiles] = useState(null);
  const [histogram, setHistogram] = useState(null);
  const [slowData, setSlowData] = useState(null);
  const [memIntData, setMemIntData] = useState(null);
  const [scatterData, setScatterData] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    runQuery(
      "SELECT DISTINCT query_kind FROM system.query_log WHERE query_kind!='' ORDER BY query_kind",
    )
      .then((r) => setQueryKinds((r.rows || []).map((r) => r.query_kind)))
      .catch(() => {});
  }, []);

  function applyDuration(d) {
    setDuration(d);
    const h =
      {
        ["1h"]: 1,
        ["6h"]: 6,
        ["24h"]: 24,
        ["48h"]: 48,
        ["7d"]: 168,
        ["30d"]: 720,
      }[d] || 168;
    setFrom(fmtAgo(h));
    setTo(fmtNow());
  }

  async function runAnalytics() {
    setLoading(true);
    const fd = toDatePart(from),
      td = toDatePart(to);
    const kindFilter = queryKind ? ` AND query_kind='${queryKind}'` : "";
    try {
      const [sum, thr, pct, hist, sl, mi, sc] = await Promise.all([
        runQuery(buildSummarySql(from, to, kindFilter)),
        runQuery(buildThroughputSql(from, to, kindFilter)),
        runQuery(buildPercentilesSql(from, to, kindFilter)),
        runQuery(buildHistogramSql(from, to, kindFilter)),
        runQuery(
          `SELECT query_id, user, query_duration_ms, formatReadableSize(memory_usage) AS memory, substring(query,1,200) AS query_preview FROM system.query_log WHERE type='QueryFinish' AND event_date BETWEEN '${fd}' AND '${td}' AND event_time BETWEEN '${from}' AND '${to}'${kindFilter} ORDER BY query_duration_ms DESC LIMIT 100`,
        ),
        runQuery(
          `SELECT query_id, user, memory_usage AS memory_bytes, formatReadableSize(memory_usage) AS memory, substring(query,1,200) AS query_preview FROM system.query_log WHERE type='QueryFinish' AND event_date BETWEEN '${fd}' AND '${td}' AND event_time BETWEEN '${from}' AND '${to}'${kindFilter} ORDER BY memory_usage DESC LIMIT 100`,
        ),
        runQuery(buildScatterSql(from, to, fd, td, kindFilter)),
      ]);
      setSummary(sum.rows?.[0] || null);
      setThroughput(thr.rows || []);
      setPercentiles(pct.rows || []);
      setHistogram(hist.rows || []);
      setSlowData(sl.rows);
      setMemIntData(mi.rows);
      setScatterData(sc.rows || []);
    } catch (e) {
      toast.error("Failed to load analytics: " + e.message);
    }
    setLoading(false);
  }

  const handleDateOnChange = (date, label) => {
    if (label === "From") {
      setFrom(date);
      if (to && new Date(date) > new Date(to)) {
        setFrom(fmtAgo(168));
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

  const errRate = summary
    ? errorRatePct(summary.total_succeeded, summary.total_errored)
    : 0;

  return (
    <div>
      <div
        className="card"
        style={{
          padding: "16px",
          marginBottom: "20px",
          display: "flex",
          gap: "14px",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div className="form-group">
          <label className="form-label">Quick Range</label>
          <div
            style={{
              display: "flex",
              gap: "4px",
              alignItems: "center",
              justifyContent: "start",
            }}
          >
            {["1h", "6h", "24h", "48h", "7d", "30d"].map((d) => (
              <button
                key={d}
                style={{
                  padding: "10px",
                  width: "50px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                className={`btn btn-sm ${duration === d ? "btn-primary" : "btn-secondary"}`}
                onClick={() => applyDuration(d)}
              >
                {d}
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
          <label className="form-label">Query Kind</label>
          <Select
            className="form-select"
            value={queryKind}
            onChange={(e) => setQueryKind(e.target.value)}
          >
            <option value="">All</option>
            {queryKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </div>
        <button
          className="btn btn-primary"
          onClick={runAnalytics}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="loading-spinner"></span> Analyzing...
            </>
          ) : (
            <>
              <Icon className="ti ti-chart-bar"></Icon> Analyze
            </>
          )}
        </button>
      </div>

      {summary && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <MetricCard
            label="Total queries"
            value={(Number(summary.total_submitted) || 0).toLocaleString(
              "en-US",
            )}
          />
          <MetricCard
            label="Error rate"
            value={`${errRate}%`}
            danger={errRate > 0}
          />
          <MetricCard label="p99 duration" value={fmtMs(summary.p99_dur_ms)} />
          <MetricCard
            label="p99 memory"
            value={fmtBytes(summary.p99_mem_bytes)}
          />
        </div>
      )}

      {throughput && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <ChartCard
            title="Throughput and Error Rate"
            option={throughputOption(throughput)}
            height={360}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            <ChartCard
              title="Duration Percentiles (p50 / p90 / p99, ms)"
              option={percentilesOption(percentiles || [])}
              height={320}
            />
            <ChartCard
              title="Duration Distribution"
              option={histogramOption(histogram || [])}
              height={320}
            />
          </div>
        </div>
      )}

      {scatterData?.length > 0 && (
        <ScatterChart
          rows={scatterData}
          title="Duration vs Memory (slowest 200)"
          note="Each point is one completed query. Top-right is both slow and memory-heavy. Click a point to view its full query text. Showing the 200 slowest in range, not the full population."
        />
      )}

      {slowData?.length > 0 && (
        <>
          <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>
            Top 100 Slowest Queries
          </h3>
          <DataTable
            rows={slowData}
            columns={[
              "query_id",
              "user",
              "query_duration_ms",
              "memory",
              "query_preview",
            ]}
            maxHeight={420}
            cellRenderers={{
              query_duration_ms: (val) => (
                <MetricBar
                  value={val}
                  max={slowData.reduce(
                    (mx, r) => Math.max(mx, Number(r.query_duration_ms) || 0),
                    0,
                  )}
                  label={fmtMs(val)}
                  color="var(--color-warning, #f59e0b)"
                />
              ),
            }}
            actions={(row) => <OpenInMenu queryId={row.query_id} />}
          />
          <div className="divider"></div>
        </>
      )}
      {memIntData?.length > 0 && (
        <>
          <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>
            Top 100 Memory-Intensive Queries
          </h3>
          <DataTable
            rows={memIntData}
            columns={["query_id", "user", "memory", "query_preview"]}
            maxHeight={420}
            cellRenderers={{
              memory: (val, row) => (
                <MetricBar
                  value={row.memory_bytes}
                  max={memIntData.reduce(
                    (mx, r) => Math.max(mx, Number(r.memory_bytes) || 0),
                    0,
                  )}
                  label={val}
                  color="var(--accent)"
                />
              ),
            }}
            actions={(row) => <OpenInMenu queryId={row.query_id} />}
          />
        </>
      )}
    </div>
  );
}

function QueryLogSearch({ sidebar }) {
  const toast = useToast();
  const [from, setFrom] = useState(fmtAgo(24));
  const [to, setTo] = useState(fmtNow());
  const [queryKind, setQueryKind] = useState("");
  const [queryType, setQueryType] = useState("");
  const [exceptionCode, setExceptionCode] = useState("");
  const [exceptionText, setExceptionText] = useState("");
  const [isInitial, setIsInitial] = useState("");
  const [initialUser, setInitialUser] = useState("");
  const [sortField, setSortField] = useState("event_time");
  const [sortDir, setSortDir] = useState("DESC");
  const [submitted, setSubmitted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const searchQ = useQuery(),
    kindsQ = useQuery(),
    typesQ = useQuery(),
    codesQ = useQuery(),
    usersQ = useQuery();

  useEffect(() => {
    kindsQ.execute(
      "SELECT DISTINCT query_kind FROM system.query_log WHERE query_kind!='' ORDER BY query_kind",
    );
    typesQ.execute("SELECT DISTINCT type FROM system.query_log ORDER BY type");
    codesQ.execute(
      "SELECT DISTINCT exception_code FROM system.query_log WHERE exception_code!=0 ORDER BY exception_code",
    );
    usersQ.execute(
      "SELECT DISTINCT initial_user FROM system.query_log WHERE initial_user!='' ORDER BY initial_user",
    );
  }, []);

  useEffect(() => {
    if (searchQ.error) toast.error(searchQ.error);
  }, [searchQ.error]);

  function handleSearch(e) {
    e.preventDefault();
    const fd = toDatePart(from),
      td = toDatePart(to);
    const conds = [
      `event_date BETWEEN '${fd}' AND '${td}'`,
      `event_time BETWEEN '${from}' AND '${to}'`,
    ];
    if (queryKind) conds.push(`query_kind='${queryKind}'`);
    if (queryType) conds.push(`type='${queryType}'`);
    if (exceptionCode) conds.push(`exception_code=${exceptionCode}`);
    if (exceptionText.trim())
      conds.push(`exception LIKE '%${exceptionText.trim()}%'`);
    if (isInitial === "yes") conds.push("is_initial_query=1");
    if (isInitial === "no") conds.push("is_initial_query=0");
    if (initialUser) conds.push(`initial_user='${initialUser}'`);
    setSubmitted(true);
    setFiltersOpen(false);
    searchQ.execute(
      `SELECT toString(event_time) AS event_time, type, query_kind, query_duration_ms, read_rows, read_bytes, written_rows, written_bytes, result_rows, result_bytes, formatReadableSize(memory_usage) AS memory, exception_code, initial_user, substring(query,1,200) AS query_preview FROM system.query_log WHERE ${conds.join(" AND ")} ORDER BY ${sortField} ${sortDir} LIMIT 500`,
    );
  }

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

  const SORTS = [
    { k: "event_time", l: "Event Time" },
    { k: "query_duration_ms", l: "Duration" },
    { k: "read_rows", l: "Read Rows" },
    { k: "read_bytes", l: "Read Bytes" },
    { k: "written_rows", l: "Written Rows" },
    { k: "written_bytes", l: "Written Bytes" },
    { k: "result_rows", l: "Result Rows" },
    { k: "result_bytes", l: "Result Bytes" },
    { k: "memory_usage", l: "Memory" },
  ];

  const widthStyle = {
    width: `${(window?.innerWidth - (sidebar ? 250 : 1200)) / (sidebar ? 8 : 5)}px`,
  };
  const widthStyle_2 = {
    width: `${(window?.innerWidth - (sidebar ? 450 : 900)) / (sidebar ? 4 : 3)}px `,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 15,
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "15px",
          }}
        >
          <Icon className="ti ti-search" style={{ fontSize: "15px" }}></Icon>Search
        </label>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Icon
            className={`ti ${filtersOpen ? "ti-chevron-up" : "ti-chevron-down"}`}
          ></Icon>{" "}
          {filtersOpen ? "Collapse" : "Expand"} Filters
        </button>
      </div>
      {filtersOpen && (
        <div className="card" style={{ padding: "20px", marginBottom: "20px" }}>
          <form onSubmit={handleSearch}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                marginBottom: "30px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-around",
                  width: "24rem",
                }}
              >
                <div
                  style={{
                    width: `${(window?.innerWidth - (sidebar ? 150 : 300)) / 5}px `,
                  }}
                >
                  {" "}
                  <DateTimePicker
                    label="From (required)"
                    value={from}
                    onChange={handleDateOnChange}
                    name="From"
                  />
                </div>
                <div
                  style={{
                    width: `${(window?.innerWidth - (sidebar ? 150 : 300)) / 5}px `,
                  }}
                >
                  {" "}
                  <DateTimePicker
                    label="To (required)"
                    value={to}
                    onChange={handleDateOnChange}
                    name="To"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  width: "16rem",
                  flexWrap: "wrap",
                }}
              >
                <div className="form-group">
                  <label className="form-label">Exception Code</label>
                  <Select
                    className="form-select"
                    value={exceptionCode}
                    onChange={(e) => setExceptionCode(e.target.value)}
                  >
                    <option value="">All</option>
                    {codesQ.data?.map((r) => (
                      <option key={r.exception_code}>{r.exception_code}</option>
                    ))}
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">Is Initial</label>
                  <Select
                    className="form-select"
                    value={isInitial}
                    onChange={(e) => setIsInitial(e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  width: "16rem",
                  flexWrap: "wrap",
                }}
              >
                <div className="form-group">
                  <label className="form-label">Initial User</label>
                  <Select
                    className="form-select"
                    value={initialUser}
                    onChange={(e) => setInitialUser(e.target.value)}
                  >
                    <option value="">All</option>
                    {usersQ.data?.map((r) => (
                      <option key={r.initial_user}>{r.initial_user}</option>
                    ))}
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">Direction</label>
                  <Select
                    className="form-select"
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value)}
                  >
                    <option value="DESC">Desc</option>
                    <option value="ASC">Asc</option>
                  </Select>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  width: "16rem",
                  flexWrap: "wrap",
                }}
              >
                <div className="form-group">
                  <label className="form-label">Sort By</label>
                  <Select
                    className="form-select"
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                  >
                    {SORTS.map((s) => (
                      <option key={s.k} value={s.k}>
                        {s.l}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="form-group">
                  <label className="form-label">Query Kind</label>
                  <Select
                    className="form-select"
                    value={queryKind}
                    onChange={(e) => setQueryKind(e.target.value)}
                  >
                    <option value="">All</option>
                    {kindsQ.data?.map((r) => (
                      <option key={r.query_kind}>{r.query_kind}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "14px",
                marginBottom: "30px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  width: "42rem",
                }}
              >
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <Select
                    style={widthStyle_2}
                    className="form-select"
                    value={queryType}
                    onChange={(e) => setQueryType(e.target.value)}
                  >
                    <option value="">All</option>
                    {typesQ.data?.map((r) => (
                      <option key={r.type}>{r.type}</option>
                    ))}
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">Exception (text)</label>
                  <input
                    className="form-input"
                    value={exceptionText}
                    style={widthStyle_2}
                    onChange={(e) => setExceptionText(e.target.value)}
                    placeholder="partial..."
                  />
                </div>
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={searchQ.loading}
              >
                {searchQ.loading ? (
                  <>
                    <span className="loading-spinner"></span> Searching...
                  </>
                ) : (
                  <>
                    <Icon className="ti ti-search"></Icon> Search
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
      {submitted && !searchQ.loading && (
        <DataTable
          rows={searchQ.data || []}
          columns={[
            "event_time",
            "type",
            "query_kind",
            "query_duration_ms",
            "read_rows",
            "read_bytes",
            "memory",
            "exception_code",
            "initial_user",
            "query_preview",
          ]}
          emptyMessage="No entries found."
          variant="single"
        />
      )}
    </div>
  );
}
