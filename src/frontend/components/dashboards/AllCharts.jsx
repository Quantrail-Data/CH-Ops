import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from '../../utils/api.js';
import { findParameters, hasValue } from '../../../shared/sqlParams.js';
import { buildChartOption, needsLegend } from './chartTypes.js';
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

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function load() {
    try {
      const [c, d] = await Promise.all([apiFetch('/api/dashboards/charts'), apiFetch('/api/dashboards')]);
      const byId = new Map();
      for (const ch of c) {
        byId.set(String(ch.id), ch);
      }
      const deduped = Array.from(byId.values());
      setCharts(deduped);
      setDashboards(d);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function preview(chart) {
    setSelected(chart); setPreviewLoading(true); setPreviewOpt(null); setShowLegend(true);
    try {
      const cfg0 = typeof chart.config === 'string' ? (() => { try { return JSON.parse(chart.config); } catch { return {}; } })() : (chart.config || {});
      const defaults = cfg0.paramDefaults || {};

      let declared = [];
      try { declared = findParameters(chart.sqlQuery || ''); } catch { declared = []; }

      const missing = declared.filter((p) => p.required && !hasValue(defaults[p.name])).map((p) => p.name);
      if (missing.length) {
        setPreviewOpt({
          _error: true,
          message:
            `This chart needs a value for ${missing.join(', ')}. ` +
            `Set a default in the Chart Builder, or open it on a dashboard where the filter can be supplied.`,
        });
        setPreviewLoading(false);
        return;
      }

      const values = {};
      for (const p of declared) {
        if (hasValue(defaults[p.name])) values[p.name] = defaults[p.name];
      }

      const r = await runQuery(chart.sqlQuery, Object.keys(values).length ? { params: values } : {});
      const cfg = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;
      setPreviewOpt(buildChartOption(chart.chartType, chart.chartSubtype, r.rows || [], cfg, chart.name, { xLabel: cfg?.xLabel, yLabel: cfg?.yLabel, showLegend: cfg?.showLegend } ));
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

  const supportsLegend = selected && needsLegend(selected.chartType, selected.chartSubtype);

  useEffect(() => {
    if (!previewRef.current || !previewOpt || previewOpt._kpi || previewOpt._table || previewOpt._error) {
      if (previewInst.current) { 
        disposeChart(previewRef.current); 
        previewInst.current = null; 
      }
      return;
    }
    if (previewInst.current) {
      disposeChart(previewRef.current);
      previewInst.current = null;
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

      const barChartTypes = ['simple_bar', 'grouped_bar', 'stacked_bar', 'horizontal_bar'];
      const isBarChart = barChartTypes.includes(selected?.chartSubtype);
      const isScatterLike = selected?.chartSubtype === 'scatter' || selected?.chartSubtype === 'basic_scatter' || selected?.chartSubtype === 'bubble' || selected?.chartType === 'scatter' || selected?.chartType === 'bubble';
      const pieChartTypes = ['pie', 'donut', 'rose', 'nested_pie'];
      const isPieChart = pieChartTypes.includes(selected?.chartSubtype);
      const funnelChartTypes = ['funnel'];
      const isFunnelChart = funnelChartTypes.includes(selected?.chartSubtype) || selected?.chartType === 'funnel';

      const tooltipWidth = previewTools.fullscreen ? 420 : (isSmallScreen ? 220 : 300);
      const tooltipMaxHeight = previewTools.fullscreen ? 320 : 240;
      const tooltipExtraCss = `max-height: ${tooltipMaxHeight}px; overflow: auto; -webkit-overflow-scrolling: touch; width: ${tooltipWidth}px; pointer-events: auto;`;

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

      const baseOption = withZoomable({
        ...previewOpt,
        toolbox: { show: false },
        legend: resolvedLegend,
        tooltip: {
          ...(previewOpt?.tooltip || {}),
          confine: true,
          enterable: true,
          extraCssText: tooltipExtraCss,
        },
      });

      const determineTickCount = (opt) => {
        if (!opt) return 0;
        if (Array.isArray(opt.xAxis)) {
          const ax = opt.xAxis[0];
          if (ax?.data?.length) return ax.data.length;
        } else if (opt.xAxis?.data?.length) return opt.xAxis.data.length;
        if (Array.isArray(opt.series) && opt.series[0]?.data?.length) return opt.series[0].data.length;
        return 0;
      };

      const tickCount = determineTickCount(baseOption);

      const axisFontSize = tickCount > 80 ? 7 : tickCount > 60 ? 8 : tickCount > 40 ? 9 : tickCount > 24 ? 10 : 11;
      const dataLabelFontSize = tickCount > 80 ? 7 : tickCount > 60 ? 8 : tickCount > 40 ? 8 : tickCount > 24 ? 9 : 10;
      const xRotate = isBarChart ? (tickCount > 80 ? 65 : tickCount > 40 ? 55 : tickCount > 20 ? 45 : 35) : (isScatterLike ? (isSmallScreen ? 22 : 15) : (tickCount > 40 ? 30 : tickCount > 24 ? 20 : 0));
      const axisNameGapX = isBarChart ? (tickCount > 50 ? 132 : 120) : Math.max((Array.isArray(baseOption.xAxis) ? baseOption.xAxis[0]?.nameGap : baseOption.xAxis?.nameGap) || 25, tickCount > 40 ? 64 : 52);
      const axisMarginX = isBarChart ? (tickCount > 50 ? 16 : 20) : (tickCount > 40 ? 10 : 12);
      const seriesLabelWidth = tickCount > 80 ? 36 : tickCount > 60 ? 42 : tickCount > 40 ? 48 : tickCount > 24 ? 56 : 64;

      const gridTop = previewTools.fullscreen
        ? Math.max(28, tickCount > 40 ? 40 : 28)
        : isSmallScreen
          ? (supportsLegend && hasLegend && showLegend ? 76 : Math.max(22, tickCount > 40 ? 28 : 22))
          : (supportsLegend && hasLegend && showLegend ? Math.max(62, tickCount > 40 ? 68 : 62) : Math.max(24, tickCount > 40 ? 30 : 24));

      const gridLeft = previewTools.fullscreen
        ? (supportsLegend && hasLegend && showLegend ? 240 : extraLeftForYAxisName)
        : (supportsLegend && hasLegend && showLegend ? 20 : extraLeftForYAxisName);

      const gridBottomAuto = isBarChart
        ? (tickCount > 80 ? 250 : tickCount > 60 ? 230 : tickCount > 40 ? 210 : tickCount > 24 ? 185 : 165)
        : (isScatterLike ? (tickCount > 40 ? 108 : 94) : (tickCount > 40 ? 116 : 98));

      const shouldShowDataLabels = (() => {
        if (isPieChart) return true;
        if (previewTools.fullscreen) {
          if (tickCount > 150) return false;
          if (isBarChart && tickCount > 35) return false;
          if (!isBarChart && tickCount > 40) return false;
          return true;
        }

        if (isSmallScreen) {
          if (tickCount > 20) return false;
          if (isBarChart && tickCount > 15) return false;
          if (!isBarChart && tickCount > 25) return false;
        }

        if (!isSmallScreen && !previewTools.fullscreen) {
          if (tickCount > 50) return false;
          if (isBarChart && tickCount > 35) return false;
          if (!isBarChart && tickCount > 40) return false;
        }

        return true;
      })();

      const shouldShowFunnelLabels = (() => {
        if (previewTools.fullscreen) return true;
        if (!isFunnelChart) return true;
        const funnelCount = Array.isArray(baseOption.series)
          ? baseOption.series
              .filter((s) => s?.type === "funnel")
              .reduce((acc, s) => acc + (Array.isArray(s?.data) ? s.data.length : 0), 0)
          : 0;
        if (isSmallScreen && funnelCount > 10) return false;
        if (!isSmallScreen && funnelCount > 16) return false;
        return true;
      })();

      const chartOption = {
        ...baseOption,
        animationDurationUpdate: 120,
        grid: Array.isArray(baseOption.grid)
          ? baseOption.grid.map((g) => ({
              ...g,
              containLabel: true,
              top: gridTop,
              left: gridLeft,
              right: 24,
              bottom: Math.max(parseInt(g?.bottom, 10) || 18, gridBottomAuto),
            }))
          : {
              ...baseOption.grid,
              containLabel: true,
              top: gridTop,
              left: gridLeft,
              right: 24,
              bottom: Math.max(
                parseInt(baseOption?.grid?.bottom, 10) || 18,
                gridBottomAuto,
              ),
            },
        xAxis: Array.isArray(baseOption.xAxis)
          ? baseOption.xAxis.map((axis) => ({
              ...axis,
              nameLocation: "middle",
              nameGap: axisNameGapX,
              axisLabel: {
                ...axis?.axisLabel,
                rotate: xRotate,
                align: isBarChart || xRotate > 0 ? 'right' : 'left',
                margin: Math.max(axis?.axisLabel?.margin || 8, axisMarginX),
                hideOverlap: false,
                showMinLabel: true,
                showMaxLabel: true,
                interval: 0,
                color: isDarkColor,
                fontSize: axisFontSize,
                formatter: (v) => {
                  try {
                    const n = Number(v);
                    if (Number.isFinite(n)) {
                      if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
                      if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                    }
                    const s = String(v);
                    const maxLen = tickCount > 80 ? 8 : tickCount > 60 ? 10 : tickCount > 40 ? 12 : 16;
                    return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
                  } catch { return v; }
                },
              },
              nameTextStyle: {
                ...(axis?.nameTextStyle || {}),
                color: isDarkColor,
                fontSize: Math.max(8, axisFontSize - 1),
                fontWeight: 'bold'
              }
            }))
          : baseOption.xAxis
            ? {
                ...baseOption.xAxis,
                nameLocation: "middle",
                nameGap: axisNameGapX,
                axisLabel: {
                  ...baseOption?.xAxis?.axisLabel,
                  rotate: xRotate,
                  align: isBarChart || xRotate > 0 ? 'right' : 'left',
                  margin: Math.max(
                    baseOption?.xAxis?.axisLabel?.margin || 8,
                    axisMarginX,
                  ),
                  hideOverlap: false,
                  showMinLabel: true,
                  showMaxLabel: true,
                  interval: 0,
                  color: isDarkColor,
                  fontSize: axisFontSize,
                  formatter: (v) => {
                    try {
                      const n = Number(v);
                      if (Number.isFinite(n)) {
                        if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
                        if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                      }
                      const s = String(v);
                      const maxLen = tickCount > 80 ? 8 : tickCount > 60 ? 10 : tickCount > 40 ? 12 : 16;
                      return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
                    } catch { return v; }
                  },
                },
                nameTextStyle: {
                  color: isDarkColor,
                  fontSize: Math.max(8, axisFontSize - 1),
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
                hideOverlap: false,
                showMinLabel: true,
                showMaxLabel: true,
                interval: 0,
                fontSize: axisFontSize,
                formatter: (v) => {
                  try {
                    const n = Number(v);
                    if (Number.isFinite(n)) {
                      if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
                      if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                    }
                    return v;
                  } catch { return v; }
                },
              },
              nameLocation: axis?.nameLocation || 'middle',
              nameGap: Math.max(axis?.nameGap || 25, 42),
              nameTextStyle: {
                ...(axis?.nameTextStyle || {}),
                color: isDarkColor,
                fontSize: Math.max(8, axisFontSize - 1),
                fontWeight: 'bold'
              }
            }))
          : baseOption.yAxis
            ? {
                ...baseOption.yAxis,
                axisLabel: {
                  ...baseOption?.yAxis?.axisLabel,
                  color: isDarkColor,
                  hideOverlap: false,
                  showMinLabel: true,
                  showMaxLabel: true,
                  interval: 0,
                  fontSize: axisFontSize,
                  formatter: (v) => {
                    try {
                      const n = Number(v);
                      if (Number.isFinite(n)) {
                        if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
                        if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                      }
                      return v;
                    } catch { return v; }
                  },
                },
                nameLocation: baseOption?.yAxis?.nameLocation || 'middle',
                nameGap: Math.max(baseOption?.yAxis?.nameGap || 25, 42),
                nameTextStyle: {
                  ...(baseOption?.yAxis?.nameTextStyle || {}),
                  color: isDarkColor,
                  fontSize: Math.max(8, axisFontSize - 1),
                  fontWeight: 'bold'
                }
              }
            : baseOption.yAxis,
      };

      if (Array.isArray(chartOption.series) && chartOption.series.length) {
        chartOption.series = chartOption.series.map((s) => {
          if (!s || !s.type) return s;
          if (s.type !== 'bar' && s.type !== 'line' && s.type !== 'scatter') return s;
          return {
            ...s,
            clip: true,
            labelLayout: {
              hideOverlap: true,
              moveOverlap: 'shiftY'
            },
            label: {
              ...(s.label || {}),
              show: shouldShowDataLabels,
              position: s.type === 'bar' ? 'top' : 'top',
              distance: tickCount > 50 ? 5 : 8,
              color: isDarkColor,
              overflow: 'truncate',
              width: seriesLabelWidth,
              hideOverlap: true,
              fontSize: dataLabelFontSize,
              formatter: (p) => {
                try {
                  const raw = Array.isArray(p?.value) ? p.value[p.value.length - 1] : p?.value;
                  const n = Number(raw);
                  if (Number.isFinite(n)) {
                    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
                    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                    return `${n}`;
                  }
                  const t = String(raw ?? "");
                  const maxLen = tickCount > 80 ? 5 : tickCount > 60 ? 6 : tickCount > 40 ? 7 : 8;
                  return t.length > maxLen ? t.slice(0, maxLen - 1) + "…" : t;
                } catch {
                  return p?.value;
                }
              },
            },
            emphasis: {
              ...(s.emphasis || {}),
              label: {
                ...((s.emphasis && s.emphasis.label) || {}),
                show: true,
                position: 'top',
                distance: 10,
                color: isDarkColor,
                hideOverlap: false,
              },
            },
          };
        });
      }

      const pieSubtypes = ['pie', 'donut', 'rose', 'nested_pie'];
      const isPie = Array.isArray(baseOption.series) && (baseOption.series.some(s => s.type === 'pie') || pieSubtypes.includes(selected?.chartSubtype));
      if (isPie) {
        const pieSeries = baseOption.series.filter(s => s.type === 'pie');
        const pieSliceCount = pieSeries.reduce((acc, s) => acc + (Array.isArray(s?.data) ? s.data.length : 0), 0);
        const hidePieLabels = pieSliceCount > 16;

        chartOption.series = baseOption.series.map((s) => {
          if (s.type !== 'pie') return s;
          const defaultBaseRadius = selected?.chartSubtype === 'pie' ? ['0%', '64%'] : ['40%', '64%'];
          const baseRadius = s.radius || defaultBaseRadius;
          const finalRadius = previewTools.fullscreen
            ? baseRadius
            : isSmallScreen
              ? (selected?.chartSubtype === 'pie' ? ['0%', '56%'] : ['30%', '56%'])
              : (selected?.chartSubtype === 'pie' ? ['0%', '54%'] : ['28%', '54%']);
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
              show: !hidePieLabels && shouldShowDataLabels,
              formatter: s.label?.formatter || function (params) { return params.name ? `${params.name}\n${params.percent}%` : `${params.percent}%`; },
              color: isDarkColor,
              fontSize: 11,
              overflow: 'truncate',
              width: previewTools.fullscreen ? 240 : (isSmallScreen ? 160 : 220),
              lineHeight: 18,
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
          ? chartOption.grid.map((g) => ({ ...g, top: previewTools.fullscreen ? g.top : (isSmallScreen ? 84 : 92) }))
          : { ...(chartOption.grid || {}), top: previewTools.fullscreen ? (chartOption.grid?.top || gridTop) : (isSmallScreen ? 84 : 92) };
      }

      if (Array.isArray(chartOption.series)) {
        chartOption.series = chartOption.series.map((s) => {
          if (!s || s.type !== "funnel") return s;
          return {
            ...s,
            minSize: s.minSize ?? '0%',
            maxSize: s.maxSize ?? '100%',
            gap: Math.max(0, s.gap ?? 1),
            left: previewTools.fullscreen && supportsLegend && hasLegend && showLegend ? '22%' : (s.left ?? '10%'),
            top: previewTools.fullscreen && supportsLegend && hasLegend && showLegend ? '8%' : (s.top ?? '10%'),
            width: previewTools.fullscreen && supportsLegend && hasLegend && showLegend ? '74%' : (s.width ?? '80%'),
            height: previewTools.fullscreen && supportsLegend && hasLegend && showLegend ? '84%' : (s.height ?? '80%'),
            labelLayout: {
              hideOverlap: true,
              moveOverlap: 'shiftY',
            },
            label: {
              ...(s.label || {}),
              show: shouldShowFunnelLabels,
              color: isDarkColor,
              overflow: 'truncate',
              width: previewTools.fullscreen ? 220 : (isSmallScreen ? 110 : 160),
              fontSize: previewTools.fullscreen ? 12 : (isSmallScreen ? 10 : 11),
            },
            labelLine: {
              ...(s.labelLine || {}),
              show: shouldShowFunnelLabels,
              lineStyle: {
                ...(s.labelLine?.lineStyle || {}),
                color: isDarkColor,
                opacity: 1,
              },
            },
            itemStyle: {
              ...(s.itemStyle || {}),
              borderColor: isDarkColor,
            },
            emphasis: {
              ...(s.emphasis || {}),
              label: {
                ...((s.emphasis && s.emphasis.label) || {}),
                show: true,
                color: isDarkColor,
              },
              labelLine: {
                ...((s.emphasis && s.emphasis.labelLine) || {}),
                show: true,
                lineStyle: {
                  ...((s.emphasis && s.emphasis.labelLine && s.emphasis.labelLine.lineStyle) || {}),
                  color: isDarkColor,
                  opacity: 1,
                },
              },
              itemStyle: {
                ...((s.emphasis && s.emphasis.itemStyle) || {}),
                borderColor: isDarkColor,
              },
            },
          };
        });
      }

      if (theme === 'dark') {
        const shadowlessSeriesTypes = ['sankey', 'sunburst', 'graph', 'tree'];
        if (Array.isArray(chartOption.series)) {
          const borderColor = 'rgba(0,0,0,0.65)';
          chartOption.series = chartOption.series.map((s) => {
            if (!s || !s.type) return s;
            if (s.type === 'sankey') {
              return {
                ...s,
                label: {
                  ...(s.label || {}),
                  color: isDarkColor,
                },
                itemStyle: {
                  ...(s.itemStyle || {}),
                  borderColor: 'rgba(255,255,255,0.08)',
                  borderWidth: 1,
                },
                emphasis: {
                  ...(s.emphasis || {}),
                  focus: 'adjacency',
                  itemStyle: {
                    ...(s.emphasis?.itemStyle || {}),
                    borderColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 1.5,
                  },
                },
                lineStyle: {
                  ...(s.lineStyle || {}),
                  color: 'rgba(255,255,255,0.12)',
                  opacity: 0.8,
                  curveness: s.lineStyle?.curveness ?? 0.2,
                },
              };
            }
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

        const isSankey =
        Array.isArray(chartOption.series) &&
        chartOption.series.some((s) => s.type === "sankey");

      if (isSankey) {
        chartOption.series = chartOption.series.map((s) => {
          if (s.type !== "sankey") return s;

          return {
            ...s,
            label: {
              ...(s.label || {}),
              color: isDarkColor,
              fontSize: 13,
            },
          };
        });
      }

      const isSunBurst =
        Array.isArray(chartOption.series) &&
        chartOption.series.some((s) => s.type === "sunburst");

      const isSunBurstVisualmap =
        Object.keys(chartOption?.visualMap || {})?.length > 0;

      if (isSunBurst) {
        let totalNodes = 0;
        const countNodes = (node) => {
          if (!node) return 0;
          if (Array.isArray(node)) return node.reduce((acc, n) => acc + countNodes(n), 0);
          let c = 1;
          if (Array.isArray(node.children)) c += node.children.reduce((a, n) => a + countNodes(n), 0);
          return c;
        };
        for (const s of chartOption.series) {
          if (s.type !== 'sunburst') continue;
          if (Array.isArray(s.data)) {
            totalNodes += s.data.reduce((a, n) => a + countNodes(n), 0);
          } else {
            totalNodes += countNodes(s.data);
          }
        }
        const hideSunburst = totalNodes > 15;

        chartOption.series = chartOption.series.map((s) => {
          if (s.type !== "sunburst") return s;

          return {
            ...s,
            radius: isSunBurstVisualmap ? ["3%", "60%"] : ["5%", "90%"],
            levels: [
              {},
              {
                label: {
                  position: "outside",
                  rotate: "tangential",
                  distance: 10,
                  show: !hideSunburst
                },
                labelLine: {
                  show: true,
                  length: 20,
                  length2: 10,
                  smooth: false,
                },
              },
              {
                label: {
                  position: "outside",
                  distance: 10,
                  rotate: 0,
                  silent: true,
                  show: !hideSunburst
                },
                labelLine: {
                  show: true,
                  length: 20,
                  length2: 10,
                  smooth: false,
                },
              },
            ],
          };
        });
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

  async function performDeleteChartById(id) { 
    try { 
      await apiFetch(`/api/dashboards/charts/${id}`, { method: 'DELETE', body: {} }); 
      setSelected(null); 
      setPreviewOpt(null); 
      await load(); 
    } catch (e) { /* preserve behavior and don't throw */ } 
    finally { setDel(null); } 
  }

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
  const sankeyControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };
  const funnelControlsFlags = {
    zoomFun: false,
    resetFun: false,
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
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); canEdit && setDel({ id: c.id, name: c.name }); }} disabled={!canEdit} style={!canEdit ? { opacity: 0.35, cursor: 'not-allowed' } : {}} title={canEdit ? "Delete" : "Delete disabled"}><Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon></button>
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
                  isWantFeature={
                    selected.chartType === 'pie'
                      ? pieChartControlsFlags
                      : (selected.chartType === 'funnel' || selected.chartSubtype === 'funnel')
                        ? funnelControlsFlags
                        : (selected.chartType === 'sankey' ? sankeyControlsFlags : chartControlsFlags)
                  }
                />
                <div ref={previewRef} style={{ height: previewTools.fullscreen ? 'calc(100vh - 100px)' : (isSmallScreen ? 450 : 380), width: '100%', flex: 1 }} />
              </>
            )}
          </div>
        )}
      </div>
      {del && canEdit && <ConfirmModal title="Delete Chart" message={del?.name ? `Delete \"${del.name}\"?` : "Delete this chart?"} onConfirm={() => performDeleteChartById(del.id)} onCancel={() => setDel(null)} danger />}
    </div>
  );
}
