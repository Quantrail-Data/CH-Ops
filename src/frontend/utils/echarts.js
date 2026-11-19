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
import { LIGHT_COLORS, DARK_COLORS, MIDNIGHT } from "./theme.js";

// Token helpers live in theme.js; re-exported so chart code has one import.
export { chartPalette, themeColor, isLightTheme } from "./theme.js";

// Chart chrome comes from the single token mirror in theme.js.
const CHROME = MIDNIGHT;

const makeTheme = (colors, isDark, c = isDark ? CHROME.dark : CHROME.light) => ({
  color: colors,
  backgroundColor: "transparent",
  title: { textStyle: { color: c.text } },
  line: { lineStyle: { width: 1 }, symbolSize: 0, smooth: false },
  bar: {
    itemStyle: { barBorderWidth: 0 },
    label: {
      color: c.secondary,
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  pie: {
    label: {
      color: c.secondary,
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  gauge: {
    title: { color: c.secondary },
    detail: {
      color: c.text,
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  funnel: {
    label: {
      color: c.secondary,
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  boxplot: {
    itemStyle: {
      borderColor: c.muted,
      borderWidth: 1.5,
    },
  },
  sunburst: {
    label: {
      color: c.secondary,
      textShadowColor: "transparent",
      textShadowBlur: 0,
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: c.axis } },
    axisLabel: {
      color: c.muted,
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "B612, sans-serif",
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: c.grid,
        width: 0.8,
      },
    },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: c.axis } },
    axisLabel: {
      color: c.muted,
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "B612, sans-serif",
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: c.grid,
        width: 0.8,
      },
    },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: c.axis } },
    axisLabel: {
      color: c.muted,
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "B612, sans-serif",
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: c.grid,
        width: 0.8,
      },
    },
  },
  legend: {
    textStyle: {
      color: c.muted,
      fontFamily: "B612, sans-serif",
    },
  },
  tooltip: {
    backgroundColor: c.tooltipBg,
    borderColor: c.tooltipBorder,
    textStyle: {
      color: c.text,
      fontFamily: "Atkinson Hyperlegible Mono, monospace",
    },
  },
  toolbox: {
    iconStyle: {
      borderColor: c.muted,
      borderWidth: 1.5,
    },
    emphasis: { iconStyle: { borderColor: c.text } },
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
  if (!el || !el.isConnected) {
    throw new Error("Chart container is not attached to DOM");
  }
  const existing = echarts.getInstanceByDom(el);
  if (existing) {
    try {
      existing.dispose();
    } catch {
      // The chart is already gone.
    }
  }
  const chart = echarts.init(el, getThemeName(), { renderer: "canvas" });

  // Charts no longer get an in-canvas ECharts toolbox. Controls (zoom, save,
  // full screen) are provided by the shared HTML ChartToolbar in each chart's
  // header, which never overlaps the figure and uses a CSS-overlay full screen
  // instead of the browser's native fullscreen.
  if (el._ro) {
    try {
      el._ro.disconnect();
    } catch {
      // The observer is already disconnected.
    }
  }
  const ro = new ResizeObserver(() => {
    try {
      if (!el || !el.isConnected || !el.parentNode) return;
      if (!chart || chart.isDisposed?.()) return;
      chart.resize();
    } catch {
      // The chart is already gone. Skip the resize.
    }
  });
  ro.observe(el);
  el._ro = ro;
  return chart;
}

export function disposeChart(el) {
  if (!el) return;
  if (el._ro) {
    try {
      el._ro.disconnect();
    } catch {
      // The observer is already disconnected.
    }
    el._ro = null;
  }
  const inst = echarts.getInstanceByDom(el);
  if (!inst) return;
  try {
    if (inst.getDom && inst.getDom() !== el) return;
    if (inst.isDisposed && inst.isDisposed()) return;
    inst.dispose();
  } catch {
    // The chart is already gone.
  }
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

