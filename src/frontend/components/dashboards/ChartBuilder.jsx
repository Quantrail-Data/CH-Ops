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
  const hasAxisLabels = typeInfo?.hasXLabel || chartType === "boxplot" || false;
  
  const legendSupportedTypes = [
    'grouped_bar', 'stacked_bar', 
    'multi_line', 'stacked_line',
    'pie', 'donut', 'rose', 'nested_pie',
    'bubble',
    'multi_category',
    'funnel',
    'radar'
  ];
  
  const shouldShowLegend = legendSupportedTypes.includes(chartSubtype) && needsLegend(chartType, chartSubtype);

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
      setChartOption(
        buildChartOption(chartType, chartSubtype, data, mapping, chartName, {
          xLabel,
          yLabel,
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

      const barChartTypes = ['simple_bar', 'grouped_bar', 'stacked_bar'];
      const isBarChart = barChartTypes.includes(chartSubtype);

      const resolvedLegend = previewTools.fullscreen
        ? {
            ...chartOption.legend,
            show: hasLegendCheck && legendVisible,
            type: 'scroll',
            orient: 'vertical',
            left: 0,
            top: 8,
            bottom: 8,
            width: 220,
            textStyle: { ...(chartOption.legend?.textStyle || {}), color: isDarkColor }
          }
        : isSmallScreen
          ? {
              ...chartOption.legend,
              show: hasLegendCheck && legendVisible,
              type: 'scroll',
              orient: 'horizontal',
              left: 0,
              right: 0,
              top: 0,
              width: '100%',
              pageIconColor: isDarkColor,
              pageIconInactiveColor: 'var(--text-muted)',
              pageTextStyle: { color: isDarkColor },
              textStyle: { ...(chartOption.legend?.textStyle || {}), color: isDarkColor }
            }
          : {
              ...chartOption.legend,
              show: hasLegendCheck && legendVisible,
              type: 'scroll',
              left: 0,
              right: 0,
              top: 0,
              orient: "horizontal",
              pageIconColor: isDarkColor,
              pageIconInactiveColor: 'var(--text-muted)',
              pageTextStyle: { color: isDarkColor },
              textStyle: { ...(chartOption.legend?.textStyle || {}), color: isDarkColor }
            };

      const gridTop = previewTools.fullscreen
        ? 24
        : isSmallScreen
          ? (hasLegendCheck && legendVisible ? 72 : 16)
          : hasLegendCheck && legendVisible
            ? 56
            : 16;

      const baseOption = withZoomable({
        ...chartOption,
        toolbox: { show: false },
        legend: resolvedLegend,
      });

      const yHasName = Array.isArray(baseOption.yAxis)
        ? baseOption.yAxis.some((a) => !!a?.name)
        : !!baseOption.yAxis?.name;

      const extraLeftForYAxisName = yHasName ? 60 : 20;

      // Sized to the widest tick label the axis will draw. A fixed gap put the
      // rotated axis name on top of the numbers as soon as they grew wide
      // (a count axis reaching 120,000,000 needs roughly twice the old 42px).
      const yNameGap = yAxisNameGap(baseOption);

      const gridLeft = previewTools.fullscreen
        ? (hasLegendCheck && legendVisible ? 240 : extraLeftForYAxisName)
        : (hasLegendCheck && legendVisible ? 20 : extraLeftForYAxisName);

      const determineTickCount = (opt) => {
        if (!opt) return 0;
        if (Array.isArray(opt.xAxis)) {
          const ax = opt.xAxis[0];
          if (ax?.data?.length) return ax.data.length;
        } else if (opt.xAxis?.data?.length) return opt.xAxis.data.length;
        if (Array.isArray(opt.series) && opt.series[0]?.data?.length) return opt.series[0].data.length;
        return 0;
      };

      const computeInterval = (tickCount, maxLabels) => {
        if (!tickCount || tickCount <= maxLabels) return 0;
        const interval = Math.ceil(tickCount / Math.max(1, maxLabels)) - 1;
        return Math.max(0, interval);
      };

      const maxLabels = previewTools.fullscreen ? 8 : isSmallScreen ? 3 : 4;
      const tickCount = determineTickCount(baseOption);
      const axisInterval = computeInterval(tickCount, maxLabels);

      const enhancedOption = {
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
                interval: axisInterval,
                formatter: (v) => {
                  try {
                    const s = String(v);
                    return s.length > 20 ? s.slice(0, 17) + "…" : s;
                  } catch { return v; }
                },
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
                  interval: axisInterval,
                  formatter: (v) => {
                    try {
                      const s = String(v);
                      return s.length > 20 ? s.slice(0, 17) + "…" : s;
                    } catch { return v; }
                  },
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
              nameGap: Math.max(axis?.nameGap || 25, yNameGap),
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
                nameGap: Math.max(baseOption?.yAxis?.nameGap || 25, yNameGap),
                nameTextStyle: {
                  color: isDarkColor,
                  fontSize: 10,
                  fontWeight: 'bold'
                }
              }
            : baseOption.yAxis,
      };

      const pieSubtypes = ['pie', 'donut', 'rose', 'nested_pie'];
      if (Array.isArray(baseOption.series) && (baseOption.series.some(s => s.type === 'pie') || pieSubtypes.includes(chartSubtype))) {
        enhancedOption.series = baseOption.series.map((s) => {
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
    try {
      if (editId) {
        await apiFetch(`/api/dashboards/charts/${editId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: chartName || "Untitled",
            dashboardId: dashId,
            sqlQuery: sql,
            chartType,
            chartSubtype,
            config,
          }),
        });
        toast.success("Chart updated.");
        try { window.dispatchEvent(new Event('charts:changed')); } catch {}
      } else {
        const existing = await apiFetch(`/api/dashboards/${dashId}/charts`);
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

        const existingNamesLower = (existing.map(c => (c.name || '').trim()) || []).map(n => n.toLowerCase());
        let nameToSave = (chartName || '').trim();
        if (!nameToSave) {
          const base = 'Untitled';
          if (!existingNamesLower.includes(base.toLowerCase())) {
            nameToSave = base;
          } else {
            let idx = 1;
            while (true) {
              const candidate = `${base} ${String(idx).padStart(2, '0')}`;
              if (!existingNamesLower.includes(candidate.toLowerCase())) {
                nameToSave = candidate;
                break;
              }
              idx++;
              if (idx > 999) {
                nameToSave = `${base} ${Date.now()}`;
                break;
              }
            }
          }
        }

        await apiFetch("/api/dashboards/charts", {
          method: "POST",
          body: JSON.stringify({
            name: nameToSave || (chartName || "Untitled"),
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 40,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 8,
                      }}
                    >
                      {chartOption.label}
                    </div>
                    <div
                      style={{
                        fontSize: "2.5rem",
                        fontWeight: 800,
                        color: "var(--accent)",
                        fontFamily: "var(--font-table)",
                      }}
                    >
                      {chartOption.value}
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
                          zoomable={!!chartOption?.xAxis}
                          fullscreen={previewTools.fullscreen}
                          onZoomIn={previewTools.zoomIn}
                          onZoomOut={previewTools.zoomOut}
                          onZoomReset={previewTools.zoomReset}
                          onSave={previewTools.save}
                          onToggleFullscreen={previewTools.toggleFullscreen}
                          isWantFeature={chartType === "pie" ? pieChartControlsFlags : chartControlsFlags }
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
                          <div className="empty-state" style={{ padding: 16 }}>
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
