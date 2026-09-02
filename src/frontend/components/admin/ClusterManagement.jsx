// Copyright (C) 2026 Quantrail™ Data Private Limited
// ClusterManagement.jsx - multi-cluster management page
// Contributors -> Praveen kumar, kathir Moorthy

import React, { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import { useConnection } from "../../App.jsx";
import { useAuth } from "../../App.jsx";
import KubernetesClusterTab from "./KubernetesClusterTab.jsx";
import ConfirmDialog from "../editor/ConfirmDialog.jsx";

const MAX_CLUSTERS = 3;
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

function NodeClusterComponent({
  n,
  testNode,
  i,
  removeNode,
  updateNode,
  tr,
  editing,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      key={i}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 2fr 100px 1fr 1fr auto auto auto",
        gap: 8,
        marginBottom: 8,
        alignItems: "end",
      }}
    >
      <div className="form-group">
        <label className="form-label">Name *</label>
        <input
          className="form-input"
          value={n.name}
          onChange={(e) => updateNode(i, "name", e.target.value)}
          placeholder="node-1"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Host *</label>
        <input
          className="form-input"
          value={n.host}
          onChange={(e) => updateNode(i, "host", e.target.value)}
          placeholder="192.168.1.10"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Port</label>
        <input
          className="form-input"
          type="number"
          value={n.port}
          onChange={(e) =>
            updateNode(i, "port", parseInt(e.target.value) || 8123)
          }
        />
      </div>
      <div className="form-group">
        <label className="form-label">User</label>
        <input
          className="form-input"
          value={n.user}
          onChange={(e) => updateNode(i, "user", e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Password</label>

        <div className="" style={{ width: "100%", position: "relative" }}>
          <input
            className="form-input"
            style={{ width: "100%", paddingRight: "35px" }}
            type={showPassword ? "text" : "password"}
            value={n.password || ""}
            onChange={(e) => updateNode(i, "password", e.target.value)}
            placeholder={
              n.hasPassword
                ? "(unchanged - enter a new password to replace it)"
                : ""
            }
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
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <Icon className="ti ti-eye-off" />
            ) : (
              <Icon className="ti ti-eye" />
            )}
          </div>
        </div>
      </div>

      <div className="form-group" style={{ paddingTop: 20 }}>
        <label
          style={{
            display: "flex",
            gap: 4,
            alignItems: "center",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          <input
            type="checkbox"
            checked={n.secure}
            onChange={(e) => updateNode(i, "secure", e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />{" "}
          HTTPS
        </label>
      </div>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => testNode(editing, i)}
        style={{ marginBottom: 2 }}
      >
        <Icon className="ti ti-plug-connected"></Icon>
      </button>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => removeNode(i)}
        style={{ marginBottom: 2 }}
      >
        <Icon className="ti ti-trash"></Icon>
      </button>
      {tr && (
        <div
          style={{
            gridColumn: "1 / -1",
            fontSize: "12px",
            color: tr.loading
              ? "var(--text-muted)"
              : tr.ok
                ? "var(--color-success)"
                : "var(--color-danger)",
            marginTop: -4,
          }}
        >
          {tr.loading ? "Testing..." : tr.msg}
        </div>
      )}
    </div>
  );
}

export default function ClusterManagement() {
  const toast = useToast();
  const { reloadConfig, features } = useConnection();
  // Absent means on, mirroring the backend. Only an explicit false hides the
  // tab, so a config response that predates this field does not remove a
  // feature the server is happy to serve.
  const k8sEnabled = features?.kubernetes !== false;
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [clusters, setClusters] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", nodes: [] });
  const [showForm, setShowForm] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [loaded, setLoaded] = useState(false);
  // "Direct connection" rather than "VM based": the direct tab also covers
  // ClickHouse Cloud, Altinity.Cloud and Aiven, and calling a managed service a
  // virtual machine invites a support question.
  const [tab, setTab] = useState("direct");
  // The Kubernetes tab opens on its list when there is one, and on the import
  // wizard only when asked.
  const [showK8sWizard, setShowK8sWizard] = useState(false);

  const [editingK8s, setEditingK8s] = useState(null);
  const [k8sForm, setK8sForm] = useState(null);
  const [k8sVerify, setK8sVerify] = useState(null);
  const [k8sSaving, setK8sSaving] = useState(false);


  const [deleting, setDeleting] = useState(null);

  // Each tab shows only its own kind. A cluster imported from an installation
  // has no business appearing under Direct connection, where its nodes are not
  // editable and half the form does not apply.
  const directClusters = clusters.filter((c) => c.kind !== "k8s");
  const k8sClusters = clusters.filter((c) => c.kind === "k8s");
  const visibleClusters = k8sEnabled && tab === "k8s" ? k8sClusters : directClusters;

  async function load() {
    try {
      const r = await apiFetch("/api/cluster");
      setClusters(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error("Failed to load clusters: " + e.message);
    }
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);

  function addNode() {
    setForm((p) => ({
      ...p,
      nodes: [
        ...p.nodes,
        {
          name: "",
          host: "",
          port: 8123,
          user: "default",
          password: "",
          secure: false,
        },
      ],
    }));
  }

  function updateNode(i, field, value) {
    setForm((p) => ({
      ...p,
      nodes: p.nodes.map((n, j) => (j === i ? { ...n, [field]: value } : n)),
    }));
  }

  function removeNode(i) {
    setForm((p) => ({ ...p, nodes: p.nodes.filter((_, j) => j !== i) }));
  }

  async function testNode(clusterId, i) {
    const n = form.nodes[i];
    if (!n.host) {
      toast.warning("Host is required.");
      return;
    }
    const key = `${clusterId || "new"}-${i}`;
    setTestResults((p) => ({ ...p, [key]: { loading: true } }));
    try {
      const r = await apiFetch("/api/cluster/test", {
        method: "POST",
        body: JSON.stringify(n),
      });
      setTestResults((p) => ({
        ...p,
        [key]: { ok: true, msg: `v${r.version}, uptime ${r.uptime}s` },
      }));
    } catch (err) {
      setTestResults((p) => ({ ...p, [key]: { ok: false, msg: err.message } }));
    }
  }

  function startNew() {
    setForm({
      name: "",
      nodes: [
        {
          name: "",
          host: "",
          port: 8123,
          user: "default",
          password: "",
          secure: false,
        },
      ],
    });
    setEditing(null);
    setShowForm(true);
    setTestResults({});
  }

  function startEdit(cluster) {
    setForm({
      name: cluster.name,
      nodes: cluster.nodes.map((n) => ({ ...n })),
    });
    setEditing(cluster.id);
    setShowForm(true);
    setTestResults({});
  }

  async function save() {
    const valid = form.nodes.filter((n) => n.host);
    const unnamed = valid.find((n) => !n.name?.trim());
    if (unnamed) {
      toast.warning("Node Name is required for all nodes.");
      return;
    }
    if (!form.name?.trim()) {
      toast.warning("Cluster name is required.");
      return;
    }
    const names = valid.map((n) => n.name.trim().toLowerCase());
    const dupes = names.filter((v, i) => names.indexOf(v) !== i);
    if (dupes.length) {
      toast.warning(`Duplicate node name: "${dupes[0]}".`);
      return;
    }

    try {
      if (editing) {
        await apiFetch(`/api/cluster/${editing}`, {
          method: "PUT",
          body: JSON.stringify({ name: form.name, nodes: valid }),
        });
        toast.success(`Cluster "${form.name}" updated.`);
      } else {
        const res = await apiFetch("/api/cluster", {
          method: "POST",
          body: JSON.stringify({ name: form.name, nodes: valid }),
        });
        toast.success(`Cluster "${form.name}" created.`);
      }
      setShowForm(false);
      setEditing(null);
      load();
      if (reloadConfig) reloadConfig();
    } catch (err) {
      toast.error(err.message);
    }
  }
  
useEffect(() => {
    if (!editingK8s) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !k8sSaving) setEditingK8s(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingK8s, k8sSaving]);


function startEditK8s(cluster) {
    setEditingK8s(cluster);
    setK8sForm({
      name: cluster.name,
      endpoint: cluster.endpoint || cluster.nodes?.[0]?.host || "",
      port: cluster.port ?? 8443,
      secure: cluster.secure !== false,
      chUser: cluster.chUser || "default",
      // Never prefilled. The browser does not receive it, and empty means
      // unchanged on save.
      chPassword: "",
    });
    setK8sVerify(null);
  }

  async function verifyK8s() {
    setK8sVerify({ testing: true });
    try {
      const r = await apiFetch("/api/k8s/clusters/verify", {
        method: "POST",
        body: JSON.stringify({
          clusterId: editingK8s.id,
          endpoint: k8sForm.endpoint,
          port: k8sForm.port,
          secure: k8sForm.secure,
          chUser: k8sForm.chUser,
          chPassword: k8sForm.chPassword,
        }),
      });
      setK8sVerify(r);
      return r;
    } catch (err) {
      const failed = { ok: false, message: err.message };
      setK8sVerify(failed);
      return failed;
    }
  }

  async function saveK8s() {
    if (!k8sForm.name?.trim()) {
      toast.warning("Cluster name is required.");
      return;
    }
    if (!k8sForm.endpoint?.trim()) {
      toast.warning("ClickHouse address is required.");
      return;
    }

    setK8sSaving(true);
    try {
      // Test first, stop on failure. Saving settings that do not connect breaks
      // alerts and scheduled jobs silently.
      const check = await verifyK8s();
      if (!check.ok) {
        toast.error("Could not connect with these settings. Nothing was saved.");
        return;
      }

      await apiFetch(`/api/cluster/${editingK8s.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: k8sForm.name.trim(),
          endpoint: k8sForm.endpoint.trim(),
          port: Number(k8sForm.port),
          secure: k8sForm.secure,
          chUser: k8sForm.chUser,
          ...(k8sForm.chPassword ? { chPassword: k8sForm.chPassword } : {}),
        }),
      });

      const addressing = await apiFetch(
        `/api/k8s/clusters/${editingK8s.id}/reresolve`,
        { method: "POST" },
      ).catch(() => ({ ok: false }));

      if (addressing.ok === false && addressing.message) {
        toast.warning(`Saved, but node addresses could not be refreshed: ${addressing.message}`);
      }

      toast.success("Cluster updated.");
      setEditingK8s(null);
      load();
      if (reloadConfig) reloadConfig();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setK8sSaving(false);
    }
  }


  async function remove(id) {
    try {
      await apiFetch(`/api/cluster/${id}`, { method: "DELETE", body: {} });
      toast.success("Cluster deleted.");
      setDeleting(null);
      load();
      if (reloadConfig) reloadConfig();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!loaded)
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner"></div> Loading...
        </div>
      </div>
    );

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
            <Icon className="ti ti-network"></Icon> Cluster Management
          </h2>
        </div>
        <div className="alert-banner info" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-lock"></Icon>
          <span>Cluster management is only available for administrators.</span>
        </div>
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>Cluster management is only available for administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-network"></Icon> Cluster Management
        </h2>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <Icon className="ti ti-refresh"></Icon>
          </button>
          {k8sEnabled && tab === "k8s"
            ? !showK8sWizard &&
              clusters.length < MAX_CLUSTERS && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowK8sWizard(true)}
                >
                  <Icon className="ti ti-plus"></Icon> New Cluster
                </button>
              )
            : !showForm &&
              clusters.length < MAX_CLUSTERS && (
                <button className="btn btn-primary btn-sm" onClick={startNew}>
                  <Icon className="ti ti-plus"></Icon> New Cluster
                </button>
              )}
          {k8sEnabled && tab === "k8s" && showK8sWizard && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowK8sWizard(false)}
            >
              <Icon className="ti ti-x"></Icon> Cancel
            </button>
          )}
          {(!k8sEnabled || tab === "direct") && showForm && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              <Icon className="ti ti-x"></Icon> Cancel
            </button>
          )}
        </div>
      </div>

      {k8sEnabled && (
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          <button
            className={tab === "direct" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            onClick={() => {
              setTab("direct");
              setShowK8sWizard(false);
            }}
          >
            Direct connection
          </button>
          <button
            className={tab === "k8s" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            onClick={() => {
              setTab("k8s");
              setShowForm(false);
              setEditing(null);
            }}
          >
            Kubernetes
          </button>
        </div>
      )}

      {k8sEnabled && tab === "k8s" && showK8sWizard && (
        <KubernetesClusterTab
          onImported={async () => {
            await load();
            setShowK8sWizard(false);
          }}
        />
      )}

      {(!k8sEnabled || tab === "direct") && showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Cluster Name *</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Production, Staging, Analytics"
              style={{ maxWidth: 300 }}
            />
          </div>
          <div
            style={{
              marginBottom: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "14px" }}>
              Nodes ({form.nodes.length})
            </span>
            <button className="btn btn-secondary btn-sm" onClick={addNode}>
              <Icon className="ti ti-plus"></Icon> Add Node
            </button>
          </div>
          {form.nodes.map((n, i) => {
            const key = `${editing || "new"}-${i}`;
            const tr = testResults[key];
            return (
              <NodeClusterComponent
                key={key}
                i={i}
                n={n}
                testNode={testNode}
                updateNode={updateNode}
                removeNode={removeNode}
                tr={tr}
                editing={editing}
              />
            );
          })}
          <button
            className="btn btn-primary"
            onClick={save}
            style={{ marginTop: 8 }}
          >
            <Icon className="ti ti-device-floppy"></Icon>{" "}
            {editing ? "Update Cluster" : "Create Cluster"}
          </button>
        </div>
      )}

      {k8sEnabled && tab === "k8s" && !showK8sWizard && k8sClusters.length === 0 ? (
        <div className="empty-state">
          <Icon className="ti ti-topology-star-3"></Icon>
          <p>Add a cluster. Click New Cluster to import one from an installation.</p>
        </div>
      ) : (!k8sEnabled || tab === "direct") && directClusters.length === 0 && !showForm ? (
        <div className="empty-state">
          <Icon className="ti ti-network"></Icon>
          <p>No clusters configured. Click New Cluster to get started.</p>
        </div>
      ) : (!k8sEnabled || tab === "direct") || !showK8sWizard ? (
        <div style={{ display: "grid", gap: 14 }}>
          {visibleClusters.map((c) => (
            editing !== c.id && <div key={c.id} className="card" style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div>
                  <strong style={{ fontSize: "1rem" }}>{c.name}</strong>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "13px",
                      marginLeft: 8,
                    }}
                  >
                    {c.nodes.length} node{c.nodes.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => (c.kind === "k8s" ? startEditK8s(c) : startEdit(c))}
                  >
                    <Icon className="ti ti-edit"></Icon> Edit
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleting(c)}
                  >
                    <Icon className="ti ti-trash"></Icon>
                  </button>
                </div>
              </div>
              {c.kind === "k8s" && (
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 8,
                    color: "var(--text-muted)",
                  }}
                >
                  These hosts come from the {c.k8s?.installation} installation
                  in namespace {c.k8s?.namespace}, managed by{" "}
                  {c.k8s?.operator === "ocko" ? "OCKO" : "AKOC"}. They update
                  automatically when the cluster is scaled.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.nodes.map((n) => (
                  <span
                    key={n.host}
                    className="badge badge-blue"
                    style={{ fontSize: "12px", padding: "3px 10px" }}
                  >
                    <Icon
                      className="ti ti-server"
                      style={{ fontSize: 13, marginRight: 4 }}
                    ></Icon>
                    {n.name || n.host} ({n.host}:{n.port})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {editingK8s && k8sForm && (
        <div className="modal-overlay" >
          <div
            className="modal-box"
            style={{ maxWidth: 520, width: "94%" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Icon className="ti ti-edit" />
              <span style={{ fontWeight: 600 }}>Edit cluster</span>
            </div>

            <div className="form-group">
              <label className="form-label">Cluster name</label>
              <input
                className="form-input"
                value={k8sForm.name}
                onChange={(e) => setK8sForm((p) => ({ ...p, name: e.target.value }))}
                style={{ width: "100%" }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">ClickHouse address</label>
              <input
                className="form-input"
                value={k8sForm.endpoint}
                onChange={(e) => {
                  setK8sForm((p) => ({ ...p, endpoint: e.target.value }));
                  setK8sVerify(null);
                }}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div className="form-group" style={{ flex: "0 0 120px" }}>
                <label className="form-label">Port</label>
                <input
                  className="form-input"
                  type="number"
                  value={k8sForm.port}
                  onChange={(e) => {
                    setK8sForm((p) => ({ ...p, port: e.target.value }));
                    setK8sVerify(null);
                  }}
                  style={{ width: "100%" }}
                />
              </div>
              <div
                className="form-group"
                style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}
              >
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={k8sForm.secure}
                    onChange={(e) => {
                      setK8sForm((p) => ({ ...p, secure: e.target.checked }));
                      setK8sVerify(null);
                    }}
                  />
                  Use TLS
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">ClickHouse user</label>
              <input
                className="form-input"
                value={k8sForm.chUser}
                onChange={(e) => {
                  setK8sForm((p) => ({ ...p, chUser: e.target.value }));
                  setK8sVerify(null);
                }}
                style={{ width: "100%" }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">ClickHouse password</label>
              <input
                className="form-input"
                type="password"
                value={k8sForm.chPassword}
                onChange={(e) => {
                  setK8sForm((p) => ({ ...p, chPassword: e.target.value }));
                  setK8sVerify(null);
                }}
                placeholder={
                  editingK8s.hasChPassword
                    ? "Leave blank to keep the current password"
                    : "No password set"
                }
                style={{ width: "100%" }}
              />
            </div>

            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Nodes come from the installation and are re-read on refresh.
            </p>

            {k8sVerify && !k8sVerify.testing && (
              <div
                className={k8sVerify.ok ? "alert-banner info" : "alert-banner danger"}
                style={{ marginBottom: 12, fontSize: 12 }}
              >
                <Icon className={k8sVerify.ok ? "ti ti-check" : "ti ti-alert-triangle"} />
                <span>
                  {k8sVerify.ok
                    ? `Connected. ClickHouse ${k8sVerify.version ?? ""}`.trim()
                    : k8sVerify.message || "Could not connect."}
                </span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={verifyK8s}
                disabled={k8sSaving || k8sVerify?.testing}
              >
                Test connection
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingK8s(null)}
                disabled={k8sSaving}
              >
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveK8s} disabled={k8sSaving}>
                {k8sSaving ? "Testing and saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      
      <ConfirmDialog
        open={!!deleting}
        tone="danger"
        title="Delete this cluster?"
        message={
          deleting
            ? `"${deleting.name}" will be removed from CHOps, along with its ${deleting.nodes?.length ?? 0} node${
                deleting.nodes?.length === 1 ? "" : "s"
              }.`
            : ""
        }
        detail={
          deleting?.kind === "k8s"
            ? "Nothing in Kubernetes is changed, and the Kubernetes connection is kept so it can be used for other installations. Dashboards and alerts that point at this cluster will stop working."
            : "Dashboards and alerts that point at this cluster will stop working."
        }
        confirmLabel="Delete cluster"
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove(deleting.id)}
      />
    </div>
  );
}
