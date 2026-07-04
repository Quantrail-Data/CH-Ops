// ErrorLog - View and search ClickHouse® error logs
//
// Displays system.error_log with two modes: Overview and Search. The
// Overview is a metrics dashboard built from system.error_log (which is a
// periodic time series of per-code error counts, not a per-event log): it
// shows total/distinct/remote stat cards, a Local vs Remote split, the top
// error types by total count, error rate over time (stacked area of the
// top-N codes plus Other), and a top-errors table with a sample message and
// the offending query_id per code. The Search view supports filtering by
// error type (multi-select), message text, and time range.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery.js';
import { runQuery } from '../../utils/api.js';
import DataTable from '../layout/DataTable.jsx';
import { DateTimePicker } from '../layout/DateTimePicker.jsx';
import { useToast } from '../layout/Toast.jsx';
import ChartCard from '../layout/ChartCard.jsx';
import { initChart, disposeChart } from '../../utils/echarts.js';
import ChartToolbar, { useChartTools } from '../common/ChartToolbar.jsx';

const pad = n => String(n).padStart(2, '0');
const fmtAgo = h => { const d = new Date(Date.now()-h*3600000); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const fmtNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

export default function ErrorLog() {
  const { tab: routeTab = 'overview' } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/logs/error/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-bug"></Icon> Error Log</h2></div>
      <div className="tab-bar">
        <div className={`tab-item ${routeTab === 'overview' ? 'active' : ''}`} onClick={() => handleTabChange('overview')}><Icon className="ti ti-chart-dots-3"></Icon> Overview</div>
        <div className={`tab-item ${routeTab === 'search' ? 'active' : ''}`} onClick={() => handleTabChange('search')}><Icon className="ti ti-search"></Icon> Search</div>
      </div>
      {routeTab === 'overview' && <ErrorLogOverview />}
      {routeTab === 'search' && <ErrorLogSearch />}
    </div>
  );
}

/* Overview dashboard */

// Quick-range presets -> hours back, and the bucket size (seconds) used for
// the error-rate time series. Buckets are kept in the ~60-170 range so the
// stacked area stays readable across every preset.
const RANGE_HOURS = { '1h': 1, '6h': 6, '24h': 24, '48h': 48, '7d': 168, '30d': 720 };
const RANGE_ROUNDING = { '1h': 60, '6h': 300, '24h': 600, '48h': 1800, '7d': 3600, '30d': 21600 };
const PRESETS = ['1h', '6h', '24h', '48h', '7d', '30d'];

// The error-rate chart plots every distinct error code in range as its own
// stacked band; if there are more than this many, the rest collapse into a
// single "Other" band (guards the browser against pathological cardinality).
// The right-side legend is scrollable, so a large code count stays navigable.
const RATE_MAX = 200;

// Fixed, high-contrast series palette. These mid-tone hues stay legible on
// both the light and dark themes, so they do not need CSS-variable resolution
// (unlike anything passed to ECharts, which cannot read CSS custom properties).
const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

const fmtInt = v => (Number(v) || 0).toLocaleString('en-US');

// Shared time x-axis: real time spacing, ~3 labels, yyyy-MM-DD HH:mm. Colours
// are left unset so the registered ECharts theme (chops-light/chops-dark)
// supplies them; the chart remounts on theme change so they re-resolve.
function timeAxis(from, to) {
  const min = from ? new Date(from.replace(' ', 'T')).getTime() : undefined;
  const max = to ? new Date(to.replace(' ', 'T')).getTime() : undefined;
  return {
    type: 'time', min, max, splitNumber: 3,
    axisLabel: {
      hideOverlap: true,
      formatter: (ms) => {
        const d = new Date(ms);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      },
    },
  };
}

// Horizontal ranked bar of top error codes by total count.
function barOption(rows) {
  const data = rows.map(r => ({ name: String(r.error), total: Number(r.total) || 0 }));
  return {
    grid: { left: 12, right: 30, top: 10, bottom: 10, containLabel: true },
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'shadow' },
      formatter: p => `${p[0].name}: ${fmtInt(p[0].value)}`,
    },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category', inverse: true,
      data: data.map(d => d.name),
      axisLabel: { width: 170, overflow: 'truncate' },
    },
    series: [{
      type: 'bar', barMaxWidth: 18,
      data: data.map((d, i) => ({
        value: d.total,
        itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 3, 3, 0] },
      })),
    }],
  };
}

// Pivot long-format rate rows ({ t, error, v }) into one zero-filled stacked
// series per error code. Zero-fill happens here (not via SQL WITH FILL) so we
// avoid the per-group fill trap, and so any number of codes is supported.
// Codes beyond RATE_MAX (by total) collapse into a single "Other" band.
function buildRateSeries(rows, from, to, rounding) {
  const r = Number(rounding) || 3600;
  const fromSec = from ? Math.floor(new Date(from.replace(' ', 'T')).getTime() / 1000) : 0;
  const toSec = to ? Math.floor(new Date(to.replace(' ', 'T')).getTime() / 1000) : 0;
  // Align to interval boundaries the same way toStartOfInterval does (floor to r).
  const b0 = Math.floor(fromSec / r) * r;
  const b1 = Math.floor(toSec / r) * r;
  const buckets = [];
  for (let b = b0; b <= b1; b += r) buckets.push(b);

  const totals = new Map();           // error -> grand total
  const perError = new Map();         // error -> Map(bucket -> value)
  for (const row of rows) {
    const name = String(row.error);
    const tt = Number(row.t);
    const v = Number(row.v) || 0;
    totals.set(name, (totals.get(name) || 0) + v);
    let m = perError.get(name);
    if (!m) { m = new Map(); perError.set(name, m); }
    m.set(tt, (m.get(tt) || 0) + v);
  }

  let names = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  if (names.length > RATE_MAX) {
    const keep = names.slice(0, RATE_MAX);
    const rest = names.slice(RATE_MAX);
    const om = new Map();
    for (const n of rest) {
      const m = perError.get(n);
      if (!m) continue;
      for (const [tt, v] of m) om.set(tt, (om.get(tt) || 0) + v);
    }
    if (!perError.has('Other')) perError.set('Other', om);
    names = [...keep, 'Other'];
  }

  const series = names.map((name, i) => {
    const c = PALETTE[i % PALETTE.length];
    const m = perError.get(name) || new Map();
    return {
      name, type: 'line', stack: 'total', smooth: false, symbol: 'none',
      itemStyle: { color: c },
      lineStyle: { color: c, width: 1 },
      areaStyle: { color: c, opacity: 0.28 },
      emphasis: { focus: 'series' },
      data: buckets.map(b => [b * 1000, m.get(b) || 0]),
    };
  });
  const legendItems = names.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length] }));
  return { series, names, legendItems };
}

// Donut: local vs remote exceptions over the range.
function donutOption(local, remote) {
  return {
    tooltip: {
      trigger: 'item', confine: true,
      formatter: p => `${p.name}: ${fmtInt(p.value)} (${p.percent}%)`,
    },
    legend: { show: true, bottom: 0 },
    series: [{
      type: 'pie', radius: ['45%', '70%'], avoidLabelOverlap: true,
      label: { show: true, formatter: '{b} ({d}%)', color: 'inherit', fontSize: 11 }, labelLine: { show: true },
      data: [
        { name: 'Local', value: local, itemStyle: { color: '#3b82f6' } },
        { name: 'Remote', value: remote, itemStyle: { color: '#f59e0b' } },
      ],
    }],
  };
}

function Stat({ label, value, icon, color, small }) {
  return (
    <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, minHeight: 84 }}>
      {icon && <Icon className={`ti ${icon}`} style={{ fontSize: 28, color: color || 'var(--accent)', opacity: 0.9, flexShrink: 0 }}></Icon>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: small ? '1.05rem' : '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      </div>
    </div>
  );
}

// Per-section error slot so one failed query does not blank the whole page.
function SectionError({ title, message }) {
  return (
    <div className="card" style={{ padding: 16, minHeight: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--color-danger)', fontSize: '13px', lineHeight: 1.5, wordBreak: 'break-word' }}>
        <Icon className="ti ti-alert-circle" style={{ flexShrink: 0, marginTop: 2 }}></Icon>
        <span>{message}</span>
      </div>
    </div>
  );
}

// Error Rate Over Time: stacked-area chart with a custom legend on the RIGHT
// that scrolls vertically, so it stays usable even with hundreds of error
// codes. The built-in ECharts legend is disabled; visibility is driven by
// legend.selected via setOption (merge), which preserves zoom and works even
// though the legend is not rendered. The chart remounts on theme change
// (parent passes a themeKey-keyed instance), which also resets the toggles.
function RateChart({ rows, from, to, rounding }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const tools = useChartTools(() => chartRef.current, { filename: 'error-rate' });

  const { series, names, legendItems } = useMemo(
    () => buildRateSeries(rows, from, to, rounding),
    [rows, from, to, rounding],
  );

  // (Re)build the chart whenever the data (series) changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = initChart(containerRef.current);
    chartRef.current = chart;
    chart.setOption({
      grid: { left: 12, right: 16, top: 16, bottom: 36, containLabel: true },
      tooltip: {
        trigger: 'axis', confine: true,
        // With many series a full list is unusable: show only non-zero codes,
        // largest first, capped, plus a running total.
        formatter: (ps) => {
          if (!ps || !ps.length) return '';
          const ms = ps[0].value && ps[0].value[0];
          const d = new Date(ms);
          const head = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          const items = ps
            .map(p => ({ n: p.seriesName, v: Number(p.value && p.value[1]) || 0, m: p.marker }))
            .filter(it => it.v > 0)
            .sort((a, b) => b.v - a.v);
          const total = items.reduce((a, it) => a + it.v, 0);
          const top = items.slice(0, 12).map(it => `${it.m}${it.n}: ${fmtInt(it.v)}`).join('<br/>');
          const more = items.length > 12 ? `<br/>+${items.length - 12} more` : '';
          return `${head}<br/>${top}${more}<br/><b>Total: ${fmtInt(total)}</b>`;
        },
      },
      legend: { show: false, data: names, selected: Object.fromEntries(names.map(n => [n, true])) },
      toolbox: { show: false },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
      xAxis: timeAxis(from, to),
      yAxis: { type: 'value' },
      series,
    }, true);
    setTimeout(() => chartRef.current && chartRef.current.resize(), 50);
    return () => { disposeChart(containerRef.current); chartRef.current = null; };
  }, [series, names, from, to]);

  // Apply show/hide selection without resetting zoom (merge setOption).
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({
      legend: { selected: Object.fromEntries(names.map(n => [n, !hidden.has(n)])) },
    });
  }, [hidden, names]);

  // Refit on fullscreen toggle; Escape exits.
  useEffect(() => {
    const t = setTimeout(() => chartRef.current && chartRef.current.resize(), 150);
    if (!fullscreen) return () => clearTimeout(t);
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);

  const toggle = (name) => setHidden(prev => {
    const n = new Set(prev);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });
  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(names));

  const chartH = fullscreen ? 'calc(100vh - 130px)' : 428;

  return (
    <div style={fullscreen
      ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', padding: 16, display: 'flex', flexDirection: 'column' }
      : { position: 'relative' }}>
      <div className="card" style={{ padding: 16, flex: fullscreen ? 1 : undefined, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>Error Rate Over Time</span>
          <ChartToolbar
            zoomable
            fullscreen={fullscreen}
            onZoomIn={tools.zoomIn}
            onZoomOut={tools.zoomOut}
            onZoomReset={tools.zoomReset}
            onSave={tools.save}
            onToggleFullscreen={() => setFullscreen(f => !f)}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, flex: fullscreen ? 1 : undefined, minHeight: 0 }}>
          <div ref={containerRef} style={{ flex: 1, minWidth: 0, height: fullscreen ? '100%' : chartH }} />
          <div style={{ width: 196, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, height: fullscreen ? '100%' : chartH, borderLeft: '1px solid var(--border-default)', paddingLeft: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexShrink: 0 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Series ({names.length})</span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', padding: '2px 7px' }} onClick={showAll}>All</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', padding: '2px 7px' }} onClick={hideAll}>None</button>
              </span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1, paddingRight: 4 }}>
              {legendItems.map(it => {
                const off = hidden.has(it.name);
                return (
                  <button
                    key={it.name}
                    onClick={() => toggle(it.name)}
                    title={it.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 4px', borderRadius: 4, opacity: off ? 0.4 : 1, textAlign: 'left', width: '100%' }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color, flexShrink: 0, filter: off ? 'grayscale(1)' : 'none' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorLogOverview() {
  const [duration, setDuration] = useState('7d');
  const [from, setFrom] = useState(fmtAgo(168));
  const [to, setTo] = useState(fmtNow());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState({ summary: [], top: [], rate: [], table: [], rng: { from: null, to: null, r: 3600 } });
  const [errs, setErrs] = useState({});
  // Bumped on theme change so charts remount and the registered ECharts theme
  // re-resolves axis/legend colours (ECharts captures them once at init).
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey(k => k + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  function applyDuration(d) {
    setDuration(d);
    setFrom(fmtAgo(RANGE_HOURS[d] || 168));
    setTo(fmtNow());
  }

  const load = useCallback(async () => {
    setLoading(true);
    const r = RANGE_ROUNDING[duration] || 3600;
    const f = from, t = to;
    const next = { summary: [], top: [], rate: [], table: [], rng: { from: f, to: t, r } };
    const e = {};

    // 1) summary: totals/distinct/last/remote in one row (always returns a row).
    try {
      const res = await runQuery(`SELECT sum(value) AS total_errors, uniqExact(error) AS distinct_errors, max(last_error_time) AS last_seen, sumIf(value, remote = 1) AS remote_errors FROM system.error_log WHERE event_time BETWEEN '${f}' AND '${t}'`);
      next.summary = res.rows || [];
    } catch (err) { e.summary = err.message || 'Query failed'; }

    // 2) top error codes by total count (drives the bar + the area's series).
    try {
      const res = await runQuery(`SELECT error, sum(value) AS total FROM system.error_log WHERE event_time BETWEEN '${f}' AND '${t}' GROUP BY error ORDER BY total DESC LIMIT 15`);
      next.top = res.rows || [];
    } catch (err) { e.top = err.message || 'Query failed'; }

    // 3) error rate over time: one row per (bucket, error). Pivot + zero-fill
    //    happen client-side in buildRateSeries, which avoids the per-group
    //    WITH FILL trap and supports any number of distinct codes.
    try {
      const sql = `SELECT toStartOfInterval(event_time, INTERVAL ${r} SECOND)::INT AS t, error, sum(value) AS v FROM system.error_log WHERE event_time BETWEEN '${f}' AND '${t}' GROUP BY t, error`;
      const res = await runQuery(sql);
      next.rate = res.rows || [];
    } catch (err) { e.rate = err.message || 'Query failed'; }

    // 4) top-errors table: total count + the most-recent sample message and
    //    offending query_id per code (argMax over last_error_time).
    try {
      const res = await runQuery(`SELECT error, sum(value) AS count, argMax(last_error_message, last_error_time) AS last_message, argMax(last_error_query_id, last_error_time) AS last_query_id, max(last_error_time) AS last_seen FROM system.error_log WHERE event_time BETWEEN '${f}' AND '${t}' GROUP BY error ORDER BY count DESC LIMIT 50`);
      next.table = res.rows || [];
    } catch (err) { e.table = err.message || 'Query failed'; }

    setData(next);
    setErrs(e);
    setLoaded(true);
    setLoading(false);
  }, [from, to, duration]);

  const summaryRow = data.summary?.[0] || {};
  const total = Number(summaryRow.total_errors) || (data.top.reduce((a, x) => a + (Number(x.total) || 0), 0));
  const distinct = Number(summaryRow.distinct_errors) || data.top.length;
  const remoteErr = Number(summaryRow.remote_errors) || 0;
  const localErr = Math.max(total - remoteErr, 0);
  const remotePct = total > 0 ? Math.round((remoteErr / total) * 1000) / 10 : 0;
  const rawLast = summaryRow.last_seen;
  const lastSeen = total > 0 && rawLast && !String(rawLast).startsWith('1970') ? rawLast : '-';

  const hasData = total > 0 || data.top.length > 0;
  const hasErrs = Object.keys(errs).length > 0;
  const rng = data.rng || { from, to, r: 3600 };

  const tableRows = (data.table || []).map(r => ({
    error: r.error,
    count: Number(r.count) || 0,
    last_seen: r.last_seen || '-',
    last_query_id: r.last_query_id || '',
    last_message: r.last_message || '',
  }));

  // Only the short count is formatted. The long-text columns (query_id,
  // message) are left to DataTable so they truncate and expand on click, the
  // same as the Search table.
  const cellRenderers = {
    count: v => fmtInt(v),
  };

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label">Quick</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {PRESETS.map(d => (
              <button
                key={d}
                className={`btn btn-sm ${duration === d ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 12px', minWidth: 48 }}
                onClick={() => applyDuration(d)}
              >{d}</button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ padding: '8px 14px' }} onClick={load} disabled={loading}>
          {loading ? <><span className="loading-spinner"></span> Loading...</> : <><Icon className="ti ti-player-play"></Icon> Load</>}
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><span className="loading-spinner"></span></div>
      ) : !loaded ? (
        <div className="empty-state"><Icon className="ti ti-player-play" style={{ color: '#fb923c' }}></Icon><p>Select a time range and click Load.</p></div>
      ) : !hasData && !hasErrs ? (
        <div className="empty-state"><Icon className="ti ti-circle-check" style={{ color: '#34d399' }}></Icon><p>No errors recorded in the selected range.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Stat label="Total Errors" value={fmtInt(total)} icon="ti-alert-triangle" color="var(--color-danger)" />
            <Stat label="Error Types" value={fmtInt(distinct)} icon="ti-list-details" color="var(--accent)" />
            <Stat label="Remote Share" value={`${remotePct}%`} icon="ti-network" color="var(--color-info)" />
            <Stat label="Last Error" value={lastSeen} icon="ti-clock" color="var(--text-secondary)" small />
          </div>

          {/* Local vs Remote + Top error types */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(0, 2fr)', gap: 16 }}>
            {errs.summary
              ? <SectionError title="Local vs Remote" message={errs.summary} />
              : <ChartCard key={`donut-${themeKey}`} title="Local vs Remote" height={300} option={donutOption(localErr, remoteErr)}  chartType='pie' />}
            {errs.top
              ? <SectionError title="Top Error Types" message={errs.top} />
              : data.top.length
                ? <ChartCard key={`bar-${themeKey}`} title="Top Error Types" height={Math.max(240, data.top.length * 26 + 40)} scrollToHeight={300} option={barOption(data.top)} />
                : <div className="card" style={{ padding: 16 }}><div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Top Error Types</div><div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No errors in range.</div></div>}
          </div>

          {/* Error rate over time */}
          {errs.rate
            ? <SectionError title="Error Rate Over Time" message={errs.rate} />
            : data.rate.length
              ? <RateChart key={`rate-${themeKey}`} rows={data.rate} from={rng.from} to={rng.to} rounding={rng.r} />
              : null}

          {/* Top errors table */}
          {errs.table
            ? <SectionError title="Top Errors" message={errs.table} />
            : (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Top Errors</div>
                <div className="ov-log-table">
                  <DataTable
                    rows={tableRows}
                    columns={['error', 'count', 'last_seen', 'last_query_id', 'last_message']}
                    cellRenderers={cellRenderers}
                    variant="single"
                    s_no={true}
                    maxHeight={480}
                    emptyMessage="No error entries found."
                  />
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function ErrorLogSearch() {
  const toast = useToast();
  const [from, setFrom] = useState(fmtAgo(168));
  const [to, setTo] = useState(fmtNow());
  const [selectedErrors, setSelectedErrors] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [rowLimit, setRowLimit] = useState(500);
  const [submitted, setSubmitted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const q = useQuery();
  const errorsQ = useQuery();

  useEffect(() => { errorsQ.execute('SELECT DISTINCT error FROM system.error_log ORDER BY error'); }, []);
  useEffect(() => { if (q.error) toast.error(q.error); }, [q.error]);
  useEffect(() => { if (errorsQ.error) toast.error(errorsQ.error); }, [errorsQ.error]);

  function toggleError(err) { setSelectedErrors(prev => prev.includes(err) ? prev.filter(e => e !== err) : [...prev, err]); }

  async function handleSearch(e) {
    e.preventDefault();
    const conds = [`event_time BETWEEN '${from}' AND '${to}'`];
    if (errorMessage.trim()) conds.push(`last_error_message LIKE '%${errorMessage.trim()}%'`);
    if (selectedErrors.length > 0) conds.push(`error IN (${selectedErrors.map(e => `'${e}'`).join(',')})`);
    setSubmitted(true);
    setFiltersOpen(false);
    await q.execute(`SELECT event_time, error, last_error_message, last_error_query_id FROM system.error_log WHERE ${conds.join(' AND ')} ORDER BY event_time DESC LIMIT ${rowLimit}`);
  }

      // handle the Date change infinity like FROM > TO -->( Kathirdhasan )
      const handleDateOnChange = (date, label) => {
    if (label === "From") {
      setFrom(date);
      if (to && new Date(date) > new Date(to)) {
        setFrom(fmtAgo(168));
        toast.warning("From Date must be earlier than To Date!");
      }
    }

    if (label === "To") {
      setTo(date);
      if (from && new Date(from) > new Date(date)) {
        setTo(fmtNow());
        toast.warning("To date cannot be less than From date!");
      }
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom:15,
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "15px",
          }}
        >
          <Icon className="ti ti-search" style={{ fontSize: "15px" }}></Icon>Search
        </label>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Icon
            className={`ti ${filtersOpen ? "ti-chevron-up" : "ti-chevron-down"}`}
          ></Icon>{" "}
          {filtersOpen ? "Collapse" : "Expand"} Filters
        </button>
      </div>
      {/* <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setFiltersOpen(!filtersOpen)}><Icon className={`ti ${filtersOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}></Icon> {filtersOpen ? 'Collapse' : 'Expand'} Filters</button>
      </div> */}
      {filtersOpen && <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <form onSubmit={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <DateTimePicker label="From *" value={from} onChange={handleDateOnChange} name="From"/>
            <DateTimePicker label="To *" value={to} onChange={handleDateOnChange} name="To"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Error Type (multi-select)</label>
              <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {errorsQ.data?.map(r => (
                  <label key={r.error} style={{ display: 'flex', gap: 4, fontSize: '13px', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: selectedErrors.includes(r.error) ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (selectedErrors.includes(r.error) ? 'var(--accent-border)' : 'var(--border-default)') }}>
                    <input type="checkbox" checked={selectedErrors.includes(r.error)} onChange={() => toggleError(r.error)} style={{ accentColor: 'var(--accent)' }} />{r.error}
                  </label>
                ))}
                {!errorsQ.data?.length && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading errors...</span>}
              </div>
            </div>
            <div className="form-group"><label className="form-label">Error Message (text)</label><input className="form-input" value={errorMessage} onChange={e => setErrorMessage(e.target.value)} placeholder="partial..." /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group"><label className="form-label">Row Limit</label><input className="form-input" type="number" min={1} max={100000} value={rowLimit} onChange={e => setRowLimit(parseInt(e.target.value) || 500)} style={{ width: 100 }} /></div>
            <button className="btn btn-primary" type="submit" disabled={q.loading}>{q.loading ? <><span className="loading-spinner"></span> Searching...</> : <><Icon className="ti ti-search"></Icon> Search</>}</button>
          </div>
        </form>
      </div>}
      {submitted && !q.loading && <DataTable rows={q.data || []} emptyMessage="No error entries found." variant="single" s_no={true}/>}
    </div>
  );
}
