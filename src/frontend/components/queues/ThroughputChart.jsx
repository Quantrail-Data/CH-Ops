//@author: Sanjeev Kumar G
// ThroughputChart.jsx
// Ingestion throughput over time. Stacked bars (processed/failed) + rows line.
// Uses the shared ECharts wrapper so it matches the rest of CHOps.

import React, { useEffect, useRef } from "react";
import Icon from "../common/Icon.jsx";
import { initChart, disposeChart } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";

// Read a CSS variable's current value (so theme switches are respected).
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fallback;
}

export default function ThroughputChart({ points }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const tools = useChartTools(() => chartRef.current, { filename: "ingestion-throughput" });
  const has = Array.isArray(points) && points.length > 0;

  useEffect(() => {
    // The chart element is always mounted (so init/dispose stay balanced); when
    // there is no data we simply leave it blank and show the n.a. overlay.
    if (!elRef.current || !has) return;
    if (!chartRef.current) chartRef.current = initChart(elRef.current);

    const axis = cssVar("--text-muted", "#94a3b8");
    const grid = cssVar("--border-default", "#334155");
    const ok = cssVar("--color-success", "#22c55e");
    const bad = cssVar("--color-danger", "#ef4444");
    const accent = cssVar("--accent", "#8b5cf6");

    const labels = points.map((p) => p.bucket);
    // Show only 4 x-axis labels (first, last, and 2 evenly spaced between) so the
    // axis stays readable no matter how many time buckets there are.
    const lastIdx = labels.length - 1;
    const tickIdx = new Set(
      lastIdx <= 0
        ? [0]
        : [0, Math.round(lastIdx / 3), Math.round((lastIdx * 2) / 3), lastIdx]
    );
    try {
      chartRef.current.setOption({
        // HTML ChartToolbar handles controls; suppress the auto-injected ECharts
        // toolbox and add a programmatic inside dataZoom for the zoom buttons.
        toolbox: { show: false },
        dataZoom: [{ type: "inside", zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false }],
        grid: { left: 48, right: 56, top: 28, bottom: 28 },
        tooltip: { trigger: "axis" },
        legend: {
          data: ["Processed", "Failed", "Rows"],
          textStyle: { color: axis }, top: 0,
        },
        xAxis: {
          type: "category", data: labels,
          axisLabel: {
            color: axis, fontSize: 10,
            interval: (index) => tickIdx.has(index),
            showMinLabel: true, showMaxLabel: true,
          },
          axisLine: { lineStyle: { color: grid } },
        },
        yAxis: [
          {
            type: "value", name: "Files",
            axisLabel: { color: axis }, nameTextStyle: { color: axis },
            splitLine: { lineStyle: { color: grid, opacity: 0.4 } },
          },
          {
            type: "value", name: "Rows",
            axisLabel: { color: axis }, nameTextStyle: { color: axis },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: "Processed", type: "bar", stack: "files",
            data: points.map((p) => Number(p.processed || 0)),
            itemStyle: { color: ok },
          },
          {
            name: "Failed", type: "bar", stack: "files",
            data: points.map((p) => Number(p.failed || 0)),
            itemStyle: { color: bad },
          },
          {
            name: "Rows", type: "line", yAxisIndex: 1, smooth: true,
            data: points.map((p) => Number(p.rows_ingested || 0)),
            itemStyle: { color: accent }, lineStyle: { color: accent },
            symbol: "none",
          },
        ],
      }, true);
    } catch (e) {
      // Bad/partial data must never crash the page; the overlay covers it.
      console.error("ThroughputChart render skipped:", e.message);
    }
  }, [points, has]);

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
      {has && (
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
      {!has && (
        <div className="queue-na queue-na-overlay">
          <Icon className="ti ti-chart-bar-off"></Icon> n.a. (no ingestion in this range)
        </div>
      )}
    </div>
  );
}
