// Copyright (C) 2026 Quantrail™ Data Private Limited
// @ author: Sanjeev Kumar G ,Kathir Moorthy
// Interface for monitoring heap memory allocation, tracking buffer pools, and tuning garbage collection thresholds.

import React, { useState, useEffect, useRef, useCallback } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { runQuery } from "../../utils/api.js";
import {
  initChart,
  disposeChart,
  baseChartOption,
} from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";
import {
  normalizeStatsText,
  parseOverview,
  parseArenas,
  parseArenaAllocations,
  parseArenaBins,
  parseArenaLarge,
  parseArenaExtents,
  parseOperations,
  hasContention,
  fragStatus,
  efficiencyStatus,
  fmtBytes,
  fmtNum,
  fmtRate,
} from "../../utils/jemallocParser.js";

import { useToast } from "../layout/Toast.jsx";

// Theme Colors (ECharts does not resolve CSS custom properties)

function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    accent: s.getPropertyValue("--accent").trim() || "#8b5cf6",
    bgCard: s.getPropertyValue("--bg-card").trim() || "#1e293b",
    textMuted: s.getPropertyValue("--text-muted").trim() || "#64748b",
    textSecondary: s.getPropertyValue("--text-secondary").trim() || "#94a3b8",
    warning: s.getPropertyValue("--color-warning").trim() || "#f59e0b",
    danger: s.getPropertyValue("--color-danger").trim() || "#ef4444",
    success: s.getPropertyValue("--color-success").trim() || "#22c55e",
    borderDefault: s.getPropertyValue("--border-default").trim() || "#334155",
  };
}

// Tooltip definitions (jemalloc jargon to plain language)

const TOOLTIPS = {
  allocated:
    "Bytes actively used by ClickHouse queries and internal structures",
  active:
    "Bytes in pages jemalloc considers active. Includes used bytes plus per-page waste.",
  fragmentation:
    "Memory wasted inside allocated pages. Formula: (Given to Allocator - Used by Queries) / Used by Queries. Below 15% is healthy.",
  efficiency:
    "How much of the allocator active memory is actually used. Formula: Used by Queries / Given to Allocator. Above 85% is healthy.",
  resident:
    "Total physical memory (RAM) occupied by ClickHouse. This is what the OS reports.",
  mapped:
    "Total virtual address space mapped. Can be larger than RAM due to memory-mapped files.",
  dirty:
    "Pages that were used, are now free inside jemalloc, but not yet returned to the OS. Will be reused or purged.",
  metadata:
    "Memory used by jemalloc itself to track allocations, bins, and arenas. Typically under 1%.",
};

// Small reusable components

function InfoBanner({ children }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        background: "var(--bg-sunken)",
        borderRadius: 6,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <Icon
        className="ti ti-info-circle"
        style={{ flexShrink: 0, marginTop: 1, fontSize: 14 }}
      />
      <span>{children}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: "12px",
        fontWeight: 700,
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function HealthCard({
  label,
  value,
  unit,
  tooltip,
  status = "normal",
  themeColors,
}) {
  const borderColor =
    status === "critical"
      ? themeColors.danger
      : status === "warning"
        ? themeColors.warning
        : themeColors.borderDefault;
  return (
    <div
      className="card"
      title={tooltip}
      style={{
        padding: 16,
        borderLeft: `3px solid ${borderColor}`,
        transition: "border-color 0.3s",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "21px",
          fontWeight: 700,
          fontFamily: "var(--font-chart)",
          color: "var(--text-primary)",
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
      </div>
    </div>
  );
}

function HeatmapBar({ label, colorClass, widthPct, content, tooltip }) {
  const bgMap = {
    hot: "linear-gradient(90deg, #ef4444, #f87171)",
    warm: "linear-gradient(90deg, #f59e0b, #fbbf24)",
    cool: "linear-gradient(90deg, #22c55e, #4ade80)",
  };
  const textColor = colorClass === "warm" ? "#1e293b" : "white";
  return (
    <div
      style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}
      title={tooltip}
    >
      <div
        style={{
          minWidth: 70,
          fontSize: "12px",
          fontFamily: "var(--font-code)",
          textAlign: "right",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: 22,
          background: "var(--border-default)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(widthPct, 3)}%`,
            borderRadius: 4,
            background: bgMap[colorClass],
            display: "flex",
            alignItems: "center",
            paddingLeft: 10,
            fontSize: "11px",
            color: textColor,
            fontWeight: 600,
            transition: "width 0.3s",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            cursor: "default",
          }}
          title={content}
        >
          {widthPct > 10 ? content : ""}
        </div>
      </div>
      {widthPct <= 10 && (
        <span
          style={{ fontSize: "11px", color: "var(--text-muted)", minWidth: 80 }}
        >
          {content}
        </span>
      )}
    </div>
  );
}

function MiniChart({
  option,
  height = 60,
  zoomable = false,
  filename = "chart",
}) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const tools = useChartTools(() => chartRef.current, { filename });

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = initChart(ref.current);
    if (option) chartRef.current.setOption(option, true);
    const t = setTimeout(() => chartRef.current?.resize(), 100);
    return () => {
      clearTimeout(t);
      disposeChart(ref.current);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
      setTimeout(() => chartRef.current?.resize(), 50);
    }
  }, [option]);

  useEffect(() => {
    const t = setTimeout(() => chartRef.current?.resize(), 150);
    return () => clearTimeout(t);
  }, [tools.fullscreen]);

  return (
    <div
      style={
        tools.fullscreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "var(--bg-page)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
            }
          : undefined
      }
    >
      <ChartToolbar
        zoomable={zoomable}
        fullscreen={tools.fullscreen}
        onZoomIn={tools.zoomIn}
        onZoomOut={tools.zoomOut}
        onZoomReset={tools.zoomReset}
        onSave={tools.save}
        onToggleFullscreen={tools.toggleFullscreen}
        isWantFeature={{saveFun:false,zoomFun:false,resetFun:false,fullscreenFun:false}}
      />
      <div
        ref={ref}
        style={{
          width: "100%",
          height: tools.fullscreen ? "calc(100vh - 96px)" : height,
        }}
      />
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 0",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
          color: "var(--text-secondary)",
          userSelect: "none",
        }}
      >
        <Icon
          className={`ti ti-chevron-${open ? "down" : "right"}`}
          style={{ fontSize: 14 }}
        />
        {title}
      </div>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  );
}

// Main Component

export default function MemoryAllocator() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawText, setRawText] = useState("");
  const [overview, setOverview] = useState(null);
  const [arenas, setArenas] = useState([]);
  const [operations, setOperations] = useState(null);
  const [globalBins, setGlobalBins] = useState([]);
  const [globalLarge, setGlobalLarge] = useState([]);
  const [globalExtents, setGlobalExtents] = useState([]);
  const [arenaAllocations, setArenaAllocations] = useState({});
  const [arenaBinsMap, setArenaBinsMap] = useState({});
  const [arenaLargeMap, setArenaLargeMap] = useState({});
  const [arenaExtentsMap, setArenaExtentsMap] = useState({});
  const [selectedArena, setSelectedArena] = useState(0);
  const mountedRef = useRef(true);

  const toast = useToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runQuery("SELECT * FROM system.jemalloc_stats");
      if (!mountedRef.current) return;

      // Extract raw text from the single-row response.
      // The column name varies by ClickHouse version.
      const row = result.rows?.[0];
      if (!row)
        throw new Error(
          "system.jemalloc_stats returned no data. The table may not exist in this ClickHouse version.",
        );
      const rawValue = row.stats || row[Object.keys(row)[0]] || "";
      const text = normalizeStatsText(rawValue);
      if (!text || text.length < 100)
        throw new Error(
          "system.jemalloc_stats returned unexpected data. Expected raw jemalloc stats text.",
        );

      setRawText(text);
      setOverview(parseOverview(text));
      setArenas(parseArenas(text));
      setOperations(parseOperations(text));

      const alloc = parseArenaAllocations(text);
      setArenaAllocations(alloc);
      const bins = parseArenaBins(text);
      setArenaBinsMap(bins);
      setGlobalBins(bins.global || []);
      const large = parseArenaLarge(text);
      setArenaLargeMap(large);
      setGlobalLarge(large.global || []);
      const extents = parseArenaExtents(text);
      setArenaExtentsMap(extents);
      setGlobalExtents(extents.global || []);
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived values

  const colors = getThemeColors();

  // Memory breakdown chart option
  const breakdownOpt = overview
    ? (() => {
        const allocated = overview.allocated || 0;
        const active = overview.active || 0;
        const resident = overview.resident || 1;
        const waste = Math.max(active - allocated, 0);
        const dirty = overview.dirty || 0;
        const metadata = overview.metadata || 0;
        const opt = baseChartOption();
        return {
          ...opt,
          toolbox: { show: false },
          grid: { top: 8, right: 16, bottom: 8, left: 16, height: "100%" },
          xAxis: { type: "value", max: resident, show: false },
          yAxis: { type: "category", data: [""], show: false },
          tooltip: {
            trigger: "axis",
            formatter: () =>
              `Used by Queries: ${fmtBytes(allocated)}<br/>` +
              `Internal Waste: ${fmtBytes(waste)}<br/>` +
              `Reclaimable: ${fmtBytes(dirty)}<br/>` +
              `Bookkeeping: ${fmtBytes(metadata)}<br/>` +
              `Physical RAM: ${fmtBytes(resident)}`,
          },
          series: [
            {
              type: "bar",
              stack: "mem",
              data: [allocated],
              barWidth: 28,
              itemStyle: { color: colors.success, borderRadius: [4, 0, 0, 4] },
              name: "Used by Queries",
            },
            {
              type: "bar",
              stack: "mem",
              data: [waste],
              barWidth: 28,
              itemStyle: { color: colors.warning },
              name: "Internal Waste",
            },
            {
              type: "bar",
              stack: "mem",
              data: [dirty],
              barWidth: 28,
              itemStyle: { color: "#fb923c" },
              name: "Reclaimable",
            },
            {
              type: "bar",
              stack: "mem",
              data: [metadata],
              barWidth: 28,
              itemStyle: {
                color: colors.textMuted,
                borderRadius: [0, 4, 4, 0],
              },
              name: "Bookkeeping",
            },
          ],
        };
      })()
    : null;

  // Arena heatmap data
  const sortedArenasByThreads = [...arenas].sort(
    (a, b) => (b.stats.assigned_threads || 0) - (a.stats.assigned_threads || 0),
  );
  const maxThreads = sortedArenasByThreads[0]?.stats.assigned_threads || 1;
  const totalThreads = arenas.reduce(
    (s, a) => s + (a.stats.assigned_threads || 0),
    0,
  );

  const sortedArenasByLoad = [...arenas].sort((a, b) => {
    const aRate = arenaAllocations[a.id]?.total?.nrequests_ps || 0;
    const bRate = arenaAllocations[b.id]?.total?.nrequests_ps || 0;
    return bRate - aRate;
  });
  const maxLoad =
    arenaAllocations[sortedArenasByLoad[0]?.id]?.total?.nrequests_ps || 1;

  // Hot bins (top 15 by request rate)
  const hotBins = [...globalBins]
    .filter((b) => b.nrequests_ps > 0)
    .sort((a, b) => b.nrequests_ps - a.nrequests_ps)
    .slice(0, 15);
  const maxBinRate = hotBins[0]?.nrequests_ps || 1;

  // Wasteful bins (top 15 by wasted bytes)
  const wastefulBins = [...globalBins]
    .filter((b) => b.allocated > 0)
    .map((b) => ({ ...b, waste: b.allocated * (1 - b.util) }))
    .sort((a, b) => b.waste - a.waste)
    .slice(0, 15);
  const maxWaste = wastefulBins[0]?.waste || 1;

  // Contention check
  const showContention = operations && hasContention(operations.mutexStats);

  // Render

  if (loading && !overview) {
    return (
      <div
        style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}
      >
        Loading memory allocator stats...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div className="alert-banner danger" style={{ margin: 0 }}>
          <Icon className="ti ti-alert-circle" />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Failed to load jemalloc stats
            </div>
            <div style={{ fontSize: "13px" }}>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!overview) return null;

  return (
    <div style={{ padding: "0 0 32px" }}>
      {/* Page header */}
      <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem", fontWeight: 700 }}>
        Memory Allocator
      </h2>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}
      >
        jemalloc memory allocator health and allocation patterns
      </p>

      {/* Info banner */}
      <InfoBanner>
        ClickHouse uses jemalloc to manage memory. These cards show how
        efficiently memory is being used right now. Green borders mean healthy.
        Amber or red borders mean attention is needed.
      </InfoBanner>

      {/* ROW 1: Health Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <HealthCard
          label="Used by Queries"
          value={fmtBytes(overview.allocated)}
          tooltip={TOOLTIPS.allocated}
          themeColors={colors}
        />
        <HealthCard
          label="Given to Allocator"
          value={fmtBytes(overview.active)}
          tooltip={TOOLTIPS.active}
          themeColors={colors}
        />
        <HealthCard
          label="Internal Fragmentation"
          value={overview.fragmentation.toFixed(1)}
          unit="%"
          tooltip={TOOLTIPS.fragmentation}
          status={fragStatus(overview.fragmentation)}
          themeColors={colors}
        />
        <HealthCard
          label="Memory Efficiency"
          value={overview.efficiency.toFixed(1)}
          unit="%"
          tooltip={TOOLTIPS.efficiency}
          status={efficiencyStatus(overview.efficiency)}
          themeColors={colors}
        />
        <HealthCard
          label="Physical RAM"
          value={fmtBytes(overview.resident)}
          tooltip={TOOLTIPS.resident}
          themeColors={colors}
        />
        <HealthCard
          label="Virtual Memory"
          value={fmtBytes(overview.mapped)}
          tooltip={TOOLTIPS.mapped}
          themeColors={colors}
        />
        <HealthCard
          label="Reclaimable"
          value={fmtBytes(overview.dirty)}
          tooltip={TOOLTIPS.dirty}
          themeColors={colors}
        />
        <HealthCard
          label="Bookkeeping"
          value={fmtBytes(overview.metadata)}
          tooltip={TOOLTIPS.metadata}
          themeColors={colors}
        />
      </div>

      {/* ROW 2: Memory Breakdown */}
      <InfoBanner>
        How physical RAM is divided. The gap between "Used by Queries" and
        "Given to Allocator" is internal fragmentation. Smaller gap = healthier.
      </InfoBanner>
      <div
        className="card"
        style={{ padding: 16, marginBottom: 20, height: "300px",position:"relative" }}
      >
        <SectionTitle>Memory Breakdown</SectionTitle>
        {breakdownOpt && (
          <MiniChart
            option={breakdownOpt}
            height={250}
            filename="memory-breakdown"
          />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "var(--text-muted)",
            // marginTop: 6,
            position:"absolute",
            width:"95%",
            bottom:"10px",
            margin:"0px auto"
          }}
        >
          <span>Used: {fmtBytes(overview.allocated)}</span>
          <span>
            Waste:{" "}
            {fmtBytes(
              Math.max((overview.active || 0) - (overview.allocated || 0), 0),
            )}
          </span>
          <span>Reclaimable: {fmtBytes(overview.dirty)}</span>
          <span>Physical RAM: {fmtBytes(overview.resident)}</span>
        </div>
      </div>

      {/* ROW 3: Pool Distribution */}
      {arenas.length > 0 && (
        <>
          <InfoBanner>
            jemalloc splits memory into independent pools (arenas) to reduce
            lock contention. Ideally, threads and request load are spread evenly
            across pools.
          </InfoBanner>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            {/* Thread Distribution */}
            <div className="card" style={{ padding: 16 }}>
              <SectionTitle>Thread Distribution</SectionTitle>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {sortedArenasByThreads.map((a) => {
                  const threads = a.stats.assigned_threads || 0;
                  const pct =
                    totalThreads > 0 ? (threads / totalThreads) * 100 : 0;
                  const width =
                    maxThreads > 0 ? (threads / maxThreads) * 100 : 0;
                  const cls =
                    pct > 66 / arenas.length
                      ? "hot"
                      : pct > 33 / arenas.length
                        ? "warm"
                        : "cool";
                  return (
                    <HeatmapBar
                      key={a.id}
                      label={`Pool ${a.id}`}
                      colorClass={cls}
                      widthPct={width}
                      content={`${threads} (${pct.toFixed(0)}%)`}
                      tooltip={`${threads} threads assigned`}
                    />
                  );
                })}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginTop: 8,
                }}
              >
                Total threads: {totalThreads}. Balanced: ~
                {(100 / Math.max(arenas.length, 1)).toFixed(0)}% per pool.
              </div>
            </div>

            {/* Load Balance */}
            <div className="card" style={{ padding: 16 }}>
              <SectionTitle>Pool Load Balance (by Alloc Rate)</SectionTitle>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {sortedArenasByLoad.map((a) => {
                  const rate = arenaAllocations[a.id]?.total?.nrequests_ps || 0;
                  const pct = maxLoad > 0 ? (rate / maxLoad) * 100 : 0;
                  const cls = pct > 66 ? "hot" : pct > 33 ? "warm" : "cool";
                  const alloc = a.stats.allocated || 0;
                  const active = a.stats.active || 0;
                  const frag = alloc > 0 ? ((active - alloc) / alloc) * 100 : 0;
                  return (
                    <HeatmapBar
                      key={a.id}
                      label={`Pool ${a.id}`}
                      colorClass={cls}
                      widthPct={pct}
                      content={`${fmtNum(rate)} req/s`}
                      tooltip={`Allocated: ${fmtBytes(alloc)}, Fragmentation: ${frag.toFixed(1)}%`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pool Comparison Table */}
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <SectionTitle>Pool Comparison</SectionTitle>
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              <table className="data-table">
                <thead
                  style={{
                    backgroundColor: "var(--bg-page)",
                  }}
                >
                  <tr>
                    <th>Pool</th>
                    <th style={{ textAlign: "right" }}>Used by Queries</th>
                    <th style={{ textAlign: "right" }}>Given to Allocator</th>
                    <th style={{ textAlign: "right" }}>Physical RAM</th>
                    <th style={{ textAlign: "right" }}>Fragmentation</th>
                    <th style={{ textAlign: "right" }}>Threads</th>
                  </tr>
                </thead>
                <tbody>
                  {arenas.map((a) => {
                    const alloc = a.stats.allocated || 0;
                    const active = a.stats.active || 0;
                    const frag =
                      alloc > 0 ? ((active - alloc) / alloc) * 100 : 0;
                    const fragColor =
                      frag > 25
                        ? "var(--color-danger)"
                        : frag > 15
                          ? "var(--color-warning)"
                          : "var(--text-primary)";
                    return (
                      <tr key={a.id}>
                        <td style={{ fontFamily: "var(--font-code)" }}>
                          Pool {a.id}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {fmtBytes(alloc)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {fmtBytes(active)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {fmtBytes(a.stats.resident || 0)}
                        </td>
                        <td style={{ textAlign: "right", color: fragColor }}>
                          {frag.toFixed(1)}%
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {a.stats.assigned_threads || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ROW 5: Allocation Hotspots */}
      {(hotBins.length > 0 || wastefulBins.length > 0) && (
        <>
          <InfoBanner>
            Which allocation sizes are busiest and which are wasting the most
            memory. If one size dominates, queries may benefit from tuning
            max_bytes_before_external_group_by.
          </InfoBanner>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {hotBins.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <SectionTitle>
                  Busiest Sizes (top 15 by alloc rate)
                </SectionTitle>
                {hotBins.map((b, i) => {
                  const pct = (b.nrequests_ps / maxBinRate) * 100;
                  const cls = pct > 66 ? "hot" : pct > 33 ? "warm" : "cool";
                  return (
                    <HeatmapBar
                      key={i}
                      label={fmtBytes(b.size)}
                      colorClass={cls}
                      widthPct={pct}
                      content={`${fmtNum(b.nrequests_ps)} req/s`}
                    />
                  );
                })}
              </div>
            )}
            {wastefulBins.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <SectionTitle>
                  Most Wasteful Sizes (top 15 by waste)
                </SectionTitle>
                {wastefulBins.map((b, i) => {
                  const pct = (b.waste / maxWaste) * 100;
                  const cls =
                    b.util < 0.5 ? "hot" : b.util < 0.7 ? "warm" : "cool";
                  return (
                    <HeatmapBar
                      key={i}
                      label={fmtBytes(b.size)}
                      colorClass={cls}
                      widthPct={pct}
                      content={`${(b.util * 100).toFixed(0)}% used (${fmtBytes(b.waste)} waste)`}
                      tooltip={`Allocated: ${fmtBytes(b.allocated)}, Slot Usage: ${(b.util * 100).toFixed(1)}%`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      <InfoBanner>
        Internal allocator locks. Healthy systems show zero wait times. Non-zero
        values mean threads are blocking each other during memory operations.
      </InfoBanner>
      {/* ROW 6: Lock Contention (conditional) */}
      {showContention && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <SectionTitle>Lock Contention</SectionTitle>
          <div style={{ overflow: "auto" }}>
            <table className="data-table" style={{ fontSize: "12px" }}>
              <thead>
                <tr>
                  <th>Lock Name</th>
                  <th
                    style={{ textAlign: "right" }}
                    title="Total lock acquisitions"
                  >
                    Lock Ops
                  </th>
                  <th
                    style={{ textAlign: "right" }}
                    title="Times a thread had to spin-wait for the lock"
                  >
                    Spin Waits
                  </th>
                  <th
                    style={{ textAlign: "right" }}
                    title="Times a thread had to sleep-wait for the lock"
                  >
                    Blocked
                  </th>
                  <th
                    style={{ textAlign: "right" }}
                    title="Cumulative nanoseconds spent waiting"
                  >
                    Total Wait
                  </th>
                  <th
                    style={{ textAlign: "right" }}
                    title="Longest single wait in nanoseconds"
                  >
                    Worst Wait
                  </th>
                </tr>
              </thead>
              <tbody>
                {operations.mutexStats
                  .filter(
                    (m) =>
                      m.n_spin_acq > 0 ||
                      m.n_waiting > 0 ||
                      m.total_wait_ns > 0,
                  )
                  .map((m) => (
                    <tr key={m.name}>
                      <td style={{ fontFamily: "var(--font-code)" }}>
                        {m.name}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtNum(m.n_lock_ops)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          color:
                            m.n_spin_acq > 0
                              ? "var(--color-warning)"
                              : undefined,
                        }}
                      >
                        {fmtNum(m.n_spin_acq)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          color:
                            m.n_waiting > 0 ? "var(--color-danger)" : undefined,
                        }}
                      >
                        {fmtNum(m.n_waiting)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtNum(m.total_wait_ns)} ns
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtNum(m.max_wait_ns)} ns
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ROW 7: Collapsed Detail Sections */}
      <div
        style={{ borderTop: "1px solid var(--border-default)", paddingTop: 12 }}
      >
        <CollapsibleSection title="All Allocation Sizes (full table)">
          <div style={{ overflow: "auto", maxHeight: 400 }}>
            <table className="data-table" style={{ fontSize: "0.75rem" }}>
              <thead>
                <tr>
                  <th>Size</th>
                  <th style={{ textAlign: "right" }}>Allocated</th>
                  <th style={{ textAlign: "right" }}>Alloc Rate</th>
                  <th style={{ textAlign: "right" }}>Current Count</th>
                  <th style={{ textAlign: "right" }}>Active Slabs</th>
                  <th style={{ textAlign: "right" }}>Slot Usage</th>
                  <th style={{ textAlign: "right" }}>Total Allocs</th>
                  <th style={{ textAlign: "right" }}>Total Frees</th>
                  <th style={{ textAlign: "right" }}>Cache Fills</th>
                  <th style={{ textAlign: "right" }}>Cache Flushes</th>
                </tr>
              </thead>
              <tbody>
                {globalBins.map((b, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-code)" }}>
                      {fmtBytes(b.size)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {fmtBytes(b.allocated)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {fmtRate(b.nrequests_ps)}/s
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtNum(b.curregs)}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(b.curslabs)}</td>
                    <td style={{ textAlign: "right" }}>
                      {(b.util * 100).toFixed(1)}%
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtNum(b.nmalloc)}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(b.ndalloc)}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(b.nfills)}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(b.nflushes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Large Allocations">
          {globalLarge.length > 0 ? (
            <div style={{ overflow: "auto", maxHeight: 400 }}>
              <table className="data-table" style={{ fontSize: "0.75rem" }}>
                <thead>
                  <tr>
                    <th>Size</th>
                    <th style={{ textAlign: "right" }}>Allocated</th>
                    <th style={{ textAlign: "right" }}>Alloc Rate</th>
                    <th style={{ textAlign: "right" }}>Total Allocs</th>
                    <th style={{ textAlign: "right" }}>Total Frees</th>
                    <th style={{ textAlign: "right" }}>Current Extents</th>
                  </tr>
                </thead>
                <tbody>
                  {globalLarge.map((l, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "var(--font-code)" }}>
                        {fmtBytes(l.size)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtBytes(l.allocated)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtRate(l.nrequests_ps)}/s
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtNum(l.nmalloc)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtNum(l.ndalloc)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtNum(l.curlextents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              No large allocation data
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Memory Regions (extents)">
          {globalExtents.length > 0 ? (
            <div style={{ overflow: "auto", maxHeight: 400 }}>
              <table className="data-table" style={{ fontSize: "0.75rem" }}>
                <thead>
                  <tr>
                    <th>Size</th>
                    <th
                      style={{ textAlign: "right" }}
                      title="Pages recently freed, not yet returned to OS"
                    >
                      Dirty Pages
                    </th>
                    <th style={{ textAlign: "right" }}>Dirty Bytes</th>
                    <th
                      style={{ textAlign: "right" }}
                      title="Pages advised to OS but not yet reclaimed"
                    >
                      Muzzy Pages
                    </th>
                    <th style={{ textAlign: "right" }}>Muzzy Bytes</th>
                    <th
                      style={{ textAlign: "right" }}
                      title="Virtual memory held in reserve"
                    >
                      Retained Pages
                    </th>
                    <th style={{ textAlign: "right" }}>Retained Bytes</th>
                    <th style={{ textAlign: "right" }}>Total Pages</th>
                    <th style={{ textAlign: "right" }}>Total Bytes</th>
                  </tr>
                </thead>
                <tbody>
                  {globalExtents.map((e, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "var(--font-code)" }}>
                        {fmtBytes(e.size)}
                      </td>
                      <td style={{ textAlign: "right" }}>{fmtNum(e.ndirty)}</td>
                      <td style={{ textAlign: "right" }}>
                        {fmtBytes(e.dirty)}
                      </td>
                      <td style={{ textAlign: "right" }}>{fmtNum(e.nmuzzy)}</td>
                      <td style={{ textAlign: "right" }}>
                        {fmtBytes(e.muzzy)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtNum(e.nretained)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmtBytes(e.retained)}
                      </td>
                      <td style={{ textAlign: "right" }}>{fmtNum(e.ntotal)}</td>
                      <td style={{ textAlign: "right" }}>
                        {fmtBytes(e.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              No extent data
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Per-Pool Drill-down">
          {arenas.length > 0 && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: "13px", marginRight: 8 }}>
                  Select Pool:
                </label>
                <Select
                  className="form-select"
                  style={{ width: 120 }}
                  value={selectedArena}
                  onChange={(e) =>
                    setSelectedArena(parseInt(e.target.value, 10))
                  }
                >
                  {arenas.map((a) => (
                    <option key={a.id} value={a.id}>
                      Pool {a.id}
                    </option>
                  ))}
                </Select>
              </div>
              {(() => {
                const ab = arenaBinsMap[selectedArena] || [];
                const al = arenaLargeMap[selectedArena] || [];
                const ae = arenaExtentsMap[selectedArena] || [];
                const aa = arenaAllocations[selectedArena];
                return (
                  <div>
                    {aa && (
                      <div style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            marginBottom: 6,
                          }}
                        >
                          Allocations
                        </div>
                        <table
                          className="data-table"
                          style={{ fontSize: "0.75rem" }}
                        >
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th style={{ textAlign: "right" }}>Allocated</th>
                              <th style={{ textAlign: "right" }}>Alloc Rate</th>
                              <th style={{ textAlign: "right" }}>
                                Total Allocs
                              </th>
                              <th style={{ textAlign: "right" }}>
                                Total Frees
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {["small", "large", "total"].map(
                              (t) =>
                                aa[t] && (
                                  <tr key={t}>
                                    <td>{t}</td>
                                    <td style={{ textAlign: "right" }}>
                                      {fmtBytes(aa[t].allocated)}
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                      {fmtNum(aa[t].nrequests_ps)}/s
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                      {fmtNum(aa[t].nmalloc)}
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                      {fmtNum(aa[t].ndalloc)}
                                    </td>
                                  </tr>
                                ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div
                      style={{ fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      {ab.length} bin sizes, {al.length} large sizes,{" "}
                      {ae.length} extent sizes in this pool
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Raw jemalloc Output">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(rawText);
                toast?.success("Raw jemalloc copied");
              }}
            >
              <Icon className="ti ti-copy" /> Copy
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const blob = new Blob([rawText], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `jemalloc-stats-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Icon className="ti ti-download" /> Save
            </button>
          </div>
          <pre
            style={{
              fontFamily: "var(--font-code)",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              padding: 12,
              background: "var(--bg-sunken)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
              maxHeight: 500,
              overflow: "auto",
              whiteSpace: "pre",
              color: "var(--text-primary)",
            }}
          >
            {rawText}
          </pre>
        </CollapsibleSection>
      </div>
    </div>
  );
}
