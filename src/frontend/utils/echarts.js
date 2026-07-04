// echarts.js - ECharts theme registry and chart lifecycle management
//
// Registers light and dark themes for ECharts with ClickHouse-friendly
// color palettes. Provides initChart() which creates a chart instance with
// automatic resize handling via ResizeObserver, and disposeChart() for
// cleanup. baseChartOption() returns a standard chart configuration with
// toolbox, dataZoom, and grid presets used across all dashboard charts.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import * as echarts from "echarts";

const LIGHT_COLORS = [
  "#0891b2",
  "#dc2626",
  "#7c3aed",
  "#d97706",
  "#16a34a",
  "#be185d",
  "#2563eb",
  "#65a30d",
  "#c2410c",
  "#4f46e5",
];
const DARK_COLORS = [
  "#22d3ee",
  "#f87171",
  "#a78bfa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#a3e635",
  "#fb923c",
  "#818cf8",
];

const makeTheme = (colors, isDark) => ({
  color: colors,
  backgroundColor: "transparent",
  title: { textStyle: { color: isDark ? "#f0f4f8" : "#1a1a2e" } },
  line: { lineStyle: { width: 1 }, symbolSize: 0, smooth: false },
  bar: {
    itemStyle: { barBorderWidth: 0 },
    label: {
      color: isDark ? "#cbd5e1" : "#374151",
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  pie: {
    label: {
      color: isDark ? "#cbd5e1" : "#374151",
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  gauge: {
    title: { color: isDark ? "#cbd5e1" : "#374151" },
    detail: {
      color: isDark ? "#f0f4f8" : "#1a1a2e",
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  funnel: {
    label: {
      color: isDark ? "#cbd5e1" : "#374151",
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  boxplot: {
    itemStyle: {
      borderColor: isDark ? "#94a3b8" : "#475569",
      borderWidth: 1.5,
    },
  },
  sunburst: {
    label: {
      color: isDark ? "#cbd5e1" : "#374151",
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: isDark ? "#475569" : "#94a3b8" } },
    axisLabel: {
      color: isDark ? "#94a3b8" : "#374151",
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "B612, sans-serif",
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)",
        width: 0.8,
      },
    },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: isDark ? "#475569" : "#94a3b8" } },
    axisLabel: {
      color: isDark ? "#94a3b8" : "#374151",
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "B612, sans-serif",
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)",
        width: 0.8,
      },
    },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: isDark ? "#475569" : "#94a3b8" } },
    axisLabel: {
      color: isDark ? "#94a3b8" : "#374151",
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "B612, sans-serif",
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)",
        width: 0.8,
      },
    },
  },
  legend: {
    textStyle: {
      color: isDark ? "#94a3b8" : "#374151",
      fontFamily: "B612, sans-serif",
    },
  },
  tooltip: {
    backgroundColor: isDark ? "rgba(17,24,42,0.95)" : "rgba(255,255,255,0.95)",
    borderColor: isDark ? "#334155" : "#e5e7eb",
    textStyle: {
      color: isDark ? "#f0f4f8" : "#1a1a2e",
      fontFamily: "Red hat Mono, monospace",
    },
  },
  toolbox: {
    iconStyle: {
      borderColor: isDark ? "#64748b" : "#6b7280",
      borderWidth: 1.5,
    },
    emphasis: { iconStyle: { borderColor: isDark ? "#f0f4f8" : "#1a1a2e" } },
  },
  grid: { left: 60, right: 20, top: 14, bottom: 50 },
});

echarts.registerTheme("chops-light", makeTheme(LIGHT_COLORS, false));
echarts.registerTheme("chops-dark", makeTheme(DARK_COLORS, true));

export function getThemeName() {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "chops-light"
    : "chops-dark";
}

export function initChart(el) {
  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  const chart = echarts.init(el, getThemeName(), { renderer: "canvas" });

  // Charts no longer get an in-canvas ECharts toolbox. Controls (zoom, save,
  // full screen) are provided by the shared HTML ChartToolbar in each chart's
  // header, which never overlaps the figure and uses a CSS-overlay full screen
  // instead of the browser's native fullscreen.
  const ro = new ResizeObserver(() => chart.resize());
  ro.observe(el);
  el._ro = ro;
  return chart;
}

export function disposeChart(el) {
  if (!el) return;
  el._ro?.disconnect();
  const inst = echarts.getInstanceByDom(el);
  if (inst) inst.dispose();
}

// Inject a programmatic-only inside dataZoom on cartesian charts so the HTML
// ChartToolbar zoom buttons have something to drive. Mouse-wheel and drag zoom
// are disabled, so zooming happens only via the buttons. No-op for non-cartesian
// charts (pie/gauge/tree/graph) and for charts that already define a dataZoom.
export function withZoomable(option) {
  if (!option || typeof option !== "object" || Array.isArray(option)) return option;
  if (!option.xAxis || option.dataZoom) return option;
  return {
    ...option,
    dataZoom: [{ type: "inside", zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false }],
  };
}

export function baseChartOption(overrides = {}) {
  return {
    grid: { top: 40, right: 20, bottom: 45, left: 55, containLabel: true },
    tooltip: { trigger: "axis", confine: true },
    dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }],
    xAxis: { nameLocation: "center", nameGap: 28 },
    yAxis: { nameLocation: "center", nameGap: 42 },
    ...overrides,
  };
}

export { echarts };
