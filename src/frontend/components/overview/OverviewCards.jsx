// Copyright (C) 2026 Quantrail™ Data Private Limited
// Card primitives for the Cluster Overview live section.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import InfoTip from "../common/InfoTip.jsx";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";
import { initChart, disposeChart } from "../../utils/echarts.js";
import { METRICS } from "./overviewMetrics.js";
import { polish, stageGauge, useIsDark } from "./overviewChart.js";
import { NO_VALUE } from "./overviewMath.js";

const GAUGE_HEIGHT = 188;

const CHART_TOOLS = { zoomFun: false, resetFun: false, saveFun: true, fullscreenFun: true };

/** Format a derived value for display. null becomes a dash, never NaN. */
export function formatValue(value, unit) {
  if (value === NO_VALUE || value === undefined || !Number.isFinite(value)) return "-";

  if (unit === "%") return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
  if (unit === "bytes" || unit === "B/s") return formatBytes(value, unit === "B/s");
  if (unit === "x") return `${value.toFixed(value < 10 ? 2 : 1)}x`;
  if (unit === "cores") return value.toFixed(2);
  if (unit === "ms") return value.toFixed(value < 10 ? 2 : 0);

  // Any other unit falls through to a compact number here, and KpiValue prints
  // the unit beside it. 
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value < 10 ? 2 : 1);
}

function formatBytes(n, perSecond) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = Math.abs(n);
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const sign = n < 0 ? "-" : "";
  return `${sign}${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[u]}${perSecond ? "/s" : ""}`;
}

// A card holding one ECharts option, with save and fullscreen.

export function ChartCard({
  metricKey,
  title,
  option,
  type = "line",
  format = "count",
  height = 260,
  emptyMessage = "Collecting...",
}) {
  const meta = METRICS[metricKey] || {};
  const dark = useIsDark();
  const elRef = useRef(null);
  const instRef = useRef(null);
  const tools = useChartTools(() => instRef.current, { filename: title || meta.label || "chart" });

  // Theming, units, spacing and label positions all happen in one place. See
  // overviewChart.js for why buildChartOption's output needs it.
  const finalOption = useMemo(
    () => polish(option, { type, format, dark }),
    [option, type, format, dark],
  );

  // Same reason as MiniGauge: the echarts theme is fixed when the instance is
  // created, so a theme change needs a new instance rather than a new option.
  useEffect(() => {
    if (!elRef.current) return undefined;
    if (instRef.current) {
      disposeChart(elRef.current);
      instRef.current = null;
    }
    return undefined;
  }, [dark]);

  useEffect(() => {
    if (!elRef.current || !finalOption) return undefined;
    if (!instRef.current) instRef.current = initChart(elRef.current);
    try {
      // notMerge, so removing the toolbox and legend actually removes them
      // rather than leaving the previous render's copy behind.
      instRef.current.setOption(finalOption, true);
    } catch {
      // A malformed option should not take the page down with it.
    }
    return undefined;
  }, [finalOption, dark]);

  // Fullscreen changes the container size after the style has been applied, so
  // the resize has to wait a frame or echarts measures the old box.
  useEffect(() => {
    const timer = setTimeout(() => instRef.current?.resize(), 150);
    return () => clearTimeout(timer);
  }, [tools.fullscreen]);

  useEffect(() => {
    const onResize = () => instRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(
    () => () => {
      if (elRef.current) disposeChart(elRef.current);
      instRef.current = null;
    },
    [],
  );

  const shell = tools.fullscreen
    ? {
        padding: 16,
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg-page)",
        display: "flex",
        flexDirection: "column",
      }
    : { padding: "12px 12px 8px" };

  return (
    <div className="card" style={shell}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          minHeight: 28,
        }}
      >
        <h3
          style={{
            fontSize: "0.9375rem",
            margin: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {title || meta.label}
        </h3>
        <InfoTip what={meta.what} read={meta.read} formula={meta.formula} unit={meta.unit} />
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <ChartToolbar
            fullscreen={tools.fullscreen}
            onSave={tools.save}
            onToggleFullscreen={tools.toggleFullscreen}
            isWantFeature={CHART_TOOLS}
          />
        </div>
      </div>

      {finalOption ? (
        <div
          ref={elRef}
          style={{
            height: tools.fullscreen ? "calc(100vh - 120px)" : height,
            width: "100%",
            flex: tools.fullscreen ? 1 : undefined,
          }}
        />
      ) : (
        <div
          style={{
            height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: "0.8125rem",
            fontStyle: "italic",
          }}
        >
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

//  A compact row of single-value readings.

export function KpiStrip({ title, items, minWidth = 168 }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      {title && (
        <h3 style={{ fontSize: "0.9375rem", margin: "0 0 12px" }}>{title}</h3>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
          gap: 12,
        }}
      >
        {items.map((item) => (
          <KpiValue key={item.key} metricKey={item.key} value={item.value} />
        ))}
      </div>
    </div>
  );
}

function KpiValue({ metricKey, value }) {
  const meta = METRICS[metricKey] || {};
  const unavailable = value === NO_VALUE || value === undefined || !Number.isFinite(value);

  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: "0.6875rem",
          fontWeight: 700,
          color: "var(--text-secondary, var(--text-muted))",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          minWidth: 0,
        }}
      >
        <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {meta.label}
        </span>
        <InfoTip what={meta.what} read={meta.read} formula={meta.formula} unit={meta.unit} />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          fontFamily: "var(--font-chart)",
          fontWeight: 700,
          fontSize: "1.25rem",
          color: unavailable ? "var(--text-muted)" : "var(--text-primary)",
          marginTop: 2,
        }}
        title={unavailable ? "Not enough samples yet, or nothing happened in this window" : undefined}
      >
        <span>{formatValue(value, meta.unit)}</span>
        {!unavailable && meta.unit && !["%", "x", "bytes", "B/s"].includes(meta.unit) && (
          <span style={{ fontSize: "0.6875rem", fontWeight: 500, color: "var(--text-muted)" }}>
            {meta.unit}
          </span>
        )}
      </div>
    </div>
  );
}

// The health strip. Chips read green at zero, so a healthy server collapses to one quiet line 
export function HealthStrip({ chips }) {
  const [showHealthy, setShowHealthy] = useState(false);
  const bad = chips.filter((c) => c.value > 0);
  const good = chips.filter((c) => !(c.value > 0));
  const visible = showHealthy ? [...bad, ...good] : bad;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {bad.length === 0 && !showHealthy && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--color-success)",
              fontSize: "0.8125rem",
              fontWeight: 600,
            }}
          >
            <Icon className="ti ti-circle-check" />
            All {chips.length} health checks are clear
          </span>
        )}

        {visible.map((chip) => {
          const alarming = chip.value > 0;
          const color = !alarming
            ? "var(--color-success)"
            : chip.severity === "danger"
              ? "var(--color-danger)"
              : "var(--color-warning)";
          // The theme already ships a matching translucent fill for each of
          // these, which avoids color-mix()
          const tint = !alarming
            ? "transparent"
            : chip.severity === "danger"
              ? "var(--color-danger-bg)"
              : "var(--color-warning-bg)";
          return (
            <span
              key={chip.key}
              title={chip.hint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 12,
                fontSize: "0.75rem",
                border: `1px solid ${color}`,
                color,
                background: tint,
              }}
            >
              <span
                style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
              />
              {chip.label}
              {alarming && <strong style={{ fontFamily: "var(--font-chart)" }}>{chip.value}</strong>}
            </span>
          );
        })}

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={() => setShowHealthy((v) => !v)}
        >
          {showHealthy ? "Hide clear checks" : `Show all ${chips.length} checks`}
        </button>
      </div>
    </div>
  );
}

// One small staged gauge with its label underneath.

function MiniGauge({ metricKey, label, value, formatter, dark }) {
  const meta = METRICS[metricKey] || {};
  const elRef = useRef(null);
  const instRef = useRef(null);

  // No `better` here: the bands are fixed green through red on every dial, and
  // any reading that is naturally better-high is inverted in overviewMetrics.js

  const option = useMemo(
    () => stageGauge({ value, dark, formatter, size: GAUGE_HEIGHT }),
    [value, dark, formatter],
  );

  // initChart bakes the echarts theme in at construction, so an instance built
  // under the dark theme keeps it forever no matter what option is set on it.

  useEffect(() => {
    if (!elRef.current) return undefined;
    if (instRef.current) {
      disposeChart(elRef.current);
      instRef.current = null;
    }
    instRef.current = initChart(elRef.current);
    return undefined;
  }, [dark]);

  useEffect(() => {
    if (!elRef.current) return undefined;
    if (!instRef.current) instRef.current = initChart(elRef.current);
    try {
      instRef.current.setOption(option, true);
    } catch {
      // A bad option should not take the group down with it.
    }
    return undefined;
  }, [option, dark]);

  useEffect(() => {
    const onResize = () => instRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(
    () => () => {
      if (elRef.current) disposeChart(elRef.current);
      instRef.current = null;
    },
    [],
  );

  return (
    <div style={{ minWidth: 0, textAlign: "center" }}>
      <div ref={elRef} style={{ height: GAUGE_HEIGHT, width: "100%" }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          marginTop: -20,
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--text-muted)",
          minWidth: 0,
        }}
      >
        <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
          title={label || meta.label}
        >
          {label || meta.label}
        </span>
        <InfoTip what={meta.what} read={meta.read} formula={meta.formula} unit={meta.unit} />
      </div>
    </div>
  );
}

// Every percentage on the page in one card.

export function GaugeGroup({ title, subtitle, items, columns = 5 }) {
  const dark = useIsDark();
  const shown = items.filter((i) => i.show !== false);
  if (!shown.length) return null;

  return (
    <div className="card" style={{ padding: "12px 16px 8px", marginBottom: 16 }}>
      {title && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <h3 style={{ fontSize: "0.9375rem", margin: 0 }}>{title}</h3>
          {subtitle && (
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{subtitle}</span>
          )}
        </div>
      )}
      <div
        style={{
          display: "grid",
          // max() caps the row at five: a 19 percent minimum means a sixth cannot
          // fit, while the 190px floor still lets the grid drop to four, three
          // or two as the window narrows.
          gridTemplateColumns: "repeat(auto-fit, minmax(max(19%, 190px), 1fr))",
          gap: 10,
        }}
      >
        {shown.map((item) => (
          <MiniGauge
            key={item.key || item.label}
            metricKey={item.key}
            label={item.label}
            value={item.value}
            formatter={item.formatter}
            dark={dark}
          />
        ))}
      </div>
    </div>
  );
}

// A collapsible section with its state remembered.

export function Section({ id, icon, title, summary, defaultOpen = true, children }) {
  const key = `chops_overview_open_${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? defaultOpen : JSON.parse(raw);
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(open));
    } catch {
      // A browser refusing local storage is not a reason to break the page.
    }
  }, [key, open]);

  return (
    <div style={{ marginBottom: open ? 16 : 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn btn-ghost"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          justifyContent: "flex-start",
          padding: "8px 10px",
          marginBottom: open ? 10 : 0,
        }}
      >
        <Icon className={`ti ti-chevron-${open ? "up" : "down"}`} />
        {icon && <Icon className={`ti ${icon}`} />}
        <span
          style={{
            fontSize: "0.8125rem",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 700,
            color: "var(--text-secondary, var(--text-muted))",
          }}
        >
          {title}
        </span>
        {summary && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>
            {summary}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}
