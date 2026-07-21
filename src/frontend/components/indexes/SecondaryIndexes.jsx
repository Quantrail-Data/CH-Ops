// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Configures data-skipping indexes (e.g., MinMax, Bloom filters) to bypass irrelevant blocks during queries.

import React, { useEffect, useRef, useState, useCallback } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { initChart, disposeChart } from "../../utils/echarts.js";
import { treeSize, treeSeries } from "../../utils/treeChart.js";

export default function SecondaryIndexes() {
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [themeKey, setThemeKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const dbsQ = useQuery(),
    tblsQ = useQuery(),
    idxQ = useQuery();
  const chartRef = useRef(null),
    chartInst = useRef(null);

  useEffect(() => {
    dbsQ.execute(
      "SELECT DISTINCT database FROM system.data_skipping_indices ORDER BY database",
    );
  }, []);
  useEffect(() => {
    if (db)
      tblsQ.execute(
        `SELECT DISTINCT table FROM system.data_skipping_indices WHERE database='${db}' ORDER BY table`,
      );
  }, [db]);
  useEffect(() => {
    if (db) {
      const w = tbl ? ` AND table='${tbl}'` : "";
      idxQ.execute(
        `SELECT database, table, name, type_full, granularity, expr FROM system.data_skipping_indices WHERE database='${db}'${w} ORDER BY table, name`,
      );
    }
  }, [db, tbl]);

  const buildTree = useCallback(() => {
    if (!idxQ.data?.length) return null;
    const tableMap = {};
    idxQ.data.forEach((r) => {
      if (!tableMap[r.table]) tableMap[r.table] = [];
      tableMap[r.table].push({
        name: `${r.name} (${r.type_full}, g=${r.granularity})`,
        itemStyle: { color: "#34d399" },
        children: [{ name: r.expr, children: [] }],
      });
    });
    return {
      name: db,
      itemStyle: { color: "#8b5cf6" },
      children: Object.entries(tableMap).map(([t, idxs]) => ({
        name: t,
        itemStyle: { color: "#f59e0b" },
        children: idxs,
      })),
    };
  }, [idxQ.data, db]);

  const renderChart = useCallback(() => {
    const tree = buildTree();
    if (!tree || !chartRef.current) return;
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const size = treeSize(tree);
    if (chartInst.current) {
      disposeChart(chartRef.current);
      chartInst.current = null;
    }
    chartRef.current.style.width = Math.round(size.width * zoom) + "px";
    chartRef.current.style.height = Math.round(size.height * zoom) + "px";
    chartInst.current = initChart(chartRef.current);
    const series = treeSeries(tree, isDark);
    series.symbolSize = Math.round(12 * zoom);
    chartInst.current.setOption(
      {
        tooltip: { trigger: "item", triggerOn: "mousemove" },
        series: [series],
      },
      true,
    );
    chartInst.current.resize();
  }, [buildTree, themeKey, zoom]);

  useEffect(() => {
    renderChart();
  }, [renderChart]);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  useEffect(
    () => () => {
      if (chartRef.current) disposeChart(chartRef.current);
    },
    [],
  );

  function doZoom(f) {
    setZoom((z) => Math.max(0.3, Math.min(3, +(z * f).toFixed(2))));
  }
  function downloadChart() {
    if (!chartInst.current) return;
    const url = chartInst.current.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "transparent",
    });
    const a = document.createElement("a");
    a.href = url;
    a.download = "indexes-tree.png";
    a.click();
  }

  if (dbsQ.loading && !dbsQ.data)
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner"></div> Loading...
        </div>
      </div>
    );

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-list-tree"></Icon> Data Skipping Indexes
        </h2>
      </div>
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 20,
          display: "flex",
          gap: 14,
          alignItems: "flex-end",
        }}
      >
        <div className="form-group">
          <label className="form-label">Database</label>
          <Select
            className="form-select"
            value={db}
            onChange={(e) => {
              setDb(e.target.value);
              setTbl("");
            }}
          >
            <option value="">-- select --</option>
            {dbsQ.data?.map((r) => (
              <option key={r.database}>{r.database}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Table</label>
          <Select
            className="form-select"
            value={tbl}
            onChange={(e) => setTbl(e.target.value)}
          >
            <option value="">All</option>
            {tblsQ.data?.map((r) => (
              <option key={r.table}>{r.table}</option>
            ))}
          </Select>
        </div>
      </div>
      {idxQ.data?.length > 0 ? (
        <div
          className="card"
          style={
            fullscreen
              ? {
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  background: "var(--bg-page)",
                  borderRadius: 0,
                  display: "flex",
                  flexDirection: "column",
                }
              : {
          padding: 16,
          marginBottom: 20,
          height:"35rem",
          overflow:"auto"
        }
          }
     
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              flexShrink: 0,
              width:"100%"
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginRight: 4,
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => doZoom(1.25)}
              title="Zoom in"
            >
              <Icon className="ti ti-zoom-in"></Icon>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => doZoom(0.8)}
              title="Zoom out"
            >
              <Icon className="ti ti-zoom-out"></Icon>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setZoom(1)}
              title="Reset zoom"
            >
              <Icon className="ti ti-zoom-reset"></Icon>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={downloadChart}
              title="Download PNG"
              aria-label="Download PNG"
            >
              <Icon className="ti ti-download"></Icon>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFullscreen(!fullscreen)}
            >
              <Icon
                className={`ti ${fullscreen ? "ti-arrows-minimize" : "ti-arrows-maximize"}`}
              ></Icon>
            </button>
          </div>
          <div
            style={
              fullscreen
                ? {
                    overflow: "auto",
                    flex: 1,
                    display: "flex",
                    justifyContent: "center",
                  }
                : {
                    overflowX: "auto",
                    display: "flex",
                    justifyContent: "center",
                  }
            }
          >
            <div ref={chartRef} />
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <Icon className="ti ti-list-tree"></Icon>
          <p>
            {db ? "No indexes found." : "Select a database to view indexes."}
          </p>
        </div>
      )}
    </div>
  );
}
