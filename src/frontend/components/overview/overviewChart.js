// Copyright (C) 2026 Quantrail™ Data Private Limited
// Post-processing for every chart on the Cluster Overview page.
//
// buildChartOption is built for the dashboard builder, where charts are large,
// stand alone, and want their own toolbox and zoom slider. On this page they are
// small, there are twenty of them, and the card already provides save and
// fullscreen. So one function fixes all of that in one place rather than each
// card doing it slightly differently:
//
//   - drops the echarts toolbox, since the card header already has download
//   - drops the zoom slider and tightens the grid, which is most of the empty
//     space these charts were surrounded by
//   - colours every piece of text from the theme, because buildChartOption
//     leaves them at the echarts defaults, which are dark grey and vanish on a
//     dark background
//   - puts a unit on the value axis and formats the tick labels with it, so an
//     axis reads 500 MB rather than 500,000,000
//   - moves bar value labels above the bar
//   - turns the legend on whenever there is more than one series

import { useEffect, useState } from "react";
import { fmtBytes } from "../../utils/costEstimator.js";

/**
 * The series palette, pinned for both themes.
 *
 * utils/echarts.js registers two themes with different colour arrays, and
 * initChart picks one by theme, so the same chart came out cyan on dark and
 * blue on light. That is reasonable for a dashboard someone builds, and wrong
 * here: this page is read side by side with its own screenshots and by two
 * people on different themes, and a series changing colour underneath them is
 * a needless source of doubt.
 *
 * Only the text follows the theme now. Everything else is fixed.
 */
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

/**
 * Axis and label formatters, keyed by the unit a chart is measured in.
 * The key is passed to ChartCard as `format`.
 */
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


/**
 * Break a category label across lines.
 *
 * Used together with rotation rather than instead of it. Rotation alone leaves
 * the longest labels sticking far into the page; wrapping alone makes the widest
 * ones collide with their neighbours. Together, the diagonal absorbs most of the
 * length and only the genuine outliers split.
 *
 * Which is why the default limit is generous. At 14 characters nearly everything
 * on this page stays on one line and reads cleanly at 45 degrees, and only
 * "Waiting readers" and "Waiting writers" wrap, which is exactly the pair that
 * needed it.
 *
 * Done with an explicit formatter rather than axisLabel.overflow because the
 * built-in break needs a pixel width, and the useful unit here is words.
 */
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

/**
 * Re-render a chart when the theme flips.
 *
 * The page already watches data-theme to rebuild its donuts, but that state
 * lives in ClusterOverview and these cards are several levels down. A card that
 * watches for itself is less coupling than threading a themeKey through every
 * component in between.
 */
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

/**
 * Resolve a CSS custom property to a real colour string.
 *
 * Charts render to canvas, where var(--x) is not resolved, so the value has to
 * be read out of the document first. Doing it this way rather than hardcoding
 * hexes means the charts follow the app palette, including any future change to
 * it, and both themes come free because the variables are redefined per theme.
 */
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
    text: dark ? "#e2e8f0" : "#1f2937",
    axis: dark ? "#cbd5e1" : "#374151",

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

    // RESOLVED font stacks, never the variable itself.
    //
    // Charts render to canvas, and canvas has no idea what a CSS variable is.
    // Assigning ctx.font = "bold 30px var(--font-chart)" produces an invalid
    // font shorthand, and the browser discards the WHOLE assignment rather than
    // just the family: size, weight and all. The text then draws at whatever
    // the canvas default is, around 12px, and no amount of raising fontSize
    // changes anything. Nothing warns. This cost several rounds of "the gauge
    // text is still too small" before anyone looked at the font family.
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
    // buildChartOption reserves room for the toolbox and the slider we just
    // removed. Reclaiming it is most of the whitespace fix.
    // A bar chart draws its value label above the bar, outside the plot area.
    // Without extra room at the top the label on the tallest bar is clipped the
    // moment that bar reaches full scale, which is exactly when you want to read
    // it. Horizontal bars have the same problem on the right.
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
    // hideOverlap silently drops labels, which on a seven-bar chart means three
    // bars with no name at all. interval 0 forces every one.
    //
    // Wrapping applies to BOTH orientations. Rotation only applies to the x
    // axis, because a horizontal bar's categories already stack vertically and
    // turning them 45 degrees would make them worse rather than better. But
    // they still need wrapping: without it echarts truncates a long category on
    // the left edge, which is how "Merge exec" became "Merge e...".
    //
    // The wrap limit differs by orientation. A rotated label rides the diagonal
    // and can afford to be longer before it needs to split; a stacked one is
    // competing with the plot area for horizontal room.
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
    // as an array of them. Spreading an array into an object silently produces
    // {0: ..., 1: ...} and the axis config is quietly lost, so map instead.
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
        // Outside the bar, never inside. Inside is unreadable on a short bar.
        // Which side depends on orientation: above for vertical, to the right
        // for horizontal.
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
        // the labels colliding into an unreadable ring. Anything under five
        // percent is left to the legend and the tooltip.
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

// ---------------------------------------------------------------------------
// Speedometer gauge
// ---------------------------------------------------------------------------

// The ECharts "gauge with grade" dial: 240 degree sweep, thick banded arc, ticks
// notched into it, needle from the hub, labels on the dial.
//
// The bands are FIXED. Green at the low end, amber in the middle, red at the
// top, on every gauge without exception. Two earlier attempts got this wrong in
// opposite directions and both were worse:
//
//   flipping the bands per metric  gave a wall of dials where some started green
//                                  and some started red, which the eye reads as
//                                  inconsistency long before it reads the labels
//   colouring by the value         made the same dial green at 5 percent and red
//                                  at 95, so the colour carried no information
//                                  the needle was not already carrying
//
// Fixed bands only work if every reading means the same thing, so every gauge on
// this page is phrased as "how much of this is bad". A reading that is naturally
// better high, like cache hit rate, is inverted at the source and labelled as
// its complement: cache MISS rate. See overviewMetrics.js, where the inversion
// is declared alongside the metric rather than applied here.



// The gauge bands are the same in both themes on purpose. The theme's light
// variants are darker and more saturated, which is right for text on a white
// background and wrong for a 13px arc: the amber turns muddy and the green
// reads almost black at that thickness. These three are chosen to hold up on
// either background.
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
  //
  // These three fractions are constrained by each other, not free choices. The
  // scale ends sit 30 degrees below horizontal, which puts the "0" and "100"
  // labels at roughly the same height as the readout, so an oversized readout
  // grows sideways straight into them rather than into empty space. At 0.18 the
  // readout was 34px, "100%" ran about 79px wide, and it collided outright.
  //
  // 0.075 gives a 14px readout at the real cell height, with around 28px of
  // clearance each side. Well inside the collision limit, which is checked by
  // the geometry test in overview-charts.test.js.
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
        // White ticks were invisible on the light theme.
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
