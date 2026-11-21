// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Component for mapping, projecting, and transforming raw database records into custom UI views.

import { useEffect, useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "../../hooks/useQuery.js";
import { runQuery } from "../../utils/api.js";
import TreeGraph from "../common/TreeGraph.jsx";
import { buildProjectionTree } from "../../utils/schemaTrees.js";
import { SqlPreview } from "../layout/SharedComponents.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import AlertBanner from "../layout/AlertBanner.jsx";
import { useAuth } from "../../App.jsx";
import Select from "../common/Select.jsx";
import SqlEditor from "../editor/SqlEditor.jsx";
import ToggleSwitch from "../common/ToggleSwitch.jsx";
import { Button, Input, FormField } from "../ui/index.jsx";

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, [db]);
  return q;
}

function useClusters() {
  const q = useQuery();
  useEffect(() => {
    q.execute(
      "SELECT DISTINCT cluster FROM system.clusters WHERE cluster!='' ORDER BY cluster",
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
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
      <FormField label="Database *">
        <Select
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
        </Select>
      </FormField>
      <FormField label="Table * (MergeTree only)">
        <Select
          className="form-select"
          value={tbl}
          onChange={(e) => setTbl(e.target.value)}
          required
        >
          <option value="">-- select --</option>
          {tblsQ.data?.map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </Select>
      </FormField>
      {showCluster && (
        <FormField label="ON CLUSTER">
          <Select
            className="form-select"
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
          >
            <option value="">-- none --</option>
            {clustersQ.data?.map((r) => (
              <option key={r.cluster}>{r.cluster}</option>
            ))}
          </Select>
        </FormField>
      )}
    </div>
  );
}

function ViewProjections() {
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const dbsQ = useQuery(),
    tblsQ = useQuery(),
    projQ = useQuery();
  useEffect(() => {
    dbsQ.execute(
      "SELECT DISTINCT database FROM system.projections ORDER BY database",
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, []);
  useEffect(() => {
    if (db)
      tblsQ.execute(
        `SELECT DISTINCT table FROM system.projections WHERE database='${db}' ORDER BY table`,
      );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, [db]);
  useEffect(() => {
    if (db) {
      const w = tbl ? ` AND table='${tbl}'` : "";
      projQ.execute(
        `SELECT database, table, name, type, sorting_key, query FROM system.projections WHERE database='${db}'${w} ORDER BY table, name`,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, [db, tbl]);

  const tree = useMemo(() => buildProjectionTree(db, projQ.data), [db, projQ.data]);

  return (
    <div>
      <div className="card search-form-row" style={{ padding: 16, marginBottom: 20 }}>
        <FormField label="Database" className="search-field">
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
        </FormField>
        <FormField label="Table" className="search-field">
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
        </FormField>
      </div>
      {tree ? (
        <TreeGraph tree={tree} fileName="projections-tree.png" emptyMessage="No projections found." />
      ) : (
        <div className="empty-state" style={{height:"50vh" }}>
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
          <FormField label="Projection Name *">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="proj_name"
            />
          </FormField>
        <ToggleSwitch checked={ifNotExists}
              onChange={(e) => setIfNotExists(e.target.checked)} label="IF NOT EXISTS"/>
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
          <div
            style={{
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              background: "var(--input-bg)",
              overflow: "hidden",
            }}
          >
            <SqlEditor
              value={selectExpr}
              onChange={setSelectExpr}
              variant="expression"
              placeholder="col1, col2, sum(col3) - DISTINCT not supported in projections"
              height="54px"
            />
          </div>
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
          <FormField label="GROUP BY (optional)">
            <Input
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              placeholder="col1, col2"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </FormField>
          <FormField label="ORDER BY (optional)">
            <Input
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value)}
              placeholder="col1, col2"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </FormField>
        </div>

        <FormField label="WITH SETTINGS (optional)" style={{ marginBottom: 14 }}>
          <Input
            value={settings}
            onChange={(e) => setSettings(e.target.value)}
            placeholder="setting_name1 = value1, setting_name2 = value2"
            style={{ fontFamily: "var(--font-code)" }}
          />
        </FormField>

        <SqlPreview sql={buildSql()} />
        <div style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            type="submit"
            disabled={!buildSql() || !isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-plus"></Icon> Add Projection
          </Button>
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
          <FormField label="Projection *">
            <Select
              className="form-select"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
            >
              <option value="">-- select --</option>
              {projsQ.data?.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </Select>
          </FormField>
        <ToggleSwitch  checked={ifExists}
              onChange={(e) => setIfExists(e.target.checked)} label="IF EXISTS"/>
        </div>
        <SqlPreview sql={sql} />
        <div style={{ marginTop: 16 }}>
          <Button
            variant="danger"
            disabled={!sql || !isAdmin}
            onClick={() => setConfirm(true)}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-trash"></Icon> Drop Projection
          </Button>
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
          <FormField label="Projection *">
            <Select
              className="form-select"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              required
            >
              <option value="">-- select --</option>
              {projsQ.data?.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="IN PARTITION (optional)">
            <Input
              value={partition}
              onChange={(e) => setPartition(e.target.value)}
              placeholder="partition_name"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </FormField>
        <ToggleSwitch checked={ifExists}
              onChange={(e) => setIfExists(e.target.checked)} label="IF EXISTS"/>
        </div>
        <SqlPreview sql={sql} />
        <div style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            type="submit"
            disabled={!sql || !isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-hammer"></Icon> Materialize
          </Button>
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
          <FormField label="Projection *">
            <Select
              className="form-select"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
            >
              <option value="">-- select --</option>
              {projsQ.data?.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="IN PARTITION (optional)">
            <Input
              value={partition}
              onChange={(e) => setPartition(e.target.value)}
              placeholder="partition_name"
              style={{ fontFamily: "var(--font-code)" }}
            />
          </FormField>
        <ToggleSwitch checked={ifExists}
              onChange={(e) => setIfExists(e.target.checked)} label="IF EXISTS"/>
        </div>
        <SqlPreview sql={sql} />
        <div style={{ marginTop: 16 }}>
          <Button
            variant="danger"
            disabled={!sql || !isAdmin}
            onClick={() => setConfirm(true)}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-eraser"></Icon> Clear Projection
          </Button>
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
