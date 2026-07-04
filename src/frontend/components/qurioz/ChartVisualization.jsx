// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Dynamically renders configured data visualizations, charts, and metrics from query results.

import React, { useState, useEffect, useRef } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import {
  CHART_TYPES,
  buildChartOption,
  validateColumnType,
  getAxisDefaults,
  needsLegend,
} from "../dashboards/chartTypes";
import { initChart, withZoomable } from "../../utils/echarts.js";
import ChartToolbar, { useChartTools } from "../common/ChartToolbar.jsx";
import DataTable from "../layout/DataTable";
import { useQuriozChatContext } from "../../App.jsx";

function ChartVisualization({ editChart, data = [], chatMessage }) {
  const [columns, setColumns] = useState(
    data?.length > 0 ? Object.keys(data[0]) : [],
  );
  const [chartType, setChartType] = useState("bar");
  const [chartSubtype, setChartSubtype] = useState("simple_bar");
  const [mapping, setMapping] = useState({});
  const [chartName, setChartName] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");
  const [showLegend, setShowLegend] = useState(true);
  const [chartOption, setChartOption] = useState(
    chatMessage?.chart?.chartOption || null,
  );
  const [validationErrors, setValidationErrors] = useState({});
  const [topOpen, setTopOpen] = useState(true);
  const previewRef = useRef(null);
  const previewInst = useRef(null);
  const tools = useChartTools(() => previewInst.current, { filename: "chart" });

  const { replaceChat } = useQuriozChatContext();

  useEffect(() => {
    if (editChart) {
      const cfg =
        typeof editChart.config === "string"
          ? JSON.parse(editChart.config)
          : editChart.config || {};
      setChartType(editChart.chartType || "bar");
      setChartSubtype(editChart.chartSubtype || "simple_bar");
      setChartName(editChart.name || "");
      setMapping(cfg);
      setXLabel(cfg.xLabel || "");
      setYLabel(cfg.yLabel || "");
      setShowLegend(cfg.showLegend !== false);
    }
  }, [editChart]);

  const typeInfo = CHART_TYPES.find((t) => t.type === chartType);
  const subtypeInfo = typeInfo?.subtypes.find(
    (s) => s.subtype === chartSubtype,
  );
  const fields = subtypeInfo?.fields || [];
  const hasAxisLabels = typeInfo?.hasXLabel || false;

  useEffect(() => {
    if (!editChart) {
      const d = getAxisDefaults(chartType, chartSubtype);
      setXLabel(d.xLabel);
      setYLabel(d.yLabel);
      setShowLegend(needsLegend(chartType, chartSubtype));
    }
  }, [chartType, chartSubtype]);

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
    if (!data?.length || !fields.length) {
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

    setChartOption(
      buildChartOption(chartType, chartSubtype, data, mapping, chartName, {
        xLabel,
        yLabel,
        showLegend,
      }),
    );
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
        previewInst.current = null;
      }
      return;
    }
    try {
      if (!previewInst.current)
        previewInst.current = initChart(previewRef.current);
      previewInst.current.setOption(withZoomable({...chartOption, toolbox: { show: false }, grid: {
      ...chartOption?.grid,
      top: 'center',
      left: 'center',
      width:"80%",
      height:"80%"
    },}), true);
      const updatedMessage = {
        ...chatMessage,
        chart: {
          ...chatMessage?.chart,

          chartOption: {
            ...chartOption,
            
          },
        },
      };
      replaceChat(updatedMessage);
      setTimeout(() => previewInst.current?.resize(), 50);
    } catch (err) {
      setChartOption({ _error: true, message: err.message });
    }
  }, [chartOption]);

  useEffect(() => {
    setTimeout(() => previewInst.current?.resize(), 150);
  }, [tools.fullscreen]);

  function changeType(t) {
    setChartType(t);
    const f = CHART_TYPES.find((x) => x.type === t)?.subtypes[0];
    setChartSubtype(f?.subtype || "");
    setMapping({});
  }

  return (
   <div className="card" style={tools.fullscreen ? { position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-page)", padding: 16, display: "flex", flexDirection: "column" } : { marginBottom: 16, overflow: "hidden" }} >
      {
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div
            style={{
              padding: 16,
              borderRight: "1px solid var(--border-default)",
              overflow: "auto",
              maxHeight: 500,
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
          <div style={{ padding: 16, minHeight: 340 }}>
            <div
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: 8,
              }}
            >
              Preview
            </div>
            {chartOption?._error && (
              <div
                className="alert-banner danger"
                style={{ fontSize: "13px" }}
              >
                <Icon className="ti ti-alert-circle"></Icon> {chartOption.message}
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
            {chartType === "table" && (
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                <DataTable rows={data} />
              </div>
            )}
            {!(chartType === "kpi") &&
              !(chartType === "table") &&
              !chartOption?._error && (
                <div style={tools.fullscreen ? { position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-page)", padding: 16, display: "flex", flexDirection: "column" } : undefined}>
                  {chartOption && (
                    <ChartToolbar
                      zoomable={!!chartOption?.xAxis}
                      fullscreen={tools.fullscreen}
                      onZoomIn={tools.zoomIn}
                      onZoomOut={tools.zoomOut}
                      onZoomReset={tools.zoomReset}
                      onSave={tools.save}
                      onToggleFullscreen={tools.toggleFullscreen}
                    />
                  )}
                  <div ref={previewRef} style={{ height: tools.fullscreen ? "calc(100vh - 96px)" : 408, width: "100%" }}>
                    {!chartOption && (
                      <div className="empty-state" style={{ padding: 24 }}>
                        <Icon className="ti ti-chart-dots"></Icon>
                        <p style={{ fontSize: "13px" }}>
                          Map columns to see preview.
                        </p>
                      </div>
                    )}
                </div>
                </div>
              )}
          </div>
        </div>
      }
    </div>
  );
}

export default ChartVisualization;
