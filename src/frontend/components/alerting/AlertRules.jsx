// Copyright (C) 2026 Quantrail™ Data Private Limited
// @Kathir -> Kathir Moorthy
// Manages and renders the configuration rules for triggering system notification alerts.

import React, { useEffect, useState } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from "../../utils/api.js";
import { useConnection } from "../../App.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";

const SEVS = ["info", "warning", "critical"];
const OPS = [
  { k: "gt", l: "greater than" },
  { k: "gte", l: "greater than or equal" },
  { k: "lt", l: "less than" },
  { k: "lte", l: "less than or equal" },
  { k: "eq", l: "equal to" },
  { k: "neq", l: "not equal to" },
];

export default function AlertRules() {
  const [rules, setRules] = useState([]);
  const [channels, setChannels] = useState([]);
  const [clusterNodes, setClusterNodes] = useState([]);
  const { clusters } = useConnection();
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [result, setResult] = useState(null);
  const [cronError, setCronError] = useState("");
  const [f, setF] = useState({
    name: "",
    description: "",
    sql: "",
    threshold: 0,
    operator: "gt",
    severity: "warning",
    schedule: "*/5 * * * *",
    enabled: true,
    channel_ids: [],
    nodes: [],
    cluster_id: "",
  });

  function normalizeCron(expr) {
    const parts = expr.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 4) return `0 ${parts.join(" ")}`;
    return expr.trim();
  }

  function validateCron(expr) {
    const parts = expr.trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 4 && parts.length !== 5)
      return "Cron must have 4 or 5 fields";
    const normalized = parts.length === 4 ? ["0", ...parts] : parts;
    const ranges = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 7],
    ];
    const names = ["minute", "hour", "day-of-month", "month", "day-of-week"];
    for (let i = 0; i < 5; i++) {
      const p = normalized[i];
      if (p === "*") continue;
      if (p.startsWith("*/")) {
        const n = parseInt(p.slice(2));
        if (isNaN(n) || n < 1) return `Invalid step in ${names[i]}: ${p}`;
        continue;
      }
      for (const v of p.split(",")) {
        const n = parseInt(v);
        if (isNaN(n) || n < ranges[i][0] || n > ranges[i][1])
          return `${names[i]} value out of range (${ranges[i][0]}-${ranges[i][1]}): ${v}`;
      }
    }
    return "";
  }

  async function load() {
    try {
      const r = await apiFetch("/api/alerts/rules");
      setRules(Array.isArray(r) ? r : []);
    } catch {}
    try {
      const c = await apiFetch("/api/alerts/channels");
      setChannels(Array.isArray(c) ? c : []);
    } catch {}
    setLoaded(true);
  }

  // Compute available nodes based on the selected cluster in the form
  useEffect(() => {
    if (f.cluster_id) {
      const cluster = (clusters || []).find((c) => c.id === f.cluster_id);
      setClusterNodes(cluster ? cluster.nodes.map((n) => n.host) : []);
    } else {
      // All nodes from all clusters
      setClusterNodes(
        (clusters || []).flatMap((c) => (c.nodes || []).map((n) => n.host)),
      );
    }
  }, [f.cluster_id, clusters]);
  useEffect(() => {
    load();
  }, []);

  // Reload when user returns to this tab (picks up new nodes added in Cluster Management)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  function resetForm() {
    setF({
      name: "",
      description: "",
      sql: "",
      threshold: 0,
      operator: "gt",
      severity: "warning",
      schedule: "*/5 * * * *",
      enabled: true,
      channel_ids: [],
      nodes: [],
      cluster_id: "",
    });
    setEditing(null);
    setCronError("");
  }

  async function save() {
    try {
      const selectedCluster = f.cluster_id
        ? (clusters || []).find((c) => c.id === f.cluster_id)
        : null;
      const hasZeroNodes = !!(
        selectedCluster &&
        (!Array.isArray(selectedCluster.nodes) ||
          selectedCluster.nodes.length === 0)
      );
      if (hasZeroNodes) {
        setResult({
          ok: false,
          msg: "Selected cluster has zero nodes. Choose another cluster or use All clusters.",
        });
        return;
      }

      const normalizedSchedule = normalizeCron(f.schedule);
      const cronValidationError = validateCron(normalizedSchedule);
      if (cronValidationError) {
        setCronError(cronValidationError);
        setResult({ ok: false, msg: cronValidationError });
        return;
      }

      const checkQuery = await runQuery(f.sql);
      const payload = {
        ...f,
        schedule: normalizedSchedule,
        nodes: f.nodes.length > 0 ? f.nodes : null,
        cluster_id: f.cluster_id || null,
      };
      if (editing) {
        await apiFetch(`/api/alerts/rules/${editing}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setResult({ ok: true, msg: `Rule "${f.name}" updated.` });
      } else {
        await apiFetch("/api/alerts/rules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setResult({ ok: true, msg: `Rule "${f.name}" created.` });
      }
      resetForm();
      setShowForm(false);
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message.slice(0, 200) + "....." });
    }
  }

    async function name() {
    try {
      const check = await runQuery(f.sql)
      setResult({ ok: true, msg: "Query executed successfully" });
    } catch (error) {
      setResult({ ok: false, msg: error.message });
    }
  }

  async function remove(id) {
    try {
      await apiFetch(`/api/alerts/rules/${id}`, { method: "DELETE", body: {} });
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    setDel(null);
  }
  async function toggleEnabled(r) {
    try {
      await apiFetch(`/api/alerts/rules/${r.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !r.enabled }),
      });
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
  }

  function edit(r) {
    setF({
      name: r.name,
      description: r.description || "",
      sql: r.sql,
      threshold: r.threshold,
      operator: r.operator,
      severity: r.severity,
      schedule: r.schedule,
      enabled: r.enabled,
      channel_ids: (r.channels || []).map((c) => c.id),
      nodes: Array.isArray(r.nodes) ? r.nodes : [],
      cluster_id: r.cluster_id || "",
    });
    setEditing(r.id);
    setShowForm(true);
    setCronError(validateCron(r.schedule || ""));
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-bell-ringing"></Icon> Alert Rules
        </h2>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <Icon className="ti ti-refresh"></Icon>
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
          >
            <Icon className={`ti ${showForm ? "ti-x" : "ti-plus"}`}></Icon>{" "}
            {showForm ? "Cancel" : "New Rule"}
          </button>
        </div>
      </div>
      {result && (
        <div
          className={`alert-banner ${result.ok ? "success" : "danger"}`}
          style={{ marginBottom: 14 }}
        >
          <Icon className={`ti ${result.ok ? "ti-check" : "ti-alert-circle"}`}></Icon>{" "}
          {result.msg}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setResult(null)}
          >
            <Icon className="ti ti-x"></Icon>
          </button>
        </div>
      )}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Severity</label>
              <Select
                className="form-select"
                value={f.severity}
                onChange={(e) => setF({ ...f, severity: e.target.value })}
              >
                {SEVS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="form-group">
              <label className="form-label">Schedule (cron)</label>
              <input
                className="form-input"
                value={f.schedule}
                onChange={(e) => {
                  setF({ ...f, schedule: e.target.value });
                  setCronError(validateCron(e.target.value));
                }}
                onBlur={(e) => {
                  const normalized = normalizeCron(e.target.value);
                  setF((p) => ({ ...p, schedule: normalized }));
                  setCronError(validateCron(normalized));
                }}
                style={cronError ? { borderColor: "var(--color-danger)" } : {}}
              />
              {cronError && (
                <span
                  style={{ color: "var(--color-danger)", fontSize: "0.75rem" }}
                >
                  {cronError}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Operator</label>
              <Select
                className="form-select"
                value={f.operator}
                onChange={(e) => setF({ ...f, operator: e.target.value })}
              >
                {OPS.map((o) => (
                  <option key={o.k} value={o.k}>
                    {o.l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="form-group">
              <label className="form-label">Threshold</label>
              <input
                className="form-input"
                type="number"
                value={f.threshold}
                onChange={(e) =>
                  setF({ ...f, threshold: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div
              className="form-group"
              style={{ display: "flex", alignItems: "center", paddingTop: 20 }}
            >
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={(e) => setF({ ...f, enabled: e.target.checked })}
                  style={{ accentColor: "var(--accent)" }}
                />{" "}
                Enabled
              </label>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">SQL (single value)</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={f.sql}
              onChange={(e) => setF({ ...f, sql: e.target.value })}
              style={{ fontFamily: "var(--font-code)" }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Description</label>
            <input
              className="form-input"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </div>
          {channels.length > 0 && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Channels</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {channels.map((ch) => (
                  <label
                    key={ch.id}
                    style={{
                      display: "flex",
                      gap: 4,
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={f.channel_ids.includes(ch.id)}
                      onChange={() =>
                        setF((p) => ({
                          ...p,
                          channel_ids: p.channel_ids.includes(ch.id)
                            ? p.channel_ids.filter((i) => i !== ch.id)
                            : [...p.channel_ids, ch.id],
                        }))
                      }
                      style={{ accentColor: "var(--accent)" }}
                    />
                    {ch.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Cluster</label>
            <Select
              className="form-select"
              value={f.cluster_id}
              onChange={(e) =>
                setF((p) => ({ ...p, cluster_id: e.target.value, nodes: [] }))
              }
            >
              <option value="">All clusters (default)</option>
              {(clusters || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {clusterNodes.length > 0 && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">
                Target Nodes{" "}
                <span
                  style={{
                    fontWeight: 400,
                    color: "var(--text-muted)",
                    fontSize: "13px",
                  }}
                >
                  (empty = all nodes)
                </span>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {clusterNodes.map((host) => (
                  <label
                    key={host}
                    style={{
                      display: "flex",
                      gap: 4,
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={f.nodes.includes(host)}
                      onChange={() =>
                        setF((p) => ({
                          ...p,
                          nodes: p.nodes.includes(host)
                            ? p.nodes.filter((h) => h !== host)
                            : [...p.nodes, host],
                        }))
                      }
                      style={{ accentColor: "var(--accent)" }}
                    />
                    {host}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={!f.name || !f.sql || !!cronError}
          >
            <Icon className="ti ti-device-floppy"></Icon>{" "}
            {editing ? "Update" : "Create"}
          </button>
          <button
            className="btn btn-primary"
            onClick={name}
            disabled={!f.name || !f.sql || !!cronError}
            style={{marginLeft:"10px"}}
          >
            <Icon className="ti ti-send"></Icon>{" "}
            Test
          </button>
        </div>
      )}
      {!loaded ? (
        <div className="empty-state">
          <p>Loading...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="empty-state">
          <Icon className="ti ti-bell-plus" style={{ fontSize: 36 }}></Icon>
          <p>No rules yet. Click New Rule.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))",
            gap: 14,
          }}
        >
          {rules.map((r) => {
            const selectedCluster = r.cluster_id
              ? (clusters || []).find((c) => c.id === r.cluster_id)
              : null;
            const hasZeroNodes = !!(
              r.cluster_id &&
              (!selectedCluster ||
                !Array.isArray(selectedCluster.nodes) ||
                selectedCluster.nodes.length === 0)
            );
            const showMarquee =
              hasZeroNodes || r.isActive || r.lastStatus || r.lastError;
            const marqueeBg = hasZeroNodes
              ? "rgba(245,158,11,0.12)"
              : r.lastError
                ? "rgba(239,68,68,0.12)"
                : r.isActive
                  ? "rgba(239,68,68,0.12)"
                  : "rgba(59,130,246,0.12)";
            const marqueeBorder = hasZeroNodes
              ? "rgba(245,158,11,0.28)"
              : r.lastError
                ? "rgba(239,68,68,0.28)"
                : r.isActive
                  ? "rgba(239,68,68,0.28)"
                  : "rgba(59,130,246,0.28)";
            const marqueeColor = hasZeroNodes
              ? "var(--color-warning)"
              : r.lastError
                ? "var(--color-danger)"
                : r.isActive
                  ? "var(--color-danger)"
                  : "var(--text-secondary)";
            const marqueeText = hasZeroNodes
              ? "Alert warning: selected cluster has zero nodes"
              : r.lastError
                ? `Alert error: ${r.lastError}`
                : r.isActive
                  ? `Alert firing${r.lastValue != null ? ` - Current value: ${r.lastValue}` : ""}`
                  : `Last status: ${r.lastStatus}${r.lastValue != null ? ` (${r.lastValue})` : ""}`;
            return (
              <div key={r.id} className="card" style={{ padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong>{r.name}</strong>
                  <span
                    className={`badge ${r.severity === "critical" ? "badge-red" : r.severity === "warning" ? "badge-amber" : "badge-blue"}`}
                  >
                    {r.severity}
                  </span>
                </div>
                {r.description && (
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "13px",
                      marginBottom: 8,
                    }}
                  >
                    {r.description}
                  </p>
                )}
                <div
                  style={{
                    fontFamily: "var(--font-code)",
                    fontSize: "12px",
                    background: "var(--bg-sunken)",
                    padding: 8,
                    borderRadius: "var(--radius-sm)",
                    marginBottom: 8,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {r.sql}
                </div>
                {showMarquee && (
                  <div
                    style={{
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      marginBottom: 10,
                      borderRadius: "var(--radius-sm)",
                      background: marqueeBg,
                      border: `1px solid ${marqueeBorder}`,
                    }}
                  >
                    <marquee
                      behavior="scroll"
                      direction="left"
                      scrollamount="4"
                      style={{
                        padding: "6px 10px",
                        fontSize: "13px",
                        color: marqueeColor,
                      }}
                    >
                      {marqueeText}
                    </marquee>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    marginBottom: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    Fires when value is{" "}
                    {OPS.find((o) => o.k === r.operator)?.l || r.operator}{" "}
                    {r.threshold}
                  </span>
                  <span>
                    <Icon className="ti ti-clock"></Icon> {r.schedule}
                  </span>
                  <span>
                    {r.enabled ? (
                      <span className="badge badge-green">Enabled</span>
                    ) : (
                      <span className="badge badge-gray">Disabled</span>
                    )}
                  </span>
                  {r.isActive && !hasZeroNodes && (
                    <span className="badge badge-red">FIRING</span>
                  )}
                  {hasZeroNodes && (
                    <span className="badge badge-amber">NO NODES</span>
                  )}
                  {Array.isArray(r.nodes) && r.nodes.length > 0 && (
                    <span
                      style={{ fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      <Icon className="ti ti-server" style={{ fontSize: 14 }}></Icon>{" "}
                      {r.nodes.join(", ")}
                    </span>
                  )}
                  <span
                    style={{ fontSize: "12px", color: "var(--text-muted)" }}
                  >
                    <Icon
                      className="ti ti-topology-star-ring-3"
                      style={{ fontSize: 14 }}
                    ></Icon>{" "}
                    {r.cluster_id
                      ? (clusters || []).find((c) => c.id === r.cluster_id)
                          ?.name || r.cluster_id
                      : "All clusters"}
                  </span>
                </div>
                {(r.lastStatus || hasZeroNodes) && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginBottom: 8,
                    }}
                  >
                    {hasZeroNodes
                      ? "Last: warning (selected cluster has zero nodes)"
                      : `Last: ${r.lastStatus} ${r.lastValue != null ? `(${r.lastValue})` : ""}${r.lastRunAt ? ` at ${new Date(r.lastRunAt).toLocaleString()}` : ""}`}
                    {r.lastError ? (
                      <span style={{ color: "var(--color-danger)" }}>
                        {" "}
                        {r.lastError}
                      </span>
                    ) : (
                      ""
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => edit(r)}
                  >
                    <Icon className="ti ti-edit"></Icon>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => toggleEnabled(r)}
                  >
                    <Icon
                      className={`ti ${r.enabled ? "ti-player-pause" : "ti-player-play"}`}
                    ></Icon>{" "}
                    {r.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setDel(r.id)}
                  >
                    <Icon className="ti ti-trash"></Icon>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {del && (
        <ConfirmModal
          title="Delete Rule"
          message="Delete this alert rule?"
          onConfirm={() => remove(del)}
          onCancel={() => setDel(null)}
          danger
        />
      )}
    </div>
  );
}
