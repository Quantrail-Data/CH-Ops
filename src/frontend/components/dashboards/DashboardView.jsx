// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Main container component that layout and renders all dashboard widgets and analytics charts.


import React, { useState, useEffect, useRef, useMemo } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from '../../utils/api.js';
import { buildChartOption } from './chartTypes.js';
import { initChart, disposeChart, withZoomable } from '../../utils/echarts.js';
import ChartToolbar, { savePng } from '../common/ChartToolbar.jsx';
import DataTable from '../layout/DataTable.jsx';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import { useToast } from '../layout/Toast.jsx';
import { useTheme, useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

export default function DashboardView({sidebar}) {
  const toast = useToast();
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const canEdit = myLevel >= ROLE_LEVEL.editor;
  const [dashboards, setDashboards] = useState([]);
  const [selDash, setSelDash] = useState(null);
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCols, setNewCols] = useState(2);
  const [showCreate, setShowCreate] = useState(false);
  const [del, setDel] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [fs,setFs] = useState(false)
  const [showLegends, setShowLegends] = useState(true);

  async function loadDashboards() { try { setDashboards(await apiFetch('/api/dashboards')); } catch { } }
  useEffect(() => { loadDashboards(); }, []);

  async function loadCharts(dashId) {
    setLoading(true); setCharts([]); setHasUnsaved(false);
    try {
      const c = await apiFetch(`/api/dashboards/${dashId}/charts`);
      const enriched = [];
      for (const chart of c) {
        let data = null, error = null;
        try { const r = await runQuery(chart.sqlQuery); data = r.rows || []; }
        catch (e) { error = e.message; }
        const cfg = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config || {};
        const opt = error ? { _error: true, message: error } : buildChartOption(chart.chartType, chart.chartSubtype, data, cfg, chart.name, { xLabel: cfg?.xLabel, yLabel: cfg?.yLabel, showLegend: cfg?.showLegend });
        enriched.push({ ...chart, data, chartOption: opt });
      }
      enriched.sort((a, b) => a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol);
      setCharts(enriched);
    } catch { }
    setLoading(false);
  }

  function selectDash(d) { setSelDash(d); loadCharts(d.id); setShowLegends(true); }
  async function createDash() { if (!newName.trim()) return; try { const d = await apiFetch('/api/dashboards', { method: 'POST', body: JSON.stringify({ name: newName.trim(), columns: newCols }) }); setDashboards(p => [d, ...p]); setNewName(''); setShowCreate(false); toast.success(`Dashboard "${d.name}" created.`); } catch (e) { toast.error(e.message); } }
  async function deleteDash(id) { try { await apiFetch(`/api/dashboards/${id}`, { method: 'DELETE',body:{} }); loadDashboards(); setSelDash(null); setCharts([]); toast.success('Dashboard deleted.'); } catch (e) { toast.error(e.message); } setDel(null); }
  async function deleteChart(id) { try { await apiFetch(`/api/dashboards/charts/${id}`, { method: 'DELETE',body:{} }); if (selDash) loadCharts(selDash.id); toast.success('Chart removed.'); } catch { } }

  function onDragStart(e, i) { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i); }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function onDrop(e, targetIdx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    setCharts(prev => {
      const next = [...prev];
      const aRow = next[dragIdx].gridRow, aCol = next[dragIdx].gridCol;
      next[dragIdx] = { ...next[dragIdx], gridRow: next[targetIdx].gridRow, gridCol: next[targetIdx].gridCol };
      next[targetIdx] = { ...next[targetIdx], gridRow: aRow, gridCol: aCol };
      next.sort((a, b) => a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol);
      return next;
    });
    setHasUnsaved(true);
    setDragIdx(null);
  }

  async function saveLayout() {
    try {
      for (const c of charts) {
        await apiFetch(`/api/dashboards/charts/${c.id}`, { method: 'PUT', body: JSON.stringify({ gridRow: c.gridRow, gridCol: c.gridCol }) });
      }
      setHasUnsaved(false);
      toast.success('Layout saved.');
    } catch (e) { toast.error(e.message); }
  }

  const cols = selDash?.columns || 2;
  
  const legendSupportedTypes = [
    'grouped_bar', 'stacked_bar', 
    'multi_line', 'stacked_line',
    'pie', 'donut', 'rose', 'nested_pie',
    'bubble',
    'multi_category',
    'funnel',
    'radar'
  ];

  const hasLegendCharts = charts.some(c => legendSupportedTypes.includes(c.chartSubtype));

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title"><Icon className="ti ti-layout-dashboard"></Icon> Dashboards</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selDash && hasLegendCharts && (
            <button
              className={`btn btn-sm ${showLegends ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowLegends(!showLegends)}
              title={showLegends ? 'Hide legends' : 'Show legends'}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon className={`ti ${showLegends ? 'ti-eye' : 'ti-eye-off'}`}></Icon>
              <span style={{ fontSize: '12px' }}>Legends</span>
            </button>
          )}
          {selDash && <button className="btn btn-secondary btn-sm" onClick={() => loadCharts(selDash.id)}><Icon className="ti ti-refresh"></Icon></button>}
          <button className="btn btn-primary btn-sm" onClick={() => showCreate ? (setShowCreate(false)) : setShowCreate(true)} disabled={!isAdmin} style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}><Icon className={`ti ${showCreate ? 'ti-x' : 'ti-plus'}`}></Icon> {showCreate ? 'Cancel' : 'New'}</button>
        </div>
      </div>

      {showCreate && isAdmin && <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Columns</label><Select className="form-select" value={newCols} onChange={e => setNewCols(parseInt(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</Select></div>
        <button className="btn btn-primary btn-sm" onClick={createDash} disabled={!newName.trim()}><Icon className="ti ti-plus"></Icon> Create</button>
      </div>}

      {dashboards.length > 0 && <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {dashboards.map(d => <div key={d.id} className="card" style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, border: selDash?.id === d.id ? '2px solid var(--accent)' : undefined }} onClick={() => selectDash(d)}>
          <Icon className="ti ti-layout-dashboard" style={{ color: selDash?.id === d.id ? 'var(--accent)' : 'var(--icon-color)' }}></Icon>
          <span style={{ fontWeight: selDash?.id === d.id ? 700 : 500 }}>{d.name}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{d.columns}col</span>
          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setDel(d.id); }} style={{ padding: 2, marginLeft: 'auto', opacity: !isAdmin ? 0.35 : 1, cursor: !isAdmin ? 'not-allowed' : 'pointer' }} disabled={!isAdmin}><Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon></button>
        </div>)}
      </div>}

      {dashboards.length === 0 && !showCreate && <div className="empty-state"><Icon className="ti ti-layout-dashboard"></Icon><p>No dashboards. Create one to get started.</p></div>}

      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><span className="loading-spinner"></span></div>}
      {selDash && !loading && charts.length === 0 && <div className="empty-state"><Icon className="ti ti-chart-dots"></Icon><p>No charts. Use Chart Builder to add some.</p></div>}

      {selDash && charts.length > 0 && <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Drag charts to swap positions.</span>
          {hasUnsaved && isAdmin && <button className="btn btn-primary btn-sm" onClick={saveLayout}><Icon className="ti ti-device-floppy"></Icon> Save Layout</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
          {charts.map((chart, i) => (
            <div key={chart.id} draggable={!fs && canEdit} onDragStart={e => !fs && canEdit && onDragStart(e, i)} onDragOver={onDragOver} onDrop={e => canEdit && onDrop(e, i)}
              style={{ opacity: dragIdx === i ? 0.4 : 1, cursor: !fs && canEdit ? 'grab' : 'default', transition: 'opacity 0.2s' }}>
              <ChartTile setFss={setFs} sidebar={sidebar} chart={chart} onDelete={() => deleteChart(chart.id)} cols={cols} isAdmin={isAdmin} canEdit={canEdit} showLegends={showLegends} legendSupportedTypes={legendSupportedTypes} />
            </div>
          ))}
        </div>
      </div>}

      {del && isAdmin && <ConfirmModal title="Delete Dashboard" message="Delete this dashboard? Charts will be unassigned." onConfirm={() => deleteDash(del)} onCancel={() => setDel(null)} danger />}
    </div>
  );
}

function ChartTile({ chart, onDelete, sidebar, cols, setFss, isAdmin, canEdit, showLegends, legendSupportedTypes }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const [fs, setFs] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const { theme } = useTheme();
  const isDarkColor = theme === 'dark' ? 'white' : 'black';

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const hasLegend = useMemo(() => {
    const legend = chart?.chartOption?.legend;
    const series = chart?.chartOption?.series;
    if (legend?.show === false) return false;
    if (!Array.isArray(series) || series.length === 0) return false;
    return series.some(s => Array.isArray(s?.data) && s?.data.length > 0);
  }, [chart]);

  const supportsLegend = legendSupportedTypes.includes(chart.chartSubtype);

  function getContainerHeight() {
    if (fs) return "calc(100vh - 32px)";
    if (isSmallScreen) return "520px";
    return "580px";
  }

  function getChartHeight() {
    if (fs) return "calc(100vh - 100px)";
    if (isSmallScreen) return "420px";
    return "500px";
  }

  const barChartTypes = ['simple_bar', 'grouped_bar', 'stacked_bar'];
  const isBarChart = barChartTypes.includes(chart.chartSubtype);

  const resolvedLegend = fs
    ? {
        ...chart?.chartOption?.legend,
        show: supportsLegend && hasLegend && showLegends,
        type: 'scroll',
        orient: 'vertical',
        left: 0,
        top: 8,
        bottom: 8,
        width: 220,
        textStyle: { ...(chart?.chartOption?.legend?.textStyle || {}), color: isDarkColor }
      }
    : isSmallScreen
      ? {
          ...chart?.chartOption?.legend,
          show: supportsLegend && hasLegend && showLegends,
          type: 'scroll',
          orient: 'horizontal',
          left: 0,
          right: 0,
          top: 0,
          width: '100%',
          pageIconColor: isDarkColor,
          pageIconInactiveColor: 'var(--text-muted)',
          pageTextStyle: { color: isDarkColor },
          textStyle: { ...(chart?.chartOption?.legend?.textStyle || {}), color: isDarkColor }
        }
      : cols === 4
        ? {
            ...chart?.chartOption?.legend,
            show: supportsLegend && hasLegend && showLegends,
            type: 'scroll',
            left: 0,
            top: 0,
            bottom: 0,
            orient: "vertical",
            width: 135,
            pageIconColor: isDarkColor,
            pageIconInactiveColor: 'var(--text-muted)',
            pageTextStyle: { color: isDarkColor },
            textStyle: { ...(chart?.chartOption?.legend?.textStyle || {}), color: isDarkColor }
          }
        : {
            ...chart?.chartOption?.legend,
            show: supportsLegend && hasLegend && showLegends,
            type: 'scroll',
            left: 0,
            right: 0,
            top: 0,
            orient: "horizontal",
            pageIconColor: isDarkColor,
            pageIconInactiveColor: 'var(--text-muted)',
            pageTextStyle: { color: isDarkColor },
            textStyle: { ...(chart?.chartOption?.legend?.textStyle || {}), color: isDarkColor }
          };

  const gridTop = fs
    ? 24
    : isSmallScreen
      ? (supportsLegend && hasLegend && showLegends ? 72 : 20)
      : cols === 4
        ? 20
        : supportsLegend && hasLegend && showLegends
          ? 56
          : 20;

  const gridLeft = fs
    ? (supportsLegend && hasLegend && showLegends ? 240 : 20)
    : !isSmallScreen && cols === 4 && supportsLegend && hasLegend && showLegends
      ? 145
      : 20;

  const opt = {
    ...chart.chartOption,
    responsive: true,
    maintainAspectRatio: false,
    grid: {
      ...chart?.chartOption?.grid,
      top: gridTop,
      left: gridLeft,
      right: 24,
      bottom: isBarChart ? 120 : 45,
      containLabel: true,
      width: fs ? undefined : undefined,
      height: fs ? undefined : undefined
    },
    toolbox: { show: false },
    legend: resolvedLegend,
    xAxis: {
      ...chart?.chartOption?.xAxis,
      nameGap: isBarChart ? 100 : 40,
      nameLocation: "middle",
      position: 'bottom',
      axisLabel: {
        ...chart?.chartOption?.xAxis?.axisLabel,
        rotate: isBarChart ? 45 : (isSmallScreen ? 20 : 0),
        align: isBarChart ? 'right' : 'left',
        color: isDarkColor,
        margin: Math.max(chart?.chartOption?.xAxis?.axisLabel?.margin || 8, isBarChart ? 20 : 14),
        hideOverlap: false,
      },
      axisLine: { show: false },
      nameTextStyle: {
        color: isDarkColor,
        fontSize: 10,
        fontWeight: 'bold'
      }

    },
    yAxis: {
      ...chart?.chartOption?.yAxis,
      position: 'left',
      nameLocation: chart?.chartOption?.yAxis?.nameLocation || 'middle',
      nameGap: Math.max(chart?.chartOption?.yAxis?.nameGap || 25, 42),
      axisLabel: {
        ...chart?.chartOption?.yAxis?.axisLabel,
        rotate: 0,
        align: 'right',
        color: isDarkColor
      },
      nameTextStyle: {
        color: isDarkColor,
        fontSize: 10,
        fontWeight: 'bold'
      },
      axisLine: { show: false }
    }
  };


  const pieSubtypes = ['pie', 'donut', 'rose', 'nested_pie'];
  const isPie = Array.isArray(opt.series) && (opt.series.some(s => s.type === 'pie') || pieSubtypes.includes(chart.chartSubtype));
  if (isPie) {
    opt.series = opt.series.map((s) => {
      if (s.type !== 'pie') return s;
      const baseRadius = s.radius || ['40%', '64%'];
      const finalRadius = fs
        ? baseRadius
        : isSmallScreen
          ? ['30%', '56%']
          : ['28%', '54%'];
      const finalCenter = fs
        ? (s.center || ['50%', '50%'])
        : isSmallScreen
          ? (s.center || ['50%', '55%'])
          : (s.center || ['50%', '57%']);
      return {
        ...s,
        avoidLabelOverlap: true,
        label: {
          ...(s.label || {}),
          formatter: s.label?.formatter || function (params) { return params.name ? `${params.name}\n${params.percent}%` : `${params.percent}%`; },
          color: isDarkColor,
          fontSize: 11,
          overflow: 'truncate',
        },
        labelLine: {
          ...(s.labelLine || {}),
          length: 8,
          length2: 8,
          smooth: false,
        },
        radius: finalRadius,
        center: finalCenter,
      };
    });

    opt.legend = {
      ...(opt.legend || {}),
      textStyle: { ...(opt.legend?.textStyle || {}), fontSize: isSmallScreen ? 10 : 12, color: isDarkColor },
      itemGap: 12,
      pageIconColor: isDarkColor,
    };

    opt.grid = {
      ...(opt.grid || {}),
      top: fs ? (opt.grid?.top || gridTop) : (isSmallScreen ? 72 : 80),
    };
  }

  if (theme === 'dark') {
    const shadowlessSeriesTypes = ['sankey', 'sunburst', 'graph', 'tree'];
    if (Array.isArray(opt.series)) {
      const borderColor = 'rgba(0,0,0,0.65)';
      opt.series = opt.series.map((s) => {
        if (!s || !s.type) return s;
        if (!shadowlessSeriesTypes.includes(s.type)) return s;
        const enhanceLabelStyling = (lbl) => {
          const baseTextStyle = {
            ...(lbl?.textStyle || {}),
            color: isDarkColor,
            textBorderColor: borderColor,
            textBorderWidth: 2,
            textShadowColor: 'transparent',
            textShadowBlur: 0,
          };
          if (!lbl) return { textStyle: baseTextStyle };
          return { ...lbl, textStyle: baseTextStyle };
        };
        return {
          ...s,
          label: enhanceLabelStyling(s.label),
          emphasis: s.emphasis ? { ...s.emphasis, label: enhanceLabelStyling(s.emphasis.label) } : s.emphasis,
          lineStyle: s.lineStyle ? { ...(s.lineStyle || {}), textStyle: { ...(s.lineStyle?.textStyle || {}), color: isDarkColor, textBorderColor: borderColor, textBorderWidth: 2, textShadowColor: 'transparent', textShadowBlur: 0 } } : s.lineStyle,
          itemStyle: s.itemStyle ? { ...(s.itemStyle || {}), textStyle: { ...(s.itemStyle?.textStyle || {}), color: isDarkColor, textBorderColor: borderColor, textBorderWidth: 2, textShadowColor: 'transparent', textShadowBlur: 0 } } : s.itemStyle,
        };
      });
      opt.legend = {
        ...(opt.legend || {}),
        textStyle: { ...(opt.legend?.textStyle || {}), color: isDarkColor, textBorderColor: 'rgba(0,0,0,0.65)', textBorderWidth: 2, textShadowColor: 'transparent', textShadowBlur: 0 }
      };
    }
  }

  useEffect(() => {
    if (!ref.current || !opt || opt._kpi || opt._table || opt._error) return;
    try { inst.current = initChart(ref.current); inst.current.setOption(withZoomable(opt), true); setTimeout(() => inst.current?.resize(), 50); } catch { }
    return () => { if (ref.current) disposeChart(ref.current); };
  }, [opt]);

  useEffect(() => { setTimeout(() => inst.current?.resize(), 150); }, [fs, isSmallScreen, cols, showLegends]);

  function zoomIn() {
    if (inst.current) {
      const option = inst.current.getOption();
      const dataZoom = option.dataZoom;
      if (dataZoom && dataZoom[0]) {
        let start = dataZoom[0].start !== undefined ? dataZoom[0].start : 0;
        let end = dataZoom[0].end !== undefined ? dataZoom[0].end : 100;
        const range = end - start;
        const newStart = Math.max(0, start + range * 0.1);
        const newEnd = Math.min(100, end - range * 0.1);
        inst.current.dispatchAction({
          type: 'dataZoom',
          start: newStart,
          end: newEnd,
          dataZoomIndex: 0
        });
      } else {
        inst.current.dispatchAction({ type: 'dataZoom', start: 0, end: 50, dataZoomIndex: 0 });
      }
    }
  }

  function zoomOut() {
    if (inst.current) {
      const option = inst.current.getOption();
      const dataZoom = option.dataZoom;
      if (dataZoom && dataZoom[0]) {
        let start = dataZoom[0].start !== undefined ? dataZoom[0].start : 0;
        let end = dataZoom[0].end !== undefined ? dataZoom[0].end : 100;
        const range = end - start;
        const newStart = Math.max(0, start - range * 0.1);
        const newEnd = Math.min(100, end + range * 0.1);
        inst.current.dispatchAction({
          type: 'dataZoom',
          start: newStart,
          end: newEnd,
          dataZoomIndex: 0
        });
      } else {
        inst.current.dispatchAction({ type: 'dataZoom', start: 50, end: 100, dataZoomIndex: 0 });
      }
    }
  }

  function resetZoom() {
    if (inst.current) {
      inst.current.dispatchAction({
        type: 'dataZoom',
        start: 0,
        end: 100,
        dataZoomIndex: 0
      });
    }
  }

  const wrap = fs ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', padding: 16, overflow: 'auto', cursor: "default" } :
    { width: '100%', height: getContainerHeight(), overflow: 'hidden', display: 'flex', flexDirection: 'column' };

  const pieChartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
    legendFun: isSmallScreen && supportsLegend && hasLegend,
  };
  const chartControlsFlags = {
    zoomFun: true,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
    legendFun: isSmallScreen && supportsLegend && hasLegend,
  };

  return (
    <div className="card" style={{ padding: 16, ...wrap }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: '14px', fontWeight: 600, minWidth: 0, flex: 1, paddingRight: 8 }}>{chart.name}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 }}>
          {opt && !opt._error && !opt._kpi && !opt._table && (
            <ChartToolbar
              zoomable={!!opt?.xAxis}
              fullscreen={fs}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomReset={resetZoom}
              onSave={() => savePng(inst.current, chart.name)}
              onToggleFullscreen={() => { setFs(!fs); setFss(!fs); }}
              onToggleLegend={() => {}}
              legendVisible={showLegends}
              style={{ flexWrap: 'nowrap' }}
              isWantFeature={chart.chartType === 'pie' ? pieChartControlsFlags : chartControlsFlags}
            />
          )}
          {opt && (opt._error || opt._kpi || opt._table) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFs(!fs); setFss(!fs); }} title={fs ? 'Exit full screen' : 'Full screen'}><Icon className={`ti ${fs ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}`} style={{ fontSize: 14 }}></Icon></button>
          )}
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={onDelete}><Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon></button>
          )}
        </div>
      </div>
      {opt?._error && <div className="alert-banner danger" style={{ fontSize: '13px' }}><Icon className="ti ti-alert-circle"></Icon> {opt.message}</div>}
      {opt?._kpi && <div style={{ textAlign: 'center', padding: 24 }}><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{opt.label}</div><div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-table)' }}>{opt.value}</div></div>}
      {opt?._table && <DataTable rows={opt.data} maxRows={fs ? opt?.data?.length || 10 : 5} />}
      {!opt?._kpi && !opt?._table && !opt?._error &&
        <div
          ref={ref}
          style={{
            height: getChartHeight(),
            width: '100%',
            flex: 1,
            position: "relative",
            display: "flex",
            paddingRight: 0
          }}
        />}
    </div>
  );
}
