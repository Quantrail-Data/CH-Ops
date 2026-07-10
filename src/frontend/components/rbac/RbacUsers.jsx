// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Manages system user accounts, assigns security roles, and tracks authentication states.

import React, { useEffect, useState } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "../../hooks/useQuery.js";
import { runQuery } from "../../utils/api.js";
import DataTable from "../layout/DataTable.jsx";
import { SqlPreview } from "../layout/SharedComponents.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import AlertBanner from "../layout/AlertBanner.jsx";
import { useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };
const ACCESS_TYPES = [
  "SELECT",
  "INSERT",
  "ALTER",
  "CREATE",
  "DROP",
  "TRUNCATE",
  "OPTIMIZE",
  "SHOW",
  "KILL QUERY",
  "ACCESS MANAGEMENT",
  "SYSTEM",
  "INTROSPECTION",
  "SOURCES",
  "dictGet",
  "ALL",
  "NONE",
];
const AUTH_METHODS = [
  { v: "sha256_password", l: "SHA-256" },
  { v: "double_sha1_password", l: "Double SHA-1" },
  { v: "plaintext_password", l: "Plaintext" },
  { v: "no_password", l: "No Password" },
];

function useDbList() {
  const q = useQuery();
  useEffect(() => {
    q.execute("SELECT name FROM system.databases ORDER BY name");
  }, []);
  return q;
}
function useTableList(db) {
  const q = useQuery();
  useEffect(() => {
    if (db && db !== "*")
      q.execute(
        `SELECT name FROM system.tables WHERE database='${db}' ORDER BY name`,
      );
  }, [db]);
  return q;
}

export default function RbacUsers() {
  const { tab: routeTab = "list" } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;

  const handleTabChange = (newTab) => {
    if (newTab === 'list' || isAdmin) {
      navigate(`/rbac/users/${newTab}`, { replace: true });
    }
  };

  const usersQ = useQuery(),
    rolesQ = useQuery(),
    clustersQ = useQuery();
  const [result, setResult] = useState(null);

  function load() {
    usersQ.execute("SELECT name FROM system.users ORDER BY name");
    rolesQ.execute("SELECT name FROM system.roles ORDER BY name");
    clustersQ.execute(
      "SELECT DISTINCT cluster FROM system.clusters WHERE cluster!='' ORDER BY cluster",
    );
  }
  useEffect(load, []);

  const users = (usersQ.data || []).map((r) => r.name);
  const roles = (rolesQ.data || []).map((r) => r.name);
  const clusters = (clustersQ.data || []).map((r) => r.cluster);
  const tabs = [
    { id: "list", l: "List", i: "ti-list" },
    { id: "create", l: "Create", i: "ti-plus" },
    { id: "alter", l: "Alter", i: "ti-edit" },
    { id: "grant", l: "Grant/Revoke", i: "ti-key" },
    { id: "drop", l: "Drop", i: "ti-trash" },
  ];

  if (usersQ.loading && !usersQ.data)
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
          <Icon className="ti ti-users"></Icon> Users
        </h2>
      </div>
      <AlertBanner result={result} setResult={setResult} />
      <div className="tab-bar">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab-item ${routeTab === t.id ? "active" : ""}`}
            onClick={() => handleTabChange(t.id)}
            style={t.id !== 'list' && !isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <Icon className={`ti ${t.i}`}></Icon> {t.l}
          </div>
        ))}
      </div>
      {routeTab === "list" && (
        <DataTable
          rows={usersQ.data || []}
          emptyMessage="No users."
          variant="single"
        />
      )}
      {routeTab === "create" && (
        <CreateUser
          clusters={clusters}
          roles={roles}
          setResult={setResult}
          onSuccess={load}
        />
      )}
      {routeTab === "alter" && (
        <AlterUser
          users={users}
          clusters={clusters}
          roles={roles}
          setResult={setResult}
          onSuccess={load}
        />
      )}
      {routeTab === "grant" && (
        <GrantRevoke
          users={users}
          roles={roles}
          clusters={clusters}
          setResult={setResult}
        />
      )}
      {routeTab === "drop" && (
        <DropUser
          users={users}
          clusters={clusters}
          setResult={setResult}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function CreateUser({ clusters, roles, setResult, onSuccess }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const dbsQ = useDbList();
  const [f, setF] = useState({
    name: "",
    password: "",
    authMethod: "sha256_password",
    onCluster: "",
    defaultDb: "",
    defaultRole: "",
    hostIp: "",
    validUntil: "",
  });
  const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [showPassword, setShowpassword] = useState(false);

  function buildSql() {
    if (!f.name.trim()) return "";
    const p = ["CREATE USER IF NOT EXISTS", f.name.trim()];
    if (f.onCluster) p.push(`ON CLUSTER '${f.onCluster}'`);
    if (f.authMethod === "no_password") p.push("NOT IDENTIFIED");
    else if (f.password) p.push(`IDENTIFIED WITH ${f.authMethod} BY '***'`);
    if (f.validUntil)
      p.push(`VALID UNTIL '${f.validUntil.replace("T", " ")}:00'`);
    if (f.hostIp.trim()) p.push(`HOST IP '${f.hostIp.trim()}'`);
    if (f.defaultDb) p.push(`DEFAULT DATABASE ${f.defaultDb}`);
    if (f.defaultRole) p.push(`DEFAULT ROLE ${f.defaultRole}`);
    return p.join(" ");
  }
  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql().replace("'***'", `'${f.password}'`));
      setResult({ ok: true, msg: "User created." });
      onSuccess();
      setF({
        name: "",
        password: "",
        authMethod: "sha256_password",
        onCluster: "",
        defaultDb: "",
        defaultRole: "",
        hostIp: "",
        validUntil: "",
      });
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }
  return (
    <form onSubmit={submit} className="card" style={{ padding: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="form-group">
          <label className="form-label">Username *</label>
          <input
            className="form-input"
            required
            value={f.name}
            onChange={(e) => u("name", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Auth Method</label>
          <Select
            className="form-select"
            value={f.authMethod}
            onChange={(e) => u("authMethod", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            {AUTH_METHODS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.l}
              </option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <div className="" style={{ width: "100%", position: "relative" }}>
            <input
              className="form-input"
              type={showPassword ? "text" : "password"}
              style={{ width: "100%", paddingRight: "35px" }}
              value={f.password}
              onChange={(e) => u("password", e.target.value)}
              disabled={f.authMethod === "no_password" || !isAdmin}
            />
            <div
              className="password-eye"
              style={{
                position: "absolute",
                right: "15px",
                top: "22%",
                cursor: "pointer",
              }}
              title={showPassword ? "hide" : "show"}
              onClick={() => setShowpassword(!showPassword)}
            >
              {showPassword ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="form-group">
          <label className="form-label">ON CLUSTER</label>
          <Select
            className="form-select"
            value={f.onCluster}
            onChange={(e) => u("onCluster", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {clusters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Default Database</label>
          <Select
            className="form-select"
            value={f.defaultDb}
            onChange={(e) => u("defaultDb", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">None</option>
            {dbsQ.data?.map((r) => (
              <option key={r.name}>{r.name}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Default Role</label>
          <Select
            className="form-select"
            value={f.defaultRole}
            onChange={(e) => u("defaultRole", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </div>
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
          <label className="form-label">Host IP</label>
          <input
            className="form-input"
            value={f.hostIp}
            onChange={(e) => u("hostIp", e.target.value)}
            placeholder="optional"
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Valid Until</label>
          <input
            className="form-input"
            type="datetime-local"
            value={f.validUntil}
            onChange={(e) => u("validUntil", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          />
        </div>
      </div>
      <SqlPreview sql={buildSql()} />
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={!isAdmin} style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
          <Icon className="ti ti-plus"></Icon> Create
        </button>
      </div>
    </form>
  );
}

function AlterUser({ users, clusters, roles, setResult, onSuccess }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const dbsQ = useDbList();
  const [sel, setSel] = useState("");
  const [f, setF] = useState({
    rename: "",
    authMethod: "sha256_password",
    password: "",
    resetAuth: false,
    onCluster: "",
    defaultDb: "",
    defaultDbAction: "",
    defaultRole: "",
    defaultRoleAction: "",
    hostIp: "",
    hostAction: "",
    validUntil: "",
    addSettings: "",
    dropSettings: "",
    addProfiles: "",
    dropProfiles: "",
  });
  const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [showPassword, setShowpassword] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);

  function buildSql() {
    if (!sel) return "";
    const p = ["ALTER USER", sel];
    if (f.onCluster) p.push(`ON CLUSTER '${f.onCluster}'`);
    if (f.rename.trim()) p.push(`RENAME TO ${f.rename.trim()}`);
    if (f.resetAuth) p.push("RESET AUTHENTICATION METHODS TO NEW");
    else if (f.password && f.authMethod !== "no_password")
      p.push(`IDENTIFIED WITH ${f.authMethod} BY '***'`);
    else if (f.authMethod === "no_password") p.push("NOT IDENTIFIED");
    if (f.validUntil)
      p.push(`VALID UNTIL '${f.validUntil.replace("T", " ")}:00'`);
    if (f.hostAction === "add" && f.hostIp.trim())
      p.push(`ADD HOST IP '${f.hostIp.trim()}'`);
    else if (f.hostAction === "drop" && f.hostIp.trim())
      p.push(`DROP HOST IP '${f.hostIp.trim()}'`);
    if (f.defaultDb) p.push(`DEFAULT DATABASE ${f.defaultDb}`);
    if (f.defaultRole)
      p.push(
        `DEFAULT ROLE ${f.defaultRoleAction === "all" ? "ALL" : f.defaultRole}`,
      );
    if (f.addSettings.trim()) p.push(`ADD SETTINGS ${f.addSettings.trim()}`);
    if (f.dropSettings.trim()) p.push(`DROP SETTINGS ${f.dropSettings.trim()}`);
    if (f.addProfiles.trim()) p.push(`ADD PROFILES '${f.addProfiles.trim()}'`);
    if (f.dropProfiles.trim())
      p.push(`DROP PROFILES '${f.dropProfiles.trim()}'`);
    return p.join(" ");
  }
  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql().replace("'***'", `'${f.password}'`));
      setResult({ ok: true, msg: "User altered." });
      onSuccess();
      setF({
        rename: "",
        authMethod: "sha256_password",
        password: "",
        resetAuth: false,
        onCluster: "",
        defaultDb: "",
        defaultDbAction: "",
        defaultRole: "",
        defaultRoleAction: "",
        hostIp: "",
        hostAction: "",
        validUntil: "",
        addSettings: "",
        dropSettings: "",
        addProfiles: "",
        dropProfiles: "",
      });
      setSel("");
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="form-group">
          <label className="form-label">User *</label>
          <Select
            className="form-select"
            required
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Rename To</label>
          <input
            className="form-input"
            value={f.rename}
            onChange={(e) => u("rename", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          />
        </div>
        <div className="form-group">
          <label className="form-label">ON CLUSTER</label>
          <Select
            className="form-select"
            value={f.onCluster}
            onChange={(e) => u("onCluster", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {clusters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="form-group">
          <label className="form-label">Auth Method</label>
          <Select
            className="form-select"
            value={f.authMethod}
            onChange={(e) => u("authMethod", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            {AUTH_METHODS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.l}
              </option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">New Password</label>

          <div className="" style={{ width: "100%", position: "relative" }}>
            <input
              className="form-input"
              style={{ width: "100%", paddingRight: "35px" }}
              type={showPassword ? "text" : "password"}
              value={f.password}
              onChange={(e) => u("password", e.target.value)}
              disabled={f.authMethod === "no_password" || !isAdmin}
            />
            <div
              className="password-eye"
              style={{
                position: "absolute",
                right: "15px",
                top: "22%",
                cursor: "pointer",
              }}
              title={showPassword ? "hide" : "show"}
              onClick={() => setShowpassword(!showPassword)}
            >
              {showPassword ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
            </div>
          </div>
        </div>
        <div
          className="form-group"
          style={{ display: "flex", alignItems: "center", paddingTop: 22 }}
        >
          <label
            style={{
              display: "flex",
              gap: 6,
              cursor: isAdmin ? "pointer" : "not-allowed",
              fontSize: "14px",
            }}
          >
            <input
              type="checkbox"
              checked={f.resetAuth}
              onChange={(e) => u("resetAuth", e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
              disabled={!isAdmin}
            />{" "}
            RESET AUTH
          </label>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="form-group">
          <label className="form-label">Default Database</label>
          <Select
            className="form-select"
            value={f.defaultDb}
            onChange={(e) => u("defaultDb", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {dbsQ.data?.map((r) => (
              <option key={r.name}>{r.name}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label
            className="form-label"
          >
            Default Role
            <Icon
              style={{ fontSize: "medium", cursor: "pointer" }}
              onMouseOver={() => setOpenInfo(true)}
              onClick={() => setOpenInfo(!openInfo)}
              className="ti ti-info-circle"
            ></Icon>
          </label>
          <Select
            className="form-select"
            value={f.defaultRole}
            onChange={(e) => u("defaultRole", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <div style={{ height: "22px" }}>
            {openInfo && (
              <div
                className="alert-banner info"
                style={{ marginTop: "0px", fontSize: "12px",padding:"6px" }}
              >
                <Icon
                  style={{ fontSize: "15px",paddingTop:"2px" }}
                  className="ti ti-info-circle"
                ></Icon>
                <span>
                  To set a default role to the user, The role must be granted to
                  the user
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Host Action</label>
          <Select
            className="form-select"
            value={f.hostAction}
            onChange={(e) => u("hostAction", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            <option value="add">ADD HOST</option>
            <option value="drop">DROP HOST</option>
          </Select>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        {f.hostAction && (
          <div className="form-group">
            <label className="form-label">Host IP</label>
            <input
              className="form-input"
              value={f.hostIp}
              onChange={(e) => u("hostIp", e.target.value)}
              disabled={!isAdmin}
              style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
            />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Valid Until</label>
          <input
            className="form-input"
            type="datetime-local"
            value={f.validUntil}
            onChange={(e) => u("validUntil", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          />
        </div>
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
          <label className="form-label">ADD SETTINGS</label>
          <input
            className="form-input"
            value={f.addSettings}
            onChange={(e) => u("addSettings", e.target.value)}
            placeholder="var = value, ..."
            style={{ fontFamily: "var(--font-code)" }}
            disabled={!isAdmin}
          />
        </div>
        <div className="form-group">
          <label className="form-label">DROP SETTINGS</label>
          <input
            className="form-input"
            value={f.dropSettings}
            onChange={(e) => u("dropSettings", e.target.value)}
            placeholder="var, ..."
            style={{ fontFamily: "var(--font-code)" }}
            disabled={!isAdmin}
          />
        </div>
        <div className="form-group">
          <label className="form-label">ADD PROFILES</label>
          <input
            className="form-input"
            value={f.addProfiles}
            onChange={(e) => u("addProfiles", e.target.value)}
            placeholder="profile_name"
            disabled={!isAdmin}
          />
        </div>
        <div className="form-group">
          <label className="form-label">DROP PROFILES</label>
          <input
            className="form-input"
            value={f.dropProfiles}
            onChange={(e) => u("dropProfiles", e.target.value)}
            placeholder="profile_name"
            disabled={!isAdmin}
          />
        </div>
      </div>
      <SqlPreview sql={buildSql()} />
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={!sel || !isAdmin} style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
          <Icon className="ti ti-edit"></Icon> Alter
        </button>
      </div>
    </form>
  );
}

function GrantRevoke({ users, roles, clusters, setResult }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const dbsQ = useDbList();
  const [f, setF] = useState({
    user: "",
    action: "grant",
    accessType: "SELECT",
    database: "*",
    table: "*",
    onCluster: "",
  });
  const tblsQ = useTableList(f.database);
  const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
  function buildSql() {
    if (!f.user) return "";
    const verb = f.action === "grant" ? "GRANT" : "REVOKE";
    const dir = f.action === "grant" ? "TO" : "FROM";
    return `${verb} ${f.accessType} ON ${f.database}.${f.table} ${dir} ${f.user}${f.onCluster ? ` ON CLUSTER '${f.onCluster}'` : ""}`;
  }

  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql());
      setResult({ ok: true, msg: "Executed." });
      setF({
        user: "",
        action: "grant",
        accessType: "SELECT",
        database: "*",
        table: "*",
        onCluster: "",
      });
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="form-group">
          <label className="form-label">User *</label>
          <Select
            className="form-select"
            value={f.user}
            onChange={(e) => u("user", e.target.value)}
            required
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Action</label>
          <Select
            className="form-select"
            value={f.action}
            onChange={(e) => u("action", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="grant">Grant</option>
            <option value="revoke">Revoke</option>
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Privilege</label>
          <Select
            className="form-select"
            value={f.accessType}
            onChange={(e) => u("accessType", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            {ACCESS_TYPES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Database</label>
          <Select
            className="form-select"
            value={f.database}
            onChange={(e) => {
              u("database", e.target.value);
              u("table", "*");
            }}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="*">* (all)</option>
            {dbsQ.data?.map((r) => (
              <option key={r.name}>{r.name}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Table</label>
          <Select
            className="form-select"
            value={f.table}
            onChange={(e) => u("table", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="*">* (all)</option>
            {tblsQ.data?.map((r) => (
              <option key={r.name}>{r.name}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">ON CLUSTER</label>
          <Select
            className="form-select"
            value={f.onCluster}
            onChange={(e) => u("onCluster", e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {clusters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>
      <SqlPreview sql={buildSql()} />
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={!f.user || !isAdmin} style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
          <Icon className="ti ti-key"></Icon> Execute
        </button>
      </div>
    </form>
  );
}

function DropUser({ users, clusters, setResult, onSuccess }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [sel, setSel] = useState("");
  const [onCluster, setOnCluster] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [sql, setSql] = useState("");

  useEffect(() => {
    setSql(
      sel
        ? `DROP USER IF EXISTS ${sel}${onCluster ? ` ON CLUSTER '${onCluster}'` : ""}`
        : "",
    );
  }, [sel, onCluster]);
  async function drop() {
    try {
      await runQuery(sql);
      setResult({ ok: true, msg: "User dropped." });
      onSuccess();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setConfirm(false);
      setConfirmName("");
      setSel("");
      setSql("");
      setTimeout(() => {
        setResult(null);
      }, 5000);
    }
  }

  return (
    <div
      className="card"
      style={{ padding: 20, height: confirm ? "700px" : "auto" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="form-group">
          <label className="form-label">User</label>
          <Select
            className="form-select"
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">ON CLUSTER</label>
          <Select
            className="form-select"
            value={onCluster}
            onChange={(e) => setOnCluster(e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {clusters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>
      <SqlPreview sql={sql} />
      <div style={{ marginTop: 16 }}>
        <button
          className="btn btn-danger"
          disabled={!sel || !isAdmin}
          onClick={() => setConfirm(true)}
          style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
        >
          <Icon className="ti ti-trash"></Icon> Drop
        </button>
      </div>
      {confirm && (
        <ConfirmModal
          title="Drop User"
          message={
            <div>
              <p>
                Type the username <strong>{sel}</strong> to confirm:
              </p>
              <input
                className="form-input"
                style={{ marginTop: 8 }}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={sel}
                autoFocus
              />
            </div>
          }
          confirmText="Drop User"
          onConfirm={drop}
          onCancel={() => {
            setConfirm(false);
            setConfirmName("");
          }}
          danger
          confirmDisabled={confirmName !== sel}
        />
      )}
    </div>
  );
}
