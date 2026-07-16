// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Component for mapping, projecting, and transforming raw database records into custom UI views.

import React, { useEffect, useRef, useState, useCallback } from "react";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "../../hooks/useQuery.js";
import { runQuery } from "../../utils/api.js";
import { initChart, disposeChart } from "../../utils/echarts.js";
import { treeSize, treeSeries } from "../../utils/treeChart.js";
import { SqlPreview } from "../layout/SharedComponents.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import AlertBanner from "../layout/AlertBanner.jsx";
import { useTheme, useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

export default function Projections() {
  const { tab: routeTab = "view" } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;

  const handleTabChange = (newTab) => {
    if (newTab === "view" || isAdmin) {
      navigate(`/indexes/projections/${newTab}`, { replace: true });
    }
  };

  const tabs = [
    { id: "view", label: "View Projections", icon: "ti-transform" },
    { id: "add", label: "Add Projection", icon: "ti-plus" },
    { id: "drop", label: "Drop Projection", icon: "ti-trash" },
    { id: "materialize", label: "Materialize", icon: "ti-hammer" },
    { id: "clear", label: "Clear", icon: "ti-eraser" },
  ];

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-transform"></Icon> Projections
        </h2>
      </div>
      <div className="tab-bar">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab-item ${routeTab === t.id ? "active" : ""}`}
            onClick={() => handleTabChange(t.id)}
            style={
              t.id !== "view" && !isAdmin
                ? { opacity: 0.35, cursor: "not-allowed" }
                : {}
            }
          >
            <Icon className={`ti ${t.icon}`}></Icon> {t.label}
          </div>
        ))}
      </div>
      {routeTab === "view" && <ViewProjections />}
      {routeTab === "add" && <AddProjection />}
      {routeTab === "drop" && <DropProjection />}
      {routeTab === "materialize" && <MaterializeProjection />}
      {routeTab === "clear" && <ClearProjection />}
    </div>
  );
}

function useMergeTreeDbs() {
  const q = useQuery();
  useEffect(() => {
    q.execute(
      "SELECT DISTINCT database FROM system.tables WHERE engine LIKE '%MergeTree%' ORDER BY database",
    );
  }, []);
  return q;
}

function useMergeTreeTables(db) {
  const q = useQuery();
  useEffect(() => {
    if (db)
      q.execute(
        `SELECT name FROM system.tables WHERE database='${db}' AND engine LIKE '%MergeTree%' ORDER BY name`,
      );
  }, [db]);
  return q;
}

function useClusters() {
  const q = useQuery();
  useEffect(() => {
    q.execute(
      "SELECT DISTINCT cluster FROM system.clusters WHERE cluster!='' ORDER BY cluster",
    );
  }, []);
  return q;
}

function useExistingProjections(db, tbl) {
  const q = useQuery();
  useEffect(() => {
    if (db && tbl)
      q.execute(
        `SELECT name FROM system.projections WHERE database='${db}' AND table='${tbl}' ORDER BY name`,
      );
  }, [db, tbl]);
  return q;
}

function useColumns(db, tbl) {
  const q = useQuery();
  useEffect(() => {
    if (db && tbl)
      q.execute(
        `SELECT name, type FROM system.columns WHERE database='${db}' AND table='${tbl}' ORDER BY position`,
      );
  }, [db, tbl]);
  return q;
}

function DbTableSelector({
  db,
  setDb,
  tbl,
  setTbl,
  cluster,
  setCluster,
  showCluster = false,
}) {
  const dbsQ = useMergeTreeDbs();
  const tblsQ = useMergeTreeTables(db);
  const clustersQ = useClusters();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showCluster ? "repeat(3, 1fr)" : "1fr 1fr",
        gap: 14,
        marginBottom: 14,
      }}
    >
      <div className="form-group">
        <label className="form-label">Database *</label>
        <select
          className="form-select"
          value={db}
          onChange={(e) => {
            setDb(e.target.value);
            setTbl("");
          }}
          required
        >
          <option value="">-- select --</option>
          {dbsQ.data?.map((r) => (
            <option key={r.database}>{r.database}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Table * (MergeTree only)</label>
        <select
          className="form-select"
          value={tbl}
          onChange={(e) => setTbl(e.target.value)}
          required
        >
          <option value="">-- select --</option>
          {tblsQ.data?.map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </select>
      </div>
      {showCluster && (
        <div className="form-group">
          <label className="form-label">ON CLUSTER</label>
          <select
            className="form-select"
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
          >
            <option value="">-- none --</option>
            {clustersQ.data?.map((r) => (
              <option key={r.cluster}>{r.cluster}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function ViewProjections() {
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [themeKey, setThemeKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const dbsQ = useQuery(),
    tblsQ = useQuery(),
    projQ = useQuery();
  const chartRef = useRef(null),
    chartInst = useRef(null);
  const { theme } = useTheme();
  useEffect(() => {
    dbsQ.execute(
      "SELECT DISTINCT database FROM system.projections ORDER BY database",
    );
  }, []);
  useEffect(() => {
    if (db)
      tblsQ.execute(
        `SELECT DISTINCT table FROM system.projections WHERE database='${db}' ORDER BY table`,
      );
  }, [db]);
  useEffect(() => {
    if (db) {
      const w = tbl ? ` AND table='${tbl}'` : "";
      projQ.execute(
        `SELECT database, table, name, type, sorting_key, query FROM system.projections WHERE database='${db}'${w} ORDER BY table, name`,
      );
    }
  }, [db, tbl]);

  const buildTree = useCallback(() => {
    if (!projQ.data?.length) return null;
    const tableMap = {};
    projQ.data.forEach((r) => {
      if (!tableMap[r.table]) tableMap[r.table] = [];
      tableMap[r.table].push({
        name: `${r.name} (${r.type})`,
        itemStyle: { color: "#34d399" },
        children: [
          { name: `key: ${r.sorting_key || "none"}`, children: [] },
          ...(r.query
            ? [{ name: `query: ${r.query.substring(0, 80)}`, children: [] }]
            : []),
        ],
      });
    });
    return {
      name: db,
      itemStyle: { color: "#8b5cf6" },
      children: Object.entries(tableMap).map(([t, ps]) => ({
        name: t,
        itemStyle: { color: "#f59e0b" },
        children: ps,
      })),
    };
  }, [projQ.data, db]);

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
    if (!chartInst.current || !chartRef.current) return;
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    try {
      const tree = buildTree();
      if (tree) {
        const updatedSeries = treeSeries(tree, isDark);
        updatedSeries.symbolSize = Math.round(12 * zoom);
        chartInst.current.setOption({ series: [updatedSeries] }, true);
        chartInst.current.resize();
      }
    } catch (e) {}
    const bg = isDark ? "#000000" : "#ffffff";
    const url = chartInst.current.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: bg,
    });
    const a = document.createElement("a");
    a.href = url;
    a.download = "projections-tree.png";
    a.click();
  }
  return (
    <div>
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
          <select
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
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Table</label>
          <select
            className="form-select"
            value={tbl}
            onChange={(e) => setTbl(e.target.value)}
          >
            <option value="">All</option>
            {tblsQ.data?.map((r) => (
              <option key={r.table}>{r.table}</option>
            ))}
          </select>
        </div>
      </div>
      {projQ.data?.length > 0 ? (
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
              : {padding: 16,
          marginBottom: 20,
          height:"35rem",
          overflow:"auto"}
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
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
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
          <Icon className="ti ti-transform"></Icon>
          <p>{db ? "No projections found." : "Select a database."}</p>
        </div>
      )}
    </div>
  );
}

function AddProjection() {
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const [cluster, setCluster] = useState("");
  const [name, setName] = useState("");
  const [ifNotExists, setIfNotExists] = useState(true);
  const [selectExpr, setSelectExpr] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [orderBy, setOrderBy] = useState("");
  const [settings, setSettings] = useState("");
  const [result, setResult] = useState(null);

  const colsQ = useColumns(db, tbl);

  function buildSql() {
    if (!db || !tbl || !name.trim() || !selectExpr.trim()) return "";
    const parts = ["ALTER TABLE", `${db}.${tbl}`];
    if (cluster) parts.push(`ON CLUSTER '${cluster}'`);
    parts.push("ADD PROJECTION");
    if (ifNotExists) parts.push("IF NOT EXISTS");
    parts.push(name.trim());

    let expr = selectExpr.trim();
    if (expr.toUpperCase().startsWith("DISTINCT "))
      expr = expr.substring(9).trim();
    let inner = `SELECT ${expr}`;
    if (groupBy.trim()) inner += ` GROUP BY ${groupBy.trim()}`;
    if (orderBy.trim()) inner += ` ORDER BY ${orderBy.trim()}`;
    parts.push(`( ${inner} )`);

    if (settings.trim()) parts.push(`WITH SETTINGS ( ${settings.trim()} )`);
    return parts.join(" ");
  }

  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql());
      setResult({
        ok: true,
        msg: `Projection '${name}' added to ${db}.${tbl}.`,
      });
      setDb("");
      setTbl("");
      setCluster("");
      setName("");
      setIfNotExists(true);
      setSelectExpr("");
      setGroupBy("");
      setOrderBy("");
      setSettings("");
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }

  return (
    <div>
      <AlertBanner result={result} setResult={setResult} />
      <form onSubmit={submit} className="card" style={{ padding: 20 }}>
        <DbTableSelector
          db={db}
          setDb={setDb}
          tbl={tbl}
          setTbl={setTbl}
          cluster={cluster}
          setCluster={setCluster}
          showCluster
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div className="form-group">
            <label className="form-label">Projection Name *</label>
            <input
              className="form-input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="proj_name"
            />
          </div>
          <div
            className="form-group"
            style={{ display: "flex", alignItems: "center", paddingTop: 22 }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              <input
                type="checkbox"
                checked={ifNotExists}
                onChange={(e) => setIfNotExists(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />{" "}
              IF NOT EXISTS
            </label>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">
            SELECT Expression *{" "}
            <span
              style={{
                fontWeight: 400,
                color: "var(--text-muted)",
                fontSize: "0.75rem",
              }}
            >
              (column list)
            </span>
          </label>
          <textarea
            className="form-textarea"
            rows={2}
            required
            value={selectExpr}
            onChange={(e) => setSelectExpr(e.target.value)}
            placeholder="col1, col2, sum(col3) - DISTINCT not supported in projections"
            style={{ fontFamily: "var(--font-code)" }}
          />
          {colsQ.data?.length > 0 && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Available: {colsQ.data.map((c) => c.name).join(", ")}
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div className="form-group">
            <label className="form-label">GROUP BY (optional)</label>
            <input
              className="form-input"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              placeholder="col1, col2"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">ORDER BY (optional)</label>
            <input
              className="form-input"
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value)}
              placeholder="col1, col2"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">WITH SETTINGS (optional)</label>
          <input
            className="form-input"
            value={settings}
            onChange={(e) => setSettings(e.target.value)}
            placeholder="setting_name1 = value1, setting_name2 = value2"
            style={{ fontFamily: "var(--font-code)" }}
          />
        </div>

        <SqlPreview sql={buildSql()} />
        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!buildSql() || !isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-plus"></Icon> Add Projection
          </button>
        </div>
      </form>
    </div>
  );
}

function DropProjection() {
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const [cluster, setCluster] = useState("");
  const [projName, setProjName] = useState("");
  const [ifExists, setIfExists] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState(null);

  const projsQ = useExistingProjections(db, tbl);

  const sql =
    db && tbl && projName
      ? `ALTER TABLE ${db}.${tbl}${cluster ? ` ON CLUSTER '${cluster}'` : ""} DROP PROJECTION ${ifExists ? "IF EXISTS " : ""}${projName}`
      : "";

  async function drop() {
    try {
      await runQuery(sql);
      setResult({ ok: true, msg: `Projection '${projName}' dropped.` });
      setProjName("");
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setConfirm(false);
      setDb("");
      setTbl("");
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }

  return (
    <div>
      <AlertBanner result={result} setResult={setResult} />
      <div className="card" style={{ padding: 20 }}>
        <DbTableSelector
          db={db}
          setDb={setDb}
          tbl={tbl}
          setTbl={setTbl}
          cluster={cluster}
          setCluster={setCluster}
          showCluster
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div className="form-group">
            <label className="form-label">Projection *</label>
            <select
              className="form-select"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
            >
              <option value="">-- select --</option>
              {projsQ.data?.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <div
            className="form-group"
            style={{ display: "flex", alignItems: "center", paddingTop: 22 }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              <input
                type="checkbox"
                checked={ifExists}
                onChange={(e) => setIfExists(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />{" "}
              IF EXISTS
            </label>
          </div>
        </div>
        <SqlPreview sql={sql} />
        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-danger"
            disabled={!sql || !isAdmin}
            onClick={() => setConfirm(true)}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-trash"></Icon> Drop Projection
          </button>
        </div>
      </div>
      {confirm && (
        <ConfirmModal
          title="Drop Projection"
          message={`Drop projection '${projName}' from ${db}.${tbl}?`}
          onConfirm={drop}
          onCancel={() => setConfirm(false)}
          danger
        />
      )}
    </div>
  );
}

function MaterializeProjection() {
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const [cluster, setCluster] = useState("");
  const [projName, setProjName] = useState("");
  const [ifExists, setIfExists] = useState(true);
  const [partition, setPartition] = useState("");
  const [result, setResult] = useState(null);

  const projsQ = useExistingProjections(db, tbl);

  const sql =
    db && tbl && projName
      ? `ALTER TABLE ${db}.${tbl}${cluster ? ` ON CLUSTER '${cluster}'` : ""} MATERIALIZE PROJECTION ${ifExists ? "IF EXISTS " : ""}${projName}${partition.trim() ? ` IN PARTITION ${partition.trim()}` : ""}`
      : "";

  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(sql);
      setResult({ ok: true, msg: `Projection '${projName}' materialized.` });
      setDb("");
      setTbl("");
      setCluster("");
      setProjName("");
      setIfExists(true);
      setPartition("");
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }

  return (
    <div>
      <AlertBanner result={result} setResult={setResult} />
      <form onSubmit={submit} className="card" style={{ padding: 20 }}>
        <DbTableSelector
          db={db}
          setDb={setDb}
          tbl={tbl}
          setTbl={setTbl}
          cluster={cluster}
          setCluster={setCluster}
          showCluster
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div className="form-group">
            <label className="form-label">Projection *</label>
            <select
              className="form-select"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              required
            >
              <option value="">-- select --</option>
              {projsQ.data?.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">IN PARTITION (optional)</label>
            <input
              className="form-input"
              value={partition}
              onChange={(e) => setPartition(e.target.value)}
              placeholder="partition_name"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </div>
          <div
            className="form-group"
            style={{ display: "flex", alignItems: "center", paddingTop: 22 }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              <input
                type="checkbox"
                checked={ifExists}
                onChange={(e) => setIfExists(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />{" "}
              IF EXISTS
            </label>
          </div>
        </div>
        <SqlPreview sql={sql} />
        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!sql || !isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-hammer"></Icon> Materialize
          </button>
        </div>
      </form>
    </div>
  );
}

function ClearProjection() {
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const [cluster, setCluster] = useState("");
  const [projName, setProjName] = useState("");
  const [ifExists, setIfExists] = useState(true);
  const [partition, setPartition] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState(null);

  const projsQ = useExistingProjections(db, tbl);

  const sql =
    db && tbl && projName
      ? `ALTER TABLE ${db}.${tbl}${cluster ? ` ON CLUSTER '${cluster}'` : ""} CLEAR PROJECTION ${ifExists ? "IF EXISTS " : ""}${projName}${partition.trim() ? ` IN PARTITION ${partition.trim()}` : ""}`
      : "";

  async function execute() {
    try {
      await runQuery(sql);
      setResult({ ok: true, msg: `Projection '${projName}' cleared.` });
      setDb("");
      setTbl("");
      setCluster("");
      setProjName("");
      setIfExists(true);
      setConfirm(false);
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setConfirm(false);
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }

  return (
    <div>
      <AlertBanner result={result} setResult={setResult} />
      <div className="card" style={{ padding: 20 }}>
        <DbTableSelector
          db={db}
          setDb={setDb}
          tbl={tbl}
          setTbl={setTbl}
          cluster={cluster}
          setCluster={setCluster}
          showCluster
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div className="form-group">
            <label className="form-label">Projection *</label>
            <select
              className="form-select"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
            >
              <option value="">-- select --</option>
              {projsQ.data?.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">IN PARTITION (optional)</label>
            <input
              className="form-input"
              value={partition}
              onChange={(e) => setPartition(e.target.value)}
              placeholder="partition_name"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </div>
          <div
            className="form-group"
            style={{ display: "flex", alignItems: "center", paddingTop: 22 }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              <input
                type="checkbox"
                checked={ifExists}
                onChange={(e) => setIfExists(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />{" "}
              IF EXISTS
            </label>
          </div>
        </div>
        <SqlPreview sql={sql} />
        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-danger"
            disabled={!sql || !isAdmin}
            onClick={() => setConfirm(true)}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-eraser"></Icon> Clear Projection
          </button>
        </div>
      </div>
      {confirm && (
        <ConfirmModal
          title="Clear Projection"
          message={`Clear projection data for '${projName}' in ${db}.${tbl}? This removes materialized data but keeps the projection definition.`}
          onConfirm={execute}
          onCancel={() => setConfirm(false)}
          danger
        />
      )}
    </div>
  );
}
