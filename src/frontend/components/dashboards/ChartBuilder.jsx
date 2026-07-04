// Copyright (C) 2026 Quantrail™ Data Private Limited
// @Kathir -> Kathir Moorthy
// Dynamic utility module for configuring, instantiating, and rendering custom charts.

import React, { useState, useRef, useEffect } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { runQuery, apiFetch } from "../../utils/api.js";
import { isReadOnlySql } from "../../../shared/sqlClassify.js";
import {
  CHART_TYPES,
  buildChartOption,
  validateColumnType,
  getAxisDefaults,
  needsLegend,
} from "./chartTypes.js";
import { initChart, disposeChart, withZoomable } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";
import DataTable from "../layout/DataTable.jsx";
import ErrorBoundary from "../layout/ErrorBoundary.jsx";
import { useToast } from "../layout/Toast.jsx";

export default function ChartBuilder({ editChart, onEditDone }) {
  const toast = useToast();
  const [sql, setSql] = useState("");
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
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

  // Load edit chart
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

  useEffect(() => {
    if (!editChart) {
      const d = getAxisDefaults(chartType, chartSubtype);
      setXLabel(d.xLabel);
      setYLabel(d.yLabel);
      setShowLegend(needsLegend(chartType, chartSubtype));
    }
  }, [chartType, chartSubtype]);

  async function runSql() {
    if (!sql.trim()) return;
    if (!isReadOnlySql(sql)) {
      setError(
        "Chart Builder only runs read-only queries (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, EXISTS).",
      );
      return;
    }
    setRunning(true);
    setError(null);
    setData(null);
    try {
      const r = await runQuery(sql.trim(), { readOnly: true });
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
          showLegend,
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

      const baseOption = withZoomable({
        ...chartOption,
        toolbox: { show: false },
      });
      const enhancedOption = {
        ...baseOption,
        grid: Array.isArray(baseOption.grid)
          ? baseOption.grid.map((g) => ({
              ...g,
              containLabel: true,
              bottom: Math.max(parseInt(g?.bottom, 10) || 18, 70),
            }))
          : {
              ...baseOption.grid,
              containLabel: true,
              bottom: Math.max(
                parseInt(baseOption?.grid?.bottom, 10) || 18,
                70,
              ),
            },
        xAxis: Array.isArray(baseOption.xAxis)
          ? baseOption.xAxis.map((axis) => ({
              ...axis,
              nameLocation: "middle",
              nameGap: Math.max(axis?.nameGap || 25, 42),
              axisLabel: {
                ...axis?.axisLabel,
                margin: Math.max(axis?.axisLabel?.margin || 8, 14),
                hideOverlap: false,
              },
            }))
          : baseOption.xAxis
            ? {
                ...baseOption.xAxis,
                nameLocation: "middle",
                nameGap: Math.max(baseOption?.xAxis?.nameGap || 25, 42),
                axisLabel: {
                  ...baseOption?.xAxis?.axisLabel,
                  margin: Math.max(
                    baseOption?.xAxis?.axisLabel?.margin || 8,
                    14,
                  ),
                  hideOverlap: false,
                },
              }
            : baseOption.xAxis,
      };

      previewInst.current.setOption(enhancedOption, true);
      setTimeout(() => previewInst.current?.resize(), 50);
    } catch (err) {
      setChartOption({ _error: true, message: err.message });
    }
  }, [chartOption]);

  useEffect(() => {
    setTimeout(() => previewInst.current?.resize(), 150);
  }, [fullscreen, bottomOpen, previewTools.fullscreen]);

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
    const config = { ...mapping, xLabel, yLabel, showLegend };
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
      } else {
        // Auto-fill: find next available position
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
        await apiFetch("/api/dashboards/charts", {
          method: "POST",
          body: JSON.stringify({
            name: chartName || "Untitled",
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
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setChartType("bar");
      setChartSubtype("simple_bar");
      setChartName("");
      setMapping({});
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
        >
          <Icon
            className={`ti ${fullscreen ? "ti-minimize" : "ti-maximize"}`}
          ></Icon>{" "}
          {fullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>

      {/* TOP: SQL + Results */}
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
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}
          >
            <div
              style={{
                padding: 12,
                borderRight: "1px solid var(--border-default)",
              }}
            >
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                placeholder="SELECT ..."
                spellCheck={false}
                style={{
                  width: "100%",
                  minHeight: "26vh",
                  maxHeight: "40vh",
                  resize: "vertical",
                  overflow: "auto",
                  fontFamily: "var(--font-code)",
                  fontSize: "14px",
                  padding: 10,
                  background: "var(--input-bg)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 8,
                }}
              >
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
            <div style={{ padding: 12, maxHeight: "40vh", overflow: "auto" }}>
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
              {data && <DataTable rows={data.slice(0, 10)} columns={columns} />}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM: Config + Preview */}
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
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}
          >
            <div
              style={{
                padding: 12,
                borderRight: "1px solid var(--border-default)",
                overflow: "auto",
                maxHeight: "60vh",
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

                    {/* {fields.map((f) => (
                      <div key={f.key} className="form-group">
                        <label
                          className="form-label"
                          style={{ fontSize: "12px" }}
                        >
                          {f.label}
                          {f.required ? " *" : ""} ({f.expect})
                        </label>
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
                          

                          <option value=" ">--</option>
                          {columns
                            .filter((c) => {
                              if (f.expect === "numeric") {
                                return isNumericColumn(c);
                              }
                              return true;
                            })
                            .map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                        </Select>
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
                    ))} */}
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
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  cursor: "pointer",
                  fontSize: "14px",
                  marginBottom: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={(e) => setShowLegend(e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />{" "}
                Show Legend
              </label>
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
            <div style={{ padding: 12, minHeight: "50vh", overflow: "auto" }}>
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
                  {/* {chartOption &&
                  !chartOption._error &&
                  !chartOption._kpi &&
                  !chartOption._table && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={zoomIn}
                        title="Zoom In"
                      >
                        <Icon className="ti ti-zoom-in"></Icon>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={zoomOut}
                        title="Zoom Out"
                      >
                        <Icon className="ti ti-zoom-out"></Icon>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={resetZoom}
                        title="Reset View"
                      >
                        <Icon className="ti ti-refresh"></Icon>
                      </button>
                    </div>
                  )} */}
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
                            : 430,
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

      {/* Save */}
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
