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
  const [showLegend, setShowLegend] = useState(true);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const previewRef = useRef(null);
  const previewInst = useRef(null);
  const previewTools = useChartTools(() => previewInst.current, { filename: 'chart' });
  const [del, setDel] = useState(null);

  const { theme } = useTheme()

  const isDarkColor = theme === 'dark' ? 'white' : 'black';

  const legendSupportedTypes = [
    'grouped_bar', 'stacked_bar', 
    'multi_line', 'stacked_line',
    'pie', 'donut', 'rose', 'nested_pie',
    'bubble',
    'multi_category',
    'funnel',
    'radar'
  ];

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function load() {
    try { const [c, d] = await Promise.all([apiFetch('/api/dashboards/charts'), apiFetch('/api/dashboards')]); setCharts(c); setDashboards(d); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function preview(chart) {
    setSelected(chart); setPreviewLoading(true); setPreviewOpt(null); setShowLegend(true);
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

  const supportsLegend = selected && legendSupportedTypes.includes(selected.chartSubtype);

  useEffect(() => {
    if (!previewRef.current || !previewOpt || previewOpt._kpi || previewOpt._table || previewOpt._error) {
      if (previewInst.current) { 
        disposeChart(previewRef.current); 
        previewInst.current = null; 
      }
      return;
    }
    buildChart();
  }, [theme, showLegend]);

  function buildChart() {
    if (!previewRef.current || !previewOpt || previewOpt._kpi || previewOpt._table || previewOpt._error) {
      if (previewInst.current) { 
        disposeChart(previewRef.current); 
        previewInst.current = null; 
      }
      return;
    }
    try {
      if (!previewInst.current) previewInst.current = initChart(previewRef.current);

      const yHasName = Array.isArray(previewOpt.yAxis)
        ? previewOpt.yAxis.some((a) => !!a?.name)
        : !!previewOpt.yAxis?.name;

      const extraLeftForYAxisName = yHasName ? 60 : 20;

      const barChartTypes = ['simple_bar', 'grouped_bar', 'stacked_bar'];
      const isBarChart = barChartTypes.includes(selected?.chartSubtype);

      const resolvedLegend = previewTools.fullscreen
        ? {
            ...previewOpt?.legend,
            show: supportsLegend && hasLegend && showLegend,
            type: 'scroll',
            orient: 'vertical',
            left: 0,
            top: 8,
            bottom: 8,
            width: 220,
            textStyle: { ...(previewOpt?.legend?.textStyle || {}), color: isDarkColor }
          }
        : isSmallScreen
          ? {
              ...previewOpt?.legend,
              show: supportsLegend && hasLegend && showLegend,
              type: 'scroll',
              orient: 'horizontal',
              left: 0,
              right: 0,
              top: 0,
              width: '100%',
              pageIconColor: isDarkColor,
              pageIconInactiveColor: 'var(--text-muted)',
              pageTextStyle: { color: isDarkColor },
              textStyle: { ...(previewOpt?.legend?.textStyle || {}), color: isDarkColor }
            }
          : {
              ...previewOpt?.legend,
              show: supportsLegend && hasLegend && showLegend,
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
        ? 24
        : isSmallScreen
          ? (supportsLegend && hasLegend && showLegend ? 72 : 20)
          : (supportsLegend && hasLegend && showLegend ? 56 : 20);

      const gridLeft = previewTools.fullscreen
        ? (supportsLegend && hasLegend && showLegend ? 240 : extraLeftForYAxisName)
        : (supportsLegend && hasLegend && showLegend ? 20 : extraLeftForYAxisName);

      const baseOption = withZoomable({
        ...previewOpt,
        toolbox: { show: false },
        legend: resolvedLegend,
      });

      const chartOption = {
        ...baseOption,
        grid: Array.isArray(baseOption.grid)
          ? baseOption.grid.map((g) => ({
              ...g,
              containLabel: true,
              top: gridTop,
              left: gridLeft,
              right: 24,
              bottom: Math.max(parseInt(g?.bottom, 10) || 18, isBarChart ? 120 : 70),
            }))
          : {
              ...baseOption.grid,
              containLabel: true,
              top: gridTop,
              left: gridLeft,
              right: 24,
              bottom: Math.max(
                parseInt(baseOption?.grid?.bottom, 10) || 18,
                isBarChart ? 120 : 70,
              ),
            },
        xAxis: Array.isArray(baseOption.xAxis)
          ? baseOption.xAxis.map((axis) => ({
              ...axis,
              nameLocation: "middle",
              nameGap: isBarChart ? 100 : Math.max(axis?.nameGap || 25, 42),
              axisLabel: {
                ...axis?.axisLabel,
                rotate: isBarChart ? 45 : 0,
                align: isBarChart ? 'right' : 'left',
                margin: Math.max(axis?.axisLabel?.margin || 8, isBarChart ? 20 : 14),
                hideOverlap: false,
                color: isDarkColor,
              },
            }))
          : baseOption.xAxis
            ? {
                ...baseOption.xAxis,
                nameLocation: "middle",
                nameGap: isBarChart ? 100 : Math.max(baseOption?.xAxis?.nameGap || 25, 42),
                axisLabel: {
                  ...baseOption?.xAxis?.axisLabel,
                  rotate: isBarChart ? 45 : 0,
                  align: isBarChart ? 'right' : 'left',
                  margin: Math.max(
                    baseOption?.xAxis?.axisLabel?.margin || 8,
                    isBarChart ? 20 : 14,
                  ),
                  hideOverlap: false,
                  color: isDarkColor,
                },
                nameTextStyle: {
                  color: isDarkColor,
                  fontSize: 10,
                  fontWeight: 'bold'
                }
              }
            : baseOption.xAxis,
        yAxis: Array.isArray(baseOption.yAxis)
          ? baseOption.yAxis.map((axis) => ({
              ...axis,
              axisLabel: {
                ...axis?.axisLabel,
                color: isDarkColor,
              },
              nameLocation: axis?.nameLocation || 'middle',
              nameGap: Math.max(axis?.nameGap || 25, 42),
              nameTextStyle: {
                color: isDarkColor,
                fontSize: 10,
                fontWeight: 'bold'
              }
            }))
          : baseOption.yAxis
            ? {
                ...baseOption.yAxis,
                axisLabel: {
                  ...baseOption?.yAxis?.axisLabel,
                  color: isDarkColor,
                },
                nameLocation: baseOption?.yAxis?.nameLocation || 'middle',
                nameGap: Math.max(baseOption?.yAxis?.nameGap || 25, 42),
                nameTextStyle: {
                  color: isDarkColor,
                  fontSize: 10,
                  fontWeight: 'bold'
                }
              }
            : baseOption.yAxis,
      };

      const pieSubtypes = ['pie', 'donut', 'rose', 'nested_pie'];
      const isPie = Array.isArray(baseOption.series) && (baseOption.series.some(s => s.type === 'pie') || pieSubtypes.includes(selected?.chartSubtype));
      if (isPie) {
        chartOption.series = baseOption.series.map((s) => {
          if (s.type !== 'pie') return s;
          const baseRadius = s.radius || ['40%', '64%'];
          const finalRadius = previewTools.fullscreen
            ? baseRadius
            : isSmallScreen
              ? ['30%', '56%']
              : ['28%', '54%'];
          const finalCenter = previewTools.fullscreen
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

        chartOption.legend = {
          ...(chartOption.legend || {}),
          textStyle: { ...(chartOption.legend?.textStyle || {}), fontSize: isSmallScreen ? 10 : 12, color: isDarkColor },
          itemGap: 12,
          pageIconColor: isDarkColor,
        };

        chartOption.grid = Array.isArray(chartOption.grid)
          ? chartOption.grid.map((g) => ({ ...g, top: previewTools.fullscreen ? g.top : (isSmallScreen ? 72 : 80) }))
          : { ...(chartOption.grid || {}), top: previewTools.fullscreen ? (chartOption.grid?.top || gridTop) : (isSmallScreen ? 72 : 80) };
      }

      if (theme === 'dark') {
        const shadowlessSeriesTypes = ['sankey', 'sunburst', 'graph', 'tree'];
        if (Array.isArray(chartOption.series)) {
          const borderColor = 'rgba(0,0,0,0.65)';
          chartOption.series = chartOption.series.map((s) => {
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
          chartOption.legend = {
            ...(chartOption.legend || {}),
            textStyle: { ...(chartOption.legend?.textStyle || {}), color: isDarkColor, textBorderColor: 'rgba(0,0,0,0.65)', textBorderWidth: 2, textShadowColor: 'transparent', textShadowBlur: 0 }
          };
        }
      }

      previewInst.current.setOption(chartOption, true);
      setTimeout(() => previewInst.current?.resize(), 50);
    } catch { }
  }

  useEffect(() => {
    if (!previewRef.current || !previewOpt || previewOpt._kpi || previewOpt._table || previewOpt._error) {
      if (previewInst.current) { 
        disposeChart(previewRef.current); 
        previewInst.current = null; 
      }
      return;
    }
    buildChart();
  }, [previewOpt, previewTools.fullscreen, isDarkColor, hasLegend, selected, showLegend, isSmallScreen]);

  useEffect(() => () => { if (previewRef.current) disposeChart(previewRef.current); }, []);
  useEffect(() => { const t = setTimeout(() => previewInst.current?.resize(), 150); return () => clearTimeout(t); }, [previewTools.fullscreen, showLegend, isSmallScreen]);

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
      <div className="section-header">
        <h2 className="section-title"><Icon className="ti ti-chart-bar"></Icon> All Charts</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selected && supportsLegend && (
            <button
              className={`btn btn-sm ${showLegend ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowLegend(!showLegend)}
              title={showLegend ? 'Hide legend' : 'Show legend'}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon className={`ti ${showLegend ? 'ti-eye' : 'ti-eye-off'}`}></Icon>
              <span style={{ fontSize: '12px' }}>Legend</span>
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: selected ? (isSmallScreen ? '1fr' : '1fr 1fr') : '1fr', gap: 16 }}>
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
          <div className="card" style={previewTools.fullscreen ? { padding: 16, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', overflow: 'auto' } : { padding: 16, overflow: "auto", minHeight: isSmallScreen ? '600px' : '420px' }}>
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
                <div ref={previewRef} style={{ height: previewTools.fullscreen ? 'calc(100vh - 100px)' : (isSmallScreen ? 450 : 380), width: '100%', flex: 1 }} />
              </>
            )}
          </div>
        )}
      </div>
      {del && canEdit && <ConfirmModal title="Delete Chart" message="Delete this chart?" onConfirm={() => deleteChart(del)} onCancel={() => setDel(null)} danger />}
    </div>
  );
}
