import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from '../../utils/api.js';
import { findParameters, hasValue } from '../../../shared/sqlParams.js';
import { buildChartOption, needsLegend, yAxisNameGap } from './chartTypes.js';
import { initChart, disposeChart, withZoomable } from '../../utils/echarts.js';
import ChartToolbar, { useChartTools } from '../common/ChartToolbar.jsx';
import DataTable from '../layout/DataTable.jsx';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import { useTheme, useAuth } from "../../App.jsx";
import Select from "../common/Select.jsx";

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
  const previewContainerRef = useRef(null);
  const [hasPreviewInstance, setHasPreviewInstance] = useState(false);
  const appliedOptionRef = useRef(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDashboard, setFilterDashboard] = useState('all');

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

  const chartTypes = useMemo(() => {
    const types = new Set();
    charts.forEach(c => {
      if (c.chartType) types.add(c.chartType);
    });
    return Array.from(types).sort();
  }, [charts]);

  const filteredCharts = useMemo(() => {
    return charts.filter(chart => {
      // Search filter - search chart name
      const matchesSearch = chart.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
      
      // Type filter - filter based on chart types
      const matchesType = filterType === 'all' || chart.chartType === filterType;
      
      // Dashboard filter - filter based on dashboards
      const matchesDashboard = filterDashboard === 'all' || String(chart.dashboardId) === filterDashboard;
      
      return matchesSearch && matchesType && matchesDashboard;
    });
  }, [charts, searchTerm, filterType, filterDashboard]);

  async function preview(chart) {
    if (selected?.id === chart.id) {
      setSelected(null);
      setPreviewOpt(null);
      if (previewInst.current) {
        disposeChart(previewRef.current);
        previewInst.current = null;
        setHasPreviewInstance(false);
      }
      return;
    }

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
        setTimeout(() => {
          if (previewContainerRef.current) {
            previewContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
        return;
      }

      const values = {};
      for (const p of declared) {
        if (hasValue(defaults[p.name])) values[p.name] = defaults[p.name];
      }

      const r = await runQuery(chart.sqlQuery, Object.keys(values).length ? { params: values } : {});
      const cfg = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;
      setPreviewOpt(buildChartOption(chart.chartType, chart.chartSubtype, r.rows || [], cfg, chart.name, { xLabel: cfg?.xLabel, yLabel: cfg?.yLabel, showLegend: cfg?.showLegend } ));
      
      setTimeout(() => {
        if (previewContainerRef.current) {
          previewContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
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
        setHasPreviewInstance(false);
      }
      return;
    }
    if (previewInst.current) {
      disposeChart(previewRef.current);
      previewInst.current = null;
      setHasPreviewInstance(false);
    }
    buildChart();
  }, [theme, showLegend]);

  function buildChart() {
    if (!previewRef.current || !previewOpt || previewOpt._kpi || previewOpt._table || previewOpt._error) {
      if (previewInst.current) { 
        disposeChart(previewRef.current); 
        previewInst.current = null; 
        setHasPreviewInstance(false);
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
      const lineChartSubtypes = ['simple_line', 'multi_line', 'stacked_line', 'step_line', 'smooth_line', 'area_line', 'stacked_area'];
      const isBarChart = barChartTypes.includes(selected?.chartSubtype);
      const isLineChart = selected?.chartType === 'line' || lineChartSubtypes.includes(selected?.chartSubtype);
      const isHeatmap = selected?.chartType === 'heatmap' || selected?.chartSubtype === 'heatmap';
      const isScatterLike = selected?.chartSubtype === 'scatter' || selected?.chartSubtype === 'basic_scatter' || selected?.chartSubtype === 'bubble' || selected?.chartType === 'scatter' || selected?.chartType === 'bubble';
      const pieChartTypes = ['pie', 'donut', 'rose', 'nested_pie'];
      const isPieChart = pieChartTypes.includes(selected?.chartSubtype);
      const funnelChartTypes = ['funnel'];
      const isFunnelChart = funnelChartTypes.includes(selected?.chartSubtype) || selected?.chartType === 'funnel';
      const isTreemapChart = selected?.chartType === 'treemap' || selected?.chartSubtype === 'treemap';
      const isSunburstChart = selected?.chartType === 'sunburst' || selected?.chartSubtype === 'sunburst';
      const isCandlestick = selected?.chartType === 'candlestick' || selected?.chartSubtype === 'candlestick' || (Array.isArray(previewOpt?.series) && previewOpt.series.some(s => s.type === 'candlestick'));
      const isRadar = selected?.chartType === 'radar' || selected?.chartSubtype === 'radar';
      const isBoxplot = selected?.chartType === 'boxplot' || selected?.chartSubtype === 'boxplot';
      const isGraph = selected?.chartType === 'graph' || selected?.chartSubtype === 'graph';
      const isSankeyChart = selected?.chartType === 'sankey' || selected?.chartSubtype === 'sankey';
      const isGaugeChart = selected?.chartType === 'gauge' || selected?.chartSubtype === 'gauge';

      const usesCartesianGrid = !isPieChart && !isFunnelChart && !isSunburstChart && !isRadar && !isGraph && !isSankeyChart && !isTreemapChart && !isGaugeChart && (isBarChart || isLineChart || isHeatmap || isScatterLike || isCandlestick || isBoxplot || selected?.chartType === 'bar' || selected?.chartType === 'line' || selected?.chartType === 'scatter' || selected?.chartType === 'heatmap');

      const gridLineColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)';
      const gridLineColorSubtle = theme === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)';

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
            textStyle: { ...(previewOpt?.legend?.textStyle || {}), color: isDarkColor, fontSize: 16 },
            itemStyle: {
              ...(previewOpt?.legend?.itemStyle || {}),
              borderColor: 'transparent',
              borderWidth: 0,
            },
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
              textStyle: { ...(previewOpt?.legend?.textStyle || {}), color: isDarkColor },
              itemStyle: {
                ...(previewOpt?.legend?.itemStyle || {}),
                borderColor: 'transparent',
                borderWidth: 0,
              },
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
              textStyle: { ...(previewOpt?.legend?.textStyle || {}), color: isDarkColor },
              itemStyle: {
                ...(previewOpt?.legend?.itemStyle || {}),
                borderColor: 'transparent',
                borderWidth: 0,
              },
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

      const axis0 = Array.isArray(baseOption?.xAxis) ? baseOption.xAxis[0] : baseOption?.xAxis;
      const axis1 = Array.isArray(baseOption?.yAxis) ? baseOption.yAxis[0] : baseOption?.yAxis;
      const hasBarSeries = Array.isArray(baseOption?.series) && baseOption.series.some((s) => s?.type === 'bar');
      const isHorizontalBar = !!(
        selected?.chartType === 'bar' &&
        hasBarSeries &&
        axis0?.type === 'value' &&
        axis1?.type === 'category'
      );
      const isVerticalBar = !!(
        selected?.chartType === 'bar' &&
        hasBarSeries &&
        (isBarChart || axis0?.type === 'category')
      );

      const determineTickCount = (opt) => {
        if (!opt) return 0;
        if (Array.isArray(opt.yAxis) && isHorizontalBar) {
          const ay = opt.yAxis[0];
          if (ay?.data?.length) return ay.data.length;
        } else if (!Array.isArray(opt.yAxis) && isHorizontalBar && opt.yAxis?.data?.length) {
          return opt.yAxis.data.length;
        }
        if (Array.isArray(opt.xAxis)) {
          const ax = opt.xAxis[0];
          if (ax?.data?.length) return ax.data.length;
        } else if (opt.xAxis?.data?.length) return opt.xAxis.data.length;
        if (Array.isArray(opt.series) && opt.series[0]?.data?.length) return opt.series[0].data.length;
        return 0;
      };

      const tickCount = determineTickCount(baseOption);

      const isFullscreen = previewTools.fullscreen;
      const axisFontSize = isFullscreen 
        ? (tickCount > 80 ? 11 : tickCount > 60 ? 12 : tickCount > 40 ? 13 : tickCount > 24 ? 14 : 15)
        : (tickCount > 80 ? 7 : tickCount > 60 ? 8 : tickCount > 40 ? 9 : tickCount > 24 ? 10 : 11);
      const dataLabelFontSize = isFullscreen
        ? (tickCount > 80 ? 11 : tickCount > 60 ? 12 : tickCount > 40 ? 12 : tickCount > 24 ? 13 : 14)
        : (tickCount > 80 ? 7 : tickCount > 60 ? 8 : tickCount > 40 ? 8 : tickCount > 24 ? 9 : 10);
      const xRotate = (isVerticalBar || isHeatmap || isLineChart) ? (tickCount > 80 ? 65 : tickCount > 40 ? 55 : tickCount > 20 ? 45 : 35) : (isScatterLike ? (isSmallScreen ? 22 : 15) : (tickCount > 40 ? 30 : tickCount > 24 ? 20 : 0));
      const axisNameGapX = (isVerticalBar || isHeatmap || isLineChart) ? (tickCount > 50 ? 132 : 120) : Math.max((Array.isArray(baseOption.xAxis) ? baseOption.xAxis[0]?.nameGap : baseOption.xAxis?.nameGap) || 25, tickCount > 40 ? 64 : 52);
      const axisMarginX = (isVerticalBar || isHeatmap || isLineChart) ? (tickCount > 50 ? 16 : 20) : (tickCount > 40 ? 10 : 12);
      const seriesLabelWidth = isFullscreen
        ? (tickCount > 80 ? 60 : tickCount > 60 ? 72 : tickCount > 40 ? 84 : tickCount > 24 ? 96 : 108)
        : (tickCount > 80 ? 36 : tickCount > 60 ? 42 : tickCount > 40 ? 48 : tickCount > 24 ? 56 : 64);

      const horizontalDataLabelOffset = previewTools.fullscreen ? 20 : (isSmallScreen ? 16 : 18);

      const gridTop = previewTools.fullscreen
        ? Math.max(28, tickCount > 40 ? 40 : 28)
        : isSmallScreen
          ? (supportsLegend && hasLegend && showLegend ? 76 : Math.max(22, tickCount > 40 ? 28 : 22))
          : (supportsLegend && hasLegend && showLegend ? Math.max(62, tickCount > 40 ? 68 : 62) : Math.max(24, tickCount > 40 ? 30 : 24));

      const gridLeft = previewTools.fullscreen
        ? (isHorizontalBar ? 96 : (supportsLegend && hasLegend && showLegend ? 240 : extraLeftForYAxisName))
        : isHorizontalBar
          ? (isSmallScreen ? 84 : 92)
          : (supportsLegend && hasLegend && showLegend ? 20 : extraLeftForYAxisName);

      const gridBottomAuto = (isVerticalBar || isHeatmap || isLineChart)
        ? (tickCount > 80 ? 180 : tickCount > 60 ? 160 : tickCount > 40 ? 140 : tickCount > 24 ? 120 : 110)
        : (isScatterLike ? (tickCount > 40 ? 108 : 94) : (tickCount > 40 ? 116 : 98));

      const gridRight = isHorizontalBar
        ? (previewTools.fullscreen ? 170 : (isSmallScreen ? 130 : 145))
        : 24;

      const shouldShowDataLabels = (() => {
        if (isHeatmap) {
          const totalHeatmapCells = Array.isArray(baseOption.series)
            ? baseOption.series.reduce((acc, s) => {
                if (s.type === 'heatmap' && Array.isArray(s.data)) {
                  return acc + s.data.length;
                }
                return acc;
              }, 0)
            : 0;
          if (totalHeatmapCells > 15) return false;
          return true;
        }
        if (isPieChart) return true;
        if (isHorizontalBar) {
          if (previewTools.fullscreen) {
            if (tickCount > 30) return false;
            return true;
          }
          if (isSmallScreen) {
            if (tickCount > 16) return false;
            return true;
          }
          if (tickCount > 22) return false;
          return true;
        }
        if (previewTools.fullscreen) {
          if (tickCount > 150) return false;
          if ((isVerticalBar || isLineChart) && tickCount > 35) return false;
          if (!(isVerticalBar || isLineChart) && tickCount > 40) return false;
          return true;
        }

        if (isSmallScreen) {
          if (tickCount > 20) return false;
          if ((isVerticalBar || isLineChart) && tickCount > 15) return false;
          if (!(isVerticalBar || isLineChart) && tickCount > 25) return false;
        }

        if (!isSmallScreen && !previewTools.fullscreen) {
          if (tickCount > 50) return false;
          if ((isVerticalBar || isLineChart) && tickCount > 35) return false;
          if (!(isVerticalBar || isLineChart) && tickCount > 40) return false;
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

      const splitLineStyle = usesCartesianGrid ? {
        show: true,
        lineStyle: {
          color: gridLineColor,
          width: 1,
          type: 'solid',
          opacity: 1,
        },
      } : undefined;

      const chartOption = {
        ...baseOption,
        animationDurationUpdate: 120,
        grid: Array.isArray(baseOption.grid)
          ? baseOption.grid.map((g) => ({
              ...g,
              containLabel: false,
              top: gridTop,
              left: gridLeft,
              right: gridRight,
              bottom: Math.max(parseInt(g?.bottom, 10) || 18, gridBottomAuto),
            }))
          : {
              ...baseOption.grid,
              containLabel: false,
              top: gridTop,
              left: gridLeft,
              right: gridRight,
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
              splitLine: usesCartesianGrid ? {
                ...(axis?.splitLine || {}),
                show: isHeatmap ? false : true,
                lineStyle: {
                  ...(axis?.splitLine?.lineStyle || {}),
                  color: gridLineColor,
                  width: 1,
                  type: 'solid',
                  opacity: 1,
                },
              } : axis?.splitLine,
              axisLine: usesCartesianGrid ? {
                ...(axis?.axisLine || {}),
                show: true,
                lineStyle: {
                  ...(axis?.axisLine?.lineStyle || {}),
                  color: gridLineColor,
                  width: 1,
                  opacity: 1,
                },
              } : axis?.axisLine,
              axisTick: usesCartesianGrid ? {
                ...(axis?.axisTick || {}),
                show: true,
                lineStyle: {
                  ...(axis?.axisTick?.lineStyle || {}),
                  color: gridLineColor,
                  opacity: 1,
                },
              } : axis?.axisTick,
              axisLabel: {
                ...axis?.axisLabel,
                rotate: xRotate,
                align: isVerticalBar || isHeatmap || isLineChart || xRotate > 0 ? 'right' : 'left',
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
                splitLine: usesCartesianGrid ? {
                  ...(baseOption?.xAxis?.splitLine || {}),
                  show: isHeatmap ? false : true,
                  lineStyle: {
                    ...(baseOption?.xAxis?.splitLine?.lineStyle || {}),
                    color: gridLineColor,
                    width: 1,
                    type: 'solid',
                    opacity: 1,
                  },
                } : baseOption?.xAxis?.splitLine,
                axisLine: usesCartesianGrid ? {
                  ...(baseOption?.xAxis?.axisLine || {}),
                  show: true,
                  lineStyle: {
                    ...(baseOption?.xAxis?.axisLine?.lineStyle || {}),
                    color: gridLineColor,
                    width: 1,
                    opacity: 1,
                  },
                } : baseOption?.xAxis?.axisLine,
                axisTick: usesCartesianGrid ? {
                  ...(baseOption?.xAxis?.axisTick || {}),
                  show: true,
                  lineStyle: {
                    ...(baseOption?.xAxis?.axisTick?.lineStyle || {}),
                    color: gridLineColor,
                    opacity: 1,
                  },
                } : baseOption?.xAxis?.axisTick,
                axisLabel: {
                  ...baseOption?.xAxis?.axisLabel,
                  rotate: xRotate,
                  align: isVerticalBar || isHeatmap || isLineChart || xRotate > 0 ? 'right' : 'left',
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
              splitLine: usesCartesianGrid ? {
                ...(axis?.splitLine || {}),
                show: isHeatmap ? false : true,
                lineStyle: {
                  ...(axis?.splitLine?.lineStyle || {}),
                  color: gridLineColor,
                  width: 1,
                  type: 'solid',
                  opacity: 1,
                },
              } : axis?.splitLine,
              axisLine: usesCartesianGrid ? {
                ...(axis?.axisLine || {}),
                show: true,
                lineStyle: {
                  ...(axis?.axisLine?.lineStyle || {}),
                  color: gridLineColor,
                  width: 1,
                  opacity: 1,
                },
              } : axis?.axisLine,
              axisTick: usesCartesianGrid ? {
                ...(axis?.axisTick || {}),
                show: true,
                lineStyle: {
                  ...(axis?.axisTick?.lineStyle || {}),
                  color: gridLineColor,
                  opacity: 1,
                },
              } : axis?.axisTick,
              axisLabel: {
                ...axis?.axisLabel,
                color: isDarkColor,
                hideOverlap: isHorizontalBar ? false : (axis?.axisLabel?.hideOverlap ?? false),
                showMinLabel: true,
                showMaxLabel: true,
                interval: isHorizontalBar ? 0 : (axis?.axisLabel?.interval ?? 0),
                fontSize: axisFontSize,
                margin: isHorizontalBar ? 28 : (axis?.axisLabel?.margin ?? 0),
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
              nameGap: isHorizontalBar ? Math.max(axis?.nameGap || 25, 58) : Math.max(axis?.nameGap || 25, yAxisNameGap(baseOption)),
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
                splitLine: usesCartesianGrid ? {
                  ...(baseOption?.yAxis?.splitLine || {}),
                  show: isHeatmap ? false : true,
                  lineStyle: {
                    ...(baseOption?.yAxis?.splitLine?.lineStyle || {}),
                    color: gridLineColor,
                    width: 1,
                    type: 'solid',
                    opacity: 1,
                  },
                } : baseOption?.yAxis?.splitLine,
                axisLine: usesCartesianGrid ? {
                  ...(baseOption?.yAxis?.axisLine || {}),
                  show: true,
                  lineStyle: {
                    ...(baseOption?.yAxis?.axisLine?.lineStyle || {}),
                    color: gridLineColor,
                    width: 1,
                    opacity: 1,
                  },
                } : baseOption?.yAxis?.axisLine,
                axisTick: usesCartesianGrid ? {
                  ...(baseOption?.yAxis?.axisTick || {}),
                  show: true,
                  lineStyle: {
                    ...(baseOption?.yAxis?.axisTick?.lineStyle || {}),
                    color: gridLineColor,
                    opacity: 1,
                  },
                } : baseOption?.yAxis?.axisTick,
                axisLabel: {
                  ...baseOption?.yAxis?.axisLabel,
                  color: isDarkColor,
                  hideOverlap: isHorizontalBar ? false : (baseOption?.yAxis?.axisLabel?.hideOverlap ?? false),
                  showMinLabel: true,
                  showMaxLabel: true,
                  interval: isHorizontalBar ? 0 : (baseOption?.yAxis?.axisLabel?.interval ?? 0),
                  fontSize: axisFontSize,
                  margin: isHorizontalBar ? 28 : (baseOption?.yAxis?.axisLabel?.margin ?? 0),
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
                nameGap: isHorizontalBar ? Math.max(baseOption?.yAxis?.nameGap || 25, 58) : Math.max(baseOption?.yAxis?.nameGap || 25, yAxisNameGap(baseOption)),
                nameTextStyle: {
                  ...(baseOption?.yAxis?.nameTextStyle || {}),
                  color: isDarkColor,
                  fontSize: Math.max(8, axisFontSize - 1),
                  fontWeight: 'bold'
                }
              }
            : baseOption.yAxis,
      };

      if (usesCartesianGrid) {
        if (chartOption.grid && !Array.isArray(chartOption.grid)) {
          chartOption.grid = {
            ...chartOption.grid,
            borderColor: gridLineColor,
            borderWidth: 1,
            show: true,
          };
        } else if (Array.isArray(chartOption.grid)) {
          chartOption.grid = chartOption.grid.map((g) => ({
            ...g,
            borderColor: gridLineColor,
            borderWidth: 1,
            show: true,
          }));
        }
      }

      if (isHeatmap) {
        if (Array.isArray(chartOption.series)) {
          chartOption.series = chartOption.series.map((s) => {
            if (!s || s.type !== 'heatmap') return s;
            
            const totalHeatmapCells = Array.isArray(s.data) ? s.data.length : 0;
            const shouldHideHeatmapLabels = totalHeatmapCells > 15;
            
            return {
              ...s,
              label: {
                ...(s.label || {}),
                show: shouldHideHeatmapLabels ? false : (s.label?.show !== undefined ? s.label.show : true),
                color: isDarkColor,
                fontSize: previewTools.fullscreen ? Math.min(14, axisFontSize + 3) : Math.min(10, axisFontSize),
                formatter: (params) => {
                  if (params && params.value && params.value.length >= 3) {
                    const val = params.value[2];
                    if (typeof val === 'number') {
                      if (Math.abs(val) >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                      if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}K`;
                      return val;
                    }
                    return val;
                  }
                  return '';
                }
              },
              emphasis: {
                ...(s.emphasis || {}),
                label: {
                  ...((s.emphasis && s.emphasis.label) || {}),
                  show: true,
                  color: isDarkColor,
                  fontSize: previewTools.fullscreen ? 16 : 12,
                }
              }
            };
          });
        }
      }

      if (Array.isArray(chartOption.series) && chartOption.series.length) {
        chartOption.series = chartOption.series.map((s) => {
          if (!s || !s.type) return s;
          if (s.type !== 'bar' && s.type !== 'line' && s.type !== 'scatter') return s;
          const labelFont = previewTools.fullscreen ? Math.max(13, dataLabelFontSize + 3) : dataLabelFontSize;
          const labelWidth = previewTools.fullscreen 
            ? (tickCount > 80 ? 60 : tickCount > 60 ? 72 : tickCount > 40 ? 84 : tickCount > 24 ? 96 : 108)
            : seriesLabelWidth;
          return {
            ...s,
            clip: false,
            labelLayout: {
              hideOverlap: isHorizontalBar ? false : true,
              moveOverlap: isHorizontalBar ? 'none' : 'shiftY'
            },
            label: {
              ...(s.label || {}),
              show: shouldShowDataLabels,
              position: isHorizontalBar ? 'right' : 'top',
              distance: isHorizontalBar ? horizontalDataLabelOffset : (tickCount > 50 ? 5 : 8),
              color: isDarkColor,
              overflow: isHorizontalBar ? 'none' : 'truncate',
              width: isHorizontalBar ? undefined : labelWidth,
              hideOverlap: isHorizontalBar ? false : true,
              align: isHorizontalBar ? 'left' : (s.label?.align || undefined),
              verticalAlign: isHorizontalBar ? 'middle' : (s.label?.verticalAlign || undefined),
              fontSize: labelFont,
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
                position: isHorizontalBar ? 'right' : 'top',
                distance: isHorizontalBar ? Math.max(horizontalDataLabelOffset + 6, previewTools.fullscreen ? 24 : 20) : (previewTools.fullscreen ? 16 : 10),
                color: isDarkColor,
                hideOverlap: false,
                align: isHorizontalBar ? 'left' : (((s.emphasis && s.emphasis.label) || {}).align || undefined),
                verticalAlign: isHorizontalBar ? 'middle' : (((s.emphasis && s.emphasis.label) || {}).verticalAlign || undefined),
                fontSize: previewTools.fullscreen ? 16 : 12,
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
            ? (selected?.chartSubtype === 'pie' ? ['0%', '72%'] : ['40%', '72%'])
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
              fontSize: previewTools.fullscreen ? 15 : 11,
              overflow: 'truncate',
              width: previewTools.fullscreen ? 340 : (isSmallScreen ? 160 : 220),
              lineHeight: previewTools.fullscreen ? 26 : 18,
              distanceToLabelLine: previewTools.fullscreen ? 24 : 14,
              bleedMargin: previewTools.fullscreen ? 20 : 12,
            },
            labelLine: {
              ...(s.labelLine || {}),
              length: previewTools.fullscreen ? 24 : 14,
              length2: previewTools.fullscreen ? 20 : 12,
              smooth: false,
              distance: previewTools.fullscreen ? 8 : 4,
            },
            radius: finalRadius,
            center: finalCenter,
          };
        });

        chartOption.legend = {
          ...(chartOption.legend || {}),
          textStyle: { ...(chartOption.legend?.textStyle || {}), fontSize: previewTools.fullscreen ? 16 : (isSmallScreen ? 10 : 12), color: isDarkColor },
          itemGap: previewTools.fullscreen ? 18 : 12,
          pageIconColor: isDarkColor,
          itemStyle: {
            ...(chartOption.legend?.itemStyle || {}),
            borderColor: 'transparent',
            borderWidth: 0,
          },
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
              width: previewTools.fullscreen ? 320 : (isSmallScreen ? 110 : 160),
              fontSize: previewTools.fullscreen ? 16 : (isSmallScreen ? 10 : 11),
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
              borderWidth: 0.5,
            },
            emphasis: {
              ...(s.emphasis || {}),
              label: {
                ...((s.emphasis && s.emphasis.label) || {}),
                show: true,
                color: isDarkColor,
                fontSize: previewTools.fullscreen ? 18 : 12,
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
                borderWidth: 0.5,
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
                  fontSize: previewTools.fullscreen ? 18 : 14,
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
                fontSize: previewTools.fullscreen ? (lbl?.fontSize ? lbl.fontSize + 4 : 16) : (lbl?.fontSize || 12),
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
            textStyle: { ...(chartOption.legend?.textStyle || {}), color: isDarkColor, textBorderColor: 'rgba(0,0,0,0.65)', textBorderWidth: 2, textShadowColor: 'transparent', textShadowBlur: 0, fontSize: previewTools.fullscreen ? 16 : 12 },
            itemStyle: {
              ...(chartOption.legend?.itemStyle || {}),
              borderColor: 'transparent',
              borderWidth: 0,
            },
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
              fontSize: previewTools.fullscreen ? 18 : 13,
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
                  distance: previewTools.fullscreen ? 20 : 10,
                  show: !hideSunburst,
                  fontSize: previewTools.fullscreen ? 16 : 11,
                },
                labelLine: {
                  show: true,
                  length: previewTools.fullscreen ? 30 : 20,
                  length2: previewTools.fullscreen ? 20 : 10,
                  smooth: false,
                },
              },
              {
                label: {
                  position: "outside",
                  distance: previewTools.fullscreen ? 20 : 10,
                  rotate: 0,
                  silent: true,
                  show: !hideSunburst,
                  fontSize: previewTools.fullscreen ? 14 : 10,
                },
                labelLine: {
                  show: true,
                  length: previewTools.fullscreen ? 30 : 20,
                  length2: previewTools.fullscreen ? 20 : 10,
                  smooth: false,
                },
              },
            ],
          };
        });
      }

      appliedOptionRef.current = chartOption;
      previewInst.current.setOption(chartOption, true);
      setHasPreviewInstance(true);
      setTimeout(() => previewInst.current?.resize(), 50);
    } catch { }
  }

  useEffect(() => {
    if (!previewRef.current || !previewOpt || previewOpt._kpi || previewOpt._table || previewOpt._error) {
      if (previewInst.current) { 
        disposeChart(previewRef.current); 
        previewInst.current = null; 
        setHasPreviewInstance(false);
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

  function resetPreviewView() {
    if (!previewInst.current || !selected) return;
    const isTreemapNow = selected.chartType === 'treemap' || selected.chartSubtype === 'treemap';
    const isSunburstNow = selected.chartType === 'sunburst' || selected.chartSubtype === 'sunburst';
    if (isTreemapNow || isSunburstNow) {
      const stored = appliedOptionRef.current;
      if (!stored) return;
      try {
        previewInst.current.setOption(stored, { notMerge: false, lazyUpdate: false, silent: false });
      } catch {}
      try {
        previewInst.current.dispatchAction({ type: isSunburstNow ? 'sunburstRootToNode' : 'treemapRootToNode' });
      } catch {}
      try {
        previewInst.current.resize();
      } catch {}
      return;
    }
    previewTools.zoomReset();
  }

  function sanitizeFilename(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return "chart";
    const sanitized = trimmed
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return sanitized || "chart";
  }

  function saveFullChart() {
    const sourceInst = previewInst.current;
    const storedOption = appliedOptionRef.current;
    const chartName = selected?.name || "chart";

    if (!sourceInst || sourceInst.isDisposed?.() || !storedOption) {
      previewTools.save();
      return;
    }

    const isTreemapNow = selected?.chartType === 'treemap' || selected?.chartSubtype === 'treemap';
    const isSunburstNow = selected?.chartType === 'sunburst' || selected?.chartSubtype === 'sunburst';

    const downloadName = `${sanitizeFilename(chartName)}.png`;

    let container = null;
    let offscreenInst = null;

    try {
      container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.style.width = `${sourceInst.getWidth()}px`;
      container.style.height = `${sourceInst.getHeight()}px`;
      container.style.visibility = "hidden";
      container.style.pointerEvents = "none";
      document.body.appendChild(container);

      offscreenInst = initChart(container);

      const fullOption = JSON.parse(JSON.stringify(storedOption));

      if (Array.isArray(fullOption.dataZoom)) {
        fullOption.dataZoom = fullOption.dataZoom.map((dz) => ({
          ...dz,
          start: 0,
          end: 100,
          startValue: undefined,
          endValue: undefined,
        }));
      }

      if (fullOption.animation === undefined) fullOption.animation = false;
      fullOption.animationDuration = 0;
      fullOption.animationDurationUpdate = 0;

      offscreenInst.setOption(fullOption, true);

      if (isTreemapNow || isSunburstNow) {
        try {
          offscreenInst.dispatchAction({
            type: isSunburstNow ? "sunburstRootToNode" : "treemapRootToNode",
          });
        } catch (e) {
        }
      }

      offscreenInst.resize();

      const finish = () => {
        let dataURL = null;
        try {
          dataURL = offscreenInst.getDataURL({
            type: "png",
            pixelRatio: 2,
            backgroundColor: theme === "dark" ? "#0f1115" : "#ffffff",
            excludeComponents: ["toolbox"],
          });
        } catch (e) {
          dataURL = null;
        }

        if (dataURL) {
          try {
            const link = document.createElement("a");
            link.download = downloadName;
            link.href = dataURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } catch (e) {
          }
        }

        try {
          if (offscreenInst && !offscreenInst.isDisposed?.()) {
            offscreenInst.dispose();
          }
        } catch (e) {
        }
        try {
          if (container && container.parentNode) {
            container.parentNode.removeChild(container);
          }
        } catch (e) {
        }
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(finish, 150);
        });
      });
    } catch (e) {
      try {
        if (offscreenInst && !offscreenInst.isDisposed?.()) {
          offscreenInst.dispose();
        }
      } catch (err) {
      }
      try {
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      } catch (err) {
      }
      previewTools.save();
    }
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
  const treemapControlsFlags = {
    zoomFun: false,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
  };
  const sunburstControlsFlags = {
    zoomFun: false,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
  };

  const computePreviewChartHeight = () => {
    const barChartTypes = ['simple_bar', 'grouped_bar', 'stacked_bar'];
    const isBar = selected && barChartTypes.includes(selected.chartSubtype || '');
    if (previewTools.fullscreen) return 'calc(100vh - 100px)';
    if (isSmallScreen) return isBar ? 380 : 450;
    return isBar ? 340 : 380;
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
      
      {/* Search and Filter Bar */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        marginBottom: 16, 
        flexWrap: 'wrap',
        alignItems: 'center',
        background: 'var(--bg-card)',
        padding: '12px 16px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search charts by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ minWidth: '150px' }}>
          <Select
            className="form-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ width: '100%', cursor: 'pointer' }}
          >
            <option value="all">All Types</option>
            {chartTypes.map(type => (
              <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
            ))}
          </Select>
        </div>
        
        <div style={{ minWidth: '150px' }}>
          <Select
            className="form-select"
            value={filterDashboard}
            onChange={(e) => setFilterDashboard(e.target.value)}
            style={{ width: '100%', cursor: 'pointer' }}
          >
            <option value="all">All Dashboards</option>
            {dashboards.map(d => (
              <option key={d.id} value={String(d.id)}>{d.name}</option>
            ))}
          </Select>
        </div>
        
        {(searchTerm || filterType !== 'all' || filterDashboard !== 'all') && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearchTerm('');
              setFilterType('all');
              setFilterDashboard('all');
            }}
            style={{ whiteSpace: 'nowrap' }}
          >
            <Icon className="ti ti-x"></Icon> Clear
          </button>
        )}
        
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filteredCharts.length} chart{filteredCharts.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="data-table-wrap dt-single">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Type</th><th>Dashboard</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredCharts.map(c => (
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
              {filteredCharts.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No charts found matching your criteria.</td></tr>}
            </tbody>
          </table>
        </div>
        {selected && (
          <div ref={previewContainerRef} className="card" style={previewTools.fullscreen ? { padding: 16, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', overflow: 'auto' } : { padding: 16, overflow: "auto", minHeight: (previewOpt && previewOpt._table) ? 'auto' : (isSmallScreen ? '500px' : '420px'), width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{selected.name}</div>
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={() => { setSelected(null); setPreviewOpt(null); if (previewInst.current) { disposeChart(previewRef.current); previewInst.current = null; setHasPreviewInstance(false); } }}
                title="Close preview"
              >
                <Icon className="ti ti-x" style={{ fontSize: 16 }}></Icon>
              </button>
            </div>
            {previewLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><span className="loading-spinner"></span></div>}
            {previewOpt?._error && <div className="alert-banner danger" style={{ fontSize: '13px' }}><Icon className="ti ti-alert-circle"></Icon> {previewOpt.message}</div>}
            {previewOpt?._kpi && <div style={{ textAlign: 'center', padding: 32 }}><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{previewOpt.label}</div><div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>{previewOpt.value}</div></div>}
            {previewOpt?._table && <DataTable rows={previewOpt.data} maxRows={previewTools.fullscreen ? (previewOpt?.data?.length || 10) : Math.max(5, Math.min(20, (previewOpt?.data?.length || 0)))} />}
            {!previewOpt?._kpi && !previewOpt?._table && !previewOpt?._error && !previewLoading && (
              <>
                <ChartToolbar
                  zoomable={!!previewOpt?.xAxis || selected.chartType === 'treemap' || selected.chartSubtype === 'treemap'}
                  fullscreen={previewTools.fullscreen}
                  onZoomIn={previewTools.zoomIn}
                  onZoomOut={previewTools.zoomOut}
                  onZoomReset={resetPreviewView}
                  onSave={saveFullChart}
                  onToggleFullscreen={previewTools.toggleFullscreen}
                  resetEnabled={hasPreviewInstance}
                  resetTitle={(selected.chartType === 'treemap' || selected.chartSubtype === 'treemap' || selected.chartType === 'sunburst' || selected.chartSubtype === 'sunburst') ? "Restore view" : "Reset zoom"}
                  resetAriaLabel={(selected.chartType === 'treemap' || selected.chartSubtype === 'treemap' || selected.chartType === 'sunburst' || selected.chartSubtype === 'sunburst') ? "Restore view" : "Reset zoom"}
                  resetIcon={(selected.chartType === 'sunburst' || selected.chartSubtype === 'sunburst') ? "ti-arrow-back-up" : undefined}
                  isWantFeature={
                    selected.chartType === 'sunburst' || selected.chartSubtype === 'sunburst'
                      ? sunburstControlsFlags
                      : selected.chartType === 'treemap' || selected.chartSubtype === 'treemap'
                        ? treemapControlsFlags
                        : selected.chartType === 'pie'
                          ? pieChartControlsFlags
                          : (selected.chartType === 'funnel' || selected.chartSubtype === 'funnel')
                            ? funnelControlsFlags
                            : (selected.chartType === 'sankey' ? sankeyControlsFlags : chartControlsFlags)
                  }
                />
                <div ref={previewRef} style={{ height: computePreviewChartHeight(), width: '100%', flex: 1 }} />
              </>
            )}
          </div>
        )}
      </div>
      {del && canEdit && <ConfirmModal title="Delete Chart" message={del?.name ? `Delete \"${del.name}\"?` : "Delete this chart?"} onConfirm={() => performDeleteChartById(del.id)} onCancel={() => setDel(null)} danger />}
    </div>
  );
}
