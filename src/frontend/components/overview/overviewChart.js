// Copyright (C) 2026 Quantrail™ Data Private Limited
// Post-processing for every chart on the Cluster Overview page.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import { useEffect, useState } from "react";
import { fmtBytes } from "../../utils/costEstimator.js";

// The series palette, pinned for both themes.

export const SERIES_COLORS = [
  "#22d3ee", "#f87171", "#a78bfa", "#fbbf24", "#34d399",
  "#f472b6", "#60a5fa", "#a3e635", "#fb923c", "#818cf8",
];

/** Compact number for axis ticks and labels. 1234567 becomes 1.2M. */
export function compact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (abs >= 10 || Number.isInteger(n)) return String(Math.round(n));
  return n.toFixed(2);
}

// Axis and label formatters, keyed by the unit a chart is measured in.
// The key is passed to ChartCard as `format`.

export const FORMATS = {
  bytes: { unit: "bytes", fn: (v) => fmtBytes(v) },
  bytesPerSec: { unit: "B/s", fn: (v) => `${fmtBytes(v)}/s` },
  perSec: { unit: "/s", fn: (v) => `${compact(v)}/s` },
  count: { unit: "", fn: compact },
  cores: { unit: "cores", fn: (v) => Number(v).toFixed(2) },
  percent: { unit: "%", fn: (v) => `${(Number(v) * 100).toFixed(1)}%` },
  ms: { unit: "ms", fn: (v) => `${compact(v)} ms` },
  threads: { unit: "threads", fn: (v) => Number(v).toFixed(2) },
};


// Break a category label across lines.
 
export function wrapLabel(text, maxChars = 14) {
  const str = String(text ?? "");
  if (str.length <= maxChars) return str;

  const words = str.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= maxChars) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  // A single word longer than the limit cannot be wrapped, so truncate it
  // rather than letting one label set the width of the whole axis.
  return lines
    .map((l) => (l.length > maxChars + 3 ? `${l.slice(0, maxChars + 2)}...` : l))
    .slice(0, 3)
    .join("\n");
}

/** Read the theme synchronously, the same way the page's pie charts do. */
export function isDarkTheme() {
  return document.documentElement.getAttribute("data-theme") !== "light";
}

// Re-render a chart when the theme flips.

export function useIsDark() {
  const [dark, setDark] = useState(isDarkTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Resolve a CSS custom property to a real colour string.

function cssVar(name, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function palette(dark) {
  return {
    // The only two values that follow the theme. Everything below is fixed, so
    // a chart looks the same in both and only its labels change.
    //
    // text and axis are deliberately the SAME value. They were #e2e8f0 and
    // #cbd5e1, which put a bar's series labels and its axis ticks half a step
    // apart - close enough to look like a rendering fault rather than a
    // decision, and the axis one was the weaker of the two against a dark card.
    // Both now match --text-primary, which is what the gauge labels beside them
    // use, so every label on the page is one shade.
    text: dark ? "#f5f7fa" : "#111827",
    axis: dark ? "#f5f7fa" : "#111827",

    // Chosen to read on either background rather than being swapped per theme:
    // a mid grey at low opacity is visible on a dark card and on a white one.
    line: "rgba(148,163,184,0.30)",
    split: "rgba(148,163,184,0.15)",
    surface: "#0a0f1e",

    success: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
    info: "#60a5fa",
    accent: "#8b5cf6",

    fontChart: cssVar("--font-chart", '"B612", sans-serif'),
    fontCode: cssVar("--font-code", '"Red Hat Mono", monospace'),
  };
}

const NO_AXIS = ["pie", "treemap", "gauge", "sunburst", "radar", "funnel", "sankey"];

/**
 * Tidy and theme a built option in place-ish, returning a new object.
 *
 * @param {object} option    result of buildChartOption
 * @param {string} type      the chart type it was built with
 * @param {string} format    key into FORMATS, decides the axis unit and ticks
 * @param {boolean} dark     current theme
 */
export function polish(option, { type, format = "count", dark = true } = {}) {
  if (!option) return null;

  const p = palette(dark);
  const fmt = FORMATS[format] || FORMATS.count;
  const opt = { ...option };

  // The card header owns save and fullscreen. A second download icon floating
  // over the plot is duplication, and it was overlapping the legend.
  delete opt.toolbox;

  // These charts are 240px tall inside a card. A zoom slider costs a fifth of
  // that height to solve a problem nobody has at this size.
  delete opt.dataZoom;

  const cartesian = !NO_AXIS.includes(type);

  // A horizontal bar is the one where the x axis carries the values. It changes
  // where the value label goes and where the chart needs breathing room.
  const horizontalBars =
    cartesian &&
    opt.xAxis?.type === "value" &&
    Array.isArray(opt.series) &&
    opt.series.some((x) => x.type === "bar");

  if (cartesian) {

    const hasBars = Array.isArray(opt.series) && opt.series.some((x) => x.type === "bar");
    // A wrapped y-axis category needs more room on the left than a single line.
    const wrappedYCategories =
      hasBars && horizontalBars && Array.isArray(opt.series) && opt.series.length > 0;
    const legendRoom = opt.legend && opt.legend.show !== false ? 34 : 12;

    const firstX = Array.isArray(opt.xAxis) ? opt.xAxis[0] : opt.xAxis;
    const rotatedCategories = Boolean(firstX) && firstX.type !== "value";

    opt.grid = {
      top: legendRoom + (hasBars && !horizontalBars ? 20 : 0),
      right: 14 + (horizontalBars ? 44 : 0),
      bottom: rotatedCategories ? 18 : 8,
      left: wrappedYCategories ? 12 : 8,
      containLabel: true,
    };

    const valueAxis = {
      nameLocation: "end",
      nameGap: 10,
      nameTextStyle: { color: p.axis, fontSize: 10, align: "left" },
      axisLabel: { color: p.axis, fontSize: 10, formatter: (v) => fmt.fn(v), hideOverlap: true },
      axisLine: { lineStyle: { color: p.line } },
      splitLine: { lineStyle: { color: p.split } },
    };

    const categoryAxis = (rotated) => ({
      axisLabel: {
        color: p.axis,
        fontSize: 10,
        interval: 0,
        hideOverlap: false,
        rotate: rotated ? 45 : 0,
        lineHeight: 12,
        formatter: (v) => wrapLabel(v, rotated ? 14 : 12),
      },
      axisLine: { lineStyle: { color: p.line } },
      axisTick: { show: false },
      splitLine: { show: false },
    });

    // buildChartOption can return an axis as an object or, for a few subtypes,
    // as an array of them.
    const applyAxis = (axis, rotated) => {
      const one = (ax) => {
        if (!ax) return ax;
        const isValue = ax.type === "value";
        return {
          ...ax,
          ...(isValue ? valueAxis : categoryAxis(rotated)),
          ...(isValue && fmt.unit ? { name: fmt.unit } : {}),
        };
      };
      return Array.isArray(axis) ? axis.map(one) : one(axis);
    };

    // horizontal_bar swaps which axis carries the values, and applyAxis works
    // that out per axis rather than assuming the orientation.
    if (opt.xAxis) opt.xAxis = applyAxis(opt.xAxis, true);
    if (opt.yAxis) opt.yAxis = applyAxis(opt.yAxis, false);
  }

  // Legend on whenever there is more than one series. Two unlabelled lines is a
  // puzzle, not a chart.
  const seriesCount = Array.isArray(opt.series) ? opt.series.length : 0;
  opt.legend = {
    ...(opt.legend || {}),
    show: seriesCount > 1,
    top: 0,
    type: "scroll",
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { color: p.axis, fontSize: 10 },
    pageTextStyle: { color: p.axis },
  };

  // Overrides whichever palette initChart baked in from the theme.
  opt.color = SERIES_COLORS;
  opt.textStyle = { ...(opt.textStyle || {}), color: p.text, fontFamily: p.fontChart };
  opt.tooltip = {
    ...(opt.tooltip || {}),
    confine: true,
    valueFormatter: cartesian ? (v) => fmt.fn(v) : undefined,
  };

  if (Array.isArray(opt.series)) {
    opt.series = opt.series.map((s) => {
      const next = { ...s };

      if (s.type === "bar") {
        // Outside the bar, never inside.
        next.label = {
          ...(s.label || {}),
          show: true,
          position: horizontalBars ? "right" : "top",
          color: p.text,
          fontSize: 10,
          formatter: (v) => fmt.fn(v.value),
        };
        next.barMaxWidth = 42;
      }

      if (s.type === "line") {
        next.symbol = "none";
        next.smooth = 0.2;
        next.lineStyle = { ...(s.lineStyle || {}), width: 2 };
      }

      if (s.type === "pie") {
        // A nine-slice donut in a 320px card cannot label every slice without
        // the labels colliding into an unreadable ring. 

        next.label = {
          ...(s.label || {}),
          show: true,
          color: p.text,
          fontSize: 10,
          formatter: (v) => (v.percent >= 5 ? `${v.name}\n${v.percent}%` : ""),
        };
        next.labelLine = { ...(s.labelLine || {}), showAbove: false, length: 8, length2: 6 };
        next.minAngle = 2;
      }

      if (s.type === "treemap") {
        // buildChartOption returns a bare treemap with no label config at all,
        // which renders as one unlabelled rectangle. Everything a treemap needs
        // to be readable has to be added here.
        next.label = {
          show: true,
          color: "#ffffff",
          fontSize: 11,
          formatter: (v) => `${v.name}\n${fmt.fn(v.value)}`,
          overflow: "truncate",
        };
        next.upperLabel = { show: false };
        next.breadcrumb = { show: false };
        next.roam = false;
        next.nodeClick = false;
        next.itemStyle = { borderColor: p.surface, borderWidth: 2, gapWidth: 2 };
        next.levels = [{ itemStyle: { borderColor: p.surface, borderWidth: 2, gapWidth: 2 } }];
      }

      return next;
    });
  }

  // Pie and treemap tooltips come out of buildChartOption with a raw {c}, which
  // renders a cache as 41943040 rather than 40 MB.
  if (["pie", "treemap"].includes(opt.series?.[0]?.type)) {
    opt.tooltip = {
      ...opt.tooltip,
      trigger: "item",
      formatter: (v) =>
        `${v.name}: ${fmt.fn(v.value)}${v.percent !== undefined ? ` (${v.percent}%)` : ""}`,
    };
  }

  return opt;
}

// Speedometer gauge

const BAND_GOOD = "#34d399";
const BAND_WARN = "#fbbf24";
const BAND_BAD = "#f87171";

/**
 * @param {number|null} value    0 to 1, where 0 is good and 1 is bad
 * @param {boolean} dark
 * @param {function} formatter   receives the 0 to 1 value, renders the readout
 */
export function stageGauge({ value, dark = true, formatter, size = 188 } = {}) {
  const p = palette(dark);

  // Proportional to the dial rather than fixed, so the readout stays legible if
  // the cell is ever resized instead of quietly becoming a speck.

  const BAND_WIDTH = Math.round(size * 0.08);
  const DETAIL_SIZE = Math.round(size * 0.075);
  const AXIS_SIZE = Math.round(size * 0.058);
  const defined = Number.isFinite(value);
  const percent = defined ? Math.max(0, Math.min(100, value * 100)) : 0;

  const bands = [
    [0.6, BAND_GOOD],
    [0.85, BAND_WARN],
    [1, BAND_BAD],
  ];

  // Which band the needle is sitting in, used only for the readout colour so
  // the number agrees with the dial without introducing a second scheme.
  const readout = !defined
    ? p.muted
    : value <= 0.6
      ? BAND_GOOD
      : value <= 0.85
        ? BAND_WARN
        : BAND_BAD;

  return {
    series: [
      {
        type: "gauge",
        min: 0,
        max: 100,
        startAngle: 210,
        endAngle: -30,
        center: ["50%", "58%"],
        radius: "82%",
        splitNumber: 5,

        axisLine: { lineStyle: { width: BAND_WIDTH, color: bands } },
        progress: { show: false },

        // Notched into the arc rather than sitting outside it, using the card
        // background so they read as gaps cut out of the dial in either theme.

        axisTick: {
          distance: -BAND_WIDTH,
          length: 3,
          lineStyle: { color: p.surface, width: 1, opacity: 0.6 },
        },
        splitLine: {
          distance: -BAND_WIDTH,
          length: BAND_WIDTH,
          lineStyle: { color: p.surface, width: 2, opacity: 0.85 },
        },

        axisLabel: {
          color: p.axis,
          distance: BAND_WIDTH + 5,
          fontSize: AXIS_SIZE,
          fontWeight: 600,
          formatter: (v) => (v === 0 || v === 100 ? String(v) : ""),
        },

        // Contrasts with the page rather than with the band it happens to be
        // pointing at, so it stays legible across the whole dial.
        pointer: {
          show: defined,
          width: 5,
          length: "50%",
          itemStyle: { color: p.text },
        },
        anchor: {
          show: defined,
          size: 9,
          showAbove: true,
          itemStyle: { color: p.text, borderWidth: 0 },
        },

        title: { show: false },

        detail: {
          valueAnimation: true,
          // Inside the dial rather than hanging below it. The bottom of the
          // arc is a 60 degree gap the needle never enters, so the number sits
          // in clear space and can be read without hunting for it.
          offsetCenter: [0, "50%"],
          fontSize: DETAIL_SIZE,
          fontWeight: 700,
          fontFamily: p.fontChart,
          color: readout,
          formatter: () =>
            defined ? (formatter ? formatter(value) : `${percent.toFixed(0)}%`) : "-",
        },

        data: [{ value: percent }],
      },
    ],
  };
}
