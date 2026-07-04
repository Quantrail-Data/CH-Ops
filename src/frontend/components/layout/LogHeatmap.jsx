// LogHeatmap - Calendar heatmap for log event visualization
//
// Renders a heatmap chart showing log event frequency by date and hour.
// Supports time-range presets (1h to 30d), fullscreen mode, PNG download,
// and dynamic color scaling based on data variance. Used in Crash Log,
// Error Log, and Text Log sections to visualize event distribution over time.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from "../common/Icon.jsx";
import { runQuery } from '../../utils/api.js';
import { initChart, disposeChart } from '../../utils/echarts.js';
import {useTheme} from "../../App.jsx";

const pad = n => String(n).padStart(2, '0');
const fmtAgo = h => { const d = new Date(Date.now() - h * 3600000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const fmtNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

// Single amber/orange color scale used on both dark and light themes.
// Starts from a very faint warm tint so even the smallest values are
// barely visible, then ramps through gold, amber, burnt orange to deep brown.
const ANCHORS = [
  [255, 250, 235], [255, 237, 180], [255, 214, 120], [251, 191, 36], [234, 138, 18], [180, 83, 9], [120, 40, 0]
];

// Linearly interpolate between anchor RGB arrays to produce N hex color strings.
function interpolateScale(anchors, steps) {
  const result = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const pos = t * (anchors.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, anchors.length - 1);
    const frac = pos - lo;
    const r = Math.round(anchors[lo][0] + (anchors[hi][0] - anchors[lo][0]) * frac);
    const g = Math.round(anchors[lo][1] + (anchors[hi][1] - anchors[lo][1]) * frac);
    const b = Math.round(anchors[lo][2] + (anchors[hi][2] - anchors[lo][2]) * frac);
    result.push('#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join(''));
  }
  return result;
}

// Pre-compute the full 1000-step scale once at module load
const HEATMAP_SCALE = interpolateScale(ANCHORS, 1000);

// Legacy exports for backward compat
const DARK_COLORS = HEATMAP_SCALE;
const LIGHT_COLORS = HEATMAP_SCALE;
const PLASMA_COLORS = HEATMAP_SCALE;
const VIRIDIS_COLORS = HEATMAP_SCALE;
const HEATMAP_COLORS = HEATMAP_SCALE;

function getHeatmapColors() {
  return HEATMAP_SCALE;
}

// Compute how much of the color scale to use based on data variance.
// Low variance (all values similar) -> use only the lighter portion.
// High variance (big spread) -> use the full dark range.
// Returns a fraction between 0.3 and 1.0 indicating how deep into
// the color scale to go.
function varianceDepth(values) {
  const nonZero = values.filter(v => v > 0);
  if (nonZero.length < 2) return 0.5; // too little data, use middle range
  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  if (mean === 0) return 0.3;
  const variance = nonZero.reduce((a, b) => a + (b - mean) ** 2, 0) / nonZero.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  // cv=0 means all values identical -> 0.3 (light shades only)
  // cv>=2 means huge spread -> 1.0 (full range)
  return Math.min(1.0, Math.max(0.3, 0.3 + cv * 0.35));
}

function buildHeatmapEchartsOption(data, countCol) {
  if (!data?.length) return null;
  const dates = [...new Set(data.map(r => r.event_date))].sort();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const lookup = new Map();
  data.forEach(r => { lookup.set(`${r.event_date}-${r.event_hour}`, parseInt(r[countCol]) || 0); });

  const hmData = [];
  dates.forEach((date, di) => {
    hours.forEach(h => {
      hmData.push([di, h, lookup.get(`${date}-${h}`) || 0]);
    });
  });

  const allValues = hmData.map(d => d[2]);
  const maxVal = Math.max(...allValues, 1);

  // Pick the full scale, then slice it based on variance
  const fullColors = typeof document !== 'undefined' ? getHeatmapColors() : HEATMAP_COLORS;
  const depth = varianceDepth(allValues);
  const usedCount = Math.round(fullColors.length * depth);
  const colors = fullColors.slice(0, Math.max(usedCount, 50)); // at least 50 steps

  return {
    tooltip: { position: 'top', formatter: p => `${dates[p.value[0]]} ${String(p.value[1]).padStart(2,'0')}:00 - ${p.value[2].toLocaleString()} events` },
    grid: { top: 10, bottom: 60, left: 70, right: 20 },
    xAxis: {
      type: 'category', data: dates, splitArea: { show: true },
      axisLabel: { fontSize: 10, rotate: 45, interval: dates.length > 14 ? Math.floor(dates.length / 14) : 0 },
      name: 'Date', nameLocation: 'center', nameGap: 45, nameTextStyle: { fontSize: 11 },
    },
    yAxis: {
      type: 'category',
      data: hours.map(h => `${String(h).padStart(2,'0')}:00`),
      splitArea: { show: true },
      axisLabel: { fontSize: 10, interval: 2 },
      name: 'Hour', nameLocation: 'center', nameGap: 50, nameTextStyle: { fontSize: 11 },
    },
    visualMap: { show: false, min: 0, max: maxVal, inRange: { color: colors } },
    series: [{ type: 'heatmap', data: hmData, label: { show: false },
      itemStyle: { borderColor: 'rgba(100,100,140,0.25)', borderWidth: 1 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)', borderColor: 'var(--accent)', borderWidth: 2 } } }],
  };
}

export { buildHeatmapEchartsOption, HEATMAP_COLORS, PLASMA_COLORS, VIRIDIS_COLORS, getHeatmapColors, interpolateScale, varianceDepth };

export default function LogHeatmap({ table, countCol = 'crash_count', extraFilterSql = '', filterDropdown = null }) {
  const [from, setFrom] = useState(fmtAgo(168));
  const [to, setTo] = useState(fmtNow());
  const [duration, setDuration] = useState('7d');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Bumped on theme change to force useCallback to create a fresh renderChart
  const [themeKey, setThemeKey] = useState(0);
  const chartRef = useRef(null);
  const chartInst = useRef(null);
  const { theme } = useTheme();
    const isDarkColor = theme === 'dark' ? 'white' : 'black';
  

  function applyDuration(d) {
    setDuration(d);
    const h = {['1h']:1,['6h']:6,['24h']:24,['48h']:48,['7d']:168,['30d']:720}[d]||168;
    setFrom(fmtAgo(h)); setTo(fmtNow());
  }

  async function loadHeatmap() {
    setLoading(true);
    const filter = extraFilterSql ? ` AND ${extraFilterSql}` : '';
    const sql = `SELECT toDate(time_bucket) AS event_date, toHour(time_bucket) AS event_hour, ${countCol} FROM (SELECT time_bucket, count() AS ${countCol} FROM (SELECT toStartOfHour(event_time) AS time_bucket FROM ${table} WHERE event_time BETWEEN '${from}' AND '${to}'${filter}) GROUP BY time_bucket ORDER BY time_bucket ASC WITH FILL FROM toStartOfHour(toDateTime('${from}')) TO toStartOfHour(toDateTime('${to}')) STEP 3600)`;
    try {
      const r = await runQuery(sql);
      setData(r.rows || []);
    } catch { setData([]); }
    setLoading(false);
  }

  // themeKey is in the dependency array so this creates a new callback
  // whenever the theme changes, which triggers the useEffect below
  const renderChart = useCallback(() => {
    if (!data?.length || !chartRef.current) {
      if (chartInst.current) { disposeChart(chartRef.current); chartInst.current = null; }
      return;
    }
    const option = buildHeatmapEchartsOption(data, countCol);
    if (!option) return;
    if (chartInst.current) { disposeChart(chartRef.current); chartInst.current = null; }
    chartInst.current = initChart(chartRef.current);
    chartInst.current.setOption({...option,
      visualMap : {
        ...option.visualMap,
        inRange: { color: ['white',"blue","darkblue"] },
      },
  //     onHover: (event, activeElements, chart) => {

  //   if (activeElements.length > 0) {
  //     chart.canvas.style.cursor = 'pointer';
  //   } else {
  //     chart.canvas.style.cursor = 'default';
  //     chart.canvas.style.color = 'red'
  //   }
  // },
      xAxis: {
      ...option.xAxis,
      nameGap: 40,
      position: 'bottom',
      axisLabel: {
        ...option.xAxis?.axisLabel,
        rotate: 0,
        align: 'left',
        color: isDarkColor,
        fontSize:13

      },
      axisLine: { show: false },
      nameTextStyle: {
        color: isDarkColor,
        fontSize: 15,
        fontWeight: 'bold'
      }

    },
    yAxis: {
      ...option.yAxis,
      position: 'bottom',
      axisLabel: {
        ...option.yAxis?.axisLabel,
        rotate: 0,
        align: 'right',
        color: isDarkColor,
        fontSize:13
      },
      nameTextStyle: {
        color: isDarkColor,
        fontSize: 15,
        fontWeight: 'bold'
      },
      axisLine: { show: false }
    }}, true);
    chartInst.current.resize();
  }, [data, countCol, themeKey]);

  useEffect(() => { renderChart(); }, [renderChart]);

  // Listen for theme changes and bump themeKey to trigger a full re-render
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey(k => k + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (chartInst.current) setTimeout(() => chartInst.current?.resize(), 50);
  }, [fullscreen]);

  useEffect(() => () => { if (chartRef.current) disposeChart(chartRef.current); }, []);

  function downloadChart() {
    if (!chartInst.current) return;
    const url = chartInst.current.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: 'transparent' });
    const a = document.createElement('a');
    a.href = url; a.download = `heatmap-${countCol}.png`; a.click();
  }

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* <div className="form-group"><label className="form-label">Quick</label><div style={{ display: 'flex', gap: 4 }}>{['1h','6h','24h','48h','7d','30d'].map(d => <button key={d} className={`btn btn-sm ${duration===d?'btn-primary':'btn-secondary'}`} onClick={() => applyDuration(d)}>{d}</button>)}</div></div> */}
        <div className="form-group">
          <label className="form-label">Quick</label>
          <div style={{ display: 'flex', gap: '4px', alignItems: "center", justifyContent: "start" }}>
            {['1h', '6h', '24h', '48h', '7d', '30d'].map(d =>
              <button key={d} style={{ border: duration === d ? '1px soild transparent ' : '1px soild red', padding: "10px", width: "50px ", display: "flex", alignItems: "center", justifyContent: "center" }}
                // className='btn btn-sm '
                className={`btn btn-sm ${duration === d ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => applyDuration(d)}
              >
                {d}
              </button>)}
          </div>
        </div>
        {filterDropdown}
        <button className="btn btn-primary btn-sm" style={{padding:"10px"}} onClick={loadHeatmap} disabled={loading}>{loading ? <><span className="loading-spinner"></span> Loading...</> : <><Icon className="ti ti-player-play"></Icon> Load Heatmap</>}</button>
      </div>
      {data?.length > 0 ? (
        <div className="card" style={fullscreen ? { position: 'fixed', inset: 0, zIndex: 300, borderRadius: 0, padding: 16, display: 'flex', flexDirection: 'column' } : { padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={downloadChart} title="Download as PNG" aria-label="Download as PNG"><Icon className="ti ti-download"></Icon></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFullscreen(!fullscreen)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}><Icon className={`ti ${fullscreen ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}`}></Icon></button>
          </div>
          <div ref={chartRef} style={{ height: fullscreen ? 'calc(100% - 40px)' : 628, width: '100%' }} />
        </div>
      ) : data !== null ? (
        <div className="empty-state"><Icon className="ti ti-player-play" style={{color:"#fb923c"}}></Icon><p>No data for the selected range.</p></div>
      ) : (
        <div className="empty-state"><Icon className="ti ti-player-play" style={{color:"#fb923c"}}></Icon><p>Select a time range and click Load Heatmap.</p></div>
      )}
    </div>
  );
}
