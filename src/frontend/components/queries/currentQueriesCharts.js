// currentQueriesCharts.js - ECharts options for the Current Queries page
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Data in, option out. No colours or fonts: the chops-* themes supply both.

import { fmtBytes, fmtDuration, fmtRows, fmtPercent } from "../../utils/format.js";
import { aggregateByUser, topNWithOther, topByElapsed } from "./processesModel.js";

const TOP_USERS = 6;
const TOP_QUERIES = 10;

// ECharts puts the first category at the bottom, so reverse to read worst-first.
function categoryAxis(names) {
  return {
    type: "category",
    data: [...names].reverse(),
    axisTick: { show: false },
    axisLabel: { hideOverlap: true },
  };
}

function reversed(values) {
  return [...values].reverse();
}

// Top six plus Other.
export function memoryByUserOption(rows) {
  const slices = topNWithOther(aggregateByUser(rows), "memory", TOP_USERS);
  const total = slices.reduce((s, d) => s + d.value, 0);
  return {
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p) =>
        `${p.name}<br/>${fmtBytes(p.value)} (${total ? fmtPercent(p.value / total, 1) : "0%"})`,
    },
    legend: { type: "scroll", bottom: 0, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        type: "pie",
        radius: ["42%", "68%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderWidth: 1 },
        label: { show: false },
        emphasis: { label: { show: true, formatter: (p) => `${p.name}\n${fmtBytes(p.value)}` } },
        data: slices,
      },
    ],
  };
}

// Stacked by kind: forty selects and forty inserts are different problems.
export function queriesPerUserOption(rows) {
  const agg = aggregateByUser(rows).sort((a, b) => b.count - a.count).slice(0, TOP_USERS + 2);
  const names = agg.map((e) => e.user);
  const kinds = [...new Set(agg.flatMap((e) => Object.keys(e.kinds)))].sort();
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true },
    legend: { type: "scroll", top: 0, itemWidth: 10, itemHeight: 10 },
    grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
    xAxis: { type: "value", minInterval: 1 },
    yAxis: categoryAxis(names),
    series: kinds.map((kind) => ({
      name: kind,
      type: "bar",
      stack: "kinds",
      barMaxWidth: 18,
      data: reversed(agg.map((e) => e.kinds[kind] || 0)),
    })),
  };
}

// Next to the memory pie: a 40 GB memory hog and a 2 TB scanner need different fixes.
export function readBytesByUserOption(rows) {
  const slices = topNWithOther(aggregateByUser(rows), "readBytes", TOP_USERS);
  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      formatter: (ps) => `${ps[0].name}<br/>${fmtBytes(ps[0].value)}`,
    },
    grid: { left: 8, right: 40, top: 12, bottom: 8, containLabel: true },
    // Default tick count collides with labels this wide.
    xAxis: {
      type: "value",
      splitNumber: 3,
      axisLabel: { formatter: (v) => fmtBytes(v), hideOverlap: true },
    },
    yAxis: categoryAxis(slices.map((s) => s.name)),
    series: [
      {
        type: "bar",
        barMaxWidth: 18,
        data: reversed(slices.map((s) => s.value)),
        label: { show: true, position: "right", formatter: (p) => fmtBytes(p.value) },
      },
    ],
  };
}

// Progress label: five minutes at 95% is nearly done, at 2% it is a runaway.
export function longestRunningOption(rows) {
  const top = topByElapsed(rows, TOP_QUERIES);
  const labels = top.map((r) => `${r.user || "(unknown)"}, ${String(r.query_id || "").slice(0, 8)}`);
  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      formatter: (ps) => {
        const r = top[top.length - 1 - ps[0].dataIndex];
        if (!r) return "";
        return [
          r.query_id,
          `user: ${r.user}`,
          `elapsed: ${fmtDuration(r.elapsed)}`,
          `progress: ${r.progress === null ? "unknown" : fmtPercent(r.progress, 1)}`,
          `memory: ${fmtBytes(r.memory_usage)}`,
          `read: ${fmtRows(r.read_rows)} rows`,
        ].join("<br/>");
      },
    },
    grid: { left: 8, right: 64, top: 12, bottom: 8, containLabel: true },
    // Default tick count collides with labels this wide.
    xAxis: {
      type: "value",
      splitNumber: 3,
      axisLabel: { formatter: (v) => fmtDuration(v), hideOverlap: true },
    },
    yAxis: categoryAxis(labels),
    series: [
      {
        type: "bar",
        barMaxWidth: 16,
        data: reversed(top.map((r) => r.elapsed)),
        label: {
          show: true,
          position: "right",
          formatter: (p) => {
            const r = top[top.length - 1 - p.dataIndex];
            const pct = r && r.progress !== null ? `, ${fmtPercent(r.progress)}` : "";
            return `${fmtDuration(p.value)}${pct}`;
          },
        },
      },
    ],
  };
}

// processes has no history, so this comes from the polls the page already makes.
export function concurrencyOption(history) {
  const t = history.map((h) => h.label);
  return {
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: (ps) => {
        const count = ps.find((p) => p.seriesName === "Queries");
        const mem = ps.find((p) => p.seriesName === "Memory");
        return [
          ps[0]?.axisValue,
          count ? `queries: ${count.value}` : null,
          mem ? `memory: ${fmtBytes(mem.value)}` : null,
        ]
          .filter(Boolean)
          .join("<br/>");
      },
    },
    legend: { data: ["Queries", "Memory"], top: 0, itemWidth: 10, itemHeight: 10 },
    grid: { left: 8, right: 8, top: 30, bottom: 8, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: t,
      axisLabel: { hideOverlap: true, interval: Math.max(0, Math.ceil(t.length / 5) - 1) },
    },
    yAxis: [
      { type: "value", name: "Queries", minInterval: 1 },
      { type: "value", name: "Memory", position: "right", axisLabel: { formatter: (v) => fmtBytes(v) } },
    ],
    series: [
      {
        name: "Queries",
        type: "line",
        showSymbol: false,
        areaStyle: { opacity: 0.2 },
        data: history.map((h) => h.count),
      },
      {
        name: "Memory",
        type: "line",
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { type: "dashed" },
        data: history.map((h) => h.memory),
      },
    ],
  };
}

export const CONCURRENCY_HISTORY_LIMIT = 60;
