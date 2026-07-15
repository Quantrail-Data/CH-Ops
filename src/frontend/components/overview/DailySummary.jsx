// Workload execution profiles and metrics
// Copyright (C) 2026 Quantrail™ Data Private Limited
// @author: Sanjeev Kumar G
// Aggregates and displays the daily performance, resource consumption, and health metrics for the entire cluster.

import React, { useState, useEffect, useRef, useCallback } from "react";
import Icon from "../common/Icon.jsx";
import ChartToolbar, { savePng, useChartTools } from "../common/ChartToolbar.jsx";
import { runQuery } from "../../utils/api.js";
import {
  initChart,
  disposeChart,
  baseChartOption,
  withZoomable,
} from "../../utils/echarts.js";
import DataTable from "../layout/DataTable.jsx";

import { useTheme } from "../../App.jsx";

// SECTION 1: Constants

const pad = (n) => String(n).padStart(2, "0");

// Default to yesterday
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // console.log(d?.getDate())
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Format bytes to human-readable
function fmtBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = Math.abs(bytes);
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 ? 2 : 1)} ${units[i]}`;
}

// Format duration in ms to human-readable
function fmtMs(ms) {
  if (ms == null || isNaN(ms)) return "0 ms";
  if (ms < 1) return `${(ms * 1000).toFixed(0)} us`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// SECTION 2: SQL Query Templates

// All queries use {date} placeholder, replaced at runtime.

const SQL = {
  // Card 1.1: CPU Capacity
  // Returns: median_cpu, p99_cpu (as fraction of cores)
  cpuSummary: `
    SELECT
      quantile(0.5)(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS median_cpu,
      quantile(0.99)(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS p99_cpu
    FROM merge('system', '^metric_log')
    WHERE event_date = '{date}'
  `,

  // Card 1.1: CPU sparkline (24 hours, one point per 15 min)
  // Returns: t (unix timestamp), median_cpu, p99_cpu
  cpuSparkline: `
    SELECT
      toStartOfInterval(event_time, INTERVAL 900 SECOND)::INT AS t,
      quantile(0.5)(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS median_cpu,
      quantile(0.99)(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS p99_cpu
    FROM merge('system', '^metric_log')
    WHERE event_date = '{date}'
    GROUP BY t
    ORDER BY t WITH FILL STEP 900
  `,

  // Card 1.2: Memory Allocation
  // Returns: p99_mem, peak_mem, total_mem
  memorySummary: `
    SELECT
      quantile(0.99)(CurrentMetric_MemoryTracking) AS p99_mem,
      max(CurrentMetric_MemoryTracking) AS peak_mem
    FROM merge('system', '^metric_log')
    WHERE event_date = '{date}'
  `,

  // Total system RAM (from asynchronous_metric_log)
  totalRam: `
     SELECT max(value) AS total_ram
    FROM merge('system', '^asynchronous_metric_log')
    WHERE event_date = '{date}' AND metric = 'OSMemoryTotal'
  `,

  // Total CPU cores
  totalCores: `
    SELECT max(value) AS total_cores
    FROM merge('system', '^asynchronous_metric_log')
    WHERE event_date = '{date}' AND metric = 'NumberOfPhysicalCores'
  `,

  // Card 1.3: CPU Wait + IO Wait (stacked area, 15 min intervals)
  // Returns: t, cpu_wait_sec, io_wait_sec
  waitTimeline: `
    SELECT
      toStartOfInterval(event_time, INTERVAL 900 SECOND)::INT AS t,
      avg(ProfileEvent_OSCPUWaitMicroseconds) / 1000000 AS cpu_wait_sec,
      avg(ProfileEvent_OSIOWaitMicroseconds) / 1000000 AS io_wait_sec
    FROM merge('system', '^metric_log')
    WHERE event_date = '{date}'
    GROUP BY t
    ORDER BY t WITH FILL STEP 900
  `,

  // Card 2.1: Workload Execution Profiles
  // Returns: query_kind, median_ms, p99_ms, count
  workloadProfiles: `
    SELECT
      query_kind,
      quantile(0.5)(query_duration_ms) AS median_ms,
      quantile(0.99)(query_duration_ms) AS p99_ms,
      count() AS cnt
    FROM merge('system', '^query_log')
    WHERE event_date = '{date}'
      AND type = 'QueryFinish'
      AND query_kind IN ('Select', 'Insert')
    GROUP BY query_kind
    ORDER BY query_kind
  `,

  // Card 2.2: Data Velocity
  // Returns: total_read, total_written
  dataVelocity: `
    SELECT
      sum(read_bytes) AS total_read,
      sum(written_bytes) AS total_written
    FROM merge('system', '^query_log')
    WHERE event_date = '{date}'
      AND type = 'QueryFinish'
  `,

  // Card 3.1: Query Mix
  // Returns: query_kind, cnt
  queryMix: `
    SELECT
      query_kind,
      count() AS cnt
    FROM merge('system', '^query_log')
    WHERE event_date = '{date}'
      AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
    GROUP BY query_kind
    ORDER BY cnt DESC
  `,

  // Card 3.2: Error Summary
  // Returns: total_errors
  errorSummary: `
    SELECT
      countIf(type = 'ExceptionWhileProcessing') AS total_errors
    FROM merge('system', '^query_log')
    WHERE event_date = '{date}'
  `,

  // Card 3.2: Critical/Fatal from text_log
  textLogCritical: `
    SELECT count() AS total_critical
    FROM merge('system', '^text_log')
    WHERE event_date = '{date}'
      AND level IN ('Fatal', 'Critical')
  `,

  // Card 3.2: Top 5 errors
  // Returns: error_code, message_preview, cnt
  topErrors: `
    SELECT
      exception_code AS error_code,
      exception AS message_preview,
      count() AS cnt
    FROM merge('system', '^query_log')
    WHERE event_date = '{date}'
      AND type = 'ExceptionWhileProcessing'
      AND exception_code != 0
    GROUP BY error_code, message_preview
    ORDER BY cnt DESC
    LIMIT 5
  `,
};

// Replace {date} placeholder with the selected date
function buildSql(template, date) {
  return template.replace(/\{date\}/g, date);
}

// SECTION 3: Theme Colors for ECharts

// ECharts does not resolve CSS custom properties.
// Read computed values once and use them in chart options.
function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    accent: s.getPropertyValue("--accent").trim() || "#8b5cf6",
    bgCard: s.getPropertyValue("--bg-card").trim() || "#1e293b",
    textMuted: s.getPropertyValue("--text-muted").trim() || "#64748b",
    textSecondary: s.getPropertyValue("--text-secondary").trim() || "#94a3b8",
    textPrimary: s.getPropertyValue("--text-primary").trim() || "#ffffff",
    warning: s.getPropertyValue("--color-warning").trim() || "#f59e0b",
    danger: s.getPropertyValue("--color-danger").trim() || "#ef4444",
    success: s.getPropertyValue("--color-success").trim() || "#22c55e",
    borderDefault: s.getPropertyValue("--border-default").trim() || "#334155",
  };
}

// SECTION 4: Threshold Configuration

// Returns 'normal' | 'warning' | 'critical'
// Used to set card border color
// CPU threshold is relative: cpuPct is p99_cpu / total_cores * 100

const THRESHOLDS = {
  cpuPct: (v) => (v > 90 ? "critical" : v > 70 ? "warning" : "normal"),
  memPeakPct: (v) => (v > 90 ? "critical" : v > 75 ? "warning" : "normal"),
  cpuWaitP99: (v) => (v > 0.4 ? "critical" : v > 0.2 ? "warning" : "normal"),
  ioWaitP99: (v) => (v > 0.4 ? "critical" : v > 0.2 ? "warning" : "normal"),
  queryP99Ms: (v) =>
    v > 30000 ? "critical" : v > 10000 ? "warning" : "normal",
  errorCount: (v) => (v > 0 ? "warning" : "normal"),
  criticalCount: (v) => (v > 0 ? "critical" : "normal"),
};

// STATUS_COLORS resolved at render time via getThemeColors()

// SECTION 5: Small Chart Component

// Renders a small ECharts chart inside a card.
// Used for sparklines, stacked areas, bar charts, and donut.

function MiniChart({ option, height = 360, fs, onReady }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = initChart(ref.current);
    if (option) {
      const opt = {
        ...option,
        responsive: true,
        maintainAspectRatio: false,
        grid: option.grid
          ? {
              ...option.grid,
              width: fs ? "80%" : option.grid.width,
              height: fs ? "80%" : option.grid.height,
            }
          : option.grid,
      };
      chartRef.current.setOption(opt, false);
    }
    if (onReady) onReady(chartRef.current);
    const timer = setTimeout(() => chartRef.current?.resize(), 100);
    return () => {
      clearTimeout(timer);
      if (onReady) onReady(null);
      disposeChart(ref.current);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      const currentOption = chartRef.current.getOption?.();
      const currentDataZoom = currentOption?.dataZoom
        ? currentOption.dataZoom.map((z) => ({
            ...z,
            start: z.start,
            end: z.end,
            startValue: z.startValue,
            endValue: z.endValue,
          }))
        : undefined;

      const opt = {
        ...option,
        responsive: true,
        maintainAspectRatio: false,
        grid: option.grid
          ? {
              ...option.grid,
              width: fs ? "80%" : option.grid.width,
              height: fs ? "80%" : option.grid.height,
            }
          : option.grid,
        ...(currentDataZoom ? { dataZoom: currentDataZoom } : {}),
      };
      chartRef.current.setOption(opt, false);
      setTimeout(() => chartRef.current?.resize(), 50);
    }
  }, [option, fs]);

  return <div ref={ref} style={{ width: "100%", height: fs ? "100%" : height }} />
}

function SummaryCard({
  title,
  subtitle,
  status = "normal",
  children,
  fs,
  fsKey,
  fsFun,
  onSave,
  zoomable = false,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  chartType="all"
}) {
  const colors = getThemeColors();
  
    const chartControlsFlags = {
    zoomFun: true,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
  };
    const pieChartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };


  const borderColor =
    status === "critical"
      ? colors.danger
      : status === "warning"
        ? colors.warning
        : colors.borderDefault;

  return (
    <div
      className="card"
      style={
        fs
          ? {
              padding: 20,
              display: "flex",
              flexDirection: "column",

              gap: 12,
              width: "100%",
              height: "100%",
              position: "absolute",
              top: "0px",
              zIndex: "1000",
              left: 0,
              overflowY: "auto",
            }
          : {
              padding: 20,
              borderLeft: `3px solid ${borderColor}`,
              transition: "border-color 0.3s",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }
      }
    >
      <div>
        {/* {(title === "Errors & System Logs") && <div 
        onClick={()=>setFs(!fs)}
        style={{display:"flex",alignItems:"center",justifyContent:"end"}}>
            {fs ? <Icon className="ti ti-minimize"></Icon> : <Icon className="ti ti-maximize" title="Maxim"></Icon>}
        </div>} */}
        <ChartToolbar
          zoomable={zoomable}
          fullscreen={fs}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
          onSave={onSave}
          onToggleFullscreen={() => fsFun(fsKey)}
          isWantFeature={chartType === 'pie' ? pieChartControlsFlags : chartControlsFlags }
        />
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 2,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// Large metric value displayed prominently
function MetricValue({ label, value, unit, small = false }) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: "10px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: small ? "1.1rem" : "1.4rem",
          fontWeight: 700,
          fontFamily: "var(--font-chart)",
          color: "var(--text-primary)",
          lineHeight: 1.1,
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: "0.7em",
              fontWeight: 400,
              marginLeft: 3,
              color: "var(--text-secondary)",
            }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

// SECTION 7: Main Component

export default function DailySummary() {
  const [date, setDate] = useState(getYesterday);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const mountedRef = useRef(true);

  const { theme } = useTheme();

  const isDark = () => theme === "dark";

  const [containerFullscreenSetups, setContainerFullscreenSetups] = useState({
    cpu: false,
    memory: false,
    cpu_io: false,
    workload: false,
    data_velocity: false,
    query: false,
    error: false,
  });

  // Registry of MiniChart ECharts instances by panel key, so each SummaryCard's
  // toolbar can save its chart as PNG.
  const chartInsts = useRef({});

  const cpuTools = useChartTools(() => chartInsts.current.cpu, { filename: "CPU Capacity" });
  const memoryTools = useChartTools(() => chartInsts.current.memory, { filename: "Memory Capacity" });
  const cpuIoTools = useChartTools(() => chartInsts.current.cpu_io, { filename: "CPU IO Wait" });
  const workloadTools = useChartTools(() => chartInsts.current.workload, { filename: "Workload Profile" });
  const dataVelocityTools = useChartTools(() => chartInsts.current.data_velocity, { filename: "Data Velocity" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = {};
      const queries = [
        ["cpuSummary", SQL.cpuSummary],
        ["cpuSparkline", SQL.cpuSparkline],
        ["memorySummary", SQL.memorySummary],
        ["totalRam", SQL.totalRam],
        ["totalCores", SQL.totalCores],
        ["waitTimeline", SQL.waitTimeline],
        ["workloadProfiles", SQL.workloadProfiles],
        ["dataVelocity", SQL.dataVelocity],
        ["queryMix", SQL.queryMix],
        ["errorSummary", SQL.errorSummary],
        ["textLogCritical", SQL.textLogCritical],
        ["topErrors", SQL.topErrors],
      ];

      const responses = await Promise.allSettled(
        queries.map(([key, sql]) => runQuery(buildSql(sql, date))),
      );

      queries.forEach(([key], i) => {
        const r = responses[i];
        results[key] = r.status === "fulfilled" ? r.value?.rows || [] : [];
      });

      if (mountedRef.current) setData(results);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const colors = getThemeColors();

  const cpu = data?.cpuSummary?.[0];
  const medianCpu = cpu?.median_cpu ?? 0;
  const p99Cpu = cpu?.p99_cpu ?? 0;
  const totalCores = data?.totalCores?.[0]?.total_cores || 0;
  const cpuPct = totalCores > 0 ? (p99Cpu / totalCores) * 100 : 0;

  const mem = data?.memorySummary?.[0];
  const p99Mem = mem?.p99_mem ?? 0;
  const peakMem = mem?.peak_mem ?? 0;
  const totalRam = data?.totalRam?.[0]?.total_ram || 0;
  const p99MemPct = totalRam > 0 ? (p99Mem / totalRam) * 100 : 0;
  const peakMemPct = totalRam > 0 ? (peakMem / totalRam) * 100 : 0;

  const waitData = data?.waitTimeline || [];
  const maxCpuWait = Math.max(...waitData.map((r) => r.cpu_wait_sec || 0), 0);
  const maxIoWait = Math.max(...waitData.map((r) => r.io_wait_sec || 0), 0);

  const workload = data?.workloadProfiles || [];
  const selectRow = workload.find((r) => r.query_kind === "Select");
  const insertRow = workload.find((r) => r.query_kind === "Insert");
  const maxP99 = Math.max(selectRow?.p99_ms || 0, insertRow?.p99_ms || 0);

  const velocity = data?.dataVelocity?.[0];
  const totalRead = velocity?.total_read ?? 0;
  const totalWritten = velocity?.total_written ?? 0;

  const queryMix = data?.queryMix || [];
  const totalQueries = queryMix.reduce((sum, r) => sum + (r.cnt || 0), 0);

  const errSummary = data?.errorSummary?.[0];
  const totalErrors = errSummary?.total_errors ?? 0;
  const totalCritical = data?.textLogCritical?.[0]?.total_critical ?? 0;
  const topErrors = data?.topErrors || [];

  // Threshold statuses

  const cpuStatus = totalCores > 0 ? THRESHOLDS.cpuPct(cpuPct) : "normal";
  const memStatus = totalRam > 0 ? THRESHOLDS.memPeakPct(peakMemPct) : "normal";
  const waitStatus =
    maxCpuWait > 0.4 || maxIoWait > 0.4
      ? "critical"
      : maxCpuWait > 0.2 || maxIoWait > 0.2
        ? "warning"
        : "normal";
  const workloadStatus = THRESHOLDS.queryP99Ms(maxP99);
  const errorStatus =
    totalCritical > 0 ? "critical" : totalErrors > 0 ? "warning" : "normal";

  const colorChartBasedOnTheme = () => isDark() ? "white" : "black";

  // Chart options

  const sparkTs = (data?.cpuSparkline || []).map((r) =>
    new Date(r.t * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const cpuSparkOpt = withZoomable({
    ...baseChartOption(),
    grid: { top: 8, right: 8, bottom: 20, left: 35 },
    xAxis: {
      type: "category",
      data: sparkTs,
      show: true,
      axisLabel: { fontSize: 9, interval: "auto", color: colorChartBasedOnTheme() },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 9, color: colorChartBasedOnTheme() },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
      splitLine: { lineStyle: { opacity: 0.15 } },
    },
    tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
    series: [
      {
        name: "Median",
        type: "line",
        data: (data?.cpuSparkline || []).map(
          (r) => +(r.median_cpu || 0).toFixed(3),
        ),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1, color: colors.accent },
      },
      {
        name: "p99",
        type: "line",
        data: (data?.cpuSparkline || []).map(
          (r) => +(r.p99_cpu || 0).toFixed(3),
        ),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1, type: "dashed", color: colors.warning },
      },
    ],
  });

  const memBulletOpt = withZoomable({
    ...baseChartOption(),
    grid: { top: 16, right: 16, bottom: 20, left: 55 },
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    yAxis: {
      type: "category",
      data: ["p99 RAM", "peak RAM"],
      axisLabel: { fontSize: 11, fontWeight: 600, color: colorChartBasedOnTheme() },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
    series: [
      {
        name: "p99 RAM",
        type: "bar",
        data: [p99MemPct],
        barWidth: 14,
        itemStyle: { color: colors.accent },
      },
      {
        name: "peak RAM",
        type: "bar",
        data: [peakMemPct],
        barWidth: 14,
        itemStyle: { color: colors.warning },
      },
    ],
  });

  const waitTs = waitData.map((r) =>
    new Date(r.t * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const waitOpt = withZoomable({
    ...baseChartOption(),
    grid: { top: 16, right: 8, bottom: 20, left: 40 },
    xAxis: {
      type: "category",
      data: waitTs,
      axisLabel: { fontSize: 9, interval: "auto", color: colorChartBasedOnTheme() },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    yAxis: {
      type: "value",
      name: "sec",
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 9, color: colorChartBasedOnTheme() },
      splitLine: { lineStyle: { opacity: 0.15 } },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
    series: [
      {
        name: "CPU Wait",
        type: "line",
        areaStyle: { opacity: 0.4 },
        stack: "wait",
        data: waitData.map((r) => +(r.cpu_wait_sec || 0).toFixed(4)),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1, color: colors.accent },
        itemStyle: { color: colors.accent },
      },
      {
        name: "IO Wait",
        type: "line",
        areaStyle: { opacity: 0.4 },
        stack: "wait",
        data: waitData.map((r) => +(r.io_wait_sec || 0).toFixed(4)),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1, color: colors.warning },
        itemStyle: { color: colors.warning },
      },
    ],
  });

  const kinds = ["Select", "Insert"];
  const workloadOpt = withZoomable({
    ...baseChartOption(),
    grid: { top: 16, right: 16, bottom: 20, left: 55 },
    yAxis: {
      type: "category",
      data: kinds,
      axisLabel: { fontSize: 11, fontWeight: 600, color: colorChartBasedOnTheme() },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    xAxis: {
      type: "value",
      name: "ms",
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 9, color: colorChartBasedOnTheme() },
      splitLine: { lineStyle: { opacity: 0.15 } },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
    series: [
      {
        name: "Median",
        type: "bar",
        data: kinds.map((k) => {
          const r = workload.find((w) => w.query_kind === k);
          return +(r?.median_ms || 0).toFixed(1);
        }),
        barWidth: 14,
        itemStyle: { color: colors.accent },
      },
      {
        name: "p99",
        type: "bar",
        data: kinds.map((k) => {
          const r = workload.find((w) => w.query_kind === k);
          return +(r?.p99_ms || 0).toFixed(1);
        }),
        barWidth: 14,
        itemStyle: { color: colors.warning },
      },
    ],
  });

  const velocityCats = ["", "Read", "", "Written", ""];
  const velocityVals = [0, totalRead, 0, totalWritten, 0];

  const velocityOpt = withZoomable({
    ...baseChartOption(),
    grid: { top: 16, right: 16, bottom: 20, left: 16 },
    xAxis: {
      type: "category",
      data: velocityCats,
      axisLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: colorChartBasedOnTheme(),
        formatter: (v) => v,
      },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 9, color: colorChartBasedOnTheme(), formatter: (v) => fmtBytes(v) },
      splitLine: { lineStyle: { opacity: 0.15 } },
      axisLine: {
        lineStyle: {
          color: colors.borderDefault,
        },
        show: true,
      },
    },
    tooltip: {
      trigger: "axis",
      formatter: (p) =>
        p
          .filter((s) => s.axisValue === "Read" || s.axisValue === "Written")
          .map((s) => `${s.axisValue}: ${fmtBytes(s.value)}`)
          .join("<br/>"),
    },
    series: [
      {
        type: "bar",
        data: velocityVals,
        barWidth: 60,
        itemStyle: {
          borderRadius: 4,
          color: (params) =>
            params.dataIndex === 1 || params.dataIndex === 3 ? colors.accent : "transparent",
        },
      },
    ],
  });

  const mixOpt = {
    ...baseChartOption(),
    grid: { top: 20, right: 16, bottom: 20, left: 16 },
    xAxis: { show: false },
    yAxis: { show: false },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "68%"],
        center: ["50%", "48%"],
        avoidLabelOverlap: true,
        data: queryMix.map((r) => ({ name: r.query_kind, value: r.cnt })),
        label: {
          fontSize: 10,
          color: isDark() ? "white" : "black",
          formatter: "{b}: {c}",
        },
        emphasis: {
          label: { fontWeight: "bold", color: isDark() ? "white" : "black" },
        },
      },
    ],
  };

  function FullscreenHandler(key) {
    let obj = {};
    Object.keys(containerFullscreenSetups).forEach((v_) => {
      if (v_ === key) {
        const value = containerFullscreenSetups[v_];
        obj[v_] = !value;
      } else {
        obj[v_] = false;
      }
    });
    setContainerFullscreenSetups(obj);
  }

  return (
    <div style={{ padding: "0 0 32px" }}>
      {/* Header with date picker */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
            Daily Summary
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "12px",
              color: "var(--text-muted)",
            }}
          >
            Node health report for {date}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="date"
            value={date}
            max={getYesterday()}
            onChange={(e) => setDate(e.target.value)}
            className="form-input"
            style={{ fontSize: "13px", width: 160 }}
          />
          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchData}
            disabled={loading}
          >
            <Icon className="ti ti-refresh" style={{ marginRight: 4 }} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading && !data && (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--text-muted)",
          }}
        >
          Loading daily summary...
        </div>
      )}

      {data && (
        <>
          {/* Row 1: The Pulse */}
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            The Pulse - Compute & Memory
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
              marginBottom: 28,
            }}
          >
            {/* Card 1.1: CPU Capacity */}
            <SummaryCard
              title="CPU Capacity"
              subtitle="Median vs p99 CPU usage (cores)"
              status={cpuStatus}
              fs={containerFullscreenSetups?.cpu}
              fsKey={"cpu"}
              fsFun={FullscreenHandler}
              onSave={() => savePng(chartInsts.current.cpu, "CPU Capacity")}
              zoomable
              onZoomIn={cpuTools.zoomIn}
              onZoomOut={cpuTools.zoomOut}
              onZoomReset={cpuTools.zoomReset}
            >
              <div style={{ display: "flex", gap: 24 }}>
                <MetricValue
                  label="Median CPU"
                  value={medianCpu.toFixed(2)}
                  unit="cores"
                />
                <MetricValue
                  label="p99 CPU"
                  value={p99Cpu.toFixed(2)}
                  unit="cores"
                />
              </div>
              <MiniChart option={cpuSparkOpt} fs={containerFullscreenSetups?.cpu} onReady={(i) => { chartInsts.current.cpu = i; }} />
            </SummaryCard>

            {/* Card 1.2: Memory Allocation */}
            <SummaryCard
              title="Memory Allocation"
              subtitle="p99 utilization against system RAM"
              status={memStatus}
              fs={containerFullscreenSetups?.memory}
              fsKey={"memory"}
              fsFun={FullscreenHandler}
              onSave={() => savePng(chartInsts.current.memory, "Memory Capacity")}
              zoomable
              onZoomIn={memoryTools.zoomIn}
              onZoomOut={memoryTools.zoomOut}
              onZoomReset={memoryTools.zoomReset}
            >
              <div style={{ display: "flex", gap: 24 }}>
                <MetricValue
                  label="p99 RAM"
                  value={p99MemPct.toFixed(1)}
                  unit="%"
                />
                <MetricValue
                  label="Peak RAM"
                  value={peakMemPct.toFixed(1)}
                  unit="%"
                  small
                />
              </div>
              <MiniChart option={memBulletOpt} fs={containerFullscreenSetups?.memory} onReady={(i) => { chartInsts.current.memory = i; }} />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                }}
              >
                <span>p99: {fmtBytes(p99Mem)}</span>
                <span>Peak: {fmtBytes(peakMem)}</span>
                <span>Total: {fmtBytes(totalRam)}</span>
              </div>
            </SummaryCard>

            {/* Card 1.3: CPU & IO Wait */}
            <SummaryCard
              title="CPU & IO Wait"
              subtitle="Execution time vs stall time"
              status={waitStatus}
              fs={containerFullscreenSetups?.cpu_io}
              fsKey={"cpu_io"}
              fsFun={FullscreenHandler}
              onSave={() => savePng(chartInsts.current.cpu_io, "CPU IO Wait")}
              zoomable
              onZoomIn={cpuIoTools.zoomIn}
              onZoomOut={cpuIoTools.zoomOut}
              onZoomReset={cpuIoTools.zoomReset}
            >
              <div style={{ display: "flex", gap: 24 }}>
                <MetricValue
                  label="Peak CPU Wait"
                  value={maxCpuWait.toFixed(3)}
                  unit="sec"
                  small
                />
                <MetricValue
                  label="Peak IO Wait"
                  value={maxIoWait.toFixed(3)}
                  unit="sec"
                  small
                />
              </div>
              <MiniChart option={waitOpt} fs={containerFullscreenSetups?.cpu_io} onReady={(i) => { chartInsts.current.cpu_io = i; }} />
            </SummaryCard>
          </div>

          {/* Row 2: The Efficiency */}
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            The Efficiency - Query & Data Metrics
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 28,
            }}
          >
            {/* Card 2.1: Workload Execution Profiles */}
            <SummaryCard
              title="Workload Profiles"
              subtitle="SELECT vs INSERT duration (median / p99)"
              status={workloadStatus}
              fs={containerFullscreenSetups?.workload}
              fsKey={"workload"}
              fsFun={FullscreenHandler}
              onSave={() => savePng(chartInsts.current.workload, "Workload Profile")}
              zoomable
              onZoomIn={workloadTools.zoomIn}
              onZoomOut={workloadTools.zoomOut}
              onZoomReset={workloadTools.zoomReset}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    SELECT
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <MetricValue
                      label="Median"
                      value={fmtMs(selectRow?.median_ms)}
                      small
                    />
                    <MetricValue
                      label="p99"
                      value={fmtMs(selectRow?.p99_ms)}
                      small
                    />
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    {(selectRow?.cnt || 0).toLocaleString()} queries
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    INSERT
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <MetricValue
                      label="Median"
                      value={fmtMs(insertRow?.median_ms)}
                      small
                    />
                    <MetricValue
                      label="p99"
                      value={fmtMs(insertRow?.p99_ms)}
                      small
                    />
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    {(insertRow?.cnt || 0).toLocaleString()} queries
                  </div>
                </div>
              </div>
              <MiniChart option={workloadOpt} fs={containerFullscreenSetups?.workload} onReady={(i) => { chartInsts.current.workload = i; }} />
            </SummaryCard>

            {/* Card 2.2: Data Velocity */}
            <SummaryCard
              title="Data Velocity"
              subtitle="Total bytes read vs written"
              fs={containerFullscreenSetups?.data_velocity}
              fsKey={"data_velocity"}
              fsFun={FullscreenHandler}
              onSave={() => savePng(chartInsts.current.data_velocity, "Data Velocity")}
              zoomable
              onZoomIn={dataVelocityTools.zoomIn}
              onZoomOut={dataVelocityTools.zoomOut}
              onZoomReset={dataVelocityTools.zoomReset}
            >
              <div style={{ display: "flex", gap: 24 }}>
                <MetricValue label="Total Read" value={fmtBytes(totalRead)} />
                <MetricValue
                  label="Total Written"
                  value={fmtBytes(totalWritten)}
                />
              </div>
              <MiniChart option={velocityOpt} fs={containerFullscreenSetups?.data_velocity} onReady={(i) => { chartInsts.current.data_velocity = i; }} />
            </SummaryCard>
          </div>

          {/* Row 3: The Audit */}
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            The Audit - Workload Mix & System Anomalies
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* Card 3.1: Query Mix */}
            <SummaryCard
              title="Query Mix"
              subtitle={`${totalQueries.toLocaleString()} queries executed`}
              fs={containerFullscreenSetups?.query}
              fsKey={"query"}
              fsFun={FullscreenHandler}
              onSave={() => savePng(chartInsts.current.query, "Query Mix")}
              chartType="pie"
            >
              <MiniChart option={mixOpt} fs={containerFullscreenSetups?.query} onReady={(i) => { chartInsts.current.query = i; }} />
            </SummaryCard>

            {/* Card 3.2: Errors & Logs */}
            <SummaryCard
              title="Errors & System Logs"
              subtitle="Query errors + critical/fatal system log entries"
              status={errorStatus}
              fs={containerFullscreenSetups?.error}
              fsKey={"error"}
              fsFun={FullscreenHandler}
            >
              <div style={{ display: "flex", gap: 24 }}>
                <MetricValue
                  label="Query Errors"
                  value={totalErrors.toLocaleString()}
                />
                <MetricValue
                  label="Critical / Fatal"
                  value={totalCritical.toLocaleString()}
                />
              </div>

              {topErrors.length > 0 ? (
                <div style={{ overflow: "auto", maxHeight: 305 }}>
                  <DataTable
                    rows={topErrors}
                    columns={["error_code", "message_preview", "cnt"]}
                  />
                </div>
              ) : (
                <div
                  style={{
                    padding: 16,
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                  }}
                >
                  <Icon
                    className="ti ti-circle-check"
                    style={{ color: "var(--color-success)", marginRight: 6 }}
                  />
                  No errors recorded for this date
                </div>
              )}
            </SummaryCard>
          </div>
        </>
      )}
    </div>
  );
}