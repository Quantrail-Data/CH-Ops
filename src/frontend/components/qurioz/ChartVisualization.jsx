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
import {  useAuth } from "../../App.jsx";
import { apiFetch } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import ToggleSwitch from "../common/ToggleSwitch.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

function ChartVisualization({ editChart, data = [], chatMessage,replaceChat,updateChart,ToggleChart }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const canAddToDashboard = myLevel >= ROLE_LEVEL.editor;

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
  const [dashboards,setDashboards] = useState([])
  const [selDashboard, setSelDashboard] = useState("");
  const previewRef = useRef(null);
  const previewInst = useRef(null);
  const tools = useChartTools(() => previewInst.current, { filename: "chart" });
  const [chartId,setChartId] = useState(null)

  // const { replaceChat } = useQuriozChatContext();
  
// console.log(chartOption,previewInst,previewRef)
  function ChatVisiablePreview() {
    return (Object.keys(chartOption ?? {}).length > 0 && previewInst && previewRef) ||  chartType === 'table'
  }

  const toast = useToast();

      useEffect(() => {
      apiFetch("/api/dashboards")
        .then(setDashboards)
        .catch(() => {});
    }, []);

    useEffect(() => {
  
  const fetchChartData = async () => {
  
    if (chatMessage?.dashId && chatMessage?.chartName) {
      try {
        const response = await apiFetch(`/api/dashboards/${chatMessage?.dashId}/charts/${chatMessage?.chartName}`);
        const chartData = response?.["0"];
        if (!chartData) {
          return;
        }

        let parsedConfig = {};
        if (chartData.config) {
          try {
            parsedConfig = typeof chartData.config === "string" 
              ? JSON.parse(chartData.config) 
              : chartData.config;
          } catch (e) {
            console.error( e.message);
          }
        }

        const { xLabel, yLabel, legend = showLegend, category, value } = parsedConfig;

        const mapping = { category, value };
        setChartName(chartData.name);
        setXLabel(xLabel);
        setYLabel(yLabel);
        setShowLegend(legend);
        setChartSubtype(chartData.chartSubtype);
        setChartType(chartData.chartType)
        setMapping(mapping)
        setSelDashboard(Number(chatMessage?.dashId || chartData?.dashboardId))
        setChartId(chartData?.id)

      } catch (error) {
        console.error("Failed to fetch chart data:", error);
      }
    }
  };

  fetchChartData();

}, [chatMessage?.dashId, chatMessage?.chartName]); 

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
  const element = previewRef.current;

  if (!element) return;

  if (
    !chartOption ||
    chartOption._kpi ||
    chartOption._table ||
    chartOption._error
  ) {
    previewInst.current?.clear();
    return;
  }

  try {
    if (
      !previewInst.current ||
      previewInst.current.isDisposed?.() ||
      previewInst.current.getDom() !== element
    ) {
      previewInst.current?.dispose();
      previewInst.current = initChart(element);
    }

    previewInst.current.setOption(
      withZoomable({
        ...chartOption,
        toolbox: { show: false },
        grid: {
          ...chartOption?.grid,
          top: "center",
          left: "center",
          width: "80%",
          height: "80%",
        },
      }),
      true
    );
    requestAnimationFrame(() => {
      previewInst.current?.resize();
    });

    const updatedMessage = {
      ...chatMessage,
      chart: {
        ...chatMessage?.chart,
        chartOption: { ...chartOption },
      },
    };

    replaceChat(updatedMessage);

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
    previewRef.current = null
    previewInst.current = null
  }

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
        if (chartId) {
          await apiFetch(`/api/dashboards/charts/${chartId}`, {
            method: "PUT",
            body: JSON.stringify({
              name: chartName || "Untitled",
              dashboardId: dashId,
              sqlQuery: chatMessage.sql,
              chartType,
              chartSubtype,
              config,
            }),
          });
          ToggleChart(chatMessage)
          toast.success("Chart updated.");
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
          await apiFetch("/api/dashboards/charts", {
            method: "POST",
            body: JSON.stringify({
              name: chartName || "Untitled",
              dashboardId: dashId,
              gridRow: row,
              gridCol: col,
              sqlQuery: chatMessage.sql,
              chartType,
              chartSubtype,
              config,
            }),
          });

          const updatedMessage = {
            ...chatMessage,
              chartName,dashId
          };
          updateChart(chartName,dashId,chatMessage?.chatId,chatMessage?.messageId)
          // replaceChat(updatedMessage);
          ToggleChart(updatedMessage)
          toast.success("Chart saved to dashboard.");
        }
      } catch (e) {
        toast.error(e.message);
      } 
    }

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
           <div style={{ display:"flex",alignItems:"center"}}>
             <ToggleSwitch checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} label="Show Legend"/>
           </div>
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
          {ChatVisiablePreview() && <div style={{ padding: 16, minHeight: 340 }}>
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
                    {!chartOption && !previewRef &&(
                      <div className="empty-state" style={{ padding: 24 }}>
                        <Icon className="ti ti-chart-dots"></Icon>
                        <p style={{ fontSize: "13px" }}>
                          Map columns to see preview.
                        </p>
                      </div>
                    )}
                </div>
                  {chartOption && canAddToDashboard && (
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
                        disabled={!chartOption || !selDashboard}
                      >
                        <Icon className="ti ti-device-floppy"></Icon>{" "}
                       Save
                      </button>
                    </div>
                    )}
                </div>
              )}
          </div>}
        </div>
      }
    </div>
  );
}

export default ChartVisualization;
