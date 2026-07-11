import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from '../../utils/api.js';
import { buildChartOption } from './chartTypes.js';
import { initChart, disposeChart, withZoomable } from '../../utils/echarts.js';
import ChartToolbar, { useChartTools } from '../common/ChartToolbar.jsx';
import DataTable from '../layout/DataTable.jsx';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import { useTheme, useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

export default function AllCharts({ onEdit }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const canEdit = myLevel >= ROLE_LEVEL.editor;
  const [charts, setCharts] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previewOpt, setPreviewOpt] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef(null);
  const previewInst = useRef(null);
  const previewTools = useChartTools(() => previewInst.current, { filename: 'chart' });
  const [del, setDel] = useState(null);

  const { theme } = useTheme()

  const isDarkColor = theme === 'dark' ? 'white' : 'black';

  async function load() {
    try { const [c, d] = await Promise.all([apiFetch('/api/dashboards/charts'), apiFetch('/api/dashboards')]); setCharts(c); setDashboards(d); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function preview(chart) {
    setSelected(chart); setPreviewLoading(true); setPreviewOpt(null);
    try {
      const r = await runQuery(chart.sqlQuery);
      const cfg = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;
      setPreviewOpt(buildChartOption(chart.chartType, chart.chartSubtype, r.rows || [], cfg, chart.name, { xLabel: cfg?.xLabel, yLabel: cfg?.yLabel, showLegend: cfg?.showLegend }));
    } catch (e) { setPreviewOpt({ _error: true, message: e.message }); }
    setPreviewLoading(false);
  }

  const hasLegend = useMemo(() => {
    if (!previewOpt) return false;
    const legend = previewOpt?.legend;
    const series = previewOpt?.series;
    if (legend?.show === false) return false;
    if (!Array.isArray(series) || series.length === 0) return false;
    return series.some(s => Array.isArray(s?.data) && s?.data.length > 0);
  }, [previewOpt]);

  useEffect(() => {
    if (!previewRef.current || !previewOpt || previewOpt._kpi || previewOpt._table || previewOpt._error) {
      if (previewInst.current) { disposeChart(previewRef.current); previewInst.current = null; }
      return;
    }
    try {
      if (!previewInst.current) {

        const resolvedLegend = previewTools.fullscreen
          ? {
              ...previewOpt?.legend,
              show: hasLegend,
              type: 'scroll',
              orient: 'vertical',
              left: 0,
              top: 8,
              bottom: 8,
              width: 220,
              textStyle: { ...(previewOpt?.legend?.textStyle || {}), color: isDarkColor }
            }
          : {
              ...previewOpt?.legend,
              show: hasLegend,
              type: 'scroll',
              left: 0,
              right: 0,
              top: 0,
              orient: "horizontal",
              pageIconColor: isDarkColor,
              pageIconInactiveColor: 'var(--text-muted)',
              pageTextStyle: { color: isDarkColor },
              textStyle: { ...(previewOpt?.legend?.textStyle || {}), color: isDarkColor }
            };

        const gridTop = previewTools.fullscreen
          ? (hasLegend ? 24 : 24)
          : (hasLegend ? 56 : 20);

        const gridLeft = previewTools.fullscreen
          ? (hasLegend ? 240 : 20)
          : 20;

        const chartOption = {
          ...previewOpt,
          responsive: true,
          maintainAspectRatio: false,
          grid: {
            containLabel: true,
            top: gridTop,
            left: gridLeft,
            right: 24,
            bottom: 45
          },
          toolbox: { show: false },
          legend: resolvedLegend,
          xAxis: {
            ...previewOpt?.xAxis,
            nameGap: 40,
            position: 'bottom',
            axisLabel: {
              ...previewOpt?.xAxis?.axisLabel,
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
            ...previewOpt?.yAxis,
            position: 'bottom',
            axisLabel: {
              ...previewOpt?.yAxis?.axisLabel,
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

        previewInst.current = initChart(previewRef.current);
        previewInst.current.setOption(withZoomable(chartOption), true);
        setTimeout(() => previewInst.current?.resize(), 50);
      }

    } catch { }
  }, [previewOpt, previewTools.fullscreen, isDarkColor, hasLegend]);

  useEffect(() => () => { if (previewRef.current) disposeChart(previewRef.current); }, []);
  useEffect(() => { const t = setTimeout(() => previewInst.current?.resize(), 150); return () => clearTimeout(t); }, [previewTools.fullscreen]);

  async function deleteChart(id) { try { await apiFetch(`/api/dashboards/charts/${id}`, { method: 'DELETE', body: {} }); setSelected(null); setPreviewOpt(null); load(); } catch {} setDel(null); }

  const dashMap = Object.fromEntries(dashboards.map(d => [d.id, d.name]));

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
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-chart-bar"></Icon> All Charts</h2></div>
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 16 }}>
        <div className="data-table-wrap dt-single">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Type</th><th>Dashboard</th><th>Actions</th></tr></thead>
            <tbody>
              {charts.map(c => (
                <tr key={c.id} onClick={() => preview(c)} style={{ cursor: 'pointer', background: selected?.id === c.id ? 'var(--accent-soft)' : undefined }}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.chartType} / {c.chartSubtype}</td>
                  <td>{c.dashboardId ? dashMap[c.dashboardId] || `#${c.dashboardId}` : '-'}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    {onEdit && canEdit && <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); onEdit(c); }} title="Edit"><Icon className="ti ti-edit" style={{ fontSize: 14 }}></Icon></button>}
                    {onEdit && !canEdit && <button className="btn btn-ghost btn-sm" disabled style={{ opacity: 0.35, cursor: 'not-allowed' }} title="Edit"><Icon className="ti ti-edit" style={{ fontSize: 14 }}></Icon></button>}
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); canEdit && setDel(c.id); }} disabled={!canEdit} style={!canEdit ? { opacity: 0.35, cursor: 'not-allowed' } : {}} title={canEdit ? "Delete" : "Delete disabled"}><Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon></button>
                  </td>
                </tr>
              ))}
              {charts.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No charts.</td></tr>}
            </tbody>
          </table>
        </div>
        {selected && (
          <div className="card" style={previewTools.fullscreen ? { padding: 16, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', overflow: 'auto' } : { padding: 16, overflow: "auto" }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>{selected.name}</div>
            {previewLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><span className="loading-spinner"></span></div>}
            {previewOpt?._error && <div className="alert-banner danger" style={{ fontSize: '13px' }}><Icon className="ti ti-alert-circle"></Icon> {previewOpt.message}</div>}
            {previewOpt?._kpi && <div style={{ textAlign: 'center', padding: 32 }}><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{previewOpt.label}</div><div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>{previewOpt.value}</div></div>}
            {previewOpt?._table && <DataTable rows={previewOpt.data} maxRows={previewTools.fullscreen ? previewOpt?.data?.length || 10 : 10} />}
            {!previewOpt?._kpi && !previewOpt?._table && !previewOpt?._error && !previewLoading && (
              <>
                <ChartToolbar
                  zoomable={!!previewOpt?.xAxis}
                  fullscreen={previewTools.fullscreen}
                  onZoomIn={previewTools.zoomIn}
                  onZoomOut={previewTools.zoomOut}
                  onZoomReset={previewTools.zoomReset}
                  onSave={previewTools.save}
                  onToggleFullscreen={previewTools.toggleFullscreen}
                  isWantFeature={selected.chartType === 'pie' ? pieChartControlsFlags : chartControlsFlags}
                />
                <div ref={previewRef} style={{ height: previewTools.fullscreen ? 'calc(100vh - 100px)' : 380, width: '100%' }} />
              </>
            )}
          </div>
        )}
      </div>
      {del && canEdit && <ConfirmModal title="Delete Chart" message="Delete this chart?" onConfirm={() => deleteChart(del)} onCancel={() => setDel(null)} danger />}
    </div>
  );
}
