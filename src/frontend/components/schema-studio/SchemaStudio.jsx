// SchemaStudio.jsx - The Schema Studio wizard shell
//
// Owns all wizard state and renders one step at a time. Schema Studio runs
// under the user's own ClickHouse credentials: on entry it checks the
// server-side session (GET /connect) so a reloaded page restores the connected
// state, and otherwise shows a connect panel prefilled from the app's current
// connection. The password is sent once on connect and then held only by the
// server (encrypted); the browser keeps just the app token.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { getGlobalConnection } from "../../utils/api.js";
import { connect, connectionStatus, disconnect } from "../../utils/studioApi.js";
import StepSource from "./StepSource.jsx";
import StepSchema from "./StepSchema.jsx";
import StepEngine from "./StepEngine.jsx";
import StepGenerate from "./StepGenerate.jsx";
import "./studio.css";

const STEPS = ["Source", "Schema", "Engine", "Generate"];

export default function SchemaStudio() {
  // Connection gate
  const [checked, setChecked] = useState(false);
  const [conn, setConn] = useState({ connected: false });

  // Wizard state
  const [step, setStep] = useState(0);
  const [columns, setColumns] = useState([]);
  const [stats, setStats] = useState(null);
  const [sampleRows, setSampleRows] = useState(0);
  const [form, setForm] = useState(defaultForm());

  // Restore any existing session on entry.
  useEffect(() => {
    connectionStatus()
      .then((s) => setConn(s || { connected: false }))
      .catch(() => setConn({ connected: false }))
      .finally(() => setChecked(true));
  }, []);

  const go = (n) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));

  async function handleDisconnect() {
    try { await disconnect(); } catch { /* ignore */ }
    setConn({ connected: false });
    setStep(0);
    setColumns([]); setStats(null); setSampleRows(0);
  }

  if (!checked) {
    return (
      <div className="studio-page">
        <div className="studio-loading"><span className="loading-spinner"></span> Checking connection...</div>
      </div>
    );
  }

  if (!conn.connected) {
    return (
      <div className="studio-page">
        <div className="studio-header">
          <h1 className="studio-title"><Icon className="ti ti-table" /> Schema Studio</h1>
        </div>
        <ConnectPanel onConnected={(s) => setConn(s)} />
      </div>
    );
  }

  return (
    <div className="studio-page">
      <div className="studio-header">
        <div className="studio-title-row">
          <h1 className="studio-title"><Icon className="ti ti-table" /> Schema Studio</h1>
          <div className="studio-conn">
            <Icon className="ti ti-plug" />
            <span>{conn.chUser}@{conn.node}{conn.port ? `:${conn.port}` : ""}</span>
            <button className="btn btn-ghost studio-conn-btn" onClick={handleDisconnect}>Disconnect</button>
          </div>
        </div>
        <ol className="studio-steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={"studio-step" + (i === step ? " active" : "") + (i < step ? " done" : "")}
              onClick={() => i < step && go(i)}
            >
              <span className="studio-step-num">{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div className="studio-body">
        {step === 0 && (
          <StepSource
            onDone={(res) => {
              setColumns(res.columns || []);
              setStats(res.stats || null);
              setSampleRows(res.sample_rows || 0);
              go(1);
            }}
          />
        )}
        {step === 1 && (
          <StepSchema
            columns={columns}
            setColumns={setColumns}
            stats={stats}
            sampleRows={sampleRows}
            onBack={() => go(0)}
            onNext={() => go(2)}
          />
        )}
        {step === 2 && (
          <StepEngine
            columns={columns}
            form={form}
            setForm={setForm}
            onBack={() => go(1)}
            onNext={() => go(3)}
          />
        )}
        {step === 3 && (
          <StepGenerate
            columns={columns}
            stats={stats}
            sampleRows={sampleRows}
            form={form}
            onBack={() => go(2)}
          />
        )}
      </div>
    </div>
  );
}

// Connect panel: prefilled from the app's current connection. The user confirms
// or edits their ClickHouse credentials, which are validated and then stored in
// the encrypted server-side session.
function ConnectPanel({ onConnected }) {
  const g = getGlobalConnection();
  // Cluster, node, and port come from the navbar connection and are not editable
  // here. Schema Studio only asks for the ClickHouse username and password.
  const target = { clusterId: g.clusterId || "", node: g.node || "", port: g.port || 8123 };
  const [user, setUser] = useState(g.user || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ready = !!target.clusterId && !!target.node;

  async function doConnect() {
    setBusy(true); setError(null);
    try {
      const s = await connect({ ...target, user, password });
      onConnected(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-step-pane studio-connect">
      <h2 className="studio-step-title">Connect to ClickHouse</h2>
      <p className="studio-note">
        Schema Studio uses the cluster and node selected in the top navbar. Enter the
        ClickHouse username and password to use for this session. They are validated, then
        stored encrypted on the server so a page reload keeps you connected. The browser
        does not keep your password.
      </p>

      {error && (
        <div className="alert-banner danger"><Icon className="ti ti-alert-circle" /><span>{error}</span></div>
      )}

      {!ready ? (
        <div className="studio-suggestion">
          No cluster and node are selected. Choose them in the top navbar first, then return here.
        </div>
      ) : (
        <div className="studio-conn-target">
          <Icon className="ti ti-plug" />
          <span>{target.node}:{target.port}</span>
        </div>
      )}

      <div className="studio-field">
        <label>ClickHouse user</label>
        <input className="form-input" value={user}
          onChange={(e) => setUser(e.target.value)} placeholder="default" />
      </div>
      <div className="studio-field">
        <label>Password</label>
        <div style={{ width: "100%", position: "relative" }}>
          <input className="form-input" style={{ width: "100%", paddingRight: "35px" }} type={showPassword ? "text" : "password"} value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <div
            className="password-eye"
            style={{ position: "absolute", right: "15px", top: "22%", cursor: "pointer" }}
            title={showPassword ? "hide" : "show"}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
          </div>
        </div>
      </div>

      <div className="studio-actions">
        <button className="btn btn-primary" onClick={doConnect} disabled={busy || !ready || !user}>
          {busy ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}

// The initial engine + clauses form state.
function defaultForm() {
  return {
    target: { database: "default", table: "" },
    behavior: "MergeTree",
    behaviorParams: {},
    replicated: false,
    zk_path: "",
    replica: "{replica}",
    distributed: false,
    cluster: "",
    shardingKey: "",
    onCluster: "",
    localTableName: "",
    ifNotExists: true,
    // Table clauses (drive the deterministic composer).
    orderBy: "",
    primaryKey: "",
    partitionBy: "",
    sampleBy: "",
    tableTtl: "",
    tableSettings: "",
    indexes: [],
    projections: [],
    preferences: {
      frequently_filtered: [],
    },
  };
}
