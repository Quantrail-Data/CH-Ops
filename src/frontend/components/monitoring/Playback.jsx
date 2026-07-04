// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy,  Sanjeev Kumar G)
// Animated playback component for reviewing chronological ClickHouse system metrics over time.


import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import ChartCard from "../layout/ChartCard.jsx";
import { DateTimePicker } from "../layout/DateTimePicker.jsx";
import { baseChartOption } from "../../utils/echarts.js";
import { runQuery } from "../../utils/api.js";
import DataTable from "../layout/DataTable.jsx";

// HELPERS

const pad = (n) => String(n).padStart(2, "0");
const fmtAgo = (h) => {
  const d = new Date(Date.now() - h * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function fmtTimestamp(epochSec) {
  if (!epochSec || isNaN(epochSec)) return "--";
  const d = new Date(epochSec * 1000);
  if (isNaN(d.getTime())) return "--";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseDatetime(val) {
  if (!val) return NaN;
  return new Date(val.replace(" ", "T")).getTime();
}

function buildSql(template, from, to, step) {
  const fromMs = parseDatetime(from);
  const toMs = parseDatetime(to);
  const seconds =
    isNaN(fromMs) || isNaN(toMs) ? 0 : Math.round((toMs - fromMs) / 1000);
  return template
    .replace(/\{from\}/g, `'${from}'`)
    .replace(/\{to\}/g, `'${to}'`)
    .replace(/\{step\}/g, String(step))
    .replace(/\{seconds\}/g, String(seconds));
}

function validateInputs(from, to, step) {
  const fromMs = parseDatetime(from);
  const toMs = parseDatetime(to);
  if (isNaN(fromMs)) return "Invalid From datetime.";
  if (isNaN(toMs)) return "Invalid To datetime.";
  if (fromMs >= toMs) return "From must be before To.";
  const rangeSeconds = (toMs - fromMs) / 1000;
  if (rangeSeconds < step)
    return "Time range is shorter than one step interval.";
  const estimatedFrames = Math.ceil(rangeSeconds / step);
  if (estimatedFrames > 10000) {
    return `Too many frames (${estimatedFrames.toLocaleString()}). Increase the step or narrow the range. Max 10,000.`;
  }
  return null;
}

function toChDt(val) {
  const s = val.replace("T", " ");

  return /\d{2}:\d{2}:\d{2}/.test(s) ? s : s + ":00";
}

// CONSTANTS

const STEP_OPTIONS = [

  { value: 1, label: "1s" },

  { value: 5, label: "5s" },

  { value: 10, label: "10s" },

  { value: 30, label: "30s" },

  { value: 60, label: "60s" },

];

const SPEED_OPTIONS = [

  { value: 0.25, label: "0.25x" },

  { value: 0.5, label: "0.5x" },

  { value: 1, label: "1x" },

  { value: 2, label: "2x" },

  { value: 4, label: "4x" },

];

const FALLBACK_SERIES_COLORS = [
  "#22d3ee",
  "#f97316",
  "#22c55e",
  "#a78bfa",
  "#f43f5e",
  "#0ea5e9",
  "#84cc16",
  "#eab308",
  "#14b8a6",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#ec4899",
];

function getSeriesColorByIndex(idx) {
  return FALLBACK_SERIES_COLORS[idx % FALLBACK_SERIES_COLORS.length];
}

// CHART DEFINITIONS

const CHARTS = [

  {

    key: "hw_cpu",

    label: "CPU Usage (cores)",

    section: "Hardware",

    chartType: "band",

    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t,
  min(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS min_val,
  quantile(0.5)(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS med_val,
  max(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS max_val
FROM merge('system', '^metric_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
GROUP BY t
ORDER BY t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,

  },

  {

    key: "hw_ram",

    label: "RAM Usage",

    section: "Hardware",

    chartType: "band",

    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t,
  min(CurrentMetric_MemoryTracking) AS min_val,
  quantile(0.5)(CurrentMetric_MemoryTracking) AS med_val,
  max(CurrentMetric_MemoryTracking) AS max_val
FROM merge('system', '^metric_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
GROUP BY t
ORDER BY t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,

  },

  {

    key: "hw_net",

    label: "Network Connections",

    section: "Hardware",

    chartType: "band",

    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t,
  min(CurrentMetric_TCPConnection + CurrentMetric_HTTPConnection + CurrentMetric_MySQLConnection + CurrentMetric_InterserverConnection) AS min_val,
  quantile(0.5)(CurrentMetric_TCPConnection + CurrentMetric_HTTPConnection + CurrentMetric_MySQLConnection + CurrentMetric_InterserverConnection) AS med_val,
  max(CurrentMetric_TCPConnection + CurrentMetric_HTTPConnection + CurrentMetric_MySQLConnection + CurrentMetric_InterserverConnection) AS max_val
FROM merge('system', '^metric_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
GROUP BY t
ORDER BY t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,

  },



  {

    key: "logs_severity",

    label: "Log Entries by Severity",

    section: "App Logs",

    chartType: "stacked_area",

    categoryCol: "level",

    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t, level, count() AS cnt
FROM merge('system', '^text_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
GROUP BY t, level
ORDER BY level, t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,

    seriesOrder: [

      "Test",

      "Trace",

      "Debug",

      "Information",

      "Notice",

      "Warning",

      "Error",

      "Critical",

      "Fatal",

    ],
    seriesColors: {
      Test: "#3b82f6",
      Trace: "#14b8a6",
      Debug: "#22c55e",
      Information: "#facc15",
      Notice: "#f59e0b",
      Warning: "#f97316",
      Error: "#fb7185",
      Critical: "#ef4444",
      Fatal: "#7f1d1d",
    },
  },

  {
    key: "parts_type",
    label: "Part Events by Type",
    section: "Data Parts",
    chartType: "stacked_area",
    categoryCol: "event_type",
    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t, event_type, count() AS cnt
FROM merge('system', '^part_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
GROUP BY t, event_type
ORDER BY event_type, t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,
    seriesOrder: [
      "NewPart",
      "MergeParts",
      "MergePartsStart",
      "MutatePart",
      "MutatePartStart",
      "DownloadPart",
      "MovePart",
      "RemovePart",
    ],
    seriesColors: {
      NewPart: "#22d3ee",
      MergeParts: "#60a5fa",
      MergePartsStart: "#818cf8",
      MutatePart: "#a78bfa",
      MutatePartStart: "#c084fc",
      DownloadPart: "#34d399",
      MovePart: "#fbbf24",
      RemovePart: "#f87171",
    },
  },

  {
    key: "q_success",
    label: "Successful Queries by Kind",
    section: "Queries",
    chartType: "stacked_area",
    categoryCol: "query_kind",
    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t, query_kind, count() AS cnt
FROM merge('system', '^query_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
  AND type = 'QueryFinish'
GROUP BY t, query_kind
ORDER BY query_kind, t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,
    seriesColors: {
      Select: "#22d3ee",
      Insert: "#34d399",
      Update: "#fbbf24",
      Delete: "#f87171",
      Create: "#a78bfa",
      Alter: "#60a5fa",
      Drop: "#fb923c",
      System: "#818cf8",
      "": "#94a3b8",
    },
  },
  {
    key: "q_exceptions",
    label: "Query Exceptions by Kind",
    section: "Queries",
    chartType: "stacked_area",
    categoryCol: "query_kind",
    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t, query_kind, count() AS cnt
FROM merge('system', '^query_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
  AND (type = 'ExceptionBeforeStart' OR type = 'ExceptionWhileProcessing')
GROUP BY t, query_kind
ORDER BY query_kind, t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,
    seriesColors: {
      Select: "#fca5a5",
      Insert: "#f87171",
      Update: "#ef4444",
      Delete: "#dc2626",
      Create: "#b91c1c",
      Alter: "#991b1b",
      "": "#6b7280",
    },
  },
  {
    key: "q_throughput",
    label: "Rows Selected vs Inserted",
    section: "Queries",
    chartType: "stacked_area",
    categoryCol: null,
    sql: `SELECT toStartOfInterval(event_time, INTERVAL {step} SECOND)::INT AS t,
  avg(ProfileEvent_SelectedRows) AS selected_rows,
  avg(ProfileEvent_InsertedRows) AS inserted_rows
FROM merge('system', '^metric_log')
WHERE event_date BETWEEN toDate({from}) AND toDate({to}) AND event_time BETWEEN {from} AND {to}
GROUP BY t
ORDER BY t WITH FILL
  FROM toStartOfInterval(toDateTime({from}), INTERVAL {step} SECOND)::INT
  TO   toStartOfInterval(toDateTime({to}),   INTERVAL {step} SECOND)::INT
  STEP {step}`,
  },
];

const SECTIONS = [...new Set(CHARTS.map((c) => c.section))];


// console.log(SECTIONS)

// INSPECTION POPUP SQL BUILDERS

function buildFailedQueriesSql(frameT, step, from, to) {
  const chFrom = toChDt(from);
  const chTo = toChDt(to);
  return `SELECT initial_user, substring(query, 1, 500) AS query, substring(exception, 1, 500) AS exception
FROM system.query_log
WHERE (type = 'ExceptionBeforeStart' OR type = 'ExceptionWhileProcessing')
  AND toStartOfInterval(event_time, INTERVAL ${step} SECOND)::INT = ${frameT}
  AND event_time >= '${chFrom}' AND event_time <= '${chTo}'
ORDER BY event_time DESC LIMIT 200`;
}

function buildErrorLogsSql(frameT, step, from, to) {
  const chFrom = toChDt(from);
  const chTo = toChDt(to);
  return `SELECT level, logger_name, substring(message, 1, 500) AS message
FROM merge('system', '^text_log')
WHERE level IN ('Error', 'Critical', 'Fatal')
  AND toStartOfInterval(event_time, INTERVAL ${step} SECOND)::INT = ${frameT}
  AND event_time >= '${chFrom}' AND event_time <= '${chTo}'
ORDER BY event_time DESC LIMIT 200`;
}

// CHART BUILDERS

function buildBandOption(label, rows, frameT) {
  if (!rows?.length) return null;

  const minData = rows.map((r) => [r.t * 1000, parseFloat(r.min_val) || 0]);
  const medData = rows.map((r) => [r.t * 1000, parseFloat(r.med_val) || 0]);
  const maxData = rows.map((r) => [r.t * 1000, parseFloat(r.max_val) || 0]);

  const markLine =
    frameT != null
      ? {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#8b5cf6", width: 2, type: "solid" },
          data: [{ xAxis: frameT * 1000 }],
          label: { show: false },
          animation: false,
        }
      : undefined;

  return {
    ...baseChartOption(),
    xAxis: {
      type: "time",
      position: "bottom",
      axisLabel: {
        ...baseChartOption()?.xAxis?.axisLabel,
        rotate: 0,
        hideOverlap: true,
        margin: 14,
      },
      axisTick: { alignWithLabel: true },
      splitLine: { show: true },
    },
    yAxis: {
      type: "value",
      name: label,
      scale: true,
      axisLabel: { hideOverlap: true },
      splitLine: { show: true },
    },
    legend: {
      show: true,
      left: 10,
      right: 120,
      top: 0,
      type: "scroll",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 12 },
    },
    toolbox: {
      ...baseChartOption()?.toolbox,
      right: 0,
      top: 0,
      itemSize: 14,
      itemGap: 8,
      feature: {
        ...(baseChartOption()?.toolbox?.feature || {}),
        saveAsImage: {
          ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
          backgroundColor: "auto",
          pixelRatio: 2,
          excludeComponents: [],
        },
      },
    },
    grid: {
      left: 54,
      right: 18,
      top: 64,
      bottom: 46,
      containLabel: true,
    },
    animation: false,
    series: [
      {
        name: "Max",
        type: "line",
        smooth: true,
        symbol: "none",
        data: maxData,
        lineStyle: { color: "#06b6d4", width: 1 },
        itemStyle: { color: "#06b6d4" },
        areaStyle: { color: "#06b6d4", opacity: 0.08 },
        markLine,
        animation: false,
      },
      {
        name: "Median",
        type: "line",
        smooth: true,
        symbol: "none",
        data: medData,
        lineStyle: { color: "#f97316", width: 1 },
        itemStyle: { color: "#f97316" },
        areaStyle: { color: "#f97316", opacity: 0.06 },
        markLine,
        animation: false,
      },
      {
        name: "Min",
        type: "line",
        smooth: true,
        symbol: "none",
        data: minData,
        lineStyle: { color: "#8b5cf6", width: 1 },
        itemStyle: { color: "#8b5cf6" },
        areaStyle: { color: "#8b5cf6", opacity: 0.08 },
        markLine,
        animation: false,
      },
    ],
  };
}

function buildStackedAreaOption(chart, rows, frameT) {
  const markLine =
    frameT != null
      ? {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#8b5cf6", width: 2, type: "solid" },
          data: [{ xAxis: frameT * 1000 }],
          label: { show: false },
          animation: false,
        }
      : undefined;

  if (!rows?.length) {
    return {
      ...baseChartOption(),
      title: {
        text: "No data in selected range",
        left: "center",
        top: "middle",
        textStyle: {
          color: "var(--text-muted)",
          fontSize: 13,
          fontWeight: 500,
        },
      },
      xAxis: {
        type: "time",
        position: "bottom",
        axisLabel: {
          ...baseChartOption()?.xAxis?.axisLabel,
          rotate: 0,
          hideOverlap: true,
          margin: 14,
        },
        axisTick: { alignWithLabel: true },
        splitLine: { show: true },
      },
      yAxis: {
        type: "value",
        name: chart.label,
        scale: true,
        axisLabel: { hideOverlap: true },
        splitLine: { show: true },
      },
      legend: { show: false },
      toolbox: {
        ...baseChartOption()?.toolbox,
        right: 0,
        top: 0,
        itemSize: 14,
        itemGap: 8,
        feature: {
          ...(baseChartOption()?.toolbox?.feature || {}),
          saveAsImage: {
            ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
            backgroundColor: "auto",
            pixelRatio: 2,
            excludeComponents: [],
          },
        },
      },
      grid: {
        left: 54,
        right: 18,
        top: 64,
        bottom: 46,
        containLabel: true,
      },
      animation: false,
      series: [],
      graphic:
        frameT != null
          ? [
              {
                type: "line",
                shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
                invisible: true,
              },
            ]
          : [],
    };
  }

  if (!chart.categoryCol) {
    const cols = Object.keys(rows[0]).filter((c) => c !== "t");
    if (cols.length === 0) {
      return {
        ...baseChartOption(),
        title: {
          text: "No data in selected range",
          left: "center",
          top: "middle",
          textStyle: {
            color: "var(--text-muted)",
            fontSize: 13,
            fontWeight: 500,
          },
        },
        xAxis: {
          type: "time",
          position: "bottom",
          axisLabel: {
            ...baseChartOption()?.xAxis?.axisLabel,
            rotate: 0,
            hideOverlap: true,
            margin: 14,
          },
          axisTick: { alignWithLabel: true },
          splitLine: { show: true },
        },
        yAxis: {
          type: "value",
          name: chart.label,
          scale: true,
          axisLabel: { hideOverlap: true },
          splitLine: { show: true },
        },
        legend: { show: false },
        toolbox: {
          ...baseChartOption()?.toolbox,
          right: 0,
          top: 0,
          itemSize: 14,
          itemGap: 8,
          feature: {
            ...(baseChartOption()?.toolbox?.feature || {}),
            saveAsImage: {
              ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
              backgroundColor: "auto",
              pixelRatio: 2,
              excludeComponents: [],
            },
          },
        },
        grid: {
          left: 54,
          right: 18,
          top: 64,
          bottom: 46,
          containLabel: true,
        },
        animation: false,
        series: [],
      };
    }
    const series = cols.map((col, idx) => {
      const color = chart.seriesColors?.[col] || getSeriesColorByIndex(idx);
      return {
        name: col.replace(/_/g, " "),
        type: "line",
        smooth: true,
        symbol: "none",
        stack: "total",
        lineStyle: { color, width: 1 },
        itemStyle: { color },
        areaStyle: { color, opacity: 0.3 },
        data: rows.map((r) => [r.t * 1000, parseFloat(r[col]) || 0]),
        markLine,
        animation: false,
      };
    });
    return {
      ...baseChartOption(),
      color: series.map((s) => s.itemStyle?.color).filter(Boolean),
      toolbox: {
        ...baseChartOption()?.toolbox,
        right: 0,
        top: 0,
        itemSize: 14,
        itemGap: 8,
        feature: {
          ...(baseChartOption()?.toolbox?.feature || {}),
          saveAsImage: {
            ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
            backgroundColor: "auto",
            pixelRatio: 2,
            excludeComponents: [],
          },
        },
      },
      grid: {
        left: 54,
        right: 18,
        top: 64,
        bottom: 46,
        containLabel: true,
      },
      xAxis: {
        type: "time",
        position: "bottom",
        axisLabel: {
          ...baseChartOption()?.xAxis?.axisLabel,
          rotate: 0,
          hideOverlap: true,
          margin: 14,
        },
        axisTick: { alignWithLabel: true },
        splitLine: { show: true },
      },
      yAxis: {
        type: "value",
        name: chart.label,
        scale: true,
        axisLabel: { hideOverlap: true },
        splitLine: { show: true },
      },
      legend: {
        show: true,
        top: 0,
        left: 10,
        right: 120,
        type: "scroll",
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { fontSize: 12 },
      },
      animation: false,
      series,
    };
  }

  const catCol = chart.categoryCol;
  const valCol =
    Object.keys(rows[0]).find((c) => c !== "t" && c !== catCol) || "cnt";
  const categories =
    chart.seriesOrder ||
    [
      ...new Set(
        rows.map((r) => r[catCol]).filter((v) => v != null),
      ),
    ].sort();

  const timeMap = {};
  for (const r of rows) {
    const t = Number(r.t);
    if (isNaN(t)) continue;
    if (!timeMap[t]) timeMap[t] = {};
    const catKey = r[catCol] == null || r[catCol] === "" ? "" : r[catCol];
    timeMap[t][catKey] = parseFloat(r[valCol]) || 0;
  }
  const allTimes = Object.keys(timeMap)
    .map(Number)
    .sort((a, b) => a - b);
  if (allTimes.length === 0) {
    return {
      ...baseChartOption(),
      title: {
        text: "No data in selected range",
        left: "center",
        top: "middle",
        textStyle: {
          color: "var(--text-muted)",
          fontSize: 13,
          fontWeight: 500,
        },
      },
      xAxis: {
        type: "time",
        position: "bottom",
        axisLabel: {
          ...baseChartOption()?.xAxis?.axisLabel,
          rotate: 0,
          hideOverlap: true,
          margin: 14,
        },
        axisTick: { alignWithLabel: true },
        splitLine: { show: true },
      },
      yAxis: {
        type: "value",
        name: chart.label,
        scale: true,
        axisLabel: { hideOverlap: true },
        splitLine: { show: true },
      },
      legend: { show: false },
      toolbox: {
        ...baseChartOption()?.toolbox,
        right: 0,
        top: 0,
        itemSize: 14,
        itemGap: 8,
        feature: {
          ...(baseChartOption()?.toolbox?.feature || {}),
          saveAsImage: {
            ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
            backgroundColor: "auto",
            pixelRatio: 2,
            excludeComponents: [],
          },
        },
      },
      grid: {
        left: 54,
        right: 18,
        top: 64,
        bottom: 46,
        containLabel: true,
      },
      animation: false,
      series: [],
    };
  }

  const series = categories.map((cat, idx) => {
    const color = chart.seriesColors?.[cat] || getSeriesColorByIndex(idx);
    return {
      name: cat || "(empty)",
      type: "line",
      smooth: true,
      symbol: "none",
      stack: "total",
      lineStyle: { color, width: 1 },
      itemStyle: { color },
      areaStyle: { color, opacity: 0.4 },
      data: allTimes.map((t) => [t * 1000, timeMap[t]?.[cat] || 0]),
      markLine,
      animation: false,
    };
  });

  return {
    ...baseChartOption(),
    color: series.map((s) => s.itemStyle?.color).filter(Boolean),
    toolbox: {
      ...baseChartOption()?.toolbox,
      right: 0,
      top: 0,
      itemSize: 14,
      itemGap: 8,
      feature: {
        ...(baseChartOption()?.toolbox?.feature || {}),
        saveAsImage: {
          ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
          backgroundColor: "auto",
          pixelRatio: 2,
          excludeComponents: [],
        },
      },
    },
    grid: {
      left: 54,
      right: 18,
      top: 64,
      bottom: 46,
      containLabel: true,
    },
    xAxis: {
      type: "time",
      position: "bottom",
      axisLabel: {
        ...baseChartOption()?.xAxis?.axisLabel,
        rotate: 0,
        hideOverlap: true,
        margin: 14,
      },
      axisTick: { alignWithLabel: true },
      splitLine: { show: true },
    },
    yAxis: {
      type: "value",
      name: chart.label,
      scale: true,
      axisLabel: { hideOverlap: true },
      splitLine: { show: true },
    },
    legend: {
      show: true,
      top: 0,
      left: 10,
      right: 120,
      type: "scroll",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 12 },
    },
    animation: false,
    series,
  };
}

function buildChartOption(chart, rows, frameT) {
  try {
    if (chart.chartType === "band")
      return buildBandOption(chart.label, rows, frameT);
    return buildStackedAreaOption(chart, rows, frameT);
  } catch {
    return null;
  }
}

// INSPECTION POPUP COMPONENT

const LOG_LEVEL_COLORS = {
  Error: "#ef4444",
  Critical: "#dc2626",
  Fatal: "#991b1b",
};

function InspectionPopup({
  type,
  rows,
  loading,
  error,
  onClose,
  frameTimestamp,
}) {
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    setExpandedRow(null);
  }, [rows]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const title =
    type === "failed_queries"
      ? "Failed Queries"
      : "Error / Critical / Fatal Logs";

      console.log(rows)

  return (
    <div className="profiler-popup-overlay" onClick={onClose}>
      <div
        className="playback-inspection-popup"
        style={{backgroundColor:"white"}}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profiler-popup-header">
          <div>
            <span style={{ fontWeight: 600 }}>{title}</span>
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginLeft: 8,
              }}
            >
              at {frameTimestamp}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icon className="ti ti-x"></Icon>
          </button>
        </div>

        {loading && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <span className="loading-spinner" style={{ marginRight: 8 }}></span>{" "}
            Loading...
          </div>
        )}

        {error && (
          <div style={{ padding: 16, color: "var(--color-danger)" }}>
            <Icon className="ti ti-alert-circle" style={{ marginRight: 4 }}></Icon>{" "}
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            No {type === "failed_queries" ? "failed queries" : "error logs"} at
            this timestamp.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="playback-inspection-table-wrap">
            <DataTable rows={rows} columns={type=="failed_queries" ? ["initial_user","query","exception"]:["level","logger_name","message"]} emptyMessage={"No error logs at this timestamp."} />
            {/* <table
              className="data-table"
              style={{
                width: "100%",
                fontSize: "12px",
                tableLayout: "fixed",
              }}
            >
              <thead>
                {type === "failed_queries" ? (
                  <tr>
                    <th style={{ width: "12%" }}>User</th>
                    <th style={{ width: "48%" }}>Query</th>
                    <th style={{ width: "40%" }}>Exception</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={{ width: "10%" }}>Level</th>
                    <th style={{ width: "18%" }}>Logger</th>
                    <th style={{ width: "72%" }}>Message</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isExp = expandedRow === idx;
                  return (
                    <tr
                      key={idx}
                      onClick={() => setExpandedRow(isExp ? null : idx)}
                      style={{ cursor: "pointer" }}
                    >
                      {type === "failed_queries" ? (
                        <>
                          <td
                            style={{
                              fontFamily: "var(--font-code)",
                              fontSize: "12px",
                            }}
                          >
                            {row.initial_user || "-"}
                          </td>
                          <td
                            className={
                              isExp
                                ? "playback-cell-expanded"
                                : "playback-cell-truncated"
                            }
                          >
                            {row.query || "-"}
                          </td>
                          <td
                            className={
                              isExp
                                ? "playback-cell-expanded"
                                : "playback-cell-truncated"
                            }
                            style={{ color: "var(--color-danger)" }}
                          >
                            {row.exception || "-"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <span
                              style={{
                                color: LOG_LEVEL_COLORS[row.level] || "#ef4444",
                                fontWeight: 600,
                                fontSize: "12px",
                              }}
                            >
                              {row.level}
                            </span>
                          </td>
                          <td
                            className={
                              isExp
                                ? "playback-cell-expanded"
                                : "playback-cell-truncated"
                            }
                            style={{
                              fontFamily: "var(--font-code)",
                              fontSize: "12px",
                            }}
                          >
                            {row.logger_name || "-"}
                          </td>
                          <td
                            className={
                              isExp
                                ? "playback-cell-expanded"
                                : "playback-cell-truncated"
                            }
                          >
                            {row.message || "-"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table> */}
          </div>
        )}

        <div
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            padding: "8px 0 0",
            textAlign: "right",
          }}
        >
          {rows.length > 0 && `${rows.length} rows (max 200)`}
        </div>
      </div>
    </div>
  );
}

// MAIN COMPONENT

export default function Playback() {
  const [from, setFrom] = useState(fmtAgo(1));
  const [to, setTo] = useState(fmtNow());
  const [step, setStep] = useState(10);
  const [speed, setSpeed] = useState(1);

  const [data, setData] = useState({});
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [fetchError, setFetchError] = useState("");
  const [failedCharts, setFailedCharts] = useState([]);
  const [dataReady, setDataReady] = useState(false);

  const [allTimes, setAllTimes] = useState([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [popupType, setPopupType] = useState(null);
  const [popupRows, setPopupRows] = useState([]);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupError, setPopupError] = useState("");

  const playRef = useRef(null);
  const fetchIdRef = useRef(0);
  const popupFetchRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
    };
  }, []);

  function stopPlayback() {
    if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
    setPlaying(false);
  }

  const handleFetch = useCallback(async () => {
    const validationError = validateInputs(from, to, step);
    if (validationError) {
      setFetchError(validationError);
      return;
    }

    const thisId = ++fetchIdRef.current;
    stopPlayback();
    setFetchLoading(true);
    setFetchProgress(0);
    setFetchError("");
    setFailedCharts([]);
    setDataReady(false);
    setData({});
    setAllTimes([]);
    setFrameIndex(0);

    const results = {};
    const errors = [];

    for (let i = 0; i < CHARTS.length; i++) {
      if (fetchIdRef.current !== thisId || !mountedRef.current) return;
      const chart = CHARTS[i];
      try {
        const sql = buildSql(chart.sql, from, to, step);
        const result = await runQuery(sql);
        if (fetchIdRef.current !== thisId || !mountedRef.current) return;
        results[chart.key] = result.rows || [];
      } catch (err) {
        if (fetchIdRef.current !== thisId || !mountedRef.current) return;
        results[chart.key] = [];
        errors.push(chart.label);
      }
      if (mountedRef.current && fetchIdRef.current === thisId) {
        setFetchProgress(Math.round(((i + 1) / CHARTS.length) * 100));
      }
    }

    if (fetchIdRef.current !== thisId || !mountedRef.current) return;

    const timeSet = new Set();
    for (const key of Object.keys(results)) {
      if (!Array.isArray(results[key])) continue;
      for (const row of results[key]) {
        const t = Number(row?.t);
        if (!isNaN(t) && t > 0) timeSet.add(t);
      }
    }
    const sorted = [...timeSet].sort((a, b) => a - b);

    for (const chart of CHARTS) {
      if (results[chart.key]?.length > 0 || sorted.length === 0) continue;
      if (chart.chartType === "band") {
        results[chart.key] = sorted.map((t) => ({
          t,
          min_val: 0,
          med_val: 0,
          max_val: 0,
        }));
      } else if (!chart.categoryCol) {
        const aliases = [];
        const re = /\bAS\s+(\w+)/gi;
        let m;
        while ((m = re.exec(chart.sql)) !== null) {
          if (m[1] !== "t") aliases.push(m[1]);
        }
        const colNames = aliases.length > 0 ? aliases : ["value"];
        results[chart.key] = sorted.map((t) => {
          const row = { t };
          for (const c of colNames) row[c] = 0;
          return row;
        });
      } else {
        results[chart.key] = [];
      }
    }

    if (mountedRef.current && fetchIdRef.current === thisId) {
      setData(results);
      setAllTimes(sorted);
      setFrameIndex(0);
      setFailedCharts(errors);
      setDataReady(sorted.length > 0);
      setFetchLoading(false);
      if (errors.length > 0) {
        setFetchError(
          `${errors.length} of ${CHARTS.length} queries failed: ${errors.join(", ")}.`,
        );
      } else if (sorted.length === 0) {
        setFetchError("No data found in the selected time range.");
      }
    }
  }, [from, to, step]);

  useEffect(() => {
    if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
    if (playing && allTimes.length > 1) {
      const intervalMs = Math.max(50, Math.round(1000 / speed));
      playRef.current = setInterval(() => {
        if (!mountedRef.current) {
          clearInterval(playRef.current);
          playRef.current = null;
          return;
        }
        setFrameIndex((prev) => {
          if (prev >= allTimes.length - 1) {
            setTimeout(() => {
              if (mountedRef.current) setPlaying(false);
            }, 0);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, speed, allTimes.length]);

  const handlePlayPause = () => {
    if (!dataReady || allTimes.length < 2) return;
    if (frameIndex >= allTimes.length - 1) setFrameIndex(0);
    setPlaying((prev) => !prev);
  };
  const handleStepBack = () => {
    stopPlayback();
    setFrameIndex((prev) => Math.max(0, prev - 1));
  };
  const handleStepForward = () => {
    stopPlayback();
    setFrameIndex((prev) => Math.min(allTimes.length - 1, prev + 1));
  };
  const handleToStart = () => {
    stopPlayback();
    setFrameIndex(0);
  };
  const handleToEnd = () => {
    stopPlayback();
    setFrameIndex(Math.max(0, allTimes.length - 1));
  };
  const handleSliderChange = (e) => {
    if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
    setPlaying(false);
    const val = Number(e.target.value);
    if (!isNaN(val)) setFrameIndex(val);
  };

  const currentT =
    allTimes.length > 0 && frameIndex >= 0 && frameIndex < allTimes.length
      ? allTimes[frameIndex]
      : null;

  const chartOptions = useMemo(() => {
    if (!dataReady) return {};
    const opts = {};
    for (const chart of CHARTS) {
      opts[chart.key] = buildChartOption(chart, data[chart.key], currentT);
    }
    return opts;
  }, [data, currentT, dataReady]);

  const handleShowFailedQueries = useCallback(async () => {
    if (currentT == null) return;
    const pid = ++popupFetchRef.current;
    setPopupType("failed_queries");
    setPopupRows([]);
    setPopupLoading(true);
    setPopupError("");
    try {
      const result = await runQuery(
        buildFailedQueriesSql(currentT, step, from, to),
      );
      if (popupFetchRef.current !== pid || !mountedRef.current) return;
      setPopupRows(result.rows || []);
    } catch (err) {
      if (popupFetchRef.current !== pid || !mountedRef.current) return;
      setPopupError(err.message || "Failed to fetch failed queries");
    }
    if (popupFetchRef.current === pid && mountedRef.current)
      setPopupLoading(false);
  }, [currentT, step, from, to]);

  const handleShowErrorLogs = useCallback(async () => {
    if (currentT == null) return;
    const pid = ++popupFetchRef.current;
    setPopupType("error_logs");
    setPopupRows([]);
    setPopupLoading(true);
    setPopupError("");
    try {
      const result = await runQuery(
        buildErrorLogsSql(currentT, step, from, to),
      );
      if (popupFetchRef.current !== pid || !mountedRef.current) return;
      setPopupRows(result.rows || []);
    } catch (err) {
      if (popupFetchRef.current !== pid || !mountedRef.current) return;
      setPopupError(err.message || "Failed to fetch error logs");
    }
    if (popupFetchRef.current === pid && mountedRef.current)
      setPopupLoading(false);
  }, [currentT, step, from, to]);

  const closePopup = () => {
    setPopupType(null);
    setPopupRows([]);
    setPopupError("");
  };

  useEffect(() => {
    const handler = (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "SELECT" ||
        e.target.tagName === "TEXTAREA"
      )
        return;
      if (!dataReady) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleStepBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleStepForward();
          break;
        case "Home":
          e.preventDefault();
          handleToStart();
          break;
        case "End":
          e.preventDefault();
          handleToEnd();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dataReady, frameIndex, playing, allTimes.length]);

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon
            className="ti ti-player-play"
            style={{ color: "var(--accent)" }}
          ></Icon>{" "}
          Playback
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
        Rewind through ClickHouse system metrics like a DVR. Select a time
        range, choose a step, and click Fetch Data. Use media controls or
        keyboard (Space, arrows, Home/End) to scrub. The purple line shows
        playback position. Use the inspection buttons to drill into failures at
        any frame.
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <DateTimePicker label="From" value={from} onChange={setFrom} />
          <DateTimePicker label="To" value={to} onChange={setTo} />
          <div className="form-group" style={{ minWidth: 100,paddingBottom:"4px" }}>
            <label className="form-label">Step</label>
            <Select
              className="form-select cui-sm"
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
            >
              {STEP_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="form-group" style={{paddingBottom:"4px"}}>
            <button
              className="btn btn-primary"
              onClick={handleFetch}
              disabled={fetchLoading}
              style={{ height: 36, minWidth: 140 }}
            >
              {fetchLoading ? (
                <>
                  <span
                    className="loading-spinner"
                    style={{ marginRight: 6 }}
                  ></span>{" "}
                  {fetchProgress}%
                </>
              ) : (
                <>
                  <Icon className="ti ti-download" style={{ marginRight: 4 }}></Icon>{" "}
                  Fetch Data
                </>
              )}
            </button>
          </div>
        </div>
        {fetchLoading && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                height: 4,
                background: "var(--bg-active)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: fetchProgress + "%",
                  height: "100%",
                  background: "var(--accent)",
                  transition: "width 0.3s",
                }}
              ></div>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Fetching {CHARTS.length} datasets... ({fetchProgress}%)
            </p>
          </div>
        )}
        {fetchError && (
          <div
            style={{
              fontSize: "12px",
              color:
                failedCharts.length > 0
                  ? "var(--color-warning, #f59e0b)"
                  : "var(--color-danger, #ef4444)",
              marginTop: 10,
            }}
          >
            <Icon
              className={`ti ${failedCharts.length > 0 ? "ti-alert-triangle" : "ti-alert-circle"}`}
              style={{ marginRight: 4 }}
            ></Icon>
            {fetchError}
          </div>
        )}
      </div>

      {dataReady && (
        <div
          className="card playback-controls"
          style={{ padding: "10px 16px", marginBottom: 16 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 12,
              marginBottom: 6,
            }}
          >
            <span className="playback-timestamp">
              {currentT != null ? fmtTimestamp(currentT) : "--"}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {frameIndex + 1} / {allTimes.length}
            </span>
          </div>

          <input
            type="range"
            className="playback-slider"
            min={0}
            max={Math.max(0, allTimes.length - 1)}
            value={frameIndex}
            onChange={handleSliderChange}
            style={{ width: "100%", marginBottom: 8 }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleToStart}
              title="To Start (Home)"
            >
              <Icon className="ti ti-player-skip-back"></Icon>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleStepBack}
              title="Back (←)"
            >
              <Icon className="ti ti-player-track-prev"></Icon>
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handlePlayPause}
              style={{ minWidth: 70 }}
              title="Play/Pause (Space)"
            >
              <Icon
                className={`ti ${playing ? "ti-player-pause" : "ti-player-play"}`}
                style={{ marginRight: 3 }}
              ></Icon>
              {playing ? "Pause" : "Play"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleStepForward}
              title="Forward (→)"
            >
              <Icon className="ti ti-player-track-next"></Icon>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleToEnd}
              title="To End (End)"
            >
              <Icon className="ti ti-player-skip-forward"></Icon>
            </button>

            <div
              style={{
                width: 1,
                height: 20,
                background: "var(--border)",
                margin: "0 4px",
              }}
            ></div>

            {SPEED_OPTIONS.map((s) => (
              <button
                key={s.value}
                className={`btn btn-sm ${speed === s.value ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSpeed(s.value)}
                style={{
                  minWidth: 36,
                  padding: "2px 5px",
                  fontSize: "11px",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center"
                }}
              >
                {s.label}
              </button>
            ))}

            <div
              style={{
                width: 1,
                height: 20,
                background: "var(--border)",
                margin: "0 4px",
              }}
            ></div>

            <button
              className="btn btn-sm"
              style={{
                background: "var(--color-danger, #ef4444)",
                color: "#fff",
                fontSize: "11px",
                padding: "2px 8px",
              }}
              onClick={handleShowFailedQueries}
              disabled={!currentT}
              title="View failed queries at this timestamp"
            >
              <Icon
                className="ti ti-alert-triangle"
                style={{ marginRight: 3 }}
              ></Icon>{" "}
              Failed Queries
            </button>
            <button
              className="btn btn-sm"
              style={{
                background: "#dc2626",
                color: "#fff",
                fontSize: "11px",
                padding: "2px 8px",
              }}
              onClick={handleShowErrorLogs}
              disabled={!currentT}
              title="View Error/Critical/Fatal logs at this timestamp"
            >
              <Icon className="ti ti-bug" style={{ marginRight: 3 }}></Icon> Error
              Logs
            </button>
          </div>
        </div>
      )}

      {popupType && (
        <InspectionPopup
          type={popupType}
          rows={popupRows}
          loading={popupLoading}
          error={popupError}
          onClose={closePopup}
          frameTimestamp={currentT != null ? fmtTimestamp(currentT) : "--"}
        />
      )}

      {dataReady &&
        SECTIONS.map((section) => {
          const sectionCharts = CHARTS.filter((c) => c.section === section);
          return (
            <div key={section} style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 12,
                }}
              >
                {section}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    sectionCharts.length >= 3
                      ? "repeat(3, 1fr)"
                      : "repeat(auto-fit, minmax(450px, 1fr))",
                  gap: 16,
                }}
              >
                {sectionCharts.map((chart) => (
                  <ChartCard
                    key={chart.key}
                    title={chart.label}
                    option={chartOptions[chart.key]}
                    height={300}
                    loading={fetchLoading && !chartOptions[chart.key]}
                  />
                ))}
              </div>
            </div>
          );
        })}

      {!dataReady && !fetchLoading && (
        <div
          className="empty-state"
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <Icon
            className="ti ti-player-play"
            style={{
              fontSize: 48,
              opacity: 0.3,
              display: "block",
              marginBottom: 12,
            }}
          ></Icon>
          Select a time range and click <strong>Fetch Data</strong> to start.
        </div>
      )}
    </div>
  );
}
