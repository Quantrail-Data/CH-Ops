// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Main container component that layout and renders all dashboard widgets and analytics charts.


import React, { useState, useEffect, useRef } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from '../../utils/api.js';
import { buildChartOption } from './chartTypes.js';
import { initChart, disposeChart, withZoomable } from '../../utils/echarts.js';
import ChartToolbar, { savePng } from '../common/ChartToolbar.jsx';
import DataTable from '../layout/DataTable.jsx';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import { useToast } from '../layout/Toast.jsx';
import { useTheme } from "../../App.jsx"

export default function DashboardView({sidebar}) {
  const toast = useToast();
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
      // Sort by gridRow then gridCol
      enriched.sort((a, b) => a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol);
      setCharts(enriched);
    } catch { }
    setLoading(false);
  }

  function selectDash(d) { setSelDash(d); loadCharts(d.id); }
  async function createDash() { if (!newName.trim()) return; try { const d = await apiFetch('/api/dashboards', { method: 'POST', body: JSON.stringify({ name: newName.trim(), columns: newCols }) }); setDashboards(p => [d, ...p]); setNewName(''); setShowCreate(false); toast.success(`Dashboard "${d.name}" created.`); } catch (e) { toast.error(e.message); } }
  async function deleteDash(id) { try { await apiFetch(`/api/dashboards/${id}`, { method: 'DELETE',body:{} }); loadDashboards(); setSelDash(null); setCharts([]); toast.success('Dashboard deleted.'); } catch (e) { toast.error(e.message); } setDel(null); }
  async function deleteChart(id) { try { await apiFetch(`/api/dashboards/charts/${id}`, { method: 'DELETE',body:{} }); if (selDash) loadCharts(selDash.id); toast.success('Chart removed.'); } catch { } }

  // Drag and drop - swap in local state
  function onDragStart(e, i) { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i); }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function onDrop(e, targetIdx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    setCharts(prev => {
      const next = [...prev];
      // Swap grid positions
      const aRow = next[dragIdx].gridRow, aCol = next[dragIdx].gridCol;
      next[dragIdx] = { ...next[dragIdx], gridRow: next[targetIdx].gridRow, gridCol: next[targetIdx].gridCol };
      next[targetIdx] = { ...next[targetIdx], gridRow: aRow, gridCol: aCol };
      // Re-sort
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

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title"><Icon className="ti ti-layout-dashboard"></Icon> Dashboards</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {selDash && <button className="btn btn-secondary btn-sm" onClick={() => loadCharts(selDash.id)}><Icon className="ti ti-refresh"></Icon></button>}
          <button className="btn btn-primary btn-sm" onClick={() => showCreate ? (setShowCreate(false)) : setShowCreate(true)}><Icon className={`ti ${showCreate ? 'ti-x' : 'ti-plus'}`}></Icon> {showCreate ? 'Cancel' : 'New'}</button>
        </div>
      </div>

      {showCreate && <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Columns</label><Select className="form-select" value={newCols} onChange={e => setNewCols(parseInt(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</Select></div>
        <button className="btn btn-primary btn-sm" onClick={createDash} disabled={!newName.trim()}><Icon className="ti ti-plus"></Icon> Create</button>
      </div>}

      {dashboards.length > 0 && <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {dashboards.map(d => <div key={d.id} className="card" style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, border: selDash?.id === d.id ? '2px solid var(--accent)' : undefined }} onClick={() => selectDash(d)}>
          <Icon className="ti ti-layout-dashboard" style={{ color: selDash?.id === d.id ? 'var(--accent)' : 'var(--icon-color)' }}></Icon>
          <span style={{ fontWeight: selDash?.id === d.id ? 700 : 500 }}>{d.name}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{d.columns}col</span>
          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setDel(d.id); }} style={{ padding: 2 }}><Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon></button>
        </div>)}
      </div>}

      {dashboards.length === 0 && !showCreate && <div className="empty-state"><Icon className="ti ti-layout-dashboard"></Icon><p>No dashboards. Create one to get started.</p></div>}

      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><span className="loading-spinner"></span></div>}
      {selDash && !loading && charts.length === 0 && <div className="empty-state"><Icon className="ti ti-chart-dots"></Icon><p>No charts. Use Chart Builder to add some.</p></div>}

      {selDash && charts.length > 0 && <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Drag charts to swap positions.</span>
          {hasUnsaved && <button className="btn btn-primary btn-sm" onClick={saveLayout}><Icon className="ti ti-device-floppy"></Icon> Save Layout</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 5 }}>
          {charts.map((chart, i) => (
            <div key={chart.id} draggable={!fs} onDragStart={e => !fs && onDragStart(e, i)} onDragOver={onDragOver} onDrop={e => onDrop(e, i)}
              style={{ opacity: dragIdx === i ? 0.4 : 1, cursor: 'grab', transition: 'opacity 0.2s' }}>
              <ChartTile setFss={setFs} sidebar={sidebar} chart={chart} onDelete={() => deleteChart(chart.id)} cols={cols} />
            </div>
          ))}
        </div>
      </div>}

      {del && <ConfirmModal title="Delete Dashboard" message="Delete this dashboard? Charts will be unassigned." onConfirm={() => deleteDash(del)} onCancel={() => setDel(null)} danger />}
    </div>
  );
}

function ChartTile({ chart, onDelete, sidebar, cols,setFss }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const [fs, setFs] = useState(false);
  // const opt = chart.chartOption;
  const { theme } = useTheme();
  const isDarkColor = theme === 'dark' ? 'white' : 'black';

  const opt = {
    ...chart.chartOption,
    responsive: true,
    maintainAspectRatio: false,
    grid: {
      ...chart?.chartOption?.grid,
      top: 'center',
      left: 'center',
      width: fs ? '100%' : ChartWidthBasedCols(cols),
      height: fs ? 'calc(100vh - 100px)' : cols === 4 ? "150px" : `200px`
    },
    toolbox: { show: false },
    legend: cols === 4 ?
      { ...chart?.chartOption.legend, left: 0, top: 0, orient: "vertical", textStyle: { color: isDarkColor } } :
      { ...chart?.chartOption.legend, left: 0, orient: "vertical", textStyle: { color: isDarkColor } },
    xAxis: {
      ...chart?.chartOption?.xAxis,
      nameGap: 40,
      position: 'bottom',
      axisLabel: {
        ...chart?.chartOption?.xAxis?.axisLabel,
        rotate: 0,
        align: 'left',
        color: isDarkColor,

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
      position: 'bottom',
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



  function ChartWidthBasedCols(cols) {
    return cols === 4 ? "350px" : "100%"
  }


  function ColsWidthMethod(col) {
    switch (col) {
      case 4:
        return `${(window?.innerWidth - (sidebar ? 150 : 300)) / 4}px`;
      case 3:
        return `${(window?.innerWidth - (sidebar ? 150 : 300)) / 3}px`;
      case 2:
        return `${(window?.innerWidth - (sidebar ? 150 : 300)) / 2}px`;
      case 1:
        return `${(window?.innerWidth - (sidebar ? 150 : 300)) / 1}px`;

      default:
        return `${(window?.innerWidth - (sidebar ? 150 : 300)) / 4}px`
    }
  }

  function ColsHeigthMethod(col) {
    switch (col) {
      case 4:
        return "350px";
      case 3:
        return 450;
      case 2:
        return "350px";
      case 1:
        return "100%";

      default:
        return "350px"
    }
  }

  useEffect(() => {
    if (!ref.current || !opt || opt._kpi || opt._table || opt._error) return;
    try { inst.current = initChart(ref.current); inst.current.setOption(withZoomable(opt), true); setTimeout(() => inst.current?.resize(), 50); } catch { }
    return () => { if (ref.current) disposeChart(ref.current); };
  }, [opt]);

  useEffect(() => { setTimeout(() => inst.current?.resize(), 150); }, [fs]);

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
  const wrap = fs ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', padding: 16, overflow: 'auto',cursor:"default" } :
    { width: ColsWidthMethod(cols), overflow: "auto", height: ColsHeigthMethod(cols) };
  // const wrap = fs ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', padding: 16, overflow: 'auto' } : {};

    const pieChartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };
    const chartControlsFlags = {
    zoomFun: true,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
  };

  return (
    <div className="card" style={{ padding: 16, ...wrap }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>{chart.name}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {opt && !opt._error && !opt._kpi && !opt._table && (
            <ChartToolbar
              zoomable={!!opt?.xAxis}
              fullscreen={fs}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomReset={resetZoom}
              onSave={() => savePng(inst.current, chart.name)}
              onToggleFullscreen={() => { setFs(!fs); setFss(!fs); }}
              isWantFeature={chart.chartType === 'pie' ? pieChartControlsFlags : chartControlsFlags}
            />
          )}
          {opt && (opt._error || opt._kpi || opt._table) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFs(!fs); setFss(!fs); }} title={fs ? 'Exit full screen' : 'Full screen'}><Icon className={`ti ${fs ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}`} style={{ fontSize: 14 }}></Icon></button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onDelete}><Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon></button>
        </div>
      </div>
      {opt?._error && <div className="alert-banner danger" style={{ fontSize: '13px' }}><Icon className="ti ti-alert-circle"></Icon> {opt.message}</div>}
      {opt?._kpi && <div style={{ textAlign: 'center', padding: 24 }}><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{opt.label}</div><div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-table)' }}>{opt.value}</div></div>}
      {opt?._table && <DataTable rows={opt.data} maxRows={fs ? opt?.data?.length || 10 : 5} />}
      {!opt?._kpi && !opt?._table && !opt?._error &&
        <div
          ref={ref}
          style={{
            height: fs ? 'calc(100vh - 100px)' : cols === 4 ? "480px" : '480px',
            width: fs ? '100%' : ChartWidthBasedCols(cols),
            position: "relative",
            top: "10px",
            display: "flex"
          }}
        />}
    </div>
  );
}
