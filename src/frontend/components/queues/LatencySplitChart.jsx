//@author: Sanjeev Kumar G
// LatencySplitChart.jsx
// Where does ingestion time go? Fetch (object storage) vs Process (ClickHouse)
// vs Commit (Keeper), at p50 and p95. Unavailable stages are labeled, not zeroed.

import React, { useEffect, useRef } from "react";
import Icon from "../common/Icon.jsx";
import { initChart, disposeChart } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fallback;
}

const STAGES = [
  { key: "fetch", label: "Fetch (object storage)" },
  { key: "process", label: "Process (ClickHouse)" },
  { key: "commit", label: "Commit (Keeper)" },
];

// A stage is "available" if either p50 or p95 is a finite number.
function stageAvail(latency, key) {
  const v = latency && latency[key];
  return !!(v && (Number.isFinite(v.p50) || Number.isFinite(v.p95)));
}

export default function LatencySplitChart({ latency }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const tools = useChartTools(() => chartRef.current, { filename: "ingestion-latency" });
  // If no stage has data at all, there is nothing to plot: show n.a.
  const hasAny = STAGES.some((s) => stageAvail(latency, s.key));

  useEffect(() => {
    if (!elRef.current || !hasAny) return;
    if (!chartRef.current) chartRef.current = initChart(elRef.current);

    const axis = cssVar("--text-muted", "#94a3b8");
    const grid = cssVar("--border-default", "#334155");
    const c50 = cssVar("--accent", "#8b5cf6");
    const c95 = cssVar("--color-warning", "#f59e0b");

    const avail = (s) => stageAvail(latency, s.key);
    const categories = STAGES.map((s) => s.label);
    const p50 = STAGES.map((s) => (avail(s) ? Number(latency[s.key].p50 ?? 0) : 0));
    const p95 = STAGES.map((s) => (avail(s) ? Number(latency[s.key].p95 ?? 0) : 0));
    const unavailable = STAGES.map((s) => !avail(s));

    try {
      chartRef.current.setOption({
        toolbox: { show: false },
        dataZoom: [{ type: "inside", zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false }],
        grid: { left: 140, right: 24, top: 28, bottom: 16 },
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            const idx = params[0].dataIndex;
            if (unavailable[idx]) return `${categories[idx]}<br/>unavailable on this server`;
            return params
              .map((p) => `${p.seriesName}: ${Number(p.value || 0).toFixed(1)} ms`)
              .join("<br/>");
          },
        },
        legend: { data: ["p50", "p95"], textStyle: { color: axis }, top: 0 },
        xAxis: {
          type: "value", name: "ms",
          axisLabel: { color: axis }, nameTextStyle: { color: axis },
          splitLine: { lineStyle: { color: grid, opacity: 0.4 } },
        },
        yAxis: {
          type: "category", data: categories,
          axisLabel: {
            color: axis,
            formatter: (val, idx) => (unavailable[idx] ? `${val}  (unavailable)` : val),
          },
          axisLine: { lineStyle: { color: grid } },
        },
        series: [
          { name: "p50", type: "bar", data: p50, itemStyle: { color: c50 } },
          { name: "p95", type: "bar", data: p95, itemStyle: { color: c95 } },
        ],
      }, true);
    } catch (e) {
      console.error("LatencySplitChart render skipped:", e.message);
    }
  }, [latency, hasAny]);

  useEffect(() => {
    return () => {
      if (elRef.current) disposeChart(elRef.current);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => chartRef.current?.resize(), 150);
    return () => clearTimeout(t);
  }, [tools.fullscreen]);

  return (
    <div
      className="queue-chart-wrap"
      style={tools.fullscreen ? { position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-page)", padding: 16, display: "flex", flexDirection: "column" } : undefined}
    >
      {hasAny && (
        <ChartToolbar
          zoomable
          fullscreen={tools.fullscreen}
          onZoomIn={tools.zoomIn}
          onZoomOut={tools.zoomOut}
          onZoomReset={tools.zoomReset}
          onSave={tools.save}
          onToggleFullscreen={tools.toggleFullscreen}
        />
      )}
      <div ref={elRef} className="queue-chart" style={tools.fullscreen ? { flex: 1, minHeight: 0, height: "auto" } : undefined} />
      {!hasAny && (
        <div className="queue-na queue-na-overlay">
          <Icon className="ti ti-clock-off"></Icon> n.a. (no latency data in this range)
        </div>
      )}
    </div>
  );
}
