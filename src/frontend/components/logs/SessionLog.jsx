// SessionLog - View and search ClickHouse® session (login/logout) logs
//
// Displays system.session_log with two modes: Overview and Search. The
// Overview is a metrics dashboard built from system.session_log (one row per
// login/logout event): it shows total/success/failure/logout/users stat
// cards, a login-outcome split, top users, a breakdown by interface and by
// auth type, login activity over time (stacked area of success/failure/logout),
// and a top-failure-reasons table with the most recent user and client per
// reason. The Search view supports filtering by event type (multi-select),
// user, failure reason text, and time range.
//
// system.session_log only exists when session logging is enabled in the server
// config, so the Overview probes the table first and shows an empty state when
// it is absent. In ClickHouse Cloud the table is held per node; like the other
// CHOps logs, this queries the connected node directly rather than across
// replicas.
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
import ChartToolbar, { useChartTools } from '../common/ChartToolbar.jsx';
import { initChart, disposeChart } from '../../utils/echarts.js';

const pad = n => String(n).padStart(2, '0');
const fmtAgo = h => { const d = new Date(Date.now() - h * 3600000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const fmtNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

export default function SessionLog() {
  const { tab: routeTab = 'overview' } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/logs/session/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-shield-lock"></Icon> Session Log</h2></div>
      <div className="tab-bar">
        <div className={`tab-item ${routeTab === 'overview' ? 'active' : ''}`} onClick={() => handleTabChange('overview')}><Icon className="ti ti-chart-dots-3"></Icon> Overview</div>
        <div className={`tab-item ${routeTab === 'search' ? 'active' : ''}`} onClick={() => handleTabChange('search')}><Icon className="ti ti-search"></Icon> Search</div>
      </div>
      {routeTab === 'overview' && <SessionLogOverview />}
      {routeTab === 'search' && <SessionLogSearch />}
    </div>
  );
}

/* Overview dashboard */

// Quick-range presets -> hours back, and the bucket size (seconds) used for
// the activity time series. Buckets stay in a readable range across presets.
const RANGE_HOURS = { '1h': 1, '6h': 6, '24h': 24, '48h': 48, '7d': 168, '30d': 720 };
const RANGE_ROUNDING = { '1h': 60, '6h': 300, '24h': 600, '48h': 1800, '7d': 3600, '30d': 21600 };
const PRESETS = ['1h', '6h', '24h', '48h', '7d', '30d'];

// The three documented session event types, in a fixed display order with
// fixed colours (success / failure / logout) so the donut and the activity
// chart stay consistent and legible on both themes.
const TYPE_ORDER = ['LoginSuccess', 'LoginFailure', 'Logout'];
const TYPE_COLOR = { LoginSuccess: '#22c55e', LoginFailure: '#ef4444', Logout: '#94a3b8' };

// Fixed, high-contrast series palette for the category bars (users, interface,
// auth type). Mid-tone hues stay legible on both light and dark themes.
const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

const fmtInt = v => (Number(v) || 0).toLocaleString('en-US');

// system.session_log may not exist (created only when session logging is
// enabled). Probe its columns; an empty set means the table is absent.
async function runQueryProbe() {
  const res = await runQuery("SELECT name FROM system.columns WHERE database = 'system' AND table = 'session_log'");
  return new Set((res.rows || []).map((r) => r.name).filter(Boolean));
}

// Shared time x-axis: real time spacing, ~3 labels, yyyy-MM-DD HH:mm. Colours
// are left unset so the registered ECharts theme supplies them; the chart
// remounts on theme change so they re-resolve.
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

// Horizontal ranked bar for a category breakdown ({ name, total }).
function barOption(rows, labelWidth = 170) {
  const data = rows.map(r => ({ name: String(r.name), total: Number(r.total) || 0 }));
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
      axisLabel: { width: labelWidth, overflow: 'truncate' },
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

// Donut: login outcomes (success / failure / logout) over the range.
function donutOption(byType) {
  const map = new Map((byType || []).map(r => [String(r.type), Number(r.cnt) || 0]));
  const data = [];
  for (const t of TYPE_ORDER) if (map.has(t)) data.push({ name: t, value: map.get(t), itemStyle: { color: TYPE_COLOR[t] } });
  for (const r of byType || []) if (!TYPE_ORDER.includes(String(r.type))) data.push({ name: String(r.type), value: Number(r.cnt) || 0 });
  return {
    tooltip: {
      trigger: 'item', confine: true,
      formatter: p => `${p.name}: ${fmtInt(p.value)} (${p.percent}%)`,
    },
    legend: { show: true, bottom: 0 },
    series: [{
      type: 'pie', radius: ['45%', '70%'], avoidLabelOverlap: true,
      label: { show: true, formatter: '{b} ({d}%)', color: 'inherit', fontSize: 11 }, labelLine: { show: true },
      data,
    }],
  };
}

// Pivot long-format rate rows ({ t, type, v }) into one zero-filled stacked
// series per event type. Zero-fill happens here (not via SQL WITH FILL) so we
// avoid the per-group fill trap. Only the three known types are expected, but
// any extra type is still rendered after them.
function buildRateSeries(rows, from, to, rounding) {
  const r = Number(rounding) || 3600;
  const fromSec = from ? Math.floor(new Date(from.replace(' ', 'T')).getTime() / 1000) : 0;
  const toSec = to ? Math.floor(new Date(to.replace(' ', 'T')).getTime() / 1000) : 0;
  const b0 = Math.floor(fromSec / r) * r;
  const b1 = Math.floor(toSec / r) * r;
  const buckets = [];
  for (let b = b0; b <= b1; b += r) buckets.push(b);

  const perType = new Map();
  for (const row of rows) {
    const name = String(row.type);
    const tt = Number(row.t);
    const v = Number(row.v) || 0;
    let m = perType.get(name);
    if (!m) { m = new Map(); perType.set(name, m); }
    m.set(tt, (m.get(tt) || 0) + v);
  }

  const extra = [...perType.keys()].filter(n => !TYPE_ORDER.includes(n));
  const names = [...TYPE_ORDER.filter(n => perType.has(n)), ...extra];

  const series = names.map((name, i) => {
    const c = TYPE_COLOR[name] || PALETTE[i % PALETTE.length];
    const m = perType.get(name) || new Map();
    return {
      name, type: 'line', stack: 'total', smooth: false, symbol: 'none',
      itemStyle: { color: c },
      lineStyle: { color: c, width: 1 },
      areaStyle: { color: c, opacity: 0.28 },
      emphasis: { focus: 'series' },
      data: buckets.map(b => [b * 1000, m.get(b) || 0]),
    };
  });
  const legendItems = names.map((name, i) => ({ name, color: TYPE_COLOR[name] || PALETTE[i % PALETTE.length] }));
  return { series, names, legendItems };
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

// A small card wrapper for a category bar with an empty fallback.
// `minHeight` floors the chart height (so it never comes up shorter than a
// sibling panel) and `scrollToHeight` caps it with a scrollbar; both default to
// the natural dynamic sizing used by the standalone category bars.
function BarCard({ title, rows, themeKey, labelWidth, minHeight = 240, scrollToHeight = null }) {
  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No data in range.</div>
      </div>
    );
  }
  return <ChartCard key={`${title}-${themeKey}`} title={title} height={Math.max(minHeight, rows.length * 26 + 40)} scrollToHeight={scrollToHeight} option={barOption(rows, labelWidth)} />;
}

// Login Activity Over Time: stacked-area chart with a custom legend on the
// RIGHT (matches the Error Log rate chart). Visibility is driven by
// legend.selected via merge setOption, which preserves zoom. The chart remounts
// on theme change (themeKey-keyed instance), which also resets the toggles.
function RateChart({ rows, from, to, rounding }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const tools = useChartTools(() => chartRef.current, { filename: 'login-activity' });

  const { series, names, legendItems } = useMemo(
    () => buildRateSeries(rows, from, to, rounding),
    [rows, from, to, rounding],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = initChart(containerRef.current);
    chartRef.current = chart;
    chart.setOption({
      toolbox: { show: false },
      grid: { left: 12, right: 16, top: 16, bottom: 36, containLabel: true },
      tooltip: {
        trigger: 'axis', confine: true,
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
          const body = items.map(it => `${it.m}${it.n}: ${fmtInt(it.v)}`).join('<br/>');
          return `${head}<br/>${body}<br/><b>Total: ${fmtInt(total)}</b>`;
        },
      },
      legend: { show: false, data: names, selected: Object.fromEntries(names.map(n => [n, true])) },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
      xAxis: timeAxis(from, to),
      yAxis: { type: 'value' },
      series,
    }, true);
    setTimeout(() => chartRef.current && chartRef.current.resize(), 50);
    return () => { disposeChart(containerRef.current); chartRef.current = null; };
  }, [series, names, from, to]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({
      legend: { selected: Object.fromEntries(names.map(n => [n, !hidden.has(n)])) },
    });
  }, [hidden, names]);

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
      ? { position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg-page)', padding: 16, display: 'flex', flexDirection: 'column' }
      : { position: 'relative' }}>
      <div className="card" style={{ padding: 16, flex: fullscreen ? 1 : undefined, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>Login Activity Over Time</span>
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
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Types ({names.length})</span>
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

function SessionLogOverview() {
  const [duration, setDuration] = useState('7d');
  const [from, setFrom] = useState(fmtAgo(168));
  const [to, setTo] = useState(fmtNow());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState({ exists: false, summary: [], byType: [], users: [], iface: [], auth: [], rate: [], table: [], rng: { from: null, to: null, r: 3600 } });
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

  const load = useCallback(async (override = {}) => {
    setLoading(true);
    const activeDuration = override.duration || duration;
    const f = override.from || from;
    const t = override.to || to;
    const r = RANGE_ROUNDING[activeDuration] || 3600;
    const next = { exists: false, summary: [], byType: [], users: [], iface: [], auth: [], rate: [], table: [], rng: { from: f, to: t, r } };
    const e = {};

    let cols = new Set();
    try { cols = await runQueryProbe(); } catch (err) { e.probe = err.message || 'Query failed'; }
    next.exists = cols.size > 0;

    if (next.exists) {
      const where = `WHERE event_time BETWEEN '${f}' AND '${t}'`;

      try {
        const res = await runQuery(`SELECT count() AS total, countIf(type = 'LoginSuccess') AS success, countIf(type = 'LoginFailure') AS failure, countIf(type = 'Logout') AS logout, uniqExact(user) AS users, max(event_time) AS last_seen FROM system.session_log ${where}`);
        next.summary = res.rows || [];
      } catch (err) { e.summary = err.message || 'Query failed'; }

      try {
        const res = await runQuery(`SELECT type, count() AS cnt FROM system.session_log ${where} GROUP BY type ORDER BY cnt DESC`);
        next.byType = res.rows || [];
      } catch (err) { e.byType = err.message || 'Query failed'; }

      try {
        const res = await runQuery(`SELECT user, count() AS cnt FROM system.session_log ${where} GROUP BY user ORDER BY cnt DESC LIMIT 15`);
        next.users = res.rows || [];
      } catch (err) { e.users = err.message || 'Query failed'; }

      try {
        const res = await runQuery(`SELECT interface, count() AS cnt FROM system.session_log ${where} GROUP BY interface ORDER BY cnt DESC LIMIT 15`);
        next.iface = res.rows || [];
      } catch (err) { e.iface = err.message || 'Query failed'; }

      try {
        const res = await runQuery(`SELECT auth_type, count() AS cnt FROM system.session_log ${where} GROUP BY auth_type ORDER BY cnt DESC LIMIT 15`);
        next.auth = res.rows || [];
      } catch (err) { e.auth = err.message || 'Query failed'; }

      try {
        const res = await runQuery(`SELECT toStartOfInterval(event_time, INTERVAL ${r} SECOND)::INT AS t, type, count() AS v FROM system.session_log ${where} GROUP BY t, type`);
        next.rate = res.rows || [];
      } catch (err) { e.rate = err.message || 'Query failed'; }

      try {
        const res = await runQuery(`SELECT failure_reason, count() AS count, argMax(user, event_time) AS last_user, argMax(toString(client_address), event_time) AS last_client, max(event_time) AS last_seen FROM system.session_log ${where} AND type = 'LoginFailure' AND failure_reason != '' GROUP BY failure_reason ORDER BY count DESC LIMIT 50`);
        next.table = res.rows || [];
      } catch (err) { e.table = err.message || 'Query failed'; }
    }

    setData(next);
    setErrs(e);
    setLoaded(true);
    setLoading(false);
  }, [from, to, duration]);

  const summaryRow = data.summary?.[0] || {};
  const total = Number(summaryRow.total) || 0;
  const success = Number(summaryRow.success) || 0;
  const failure = Number(summaryRow.failure) || 0;
  const logout = Number(summaryRow.logout) || 0;
  const users = Number(summaryRow.users) || 0;
  const rawLast = summaryRow.last_seen;
  const lastSeen = total > 0 && rawLast && !String(rawLast).startsWith('1970') ? rawLast : '-';

  const hasData = total > 0;
  const hasErrs = Object.keys(errs).length > 0;
  const tableMissing = loaded && !data.exists && !errs.probe;
  const rng = data.rng || { from, to, r: 3600 };

  const userRows = (data.users || []).map(r => ({ name: r.user == null || r.user === '' ? '(unknown)' : String(r.user), total: Number(r.cnt) || 0 }));
  const ifaceRows = (data.iface || []).map(r => ({ name: r.interface == null || r.interface === '' ? '(unknown)' : String(r.interface), total: Number(r.cnt) || 0 }));
  const authRows = (data.auth || []).map(r => ({ name: r.auth_type == null || r.auth_type === '' ? '(none)' : String(r.auth_type), total: Number(r.cnt) || 0 }));

  const tableRows = (data.table || []).map(r => ({
    failure_reason: r.failure_reason || '',
    count: Number(r.count) || 0,
    last_user: r.last_user == null ? '' : String(r.last_user),
    last_client: r.last_client || '',
    last_seen: r.last_seen || '-',
  }));

  const cellRenderers = { count: v => fmtInt(v) };

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
                onClick={() => {
                  const nextFrom = fmtAgo(RANGE_HOURS[d] || 168);
                  const nextTo = fmtNow();
                  setDuration(d);
                  setFrom(nextFrom);
                  setTo(nextTo);
                  load({ duration: d, from: nextFrom, to: nextTo });
                }}
              >{d}</button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ padding: '8px 14px' }} onClick={() => load()} disabled={loading}>
          {loading ? <><span className="loading-spinner"></span> Loading...</> : <><Icon className="ti ti-player-play"></Icon> Load</>}
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><span className="loading-spinner"></span></div>
      ) : !loaded ? (
        <div className="empty-state"><Icon className="ti ti-player-play" style={{ color: '#fb923c' }}></Icon><p>Select a time range and click Load.</p></div>
      ) : tableMissing ? (
        <div className="empty-state"><Icon className="ti ti-shield-check" style={{ color: '#34d399' }}></Icon><p>system.session_log is not present. It is created only when session logging is enabled in the server config, so an absent table means no login/logout events are being recorded.</p></div>
      ) : !hasData && !hasErrs ? (
        <div className="empty-state"><Icon className="ti ti-shield-check" style={{ color: '#34d399' }}></Icon><p>No session events recorded in the selected range.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Stat label="Total Events" value={fmtInt(total)} icon="ti-list-details" color="var(--accent)" />
            <Stat label="Successful Logins" value={fmtInt(success)} icon="ti-circle-check" color="var(--color-success)" />
            <Stat label="Failed Logins" value={fmtInt(failure)} icon="ti-alert-triangle" color="var(--color-danger)" />
            <Stat label="Logouts" value={fmtInt(logout)} icon="ti-logout" color="var(--color-info)" />
            <Stat label="Distinct Users" value={fmtInt(users)} icon="ti-users" color="var(--accent)" />
            <Stat label="Last Event" value={lastSeen} icon="ti-clock" color="var(--text-secondary)" small />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(0, 2fr)', gap: 16 }}>
            {errs.byType
              ? <SectionError title="Login Outcomes" message={errs.byType} />
              : <ChartCard key={`donut-${themeKey}`} title="Login Outcomes" height={300} option={donutOption(data.byType)}  chartType='pie'/>}
            {errs.users
              ? <SectionError title="Top Users" message={errs.users} />
              : <BarCard title="Top Users" rows={userRows} themeKey={themeKey} minHeight={300} scrollToHeight={300} />}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {errs.iface
              ? <SectionError title="By Interface" message={errs.iface} />
              : <BarCard title="By Interface" rows={ifaceRows} themeKey={themeKey} labelWidth={120} />}
            {errs.auth
              ? <SectionError title="By Auth Type" message={errs.auth} />
              : <BarCard title="By Auth Type" rows={authRows} themeKey={themeKey} labelWidth={150} />}
          </div>

          {errs.rate
            ? <SectionError title="Login Activity Over Time" message={errs.rate} />
            : data.rate.length
              ? <RateChart key={`rate-${themeKey}`} rows={data.rate} from={rng.from} to={rng.to} rounding={rng.r} />
              : (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Login Activity Over Time</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No activity data in range.</div>
                </div>
              )}

          {errs.table
            ? <SectionError title="Top Failure Reasons" message={errs.table} />
            : (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Top Failure Reasons</div>
                <div className="ov-log-table">
                  <DataTable
                    rows={tableRows}
                    columns={['failure_reason', 'count', 'last_user', 'last_client', 'last_seen']}
                    cellRenderers={cellRenderers}
                    variant="single"
                    s_no={true}
                    maxHeight={480}
                    emptyMessage="No failed logins in range."
                  />
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/* Search */

const SEARCH_TYPES = ['LoginSuccess', 'LoginFailure', 'Logout'];

function SessionLogSearch() {
  const toast = useToast();
  const [from, setFrom] = useState(fmtAgo(168));
  const [to, setTo] = useState(fmtNow());
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [userText, setUserText] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [rowLimit, setRowLimit] = useState(500);
  const [submitted, setSubmitted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [tableExists, setTableExists] = useState(true);
  const [probeDone, setProbeDone] = useState(false);
  const q = useQuery();

  useEffect(() => { if (q.error) toast.error(q.error); }, [q.error]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cols = await runQueryProbe();
        if (!cancelled) {
          setTableExists(cols.size > 0);
          setProbeDone(true);
        }
      } catch {
        if (!cancelled) {
          setTableExists(true);
          setProbeDone(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggleType(t) { setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]); }

  async function handleSearch(e) {
    e.preventDefault();
    if (!tableExists) {
      setSubmitted(true);
      return;
    }
    const conds = [`event_time BETWEEN '${from}' AND '${to}'`];
    if (userText.trim()) conds.push(`user LIKE '%${userText.trim()}%'`);
    if (reasonText.trim()) conds.push(`failure_reason LIKE '%${reasonText.trim()}%'`);
    if (selectedTypes.length > 0) conds.push(`type IN (${selectedTypes.map(t => `'${t}'`).join(',')})`);
    setSubmitted(true);
    await q.execute(`SELECT event_time, type, user, auth_type, interface, toString(client_address) AS client_address, failure_reason FROM system.session_log WHERE ${conds.join(' AND ')} ORDER BY event_time DESC LIMIT ${rowLimit}`);
  }

  // handle the Date change so From never exceeds To (mirrors the other logs).
  const handleDateOnChange = (date, label) => {
    if (label === "From") {
      if (to && new Date(date) > new Date(to)) {
        toast.warning("From Date must be earlier than To Date!");
        return;
      }
      setFrom(date);
    }
    if (label === "To") {
      if (from && new Date(from) > new Date(date)) {
        toast.warning("To date cannot be less than From date!");
        return;
      }
      setTo(date);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 15,
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "15px" }}>
          <Icon className="ti ti-search" style={{ fontSize: "15px" }}></Icon>Search
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => setFiltersOpen(!filtersOpen)}>
          <Icon className={`ti ${filtersOpen ? "ti-chevron-up" : "ti-chevron-down"}`}></Icon>{" "}
          {filtersOpen ? "Collapse" : "Expand"} Filters
        </button>
      </div>
      {filtersOpen && <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <form onSubmit={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <DateTimePicker label="From *" value={from} onChange={handleDateOnChange} name="From" />
            <DateTimePicker label="To *" value={to} onChange={handleDateOnChange} name="To" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Event Type (multi-select)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SEARCH_TYPES.map(t => (
                  <label key={t} style={{ display: 'flex', gap: 4, fontSize: '13px', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: selectedTypes.includes(t) ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (selectedTypes.includes(t) ? 'var(--accent-border)' : 'var(--border-default)') }}>
                    <input type="checkbox" checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} style={{ accentColor: 'var(--accent)' }} />{t}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group"><label className="form-label">User (text)</label><input className="form-input" value={userText} onChange={e => setUserText(e.target.value)} placeholder="partial..." /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group"><label className="form-label">Failure Reason (text)</label><input className="form-input" value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="partial..." /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group"><label className="form-label">Row Limit</label><input className="form-input" type="number" min={1} max={100000} value={rowLimit} onChange={e => setRowLimit(parseInt(e.target.value) || 500)} style={{ width: 100 }} /></div>
            <button className="btn btn-primary" type="submit" disabled={q.loading || !probeDone}>{q.loading ? <><span className="loading-spinner"></span> Searching...</> : <><Icon className="ti ti-search"></Icon> Search</>}</button>
          </div>
        </form>
      </div>}
      {submitted && !q.loading && !tableExists && probeDone && (
        <div className="empty-state"><Icon className="ti ti-shield-check" style={{ color: '#34d399' }}></Icon><p>system.session_log is not present. It is created only when session logging is enabled in the server config, so no session entries can be searched.</p></div>
      )}
      {submitted && !q.loading && tableExists && <DataTable rows={q.data || []} emptyMessage="No session entries found." variant="single" s_no={true} maxHeight={600} />}
    </div>
  );
}
