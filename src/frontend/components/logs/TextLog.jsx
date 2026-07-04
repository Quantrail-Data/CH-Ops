// TextLog - View and search ClickHouse® text logs with log level awareness
//
// Renders system.text_log with two modes: Overview and Search. The Overview
// is a metrics dashboard (time range only): stat cards (total lines, error
// level count, warnings, distinct loggers, last error), log volume by level
// over time as a stacked area, a level-distribution donut, the noisiest
// loggers by error and warning count, and the most frequent message
// templates (grouped by message_format_string so unique values do not
// explode). The Search view filters by multiple log levels, message text,
// and time range.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "../../hooks/useQuery.js";
import { runQuery } from "../../utils/api.js";
import { DateTimePicker } from "../layout/DateTimePicker.jsx";
import { useToast } from "../layout/Toast.jsx";
import DataTable from "../layout/DataTable.jsx";
import { initChart, disposeChart, withZoomable } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";

const pad = (n) => String(n).padStart(2, "0");
const fmtAgo = (h) => {
  const d = new Date(Date.now() - h * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const LOG_LEVELS = [
  "Fatal",
  "Critical",
  "Error",
  "Warning",
  "Notice",
  "Information",
  "Debug",
  "Trace",
  "Test",
];

export default function TextLog() {
  const { tab: routeTab = "overview" } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/logs/text/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-file-text"></Icon> Text Log
        </h2>
      </div>
      <div className="tab-bar">
        <div
          className={`tab-item ${routeTab === "overview" ? "active" : ""}`}
          onClick={() => handleTabChange("overview")}
        >
          <Icon className="ti ti-chart-dots-3"></Icon> Overview
        </div>
        <div
          className={`tab-item ${routeTab === "search" ? "active" : ""}`}
          onClick={() => handleTabChange("search")}
        >
          <Icon className="ti ti-search"></Icon> Search
        </div>
      </div>
      {routeTab === "overview" && <TextLogOverview />}
      {routeTab === "search" && <TextLogSearch />}
    </div>
  );
}

/* Overview dashboard */

const RANGE_HOURS = { "1h": 1, "6h": 6, "24h": 24, "48h": 48, "7d": 168, "30d": 720 };
const RANGE_ROUNDING = { "1h": 60, "6h": 300, "24h": 600, "48h": 1800, "7d": 3600, "30d": 21600 };
const PRESETS = ["1h", "6h", "24h", "48h", "7d", "30d"];

// Severity ordering (most severe first) and semantic colours per level. These
// fixed hues read on both themes, so they do not need CSS-variable resolution
// (which ECharts cannot do on canvas anyway).
const LEVEL_ORDER = ["Fatal", "Critical", "Error", "Warning", "Notice", "Information", "Debug", "Trace", "Test"];
// Level colours mirror the .log-row-<level> classes used on the Search page
// (global.css), so the Overview matches Search. They are theme-specific; ECharts
// cannot read CSS, so the hex values are duplicated here and re-resolved per
// theme (the charts recompute on theme change).
const LEVEL_COLORS_DARK = {
  Fatal: "#fb7185", Critical: "#f87171", Error: "#fca5a5", Warning: "#fdba74",
  Notice: "#fde68a", Information: "#60a5fa", Debug: "#93c5fd", Trace: "#6ee7b7", Test: "#86efac",
};
const LEVEL_COLORS_LIGHT = {
  Fatal: "#880e4f", Critical: "#b71c1c", Error: "#c62828", Warning: "#e65100",
  Notice: "#f57f17", Information: "#1565c0", Debug: "#0277bd", Trace: "#2e7d32", Test: "#1a5e1a",
};
function levelColor(lv) {
  const light = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
  const map = light ? LEVEL_COLORS_LIGHT : LEVEL_COLORS_DARK;
  return map[lv] || (light ? "#1565c0" : "#60a5fa");
}

// Bar palette for the noisy-loggers chart.
const PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

const fmtInt = (v) => (Number(v) || 0).toLocaleString("en-US");

// Time x-axis: real spacing, ~3 non-overlapping labels (hideOverlap), colours
// from the registered ECharts theme (chart remounts on theme change).
function timeAxis(from, to) {
  const min = from ? new Date(from.replace(" ", "T")).getTime() : undefined;
  const max = to ? new Date(to.replace(" ", "T")).getTime() : undefined;
  return {
    type: "time", min, max, splitNumber: 3,
    axisLabel: {
      hideOverlap: true,
      formatter: (ms) => {
        const d = new Date(ms);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      },
    },
  };
}

// Pivot long-format level rows ({ t, level, v }) into one zero-filled stacked
// band per level, ordered by severity, coloured semantically. Zero-fill is
// done here (not via SQL WITH FILL) to dodge the per-group fill trap. Levels
// with no events in range are dropped.
function buildLevelSeries(rows, from, to, rounding) {
  const r = Number(rounding) || 3600;
  const fromSec = from ? Math.floor(new Date(from.replace(" ", "T")).getTime() / 1000) : 0;
  const toSec = to ? Math.floor(new Date(to.replace(" ", "T")).getTime() / 1000) : 0;
  const b0 = Math.floor(fromSec / r) * r;
  const b1 = Math.floor(toSec / r) * r;
  const buckets = [];
  for (let b = b0; b <= b1; b += r) buckets.push(b);

  const perLevel = new Map();
  const present = new Set();
  for (const row of rows) {
    const lv = String(row.level);
    const tt = Number(row.t);
    const v = Number(row.v) || 0;
    present.add(lv);
    let m = perLevel.get(lv);
    if (!m) { m = new Map(); perLevel.set(lv, m); }
    m.set(tt, (m.get(tt) || 0) + v);
  }
  // Severity order first, then any unexpected levels appended.
  const names = [
    ...LEVEL_ORDER.filter((l) => present.has(l)),
    ...[...present].filter((l) => !LEVEL_ORDER.includes(l)),
  ];
  const series = names.map((name) => {
    const c = levelColor(name);
    const m = perLevel.get(name) || new Map();
    return {
      name, type: "line", stack: "total", smooth: false, symbol: "none",
      itemStyle: { color: c },
      lineStyle: { color: c, width: 1 },
      areaStyle: { color: c, opacity: 0.3 },
      emphasis: { focus: "series" },
      data: buckets.map((b) => [b * 1000, m.get(b) || 0]),
    };
  });
  const legendItems = names.map((name) => ({ name, color: levelColor(name) }));
  return { series, names, legendItems };
}

// Donut of level distribution. Donut sits left, legend scrolls on the right,
// so slices, labels, and legend never overlap.
function levelDonutOption(rows) {
  const data = rows
    .map((r) => ({ name: String(r.level), value: Number(r.v) || 0 }))
    .filter((d) => d.value > 0);
  return {
    tooltip: {
      trigger: "item", confine: true,
      formatter: (p) => `${p.name}: ${fmtInt(p.value)} (${p.percent}%)`,
    },
    legend: {
      type: "scroll", orient: "vertical", right: 6, top: "middle",
      itemWidth: 11, itemHeight: 11, textStyle: { fontSize: 11 },
    },
    series: [{
      type: "pie", radius: ["42%", "68%"], center: ["32%", "50%"],
      avoidLabelOverlap: true, label: { show: true, formatter: '{b} ({d}%)', color: 'inherit', fontSize: 11 }, labelLine: { show: true },
      data: data.map((d) => ({ ...d, itemStyle: { color: levelColor(d.name) } })),
    }],
  };
}

// Horizontal bar option for a scrollable list. The value axis sits on top so
// it is visible at the initial scroll position; per-bar value labels mean the
// exact count is always readable even once the axis scrolls out of view.
function scrollBarOption(rows, labelKey, valueKey) {
  const data = rows.map((r) => ({ name: String(r[labelKey]), v: Number(r[valueKey]) || 0 }));
  const maxV = data.reduce((a, d) => Math.max(a, d.v), 0);
  const axMax = maxV > 0 ? Math.ceil(maxV * 1.15) : 1;
  return {
    grid: { left: 8, right: 40, top: 28, bottom: 8, containLabel: true },
    // Scrolls inside a fixed viewport with a top-anchored value axis; opt out of
    // the shared toolbox so it neither overlaps the axis nor scrolls out of view.
    toolbox: { show: false },
    tooltip: {
      trigger: "axis", confine: true, axisPointer: { type: "shadow" },
      formatter: (p) => `${p[0].name}: ${fmtInt(p[0].value)}`,
    },
    xAxis: { type: "value", position: "top", max: axMax, minInterval: 1 },
    yAxis: {
      type: "category", inverse: true,
      data: data.map((d) => d.name),
      axisLabel: { width: 150, overflow: "truncate" },
    },
    series: [{
      type: "bar", barMaxWidth: 18,
      label: { show: true, position: "right", formatter: (p) => fmtInt(p.value), fontSize: 11 },
      data: data.map((d, i) => ({
        value: d.v,
        itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 3, 3, 0] },
      })),
    }],
  };
}

// Fixed-height card whose horizontal bar list scrolls vertically when there are
// more rows than fit. The ECharts canvas is sized to the natural height of all
// rows (rowHeight each) inside a fixed-height scroll viewport; with few rows it
// just fills the viewport (no scroll). Remounts on theme change via the parent
// key, which re-resolves the registered-theme colours.
function ScrollBarChart({ title, rows, labelKey, valueKey, rowHeight = 32, viewHeight = 320 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const tools = useChartTools(() => chartRef.current, { filename: title });
  const innerHeight = Math.max(viewHeight - 6, rows.length * rowHeight);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = initChart(containerRef.current);
    chartRef.current = chart;
    chart.setOption(scrollBarOption(rows, labelKey, valueKey), true);
    setTimeout(() => chartRef.current && chartRef.current.resize(), 50);
    return () => { disposeChart(containerRef.current); chartRef.current = null; };
  }, [rows, labelKey, valueKey, innerHeight]);

  return (
    <div className="card" style={tools.fullscreen ? { padding: 16, position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-page)", display: "flex", flexDirection: "column" } : { padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>{title}</span>
        <ChartToolbar fullscreen={tools.fullscreen} onSave={tools.save} onToggleFullscreen={tools.toggleFullscreen} />
      </div>
      <div style={{ height: tools.fullscreen ? "calc(100vh - 96px)" : viewHeight, overflowY: "auto", overflowX: "hidden", flex: tools.fullscreen ? 1 : undefined }}>
        <div ref={containerRef} style={{ height: innerHeight, width: "100%" }} />
      </div>
    </div>
  );
}

function Stat({ label, value, icon, color, small }) {
  return (
    <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14, minHeight: 84 }}>
      {icon && <Icon className={`ti ${icon}`} style={{ fontSize: 28, color: color || "var(--accent)", opacity: 0.9, flexShrink: 0 }}></Icon>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: small ? "1.05rem" : "1.5rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      </div>
    </div>
  );
}

function SectionError({ title, message }) {
  return (
    <div className="card" style={{ padding: 16, minHeight: 100, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "var(--color-danger)", fontSize: "13px", lineHeight: 1.5, wordBreak: "break-word" }}>
        <Icon className="ti ti-alert-circle" style={{ flexShrink: 0, marginTop: 2 }}></Icon>
        <span>{message}</span>
      </div>
    </div>
  );
}

// Stacked-area chart with a right-side legend that scrolls vertically, so it
// stays clear of the plot and never overlaps the axis. Visibility is driven by
// legend.selected via a merge setOption, preserving zoom. Remounts on theme
// change (parent keys it by themeKey), which also resets the toggles.
function StackedAreaChart({ title, series, names, legendItems, from, to }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const saTools = useChartTools(() => chartRef.current, { filename: title });

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = initChart(containerRef.current);
    chartRef.current = chart;
    chart.setOption({
      grid: { left: 12, right: 16, top: 16, bottom: 36, containLabel: true },
      tooltip: {
        trigger: "axis", confine: true,
        formatter: (ps) => {
          if (!ps || !ps.length) return "";
          const ms = ps[0].value && ps[0].value[0];
          const d = new Date(ms);
          const head = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          const items = ps
            .map((p) => ({ n: p.seriesName, v: Number(p.value && p.value[1]) || 0, m: p.marker }))
            .filter((it) => it.v > 0)
            .sort((a, b) => b.v - a.v);
          const total = items.reduce((a, it) => a + it.v, 0);
          const top = items.slice(0, 12).map((it) => `${it.m}${it.n}: ${fmtInt(it.v)}`).join("<br/>");
          const more = items.length > 12 ? `<br/>+${items.length - 12} more` : "";
          return `${head}<br/>${top}${more}<br/><b>Total: ${fmtInt(total)}</b>`;
        },
      },
      legend: { show: false, data: names, selected: Object.fromEntries(names.map((n) => [n, true])) },
      toolbox: { show: false },
      dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }],
      xAxis: timeAxis(from, to),
      yAxis: { type: "value" },
      series,
    }, true);
    setTimeout(() => chartRef.current && chartRef.current.resize(), 50);
    return () => { disposeChart(containerRef.current); chartRef.current = null; };
  }, [series, names, from, to]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({
      legend: { selected: Object.fromEntries(names.map((n) => [n, !hidden.has(n)])) },
    });
  }, [hidden, names]);

  useEffect(() => {
    const t = setTimeout(() => chartRef.current && chartRef.current.resize(), 150);
    if (!fullscreen) return () => clearTimeout(t);
    const onKey = (e) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [fullscreen]);

  const toggle = (name) => setHidden((prev) => {
    const n = new Set(prev);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });
  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(names));

  const chartH = fullscreen ? "calc(100vh - 130px)" : 428;

  return (
    <div style={fullscreen
      ? { position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-page)", padding: 16, display: "flex", flexDirection: "column" }
      : { position: "relative" }}>
      <div className="card" style={{ padding: 16, flex: fullscreen ? 1 : undefined, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>{title}</span>
          <ChartToolbar
            zoomable
            fullscreen={fullscreen}
            onZoomIn={saTools.zoomIn}
            onZoomOut={saTools.zoomOut}
            onZoomReset={saTools.zoomReset}
            onSave={saTools.save}
            onToggleFullscreen={() => setFullscreen((f) => !f)}
          />
        </div>
        <div style={{ display: "flex", gap: 12, flex: fullscreen ? 1 : undefined, minHeight: 0 }}>
          <div ref={containerRef} style={{ flex: 1, minWidth: 0, height: fullscreen ? "100%" : chartH }} />
          <div style={{ width: 196, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, height: fullscreen ? "100%" : chartH, borderLeft: "1px solid var(--border-default)", paddingLeft: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexShrink: 0 }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Series ({names.length})</span>
              <span style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: "11px", padding: "2px 7px" }} onClick={showAll}>All</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: "11px", padding: "2px 7px" }} onClick={hideAll}>None</button>
              </span>
            </div>
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 1, paddingRight: 4 }}>
              {legendItems.map((it) => {
                const off = hidden.has(it.name);
                return (
                  <button
                    key={it.name}
                    onClick={() => toggle(it.name)}
                    title={it.name}
                    style={{ display: "flex", alignItems: "center", gap: 7, background: "transparent", border: "none", cursor: "pointer", padding: "3px 4px", borderRadius: 4, opacity: off ? 0.4 : 1, textAlign: "left", width: "100%" }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color, flexShrink: 0, filter: off ? "grayscale(1)" : "none" }} />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Plain (non-scrolling) chart card whose wrapper matches ScrollBarChart exactly
// (same padding, same title row, same fixed body height), so the two can sit
// side by side at identical height. Init/setOption mirrors ChartCard; the parent
// remounts it on theme change via the key, re-resolving theme colours.
function PlainChartCard({ title, option, height = 320 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const tools = useChartTools(() => chartRef.current, { filename: title });

  const pieChartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };


  useEffect(() => {
    if (!containerRef.current) return;
    const chart = initChart(containerRef.current);
    chartRef.current = chart;
    if (option) {
      chart.setOption(withZoomable({ ...option, toolbox: { show: false } }), true);
      setTimeout(() => chartRef.current && chartRef.current.resize(), 50);
    }
    return () => { disposeChart(containerRef.current); chartRef.current = null; };
  }, []);
  useEffect(() => {
    if (!chartRef.current || !option) return;
    chartRef.current.setOption(withZoomable({ ...option, toolbox: { show: false } }), true);
    setTimeout(() => chartRef.current && chartRef.current.resize(), 50);
  }, [option]);
  return (
    <div className="card" style={tools.fullscreen ? { padding: 16, position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-page)", display: "flex", flexDirection: "column" } : { padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>{title}</span>
        <ChartToolbar zoomable={!!option?.xAxis} fullscreen={tools.fullscreen} onZoomIn={tools.zoomIn} onZoomOut={tools.zoomOut} onZoomReset={tools.zoomReset} onSave={tools.save} onToggleFullscreen={tools.toggleFullscreen} isWantFeature={pieChartControlsFlags} />
      </div>
      <div ref={containerRef} style={{ height: tools.fullscreen ? "calc(100vh - 96px)" : height, width: "100%", flex: tools.fullscreen ? 1 : undefined }} />
    </div>
  );
}

function TextLogOverview() {
  const [duration, setDuration] = useState("24h");
  const [from, setFrom] = useState(fmtAgo(24));
  const [to, setTo] = useState(fmtNow());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState({ summary: [], trend: [], dist: [], loggers: [], messages: [], rng: { from: null, to: null, r: 3600 } });
  const [errs, setErrs] = useState({});
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  function applyDuration(d) {
    setDuration(d);
    setFrom(fmtAgo(RANGE_HOURS[d] || 24));
    setTo(fmtNow());
  }

  const load = useCallback(async () => {
    setLoading(true);
    const r = RANGE_ROUNDING[duration] || 3600;
    const f = from, t = to;
    const next = { summary: [], trend: [], dist: [], loggers: [], messages: [], rng: { from: f, to: t, r } };
    const e = {};
    const where = `event_time BETWEEN '${f}' AND '${t}'`;

    try {
      const res = await runQuery(`SELECT count() AS total, countIf(level IN ('Fatal','Critical','Error')) AS errors, countIf(level = 'Warning') AS warnings, uniqExact(logger_name) AS loggers, maxIf(event_time, level IN ('Fatal','Critical','Error')) AS last_error FROM system.text_log WHERE ${where}`);
      next.summary = res.rows || [];
    } catch (err) { e.summary = err.message || "Query failed"; }

    try {
      const res = await runQuery(`SELECT toStartOfInterval(event_time, INTERVAL ${r} SECOND)::INT AS t, level, count() AS v FROM system.text_log WHERE ${where} GROUP BY t, level`);
      next.trend = res.rows || [];
    } catch (err) { e.trend = err.message || "Query failed"; }

    try {
      const res = await runQuery(`SELECT level, count() AS v FROM system.text_log WHERE ${where} GROUP BY level ORDER BY v DESC`);
      next.dist = res.rows || [];
    } catch (err) { e.dist = err.message || "Query failed"; }

    try {
      const res = await runQuery(`SELECT logger_name AS logger, countIf(level IN ('Fatal','Critical','Error','Warning')) AS issues, count() AS total FROM system.text_log WHERE ${where} GROUP BY logger ORDER BY issues DESC, total DESC LIMIT 15`);
      next.loggers = res.rows || [];
    } catch (err) { e.loggers = err.message || "Query failed"; }

    try {
      const res = await runQuery(`SELECT message_format_string AS template, count() AS cnt, min(level) AS severity, any(message) AS sample FROM system.text_log WHERE ${where} AND message_format_string != '' GROUP BY template ORDER BY cnt DESC LIMIT 50`);
      next.messages = res.rows || [];
    } catch (err) { e.messages = err.message || "Query failed"; }

    setData(next);
    setErrs(e);
    setLoaded(true);
    setLoading(false);
  }, [from, to, duration]);

  const summaryRow = data.summary?.[0] || {};
  const total = Number(summaryRow.total) || 0;
  const errors = Number(summaryRow.errors) || 0;
  const warnings = Number(summaryRow.warnings) || 0;
  const loggers = Number(summaryRow.loggers) || 0;
  const rawLast = summaryRow.last_error;
  const lastError = errors > 0 && rawLast && !String(rawLast).startsWith("1970") ? rawLast : "-";

  const hasData = total > 0;
  const hasErrs = Object.keys(errs).length > 0;
  const rng = data.rng || { from, to, r: 3600 };

  const trend = useMemo(
    () => buildLevelSeries(data.trend, rng.from, rng.to, rng.r),
    [data.trend, rng.from, rng.to, rng.r, themeKey],
  );

  const messageRows = (data.messages || []).map((r) => ({
    severity: String(r.severity || ""),
    count: Number(r.cnt) || 0,
    template: String(r.template || ""),
    sample: String(r.sample || ""),
  }));

  // severity (coloured) and count are short. template and sample are left to
  // DataTable so they truncate and expand on click, the same as Search.
  const cellRenderers = {
    count: (v) => fmtInt(v),
    severity: (v) => (
      <span style={{ color: levelColor(v), fontWeight: 600, fontSize: "13px" }}>{v || "-"}</span>
    ),
  };

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-group">
          <label className="form-label">Quick</label>
          <div style={{ display: "flex", gap: 4 }}>
            {PRESETS.map((d) => (
              <button
                key={d}
                className={`btn btn-sm ${duration === d ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "8px 12px", minWidth: 48 }}
                onClick={() => applyDuration(d)}
              >{d}</button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ padding: "8px 14px" }} onClick={load} disabled={loading}>
          {loading ? <><span className="loading-spinner"></span> Loading...</> : <><Icon className="ti ti-player-play"></Icon> Load</>}
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><span className="loading-spinner"></span></div>
      ) : !loaded ? (
        <div className="empty-state"><Icon className="ti ti-player-play" style={{ color: "#fb923c" }}></Icon><p>Select a time range and click Load.</p></div>
      ) : !hasData && !hasErrs ? (
        <div className="empty-state"><Icon className="ti ti-file-text" style={{ color: "#60a5fa" }}></Icon><p>No log entries in the selected range.</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <Stat label="Total Lines" value={fmtInt(total)} icon="ti-file-text" color="var(--accent)" />
            <Stat label="Errors" value={fmtInt(errors)} icon="ti-alert-triangle" color="var(--color-danger)" />
            <Stat label="Warnings" value={fmtInt(warnings)} icon="ti-alert-hexagon" color="var(--color-warning)" />
            <Stat label="Loggers" value={fmtInt(loggers)} icon="ti-category" color="var(--color-info)" />
            <Stat label="Last Error" value={lastError} icon="ti-clock" color="var(--text-secondary)" small />
          </div>

          {errs.trend
            ? <SectionError title="Log Volume by Level" message={errs.trend} />
            : trend.series.length
              ? <StackedAreaChart key={`trend-${themeKey}`} title="Log Volume by Level" series={trend.series} names={trend.names} legendItems={trend.legendItems} from={rng.from} to={rng.to} />
              : null}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(0, 1.4fr)", gap: 16 }}>
            {errs.dist
              ? <SectionError title="Level Distribution" message={errs.dist} />
              : data.dist.length
                ? <PlainChartCard key={`dist-${themeKey}`} title="Level Distribution" height={400} option={levelDonutOption(data.dist)} />
                : null}
            {errs.loggers
              ? <SectionError title="Noisiest Loggers (errors + warnings)" message={errs.loggers} />
              : data.loggers.length
                ? <ScrollBarChart key={`loggers-${themeKey}`} title="Noisiest Loggers (errors + warnings)" rows={data.loggers} labelKey="logger" valueKey="issues" />
                : <div className="card" style={{ padding: 16 }}><div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Noisiest Loggers (errors + warnings)</div><div style={{ color: "var(--text-muted)", fontSize: "14px" }}>No errors or warnings in range.</div></div>}
          </div>

          {errs.messages
            ? <SectionError title="Most Frequent Messages" message={errs.messages} />
            : (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Most Frequent Messages</div>
                <div className="ov-log-table">
                  <DataTable
                    rows={messageRows}
                    columns={["severity", "count", "template", "sample"]}
                    cellRenderers={cellRenderers}
                    variant="single"
                    s_no={true}
                    maxHeight={460}
                    emptyMessage="No templated messages in range."
                  />
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function TextLogSearch() {
  const toast = useToast();
  const [from, setFrom] = useState(fmtAgo(24));
  const [to, setTo] = useState(fmtNow());
  const [levels, setLevels] = useState([
    "Fatal",
    "Critical",
    "Error",
    "Warning",
  ]);
  const [message, setMessage] = useState("");
  const [rowLimit, setRowLimit] = useState(500);
  const [submitted, setSubmitted] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const q = useQuery();

  useEffect(() => {
    if (q.error) toast.error(q.error);
  }, [q.error]);

  function toggleLevel(lv) {
    setLevels((prev) =>
      prev.includes(lv) ? prev.filter((l) => l !== lv) : [...prev, lv],
    );
  }
  function selectAll() {
    setLevels([...LOG_LEVELS]);
  }
  function selectNone() {
    setLevels([]);
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!levels.length) return;
    const conds = [
      `event_time BETWEEN '${from}' AND '${to}'`,
      `level IN (${levels.map((l) => `'${l}'`).join(",")})`,
    ];
    if (message.trim()) conds.push(`message LIKE '%${message.trim()}%'`);
    setSubmitted(true);
    setFiltersOpen(false);
    await q.execute(
      `SELECT event_time_microseconds, level, query_id, logger_name, message, source_file, source_line FROM system.text_log WHERE ${conds.join(" AND ")} ORDER BY event_time DESC LIMIT ${rowLimit}`,
    );
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

  return (
    <div>
      {/* <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setFiltersOpen(!filtersOpen)}><Icon className={`ti ${filtersOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}></Icon> {filtersOpen ? 'Collapse' : 'Expand'} Filters</button>
      </div> */}
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
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <form onSubmit={handleSearch}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <DateTimePicker
                label="From *"
                value={from}
                onChange={handleDateOnChange}
                name="From"
              />
              <DateTimePicker
                label="To *"
                value={to}
                onChange={handleDateOnChange}
                name="To"
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label" style={{ marginBottom: 6 }}>
                Log Levels *{" "}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectAll}
                  style={{ fontSize: "12px" }}
                >
                  All
                </button>{" "}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectNone}
                  style={{ fontSize: "12px" }}
                >
                  None
                </button>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {LOG_LEVELS.map((lv) => (
                  <label
                    key={lv}
                    className={`log-row-${lv.toLowerCase()}`}
                    style={{
                      display: "flex",
                      gap: 4,
                      fontSize: "13px",
                      cursor: "pointer",
                      padding: "3px 10px",
                      borderRadius: 4,
                      border: levels.includes(lv)
                        ? "2px solid currentColor"
                        : "2px solid transparent",
                      opacity: levels.includes(lv) ? 1 : 0.4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={levels.includes(lv)}
                      onChange={() => toggleLevel(lv)}
                      style={{ accentColor: "currentColor" }}
                    />
                    {lv}
                  </label>
                ))}
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div className="form-group">
                <label className="form-label">Message (text)</label>
                <input
                  className="form-input"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="partial..."
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                alignItems: "flex-end",
              }}
            >
              <div className="form-group">
                <label className="form-label">Row Limit</label>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={100000}
                  value={rowLimit}
                  onChange={(e) => setRowLimit(parseInt(e.target.value) || 500)}
                  style={{ width: 100 }}
                />
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={q.loading || !levels.length}
              >
                {q.loading ? (
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
      {submitted && !q.loading && (
        <div className="data-table-wrap dt-single">
          <table className="data-table">
            <thead>
              <tr>
                <th>S.No</th>

                {[
                  "event_time_microseconds",
                  "level",
                  "query_id",
                  "logger_name",
                  "message",
                  "source_file",
                  "source_line",
                ].map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {(q.data || []).map((row, i) => {
                const isExpanded = expandedRow === i;

                const clipStyle = isExpanded
                  ? {
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }
                  : {
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 300,
                    };

                return (
                  <tr
                    key={i}
                    className={`log-row-${(row.level || "").toLowerCase()}`}
                    onClick={() => setExpandedRow(isExpanded ? null : i)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{i + 1}</td>

                    {[
                      "event_time_microseconds",
                      "level",
                      "query_id",
                      "logger_name",
                      "message",
                      "source_file",
                      "source_line",
                    ].map((c) => (
                      <td
                        key={c}
                        style={
                          c === "message"
                            ? {
                                ...clipStyle,
                                maxWidth: isExpanded ? "none" : 400,
                              }
                            : clipStyle
                        }
                      >
                        {String(row[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {(!q.data || q.data.length === 0) && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      color: "var(--text-muted)",
                      padding: 32,
                    }}
                  >
                    No entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
