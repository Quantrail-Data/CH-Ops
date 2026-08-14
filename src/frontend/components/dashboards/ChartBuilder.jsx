// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Dynamic utility module for configuring, instantiating, and rendering custom charts.

import React, { useState, useRef, useEffect } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { runQuery, apiFetch } from "../../utils/api.js";
import { isReadOnlySql } from "../../../shared/sqlClassify.js";
import { findParameters } from "../../../shared/sqlParams.js";
import ParamInput from "../common/ParamInput.jsx";
import {
  CHART_TYPES,
  buildChartOption,
  validateColumnType,
  getAxisDefaults,
  needsLegend,
  yAxisNameGap,
} from "./chartTypes.js";
import { initChart, disposeChart, withZoomable } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";
import DataTable from "../layout/DataTable.jsx";
import ErrorBoundary from "../layout/ErrorBoundary.jsx";
import { useToast } from "../layout/Toast.jsx";
import { useTheme, useAuth } from "../../App.jsx";
import SqlEditor from "../editor/SqlEditor.jsx";
import MaxRowsControl, { clampMaxRows, readMaxRows, MAX_ROWS_KEY } from "../editor/MaxRowsControl.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

export default function ChartBuilder({ editChart, onEditDone }) {
  const toast = useToast();
  const { theme } = useTheme();
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const canBuild = myLevel >= ROLE_LEVEL.admin;

  const [sql, setSql] = useState("");
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [maxRows, setMaxRowsState] = useState(() => {
    try {
      return readMaxRows();
    } catch {
      return 5000;
    }
  });
  function setMaxRows(next) {
    const v = clampMaxRows(next);
    setMaxRowsState(v);
    try {
      localStorage.setItem(MAX_ROWS_KEY, String(v));
    } catch {}
  }

  const [chartType, setChartType] = useState("bar");
  const [chartSubtype, setChartSubtype] = useState("simple_bar");
  const [mapping, setMapping] = useState({});
  const [chartName, setChartName] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");
  const [showLegend, setShowLegend] = useState(true);
  const [chartOption, setChartOption] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [dashboards, setDashboards] = useState([]);
  const [selDashboard, setSelDashboard] = useState("");
  const [topOpen, setTopOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [editId, setEditId] = useState(null);
  // Starting values for this chart's parameters, stored in config.paramDefaults.
  // The chart table needs no column for this: a dashboard discovers its filters
  // from the SQL, and the defaults ride along in the existing config JSON.
  const [paramDefaults, setParamDefaults] = useState({});
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // What this chart declares. Shown while it is being built so the author can
  // see what will become a dashboard filter, rather than finding out later on
  // someone else's dashboard.
  const declaredParams = React.useMemo(() => {
    try { return findParameters(sql || ""); } catch { return []; }
  }, [sql]);
  const paramError = React.useMemo(() => {
    try { findParameters(sql || ""); return null; } catch (e) { return e.message; }
  }, [sql]);
  const unwrapped = declaredParams.filter((p) => p.required);
  const previewRef = useRef(null);
  const previewInst = useRef(null);
  const previewTools = useChartTools(() => previewInst.current, {
    filename: "chart-preview",
  });

  const smallScreenOverlapRef = useRef(false);

  useEffect(() => {
    apiFetch("/api/dashboards")
      .then(setDashboards)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (editChart) {
      const cfg =
        typeof editChart.config === "string"
          ? JSON.parse(editChart.config)
          : editChart.config || {};
      setSql(editChart.sqlQuery || "");
      setChartType(editChart.chartType || "bar");
      setChartSubtype(editChart.chartSubtype || "simple_bar");
      setChartName(editChart.name || "");
      setMapping(cfg);
      setParamDefaults(cfg.paramDefaults || {});
      setXLabel(cfg.xLabel || "");
      setYLabel(cfg.yLabel || "");
      setShowLegend(cfg.showLegend !== false);
      setSelDashboard(
        editChart.dashboardId ? String(editChart.dashboardId) : "",
      );
      setEditId(editChart.id);
    }
  }, [editChart]);

  const typeInfo = CHART_TYPES.find((t) => t.type === chartType);
  const subtypeInfo = typeInfo?.subtypes.find(
    (s) => s.subtype === chartSubtype,
  );
  const fields = subtypeInfo?.fields || [];
  const hasAxisLabels = typeInfo?.hasXLabel || false;
  
  const shouldShowLegend = needsLegend(chartType, chartSubtype);

  useEffect(() => {
    if (!editChart) {
      const d = getAxisDefaults(chartType, chartSubtype);
      setXLabel(d.xLabel);
      setYLabel(d.yLabel);
      setShowLegend(shouldShowLegend);
    }
  }, [chartType, chartSubtype, shouldShowLegend]);

  async function runSql() {
    if (!sql.trim()) return;
    if (!isReadOnlySql(sql)) {
      setError(
        "Chart Builder only runs read-only queries (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, EXISTS).",
      );
      return;
    }
    // Preview with the defaults the author has entered. Without this a
    // parameterized query cannot be previewed at all: a required placeholder
    // reaches ClickHouse unset and comes back as "Substitution 'x' is not set",
    // which reads as a broken query rather than a missing default.
    const missing = declaredParams
      .filter((p) => p.required && !(paramDefaults[p.name] ?? "").toString().trim())
      .map((p) => p.name);
    if (missing.length) {
      setError(
        `Give a default for ${missing.join(", ")} to preview this chart. ` +
        `Required parameters have no value until a dashboard supplies one.`,
      );
      return;
    }

    setRunning(true);
    setError(null);
    setData(null);
    try {
      const values = {};
      for (const p of declaredParams) {
        const v = paramDefaults[p.name];
        if (v !== undefined && String(v) !== "") values[p.name] = v;
      }
      const r = await runQuery(sql.trim(), {
        readOnly: true,
        ...(Object.keys(values).length ? { params: values } : {}),
      });
      setData(r.rows || []);
      setColumns(r.columns || []);
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  }

  useEffect(() => {
    if (!data?.length) return;
    const errs = {};
    fields.forEach((f) => {
      if (mapping[f.key] && f.expect) {
        const msg = validateColumnType(data, mapping[f.key], f.expect);
        if (msg) errs[f.key] = msg;
      }
    });
    setValidationErrors(errs);
  }, [data, mapping, fields]);

  useEffect(() => {
    smallScreenOverlapRef.current = false;
  }, [data, mapping, chartType, chartSubtype]);

  function countSunburstNodes(dataNode) {
    if (!dataNode) return 0;
    if (Array.isArray(dataNode)) {
      return dataNode.reduce((acc, n) => acc + countSunburstNodes(n), 0);
    }
    let count = 1;
    if (Array.isArray(dataNode.children)) {
      count += dataNode.children.reduce((acc, c) => acc + countSunburstNodes(c), 0);
    }
    return count;
  }

  function collectSunburstNames(dataNode, names = []) {
    if (!dataNode) return names;
    if (Array.isArray(dataNode)) {
      dataNode.forEach(n => collectSunburstNames(n, names));
      return names;
    }
    if (dataNode.name) names.push(dataNode.name);
    if (Array.isArray(dataNode.children)) {
      dataNode.children.forEach(c => collectSunburstNames(c, names));
    }
    return names;
  }

  useEffect(() => {
    if (!data?.length || (chartType !== "table" && !fields.length)) {
      setChartOption(null);
      return;
    }
    const allMapped = fields
      .filter((f) => f.required)
      .every((f) => mapping[f.key]);
    if (!allMapped && chartType !== "table") {
      setChartOption(null);
      return;
    }
    try {
      let effectiveXLabel = xLabel;
      let effectiveYLabel = yLabel;
      if (chartSubtype === "horizontal_bar") {
        effectiveXLabel = yLabel;
        effectiveYLabel = xLabel;
      }
      
      setChartOption(
        buildChartOption(chartType, chartSubtype, data, mapping, chartName, {
          xLabel: effectiveXLabel,
          yLabel: effectiveYLabel,
          showLegend: shouldShowLegend ? showLegend : false,
        }),
      );
    } catch (err) {
      setChartOption({ _error: true, message: err?.message || String(err) });
    }
  }, [
    data,
    mapping,
    chartType,
    chartSubtype,
    chartName,
    xLabel,
    yLabel,
    showLegend,
    shouldShowLegend,
  ]);

  useEffect(() => {
    if (!previewRef.current) return;
    if (
      !chartOption ||
      chartOption._kpi ||
      chartOption._table ||
      chartOption._error
    ) {
      if (previewInst.current) {
        disposeChart(previewRef.current);
        previewInst.current = null;
      }
      return;
    }
    try {
      if (!previewInst.current)
        previewInst.current = initChart(previewRef.current);

      const isDarkColor = theme === 'dark' ? 'white' : 'black';

      const hasLegendCheck = chartOption.legend?.show || (Array.isArray(chartOption.series) && chartOption.series.some(s => Array.isArray(s?.data) && s?.data.length > 0));
      const legendVisible = shouldShowLegend && showLegend;

      const barChartTypes = ['simple_bar', 'grouped_bar', 'stacked_bar', 'horizontal_bar'];
      const isBarChart = barChartTypes.includes(chartSubtype);
      const isScatterLike = chartSubtype === 'scatter' || chartSubtype === 'basic_scatter' || chartSubtype === 'bubble' || chartType === 'scatter' || chartType === 'bubble';
      const pieChartTypes = ['pie', 'donut', 'rose', 'nested_pie'];
      const isPieChart = pieChartTypes.includes(chartSubtype) || (Array.isArray(chartOption.series) && chartOption.series.some(s => s.type === 'pie'));
      const funnelChartTypes = ['funnel'];
      const isFunnelChart = funnelChartTypes.includes(chartSubtype) || chartType === 'funnel';
      const isSunBurst = Array.isArray(chartOption.series) && chartOption.series.some((s) => s.type === "sunburst");

      let sunburstLegendData = [];
      if (isSunBurst) {
        const sunburstSeries = chartOption.series.filter(s => s.type === 'sunburst');
        sunburstSeries.forEach((s) => {
          if (!s) return;
          if (Array.isArray(s.data)) {
            s.data.forEach(n => collectSunburstNames(n, sunburstLegendData));
          } else {
            collectSunburstNames(s.data, sunburstLegendData);
          }
        });
        sunburstLegendData = Array.from(new Set(sunburstLegendData)).slice(0, 200);
      }

      let legendConfig = {
        ...chartOption.legend,
        textStyle: { ...(chartOption.legend?.textStyle || {}), color: isDarkColor },
        type: 'scroll',
        pageIconColor: isDarkColor,
        pageIconInactiveColor: 'var(--text-muted)',
        pageTextStyle: { color: isDarkColor },
      };

      if (isSunBurst && sunburstLegendData.length > 0) {
        legendConfig = {
          ...legendConfig,
          data: sunburstLegendData,
          show: legendVisible,
          orient: previewTools.fullscreen ? 'vertical' : 'horizontal',
          ...(previewTools.fullscreen ? {
            left: 0,
            top: 8,
            bottom: 8,
            width: 220,
          } : {
            left: 0,
            right: 0,
            top: 0,
            width: '100%',
          })
        };
      } else if (isSunBurst) {
        legendConfig.show = false;
      } else {
        legendConfig = {
          ...legendConfig,
          show: hasLegendCheck && legendVisible,
          orient: previewTools.fullscreen ? 'vertical' : 'horizontal',
          ...(previewTools.fullscreen ? {
            left: 0,
            top: 8,
            bottom: 8,
            width: 220,
          } : {
            left: 0,
            right: 0,
            top: 0,
            width: '100%',
          })
        };
      }

      const baseOption = withZoomable({
        ...chartOption,
        toolbox: { show: false },
        legend: legendConfig,
      });

      if (isSunBurst && sunburstLegendData.length > 0) {
        baseOption.legend.data = sunburstLegendData;
        baseOption.legend.show = legendVisible;
      }

      const tickCount = (() => {
        if (!baseOption) return 0;
        if (Array.isArray(baseOption.xAxis) && baseOption.xAxis[0]?.data?.length) return baseOption.xAxis[0].data.length;
        if (!Array.isArray(baseOption.xAxis) && baseOption.xAxis?.data?.length) return baseOption.xAxis.data.length;
        if (Array.isArray(baseOption.series) && baseOption.series[0]?.data?.length) return baseOption.series[0].data.length;
        return 0;
      })();

      const countSeriesBars = Array.isArray(baseOption.series)
        ? baseOption.series.filter((s) => s?.type === 'bar').length
        : 0;

      const axisFontSize = tickCount > 80 ? 7 : tickCount > 60 ? 8 : tickCount > 40 ? 9 : tickCount > 24 ? 10 : 11;
      const dataLabelFontSize = tickCount > 80 ? 7 : tickCount > 60 ? 8 : tickCount > 40 ? 8 : tickCount > 24 ? 9 : 10;
      const xRotate = isBarChart ? (tickCount > 80 ? 65 : tickCount > 40 ? 55 : tickCount > 20 ? 45 : 35) : (isScatterLike ? (isSmallScreen ? 22 : 15) : (tickCount > 40 ? 30 : tickCount > 24 ? 20 : 0));
      const axisNameGapX = isBarChart ? (tickCount > 50 ? 132 : 120) : Math.max((Array.isArray(baseOption.xAxis) ? baseOption.xAxis[0]?.nameGap : baseOption.xAxis?.nameGap) || 25, tickCount > 40 ? 64 : 52);
      const axisMarginX = isBarChart ? (tickCount > 50 ? 16 : 20) : (tickCount > 40 ? 10 : 12);
      const seriesLabelWidth = tickCount > 80 ? 36 : tickCount > 60 ? 42 : tickCount > 40 ? 48 : tickCount > 24 ? 56 : 64;

      const yHasName = Array.isArray(baseOption.yAxis)
        ? baseOption.yAxis.some((a) => !!a?.name)
        : !!baseOption.yAxis?.name;

      const extraLeftForYAxisName = yHasName ? 60 : 20;
      // Sized to the widest tick label the axis will draw. A fixed gap put the
      // rotated axis name on top of the numbers as soon as they grew wide
      // (a count axis reaching 120,000,000 needs roughly twice the old 42px).
      const yNameGap = yAxisNameGap(baseOption);

      const isSunBurstChart = isSunBurst;
      const sunburstLegendHeight = (isSunBurstChart && sunburstLegendData.length > 0 && legendVisible) ? 40 : 0;

      const gridTop = previewTools.fullscreen
        ? Math.max(28, tickCount > 40 ? 40 : 28)
        : isSmallScreen
          ? ((hasLegendCheck && legendVisible) || (isSunBurstChart && sunburstLegendData.length > 0 && legendVisible) ? 76 : Math.max(22, tickCount > 40 ? 28 : 22))
          : ((hasLegendCheck && legendVisible) || (isSunBurstChart && sunburstLegendData.length > 0 && legendVisible)
            ? Math.max(62, tickCount > 40 ? 68 : 62)
            : Math.max(24, tickCount > 40 ? 30 : 24));

      const gridLeft = previewTools.fullscreen
        ? ((hasLegendCheck && legendVisible) || (isSunBurstChart && sunburstLegendData.length > 0 && legendVisible) ? 240 : extraLeftForYAxisName)
        : ((hasLegendCheck && legendVisible) || (isSunBurstChart && sunburstLegendData.length > 0 && legendVisible) ? 20 : extraLeftForYAxisName);

      const gridBottomAuto = isBarChart
        ? (tickCount > 80 ? 250 : tickCount > 60 ? 230 : tickCount > 40 ? 210 : tickCount > 24 ? 185 : 165)
        : (isScatterLike ? (tickCount > 40 ? 108 : 94) : (tickCount > 40 ? 116 : 98));

      const totalDataPoints = Array.isArray(baseOption.series)
        ? baseOption.series.reduce((acc, s) => acc + (Array.isArray(s?.data) ? s.data.length : (s?.data ? 1 : 0)), 0)
        : tickCount;

      const densityThresholdFullscreen = 220;
      const densityThresholdSmall = 30;
      const tickThresholdNormal = 50;
      const tickThresholdSmall = 30;

      const densityThreshold = previewTools.fullscreen ? densityThresholdFullscreen : (isSmallScreen ? densityThresholdSmall : densityThresholdNormal);
      const tickThreshold = previewTools.fullscreen ? tickThresholdFullscreen : (isSmallScreen ? tickThresholdSmall : tickThresholdNormal);

      const hideLabelsDueToDensity = totalDataPoints > densityThreshold || tickCount > tickThreshold;

      const pieSeries = Array.isArray(baseOption.series) ? baseOption.series.filter(s => s?.type === 'pie') : [];
      const pieSliceCount = pieSeries.reduce((acc, s) => acc + (Array.isArray(s?.data) ? s.data.length : 0), 0);
      const hidePieLabels = pieSliceCount > 16;

      const lineLabelHideThreshold = 25;
      const shouldHideLineLabelsByCount = tickCount > lineLabelHideThreshold;

      const sunburstSeries = Array.isArray(baseOption.series) ? baseOption.series.filter(s => s?.type === 'sunburst') : [];
      const sunburstNodeCount = sunburstSeries.reduce((acc, s) => {
        if (!s) return acc;
        if (Array.isArray(s.data)) {
          return acc + s.data.reduce((a, n) => a + countSunburstNodes(n), 0);
        }
        return acc + countSunburstNodes(s.data);
      }, 0);
      const hideSunburstLabels = sunburstNodeCount > 15;

      const smallOverlapNow = isSmallScreen && (totalDataPoints > densityThresholdSmall || tickCount > tickThresholdSmall || pieSliceCount > 16 || shouldHideLineLabelsByCount || hideSunburstLabels);
      if (smallOverlapNow) smallScreenOverlapRef.current = true;

      const finalHideLabels = hideLabelsDueToDensity || smallScreenOverlapRef.current || hidePieLabels || shouldHideLineLabelsByCount || hideSunburstLabels;

      const shouldShowDataLabels = (() => {
        if (isPieChart) return !finalHideLabels;
        
        if (previewTools.fullscreen) return !finalHideLabels;
        
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
        
        return !finalHideLabels;
      })();

      const shouldShowFunnelLabels = (() => {
        if (previewTools.fullscreen) return !finalHideLabels;
        if (!isFunnelChart) return !finalHideLabels;
        const funnelCount = Array.isArray(baseOption.series)
          ? baseOption.series
              .filter((s) => s?.type === "funnel")
              .reduce((acc, s) => acc + (Array.isArray(s?.data) ? s.data.length : 0), 0)
          : 0;
        if (isSmallScreen && funnelCount > 10) return false;
        if (!isSmallScreen && funnelCount > 16) return false;
        if (finalHideLabels) return false;
        return true;
      })();

      const tooltipWidth = previewTools.fullscreen ? 420 : (isSmallScreen ? 220 : 300);
      const tooltipMaxHeight = previewTools.fullscreen ? 320 : 240;
      const tooltipExtraCss = `max-height: ${tooltipMaxHeight}px; overflow: auto; -webkit-overflow-scrolling: touch; width: ${tooltipWidth}px; pointer-events: auto;`;

      const enhancedOption = {
        ...baseOption,
        tooltip: {
          ...(baseOption.tooltip || {}),
          confine: true,
          enterable: true,
          extraCssText: tooltipExtraCss,
        },
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
              bottom: Math.max(parseInt(baseOption?.grid?.bottom, 10) || 18, gridBottomAuto),
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
                  margin: Math.max(baseOption?.xAxis?.axisLabel?.margin || 8, axisMarginX),
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
                  ...(baseOption?.xAxis?.nameTextStyle || {}),
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
              nameGap: Math.max(axis?.nameGap || 25, yNameGap),
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
                nameGap: Math.max(baseOption?.yAxis?.nameGap || 25, yNameGap),
                nameTextStyle: {
                  ...(baseOption?.yAxis?.nameTextStyle || {}),
                  color: isDarkColor,
                  fontSize: Math.max(8, axisFontSize - 1),
                  fontWeight: 'bold'
                }
              }
            : baseOption.yAxis,
      };

      if (Array.isArray(enhancedOption.series) && enhancedOption.series.length) {
        enhancedOption.series = enhancedOption.series.map((s) => {
          if (!s || !s.type) return s;

          if (s.type === 'bar' || s.type === 'line' || s.type === 'scatter') {
            const isLineType = s.type === 'line' || !!s.areaStyle;
            const hideForLine = isLineType && (tickCount > lineLabelHideThreshold || finalHideLabels);
            const showLabelForSeries = shouldShowDataLabels && !hideForLine;

            const labelPosition = s.type === 'bar' ? 'top' : (isLineType ? 'top' : (s.label?.position || 'top'));
            const labelDistance = isLineType ? (tickCount > 50 ? 4 : 6) : (tickCount > 50 ? 5 : 8);
            const labelFont = isLineType ? (previewTools.fullscreen ? Math.max(9, dataLabelFontSize) : dataLabelFontSize) : dataLabelFontSize;

            return {
              ...s,
              clip: true,
              labelLayout: {
                hideOverlap: true,
                moveOverlap: 'shiftY'
              },
              label: {
                ...(s.label || {}),
                show: showLabelForSeries,
                position: labelPosition,
                distance: labelDistance,
                color: isDarkColor,
                overflow: 'truncate',
                width: seriesLabelWidth,
                hideOverlap: true,
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
                  position: 'top',
                  distance: 10,
                  color: isDarkColor,
                  hideOverlap: false,
                },
              },
            };
          }

          return s;
        });
      }

      const pieSubtypes = ['pie', 'donut', 'rose', 'nested_pie'];
      if (Array.isArray(baseOption.series) && (baseOption.series.some(s => s.type === 'pie') || pieSubtypes.includes(chartSubtype))) {
        enhancedOption.series = (enhancedOption.series || baseOption.series).map((s) => {
          if (s.type !== 'pie') return s;
          const defaultBaseRadius = chartSubtype === 'pie' ? ['0%', '64%'] : ['40%', '64%'];
          const baseRadius = s.radius || defaultBaseRadius;
          const finalRadius = previewTools.fullscreen
            ? baseRadius
            : isSmallScreen
              ? (chartSubtype === 'pie' ? ['0%', '56%'] : ['30%', '56%'])
              : (chartSubtype === 'pie' ? ['0%', '54%'] : ['28%', '54%']);
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
              show: !finalHideLabels,
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

        enhancedOption.legend = {
          ...(enhancedOption.legend || {}),
          textStyle: { ...(enhancedOption.legend?.textStyle || {}), fontSize: isSmallScreen ? 10 : 12, color: isDarkColor },
          itemGap: 12,
          pageIconColor: isDarkColor,
        };

        enhancedOption.grid = Array.isArray(enhancedOption.grid)
          ? enhancedOption.grid.map((g) => ({ ...g, top: previewTools.fullscreen ? g.top : (isSmallScreen ? 72 : 80) }))
          : { ...(enhancedOption.grid || {}), top: previewTools.fullscreen ? (enhancedOption.grid?.top || gridTop) : (isSmallScreen ? 72 : 80) };
      }

      if (theme === 'dark') {
        const shadowlessSeriesTypes = ['sankey', 'sunburst', 'graph', 'tree'];
        if (Array.isArray(enhancedOption.series)) {
          const borderColor = 'rgba(0,0,0,0.65)';
          enhancedOption.series = enhancedOption.series.map((s) => {
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
          enhancedOption.legend = {
            ...(enhancedOption.legend || {}),
            textStyle: { ...(enhancedOption.legend?.textStyle || {}), color: isDarkColor, textBorderColor: 'rgba(0,0,0,0.65)', textBorderWidth: 2, textShadowColor: 'transparent', textShadowBlur: 0 }
          };
        }
      }

      if (Array.isArray(enhancedOption.series)) {
        enhancedOption.series = enhancedOption.series.map((s) => {
          if (!s || s.type !== "funnel") return s;
          return {
            ...s,
            minSize: s.minSize ?? '0%',
            maxSize: s.maxSize ?? '100%',
            gap: Math.max(0, s.gap ?? 1),
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

      const isSankey =
        Array.isArray(enhancedOption.series) &&
        enhancedOption.series.some((s) => s.type === "sankey");

      if (isSankey) {
        enhancedOption.series = enhancedOption.series.map((s) => {
          if (s.type !== "sankey") return s;

          return {
            ...s,
            lineStyle: {
              ...(s.lineStyle || {}),
              color: theme === "dark" ?"rgba(255, 255, 255, 0.27)" : "rgba(147, 147, 147, 0.55)",
              opacity: 1,
              curveness: s.lineStyle?.curveness ?? 0.2,
            },
          };
        });
      }

      if (isSunBurst) {
        const isSunBurstVisualmap = Object.keys(enhancedOption?.visualMap || {})?.length > 0;

        let allSunburstNames = [];
        sunburstSeries.forEach((s) => {
          if (!s) return;
          if (Array.isArray(s.data)) {
            s.data.forEach(n => collectSunburstNames(n, allSunburstNames));
          } else {
            collectSunburstNames(s.data, allSunburstNames);
          }
        });
        
        const uniqueLegendData = Array.from(new Set(allSunburstNames)).slice(0, 200);

        enhancedOption.series = enhancedOption.series.map((s) => {
          if (s.type !== "sunburst") return s;

          const nodeCount = Array.isArray(s.data) ? s.data.reduce((a, n) => a + countSunburstNodes(n), 0) : countSunburstNodes(s.data);
          const hideSunburst = nodeCount > 15;

          return {
            ...s,
            radius: isSunBurstVisualmap ? ["3%","65%"] : ["5%", "90%"],
            levels: [
              {},
              {
                label: {
                  position: "outside",
                  rotate: "tangential",
                  distance: 10,
                  rotate: 0,
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

        if (uniqueLegendData.length > 0) {
          enhancedOption.legend = {
            ...(enhancedOption.legend || {}),
            data: uniqueLegendData,
            show: legendVisible,
            orient: previewTools.fullscreen ? 'vertical' : 'horizontal',
            textStyle: { ...(enhancedOption.legend?.textStyle || {}), color: isDarkColor },
            type: 'scroll',
            pageIconColor: isDarkColor,
            pageIconInactiveColor: 'var(--text-muted)',
            pageTextStyle: { color: isDarkColor },
            ...(previewTools.fullscreen ? {
              left: 0,
              top: 8,
              bottom: 8,
              width: 220,
            } : {
              left: 0,
              right: 0,
              top: 0,
              width: '100%',
            })
          };
        } else {
          enhancedOption.legend = {
            ...(enhancedOption.legend || {}),
            show: false
          };
        }
      }

      previewInst.current.setOption(enhancedOption, true);
      setTimeout(() => previewInst.current?.resize(), 50);
    } catch (err) {
      setChartOption({ _error: true, message: err.message });
    }
  }, [chartOption, previewTools.fullscreen, isSmallScreen, showLegend, theme, shouldShowLegend]);

  useEffect(() => {
    setTimeout(() => previewInst.current?.resize(), 150);
  }, [fullscreen, bottomOpen, previewTools.fullscreen, isSmallScreen]);

  useEffect(
    () => () => {
      if (previewRef.current) disposeChart(previewRef.current);
    },
    [],
  );

  async function saveChart() {
    if (!selDashboard) {
      toast.warning(
        "Select a dashboard first. Create one in the Dashboards section.",
      );
      return;
    }
    const dashId = parseInt(selDashboard, 10);
    const requestedName = (chartName || "").trim();
    // Only keep defaults for parameters the SQL still declares, so renaming or
    // removing a placeholder does not leave an orphan behind in config.
    const keptDefaults = {};
    for (const p of declaredParams) {
      if (paramDefaults[p.name] !== undefined && paramDefaults[p.name] !== "") {
        keptDefaults[p.name] = paramDefaults[p.name];
      }
    }
    const config = {
      ...mapping,
      xLabel,
      yLabel,
      showLegend: shouldShowLegend ? showLegend : false,
      ...(Object.keys(keptDefaults).length ? { paramDefaults: keptDefaults } : {}),
    };
    const resolvedEditId = editId || editChart?.id || null;
    try {
      const existing = await apiFetch(`/api/dashboards/${dashId}/charts`);

      let normalizedName = requestedName;
      if (!normalizedName) {
        const used = new Set(
          (existing || []).map((c) => String((c.name || "").trim().toLowerCase()))
        );
        if (!used.has("untitled")) {
          normalizedName = "Untitled";
        } else {
          let idx = 1;
          while (true) {
            const candidate = `Untitled ${String(idx).padStart(2, "00")}`;
            if (!used.has(candidate.toLowerCase())) {
              normalizedName = candidate;
              break;
            }
            idx++;
          }
        }
      }

      const duplicate = (existing || []).find((c) => {
        const sameName = String((c.name || "").trim().toLowerCase()) === String(normalizedName.toLowerCase());
        const sameDashboard = String(c.dashboardId || "") === String(dashId);
        const sameId = resolvedEditId ? Number(c.id) === Number(resolvedEditId) : false;
        return sameName && sameDashboard && !sameId;
      });
      if (duplicate) {
        toast.error("Chart name already exists in this dashboard.");
        return;
      }

      if (resolvedEditId) {
        await apiFetch(`/api/dashboards/charts/${resolvedEditId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: normalizedName,
            dashboardId: dashId,
            sqlQuery: sql,
            chartType,
            chartSubtype,
            config,
          }),
        });

        try {
          const all = await apiFetch('/api/dashboards/charts');
          const same = (all || []).filter(
            (c) =>
              String(c.dashboardId || '') === String(dashId) &&
              String((c.name || '').trim().toLowerCase()) === String(normalizedName.toLowerCase())
          );

          if (same.length > 1) {
            const keepId = Number(resolvedEditId);
            await Promise.all(
              same
                .filter((c) => Number(c.id) !== keepId)
                .map((c) =>
                  apiFetch(`/api/dashboards/charts/${c.id}`, {
                    method: "DELETE",
                    body: JSON.stringify({}),
                  }).catch(() => {})
                )
            );
          }
        } catch {}

        toast.success("Chart updated.");
        try { window.dispatchEvent(new Event('charts:changed')); } catch {}
      } else {
        const dash = dashboards.find((d) => d.id === dashId);
        const cols = dash?.columns || 2;
        const occupied = new Set(
          existing.map((c) => `${c.gridRow}-${c.gridCol}`),
        );
        let row = 0,
          col = 0;
        while (occupied.has(`${row}-${col}`)) {
          col++;
          if (col >= cols) {
            col = 0;
            row++;
          }
        }

        await apiFetch("/api/dashboards/charts", {
          method: "POST",
          body: JSON.stringify({
            name: normalizedName,
            dashboardId: dashId,
            gridRow: row,
            gridCol: col,
            sqlQuery: sql,
            chartType,
            chartSubtype,
            config,
          }),
        });
        toast.success("Chart saved to dashboard.");
        try { window.dispatchEvent(new Event('charts:changed')); } catch {}
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setChartType("bar");
      setChartSubtype("simple_bar");
      setChartName("");
      setMapping({});
      setParamDefaults({});
      setXLabel("");
      setYLabel("");
      setShowLegend(true);
      setChartOption(null);
      previewRef.current = null;
      previewInst.current = null;
      if (onEditDone) onEditDone();
    }
  }

  function isNumericColumn(columnName) {
    if (!data || data.length === 0) return true;
    return data.every(
      (row) =>
        !isNaN(row[columnName]) &&
        row[columnName] !== null &&
        row[columnName] !== "" &&
        typeof row[columnName] !== "boolean",
    );
  }

  function changeType(t) {
    disposeChart(previewRef?.current);
    setChartType(t);
    const f = CHART_TYPES.find((x) => x.type === t)?.subtypes[0];
    setChartSubtype(f?.subtype || "");
    setMapping({});
    setEditId(null);
  }

  function zoomIn() {
    if (previewInst.current) {
      previewInst.current.dispatchAction({
        type: "dataZoom",
        zoom: {
          xAxisIndex: 0,
          start: undefined,
          end: undefined,
          startValue: undefined,
          endValue: undefined,
        },
      });
      const option = previewInst.current.getOption();
      const dataZoom = option.dataZoom;
      if (dataZoom && dataZoom[0]) {
        let start = dataZoom[0].start !== undefined ? dataZoom[0].start : 0;
        let end = dataZoom[0].end !== undefined ? dataZoom[0].end : 100;
        const range = end - start;
        const newStart = Math.max(0, start + range * 0.1);
        const newEnd = Math.min(100, end - range * 0.1);
        previewInst.current.dispatchAction({
          type: "dataZoom",
          start: newStart,
          end: newEnd,
          dataZoomIndex: 0,
        });
      } else {
        previewInst.current.dispatchAction({
          type: "dataZoom",
          start: 0,
          end: 50,
          dataZoomIndex: 0,
        });
      }
    }
  }

  function zoomOut() {
    if (previewInst.current) {
      const option = previewInst.current.getOption();
      const dataZoom = option.dataZoom;
      if (dataZoom && dataZoom[0]) {
        let start = dataZoom[0].start !== undefined ? dataZoom[0].start : 0;
        let end = dataZoom[0].end !== undefined ? dataZoom[0].end : 100;
        const range = end - start;
        const newStart = Math.max(0, start - range * 0.1);
        const newEnd = Math.min(100, end + range * 0.1);
        previewInst.current.dispatchAction({
          type: "dataZoom",
          start: newStart,
          end: newEnd,
          dataZoomIndex: 0,
        });
      } else {
        previewInst.current.dispatchAction({
          type: "dataZoom",
          start: 50,
          end: 100,
          dataZoomIndex: 0,
        });
      }
    }
  }

  function resetZoom() {
    if (previewInst.current) {
      previewInst.current.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
        dataZoomIndex: 0,
      });
    }
  }

  const shellStyle = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg-page)",
        overflow: "auto",
        padding: 14,
      }
    : {};

  function SeperateNumericColumns(column) {
    let final = [];
    if (data?.length > 0) {
      final = Object.keys(data[0]).filter((c) => {
        const find = column?.find((c_) => c_ === c);

        if (typeof find !== "undefined" && typeof data[0][find] === "number") {
          return find;
        }
      });
    }

    return final;
  }

  const isSunBurstChartType = chartType === 'sunburst' || chartSubtype === 'sunburst';

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
  const sunburstControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };

  if (!canBuild) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
            <Icon className="ti ti-chart-dots-3"></Icon> Chart Builder
          </h2>
        </div>
        <div className="alert-banner info" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-lock"></Icon>
          <span>Chart building is only available for administrators.</span>
        </div>
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>Chart building is only available for administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={shellStyle}>
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-chart-dots-3"></Icon>{" "}
          {editId ? "Edit Chart" : "Chart Builder"}
        </h2>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setFullscreen(!fullscreen)}
          title={fullscreen ? "Exit full screen" : "Full screen"}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        >
          <Icon
            className={`ti ${fullscreen ? "ti-arrows-minimize" : "ti-arrows-maximize"}`}
            style={{ fontSize: 14 }}
          ></Icon>
        </button>
      </div>

      <div className="card" 
      style={{ marginBottom: 12, overflow: "hidden" }}>
        <div
          onClick={() => setTopOpen(!topOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            cursor: "pointer",
            background: "var(--bg-elevated)",
            fontWeight: 600,
            fontSize: "14px",
          }}
        >
          <Icon
            className={`ti ti-chevron-${topOpen ? "down" : "right"}`}
            style={{ fontSize: 16 }}
          ></Icon>{" "}
          <Icon className="ti ti-code" style={{ fontSize: 18 }}></Icon> SQL &
          Results
        </div>
        {topOpen && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 0,
              alignItems: "stretch",
              height: "50vh",
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: 12,
                borderRight: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                height: "100%",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    background: "var(--input-bg)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div style={{ height: "100%", minHeight: 320 }}>
                    <SqlEditor
                      value={sql}
                      onChange={setSql}
                      variant="compact"
                      onRun={runSql}
                      placeholder="SELECT ..."
                      height="100%"
                    />
                  </div>
                </div>

                <div style={{ overflow: "auto", maxHeight: "24vh", marginTop: 8 }}>
                  {paramError && (
                    <div className="alert-banner danger" style={{ marginTop: 8, fontSize: "13px" }}>
                      <Icon className="ti ti-alert-circle" /> {paramError}
                    </div>
                  )}

                  {!paramError && declaredParams.length > 0 && (
                    <div className="card" style={{ padding: 12, marginTop: 8 }}>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: 8 }}>
                        <Icon className="ti ti-filter" /> This chart declares{" "}
                        {declaredParams.length} dashboard filter
                        {declaredParams.length > 1 ? "s" : ""}.
                      </div>

                      {unwrapped.length > 0 && (
                        <div className="alert-banner warning" style={{ fontSize: "13px", marginBottom: 8 }}>
                          <Icon className="ti ti-alert-triangle" />
                          <div>
                            {unwrapped.map((p) => p.name).join(", ")}{" "}
                            {unwrapped.length > 1 ? "are" : "is"} outside an optional
                            block, so {unwrapped.length > 1 ? "they" : "it"} will be
                            required: a viewer will not be able to clear{" "}
                            {unwrapped.length > 1 ? "them" : "it"}, and the chart will
                            not render until a value is supplied. Give a default
                            below, or wrap the filter so it can be left out:
                            <div style={{ marginTop: 6 }}>
                              <code style={{ fontSize: "12px" }}>
                                {"WHERE 1 /*[ AND col = {"}
                                {unwrapped[0].name}:{unwrapped[0].type}
                                {"} ]*/"}
                              </code>
                            </div>
                          </div>
                        </div>
                      )}

                      {declaredParams.map((p) => (
                        <div
                          key={p.name}
                          style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}
                        >
                          <code style={{ fontSize: "12px", minWidth: 140 }}>
                            {p.name}:{p.type}
                          </code>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", minWidth: 70 }}>
                            {p.required ? "required" : "optional"}
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>default</span>
                          <ParamInput
                            param={p}
                            value={paramDefaults[p.name] ?? ""}
                            onChange={(v) => setParamDefaults((d) => ({ ...d, [p.name]: v }))}
                            invalid={p.required && !(paramDefaults[p.name] ?? "").toString().trim()}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 8,
                  flexShrink: 0,
                }}
              >
                <MaxRowsControl
                  value={maxRows}
                  onChange={setMaxRows}
                  disabled={running}
                />

                <button
                  className="btn btn-primary btn-sm"
                  onClick={runSql}
                  disabled={running || !sql.trim()}
                >
                  {running ? (
                    <>
                      <span className="loading-spinner"></span> Running...
                    </>
                  ) : (
                    <>
                      <Icon className="ti ti-player-play"></Icon> Run
                    </>
                  )}
                </button>
              </div>
            </div>
            <div
              style={{
                padding: 12,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: 6,
                }}
              >
                {data
                  ? `${data.length} rows, ${columns.length} cols`
                  : "Run a query"}
              </div>
              {error && (
                <div
                  className="alert-banner danger"
                  style={{ fontSize: "13px" }}
                >
                  <Icon className="ti ti-alert-circle"></Icon> {error}
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                {data && <DataTable rows={data} columns={columns} />}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="card"
        style={
          previewTools.fullscreen
            ? {
                position: "absolute",
                zIndex: 9999,
                background: "var(--bg-page)",
                padding: 16,
                top: "0px",
                left: "0px",
                width: "100%",
                height: "100vh",
              }
            : { marginBottom: 12, overflow: "hidden" }
        }
      >
        <div
          onClick={() => setBottomOpen(!bottomOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            cursor: "pointer",
            background: "var(--bg-elevated)",
            fontWeight: 600,
            fontSize: "14px",
          }}
        >
          <Icon
            className={`ti ti-chevron-${bottomOpen ? "down" : "right"}`}
            style={{ fontSize: 16 }}
          ></Icon>{" "}
          <Icon className="ti ti-settings" style={{ fontSize: 18 }}></Icon>{" "}
          Config & Preview
        </div>
        {bottomOpen && (
          <div
            style={{ display: "grid", gridTemplateColumns: isSmallScreen ? "1fr" : "1fr 1fr", gap: 0 }}
          >
            <div
              style={{
                padding: 12,
                borderRight: isSmallScreen ? "none" : "1px solid var(--border-default)",
                borderBottom: isSmallScreen ? "1px solid var(--border-default)" : "none",
                overflow: "auto",
                maxHeight: isSmallScreen ? "60vh" : "60vh",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div className="form-group">
                  <label className="form-label">Chart Type</label>
                  <Select
                    className="form-select"
                    value={chartType}
                    onChange={(e) => changeType(e.target.value)}
                  >
                    {CHART_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subtype</label>
                  <Select
                    className="form-select"
                    value={chartSubtype}
                    onChange={(e) => {
                      setChartSubtype(e.target.value);
                      setMapping({});
                    }}
                  >
                    {typeInfo?.subtypes.map((s) => (
                      <option key={s.subtype} value={s.subtype}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Chart Name</label>
                <input
                  className="form-input"
                  value={chartName}
                  onChange={(e) => setChartName(e.target.value)}
                />
              </div>
              {fields.length > 0 && columns.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ marginBottom: 6 }}>
                    Column Mapping
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    {fields.map(
                      (f) =>
                        f?.key !== "parent" && (
                          <div key={f.key} className="form-group">
                            <label
                              className="form-label"
                              style={{ fontSize: "12px" }}
                            >
                              {f.label}
                              {f.required ? " *" : ""} ({f.expect})
                            </label>
                            {f?.expect === "numeric" ? (
                              <Select
                                className="form-select"
                                value={mapping[f.key] || ""}
                                onChange={(e) =>
                                  setMapping((p) => ({
                                    ...p,
                                    [f.key]: e.target.value,
                                  }))
                                }
                                style={{
                                  fontSize: "13px",
                                  borderColor: validationErrors[f.key]
                                    ? "var(--color-danger)"
                                    : undefined,
                                }}
                              >
                                <option value="">--</option>
                                {SeperateNumericColumns(columns).map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <Select
                                className="form-select"
                                value={mapping[f.key] || ""}
                                onChange={(e) =>
                                  setMapping((p) => ({
                                    ...p,
                                    [f.key]: e.target.value,
                                  }))
                                }
                                style={{
                                  fontSize: "13px",
                                  borderColor: validationErrors[f.key]
                                    ? "var(--color-danger)"
                                    : undefined,
                                }}
                              >
                                <option value="">--</option>
                                {columns.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </Select>
                            )}

                            {validationErrors[f.key] && (
                              <span
                                style={{
                                  color: "var(--color-danger)",
                                  fontSize: "12px",
                                }}
                              >
                                {validationErrors[f.key]}
                              </span>
                            )}
                          </div>
                        ),
                    )}
                  </div>
                </div>
              )}
              {hasAxisLabels && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      X Label
                    </label>
                    <input
                      className="form-input"
                      value={xLabel}
                      onChange={(e) => setXLabel(e.target.value)}
                      style={{ fontSize: "13px" }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Y Label
                    </label>
                    <input
                      className="form-input"
                      value={yLabel}
                      onChange={(e) => setYLabel(e.target.value)}
                      style={{ fontSize: "13px" }}
                    />
                  </div>
                </div>
              )}
              {shouldShowLegend && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                    padding: "8px 0",
                  }}
                >
                  <button
                    onClick={() => setShowLegend(!showLegend)}
                    className={`btn btn-sm ${showLegend ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '12px',
                      padding: '4px 8px'
                    }}
                    title={showLegend ? 'Hide legend' : 'Show legend'}
                  >
                    <Icon className={`ti ${showLegend ? 'ti-eye' : 'ti-eye-off'}`} style={{ fontSize: '14px' }}></Icon>
                    <span>Legend</span>
                  </button>
                </div>
              )}
              {chartType === "gauge" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Min
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      value={mapping.min_val || 0}
                      onChange={(e) =>
                        setMapping((p) => ({ ...p, min_val: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Max
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      value={mapping.max_val || 100}
                      onChange={(e) =>
                        setMapping((p) => ({ ...p, max_val: e.target.value }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: 12, minHeight: isSmallScreen ? "60vh" : "50vh", overflow: "auto" }}>
              <ErrorBoundary
                resetKeys={[chartOption]}
                fallback={(err) => (
                  <div
                    className="alert-banner danger"
                    style={{ fontSize: "13px" }}
                  >
                    <Icon className="ti ti-alert-circle"></Icon> Chart preview
                    failed: {err?.message || String(err)}
                  </div>
                )}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    Preview
                  </div>
                </div>
                {chartOption?._error && (
                  <div
                    className="alert-banner danger"
                    style={{ fontSize: "13px" }}
                  >
                    <Icon className="ti ti-alert-circle"></Icon>{" "}
                    {chartOption.message}
                  </div>
                )}
                {chartOption?._kpi && (
                  chartOption?.isArray ? <div
                    className="alert-banner danger"
                    style={{ fontSize: "13px" }}
                  >
                    <Icon className="ti ti-alert-circle"></Icon>{" "}
                    {chartOption.message}
                  </div> :
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "90%",
                      padding: "24px",
                    }}
                  >
                    <div
                      style={{
                        minWidth: "280px",
                        padding: "28px 36px",
                        borderRadius: "18px",
                        background: "var(--surface)",
                        border: "1px solid var(--border-color)",
                        boxShadow: "var(--shadow-md)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "48px",
                          height: "4px",
                          borderRadius: "999px",
                          background: "var(--accent)",
                        }}
                      />
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          fontWeight: 600,
                        }}
                      >
                        {chartOption.label}
                      </div>

                      <div
                        style={{
                          fontSize: "3.5rem",
                          fontWeight: 800,
                          color: "var(--accent)",
                          lineHeight: 1,
                          fontFamily: "var(--font-table)",
                        }}
                      >
                        {chartOption.value}
                      </div>

                      <div
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Current Value
                      </div>
                    </div>
                  </div>
                )}
                {chartOption?._table && (
                  <div style={{ maxHeight: 300, overflow: "auto" }}>
                    <DataTable rows={chartOption.data} />
                  </div>
                )}
                {!chartOption?._kpi &&
                  !chartOption?._table &&
                  !chartOption?._error && (
                    <div
                      style={
                        previewTools.fullscreen
                          ? {
                              position: "fixed",
                              inset: 0,
                              zIndex: 9999,
                              background: "var(--bg-page)",
                              padding: 16,
                              display: "flex",
                              flexDirection: "column",
                            }
                          : undefined
                      }
                    >
                      {chartOption && (
                        <ChartToolbar
                          zoomable={!!chartOption?.xAxis && !isSunBurstChartType}
                          fullscreen={previewTools.fullscreen}
                          onZoomIn={previewTools.zoomIn}
                          onZoomOut={previewTools.zoomOut}
                          onZoomReset={previewTools.zoomReset}
                          onSave={previewTools.save}
                          onToggleFullscreen={previewTools.toggleFullscreen}
                          isWantFeature={
                            isSunBurstChartType
                              ? sunburstControlsFlags
                              : chartType === "pie"
                                ? pieChartControlsFlags
                                : chartType === "funnel" || chartSubtype === "funnel"
                                  ? funnelControlsFlags
                                  : chartType === "sankey"
                                    ? sankeyControlsFlags
                                    : chartControlsFlags
                          }
                        />
                      )}
                      <div
                        ref={previewRef}
                        style={{
                          height: previewTools.fullscreen
                            ? "calc(100vh - 96px)"
                            : isSmallScreen ? 350 : 430,
                          width: "100%",
                          overflow: "visible",
                          paddingBottom: 30,
                        }}
                      >
                        {!chartOption && (
                          <div className="empty-state" style={{ padding: 16 , height:"80%" }}>
                            <Icon className="ti ti-chart-dots"></Icon>
                            <p style={{ fontSize: "13px" }}>
                              Map columns to see preview.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )} 
              </ErrorBoundary>
            </div>
          </div>
        )}
      </div>

      {chartOption && !chartOption._error && (
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: "14px", marginBottom: 10 }}>
            <Icon className="ti ti-device-floppy"></Icon>{" "}
            {editId ? "Update Chart" : "Save to Dashboard"}
          </h3>
          {dashboards.length === 0 && (
            <div
              className="alert-banner info"
              style={{ marginBottom: 12, fontSize: "14px" }}
            >
              <Icon className="ti ti-info-circle"></Icon> Create a dashboard
              first in the Dashboards section.
            </div>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Dashboard *</label>
              <Select
                className="form-select"
                value={selDashboard}
                onChange={(e) => setSelDashboard(e.target.value)}
              >
                <option value="">--</option>
                {dashboards.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <button
              className="btn btn-primary"
              onClick={saveChart}
              disabled={!selDashboard || !sql.trim()}
            >
              <Icon className="ti ti-device-floppy"></Icon>{" "}
              {editId ? "Update" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
