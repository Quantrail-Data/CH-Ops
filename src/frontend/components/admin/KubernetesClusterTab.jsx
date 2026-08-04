// Contributors -> Kathirdhasan, Kathir Moorthy, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Four step wizard that imports a ClickHouse® installation from Kubernetes.

import React, { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import ConfirmDialog from "../editor/ConfirmDialog.jsx";
import { apiFetch } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";

const STEPS = [
  { n: 1, label: "Connect" },
  { n: 2, label: "Installation" },
  { n: 3, label: "ClickHouse® address" },
  { n: 4, label: "Credentials" },
];

// Pull the three values out of the block the setup script prints
function parseSetupBlock(text) {
  const address = text.match(/API address:\s*\n\s*(\S+)/i);
  const token = text.match(/Token:\s*\n\s*(\S+)/i);
  const ca = text.match(
    /(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/,
  );
  if (!address && !token && !ca) return null;
  return {
    apiAddress: address?.[1] ?? "",
    token: token?.[1] ?? "",
    caCertificate: ca?.[1] ?? "",
  };
}

function StepHeader({ current }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
      {STEPS.map((s) => (
        <div
          key={s.n}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: 13,
            color: s.n <= current ? "var(--text-primary)" : "var(--text-muted)",
            borderBottom:
              s.n === current
                ? "2px solid var(--accent)"
                : "2px solid transparent",
          }}
        >
          {s.n}. {s.label}
        </div>
      ))}
    </div>
  );
}

function TestResult({ result }) {
  if (!result) return null;

  const k8s = result.kubernetes;
  const missing = result.permissions?.missing ?? [];
  const degraded = result.permissions?.degraded ?? [];

  return (
    <div style={{ marginTop: 12, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon className={k8s.ok ? "ti ti-check" : "ti ti-x"} />
        <span>Kubernetes: {k8s.message}</span>
      </div>

      {result.operator && !result.operator.reachable && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon className="ti ti-alert-triangle" />
          <span>{result.operator.message}</span>
        </div>
      )}

      {missing.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <strong>Missing permissions:</strong>
          <ul style={{ margin: "4px 0 0 18px" }}>
            {missing.map((p, i) => (
              <li key={i}>
                {p.verb} {p.resource}
                {p.group ? ` (${p.group})` : ""}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
            Re-run the setup script, or grant these to the service account.
          </div>
        </div>
      )}

      {degraded.length > 0 && (
        <div style={{ marginTop: 10, color: "var(--text-muted)" }}>
          <strong>Available with reduced detail:</strong>
          <ul style={{ margin: "4px 0 0 18px" }}>
            {degraded.map((p, i) => (
              <li key={i}>
                {p.feature} is unavailable without {p.resource} access
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function KubernetesClusterTab({ onImported }) {
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [connections, setConnections] = useState([]);
  const [connectionId, setConnectionId] = useState("");
  const [conn, setConn] = useState({
    name: "",
    apiAddress: "",
    caCertificate: "",
    token: "",
  });
  const [pasteBlock, setPasteBlock] = useState("");
  const [testResult, setTestResult] = useState(null);

  const [namespaces, setNamespaces] = useState([]);
  const [namespaceSource, setNamespaceSource] = useState("cluster");
  const [namespace, setNamespace] = useState("");
  const [operators, setOperators] = useState([]);
  const [operator, setOperator] = useState("akoc");
  const [installations, setInstallations] = useState([]);
  const [installation, setInstallation] = useState("");

  const [endpoint, setEndpoint] = useState("");
  const [port, setPort] = useState(8443);
  const [secure, setSecure] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [chUser, setChUser] = useState("");
  const [chPassword, setChPassword] = useState("");
  // Set when the backend reports the credentials did not work.
  const [credentialWarning, setCredentialWarning] = useState(null);

  useEffect(() => {
    loadConnections();
    apiFetch("/api/k8s/operators")
      .then((r) => setOperators(r.operators || []))
      .catch(() => setOperators([]));
  }, []);

  async function loadConnections() {
    try {
      const r = await apiFetch("/api/k8s/connections");
      setConnections(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error("Failed to load Kubernetes connections: " + e.message);
    }
  }

  function applyPaste(text) {
    setPasteBlock(text);
    const parsed = parseSetupBlock(text);
    if (parsed) {
      setConn((p) => ({ ...p, ...parsed }));
      toast.success("Read the address, certificate and token from the pasted block.");
    }
  }

  async function testConnection() {
    setBusy(true);
    setTestResult(null);
    try {
      const body = connectionId
        ? { connectionId, namespace: namespace || undefined }
        : { ...conn, namespace: namespace || undefined };
      const r = await apiFetch("/api/k8s/test", { method: "POST", body });
      setTestResult(r);
      if (r.operators?.length === 1) setOperator(r.operators[0]);
      if (!r.kubernetes.ok) toast.error(r.kubernetes.message);
    } catch (e) {
      toast.error("Test failed: " + e.message);
    }
    setBusy(false);
  }

  async function saveAndContinue() {
    setBusy(true);
    try {
      let id = connectionId;
      if (!id) {
        if (!conn.name.trim()) {
          toast.warning("Give the connection a name so you can recognise it later.");
          setBusy(false);
          return;
        }
        const r = await apiFetch("/api/k8s/connections", {
          method: "POST",
          body: conn,
        });
        id = r.id;
        setConnectionId(id);
        await loadConnections();
      }
      await loadNamespaces(id);
      setStep(2);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  }

  async function loadNamespaces(id) {
    const r = await apiFetch(`/api/k8s/connections/${id}/namespaces`);
    setNamespaces(r.namespaces || []);
    setNamespaceSource(r.source);
    if (r.source === "restricted") {
      toast.info("This token cannot list namespaces. Type the namespace name instead.");
    }
  }

  async function loadInstallations() {
    if (!namespace.trim()) {
      toast.warning("Choose or type a namespace first.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch(
        `/api/k8s/connections/${connectionId}/installations?namespace=${encodeURIComponent(namespace)}&operator=${operator}`,
      );
      setInstallations(r.installations || []);
      if (!r.installations?.length) {
        toast.warning(
          "No ClickHouse® installations found in that namespace. The operator may not be watching it.",
        );
      }
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  }

  async function doImport(acknowledgeCredentialFailure = false) {
    if (!endpoint.trim()) {
      toast.warning("A reachable ClickHouse® address is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch("/api/k8s/import", {
        method: "POST",
        body: {
          connectionId,
          namespace,
          installation,
          operator,
          displayName,
          endpoint,
          port,
          secure,
          chUser,
          chPassword,
          acknowledgeCredentialFailure,
        },
      });

      // Nothing was created.
      if (r.needsConfirmation) {
        setCredentialWarning(r.credentialCheck);
        setBusy(false);
        return;
      }

      toast.success(`Added ${installation} with ${r.hosts} hosts.`);
      onImported?.(r.id);
      reset();
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  }

  function confirmWithoutCredentials() {
    setCredentialWarning(null);
    doImport(true);
  }

  function reset() {
    setStep(1);
    setInstallation("");
    setEndpoint("");
    setChUser("");
    setChPassword("");
    setDisplayName("");
    setTestResult(null);
    setCredentialWarning(null);
  }

  return (
    <div>
      <div
        className="card"
        style={{ padding: 12, marginBottom: 16, fontSize: 13 }}
      >
        <Icon className="ti ti-info-circle" /> Using ClickHouse® Cloud or hosted
        Altinity.Cloud®? Add them under <strong>Direct connection</strong>{" "}
        instead. Those are managed services, so there is no Kubernetes API for
        CHOps to read.
      </div>

      <StepHeader current={step} />

      {step === 1 && (
        <div>
          {connections.length > 0 && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Use an existing connection</label>
              <Select
                className="form-select"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
              >
                <option value="">Add a new connection</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.apiAddress})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {!connectionId && (
            <>
              <div className="form-group">
                <label className="form-label">Connection name *</label>
                <input
                  className="form-input"
                  value={conn.name}
                  onChange={(e) => setConn((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Production EKS"
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Paste the output of chops-k8s-setup.sh
                </label>
                <textarea
                  className="form-input"
                  rows={5}
                  value={pasteBlock}
                  onChange={(e) => applyPaste(e.target.value)}
                  placeholder="Paste the whole block. CHOps will pull out the three values."
                />
              </div>

              <div className="form-group">
                <label className="form-label">API address *</label>
                <input
                  className="form-input"
                  value={conn.apiAddress}
                  onChange={(e) => setConn((p) => ({ ...p, apiAddress: e.target.value }))}
                  placeholder="https://10.0.0.5:6443"
                />
              </div>

              <div className="form-group">
                <label className="form-label">CA certificate *</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={conn.caCertificate}
                  onChange={(e) =>
                    setConn((p) => ({ ...p, caCertificate: e.target.value }))
                  }
                  placeholder="-----BEGIN CERTIFICATE-----"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Token *</label>
                <input
                  className="form-input"
                  type="password"
                  value={conn.token}
                  onChange={(e) => setConn((p) => ({ ...p, token: e.target.value }))}
                />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={testConnection} disabled={busy}>
              Test connection
            </button>
            <button className="btn btn-primary" onClick={saveAndContinue} disabled={busy}>
              Continue
            </button>
          </div>

          <TestResult result={testResult} />
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="form-group">
            <label className="form-label">Operator *</label>
            <Select
              className="form-select"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            >
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.short})
                  {o.earlyAccess ? " - early access" : ""}
                </option>
              ))}
            </Select>
            {operators.find((o) => o.id === operator)?.earlyAccess && (
              <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>
                Early access. This operator's API is at v1alpha1, which means it
                may change without a deprecation cycle. We track it and will
                update, so a future operator release could need a CHOps update to
                match.
              </div>
            )}
            {testResult?.operators?.length > 1 && (
              <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>
                Both operators are installed in this cluster. Choose the one that
                manages the installation you are adding.
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Namespace *</label>
            {namespaceSource === "restricted" || !namespaces.length ? (
              <input
                className="form-input"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder="production"
              />
            ) : (
              <Select
                className="form-select"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
              >
                <option value="">Choose a namespace</option>
                {namespaces.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <button className="btn btn-secondary" onClick={loadInstallations} disabled={busy}>
            Find installations
          </button>

          {installations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label className="form-label">Installation *</label>
              <table className="data-table" style={{ width: "100%", marginTop: 6 }}>
                <thead>
                  <tr>
                    <th />
                    <th>Name</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Hosts</th>
                  </tr>
                </thead>
                <tbody>
                  {installations.map((i) => (
                    <tr key={i.name}>
                      <td>
                        <input
                          type="radio"
                          name="installation"
                          checked={installation === i.name}
                          onChange={() => {
                            setInstallation(i.name);
                            setDisplayName(i.name);
                          }}
                        />
                      </td>
                      <td>{i.name}</td>
                      <td>{i.status ?? "unknown"}</td>
                      <td>{i.version ?? "-"}</td>
                      <td>{i.hosts ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep(3)}
              disabled={!installation}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="card" style={{ padding: 12, marginBottom: 16, fontSize: 13 }}>
            CHOps runs outside your cluster, so the addresses Kubernetes uses
            internally will not resolve. Enter the address you use to reach
            ClickHouse® from outside: a load balancer, or a private link
            endpoint.
            <br />
            <br />
            If ClickHouse® is not exposed outside the cluster, this will not
            work. Either expose it, or run CHOps inside the cluster.
          </div>

          <div className="form-group">
            <label className="form-label">ClickHouse® address *</label>
            <input
              className="form-input"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="clickhouse.example.com"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Port</label>
              <input
                className="form-input"
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 8443)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">TLS</label>
              <Select
                className="form-select"
                value={secure ? "yes" : "no"}
                onChange={(e) => setSecure(e.target.value === "yes")}
              >
                <option value="yes">Enabled</option>
                <option value="no">Disabled</option>
              </Select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep(4)}
              disabled={!endpoint.trim()}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div className="form-group">
            <label className="form-label">Display name</label>
            <input
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={installation}
            />
          </div>

          <div className="form-group">
            <label className="form-label">ClickHouse® user *</label>
            <input
              className="form-input"
              value={chUser}
              onChange={(e) => setChUser(e.target.value)}
              placeholder="chops"
            />
            <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>
              Do not use the default user. The operator restricts it to the
              cluster's own pods, so a connection from here is refused and the
              refusal looks like a wrong password. Use
              clickhouse-user-setup.sql to create a dedicated user.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={chPassword}
              onChange={(e) => setChPassword(e.target.value)}
            />
            <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>
              Entered once for the whole installation. Every host inherits it,
              which is what keeps things working when the cluster is scaled.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setStep(3)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => doImport()} disabled={busy}>
              {busy ? "Adding..." : "Add cluster"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!credentialWarning}
        tone="danger"
        title="ClickHouse® credentials did not work"
        message={credentialWarning?.message}
        detail={
          "The cluster can still be added. Kubernetes screens will work, which is what you need while diagnosing this. The SQL editor, dashboards, alerts and backups will not work until the credentials are fixed, which you can do by editing the cluster afterwards.\n\n" +
          (credentialWarning?.detail ?? "")
        }
        confirmLabel="Add anyway"
        cancelLabel="Go back and fix"
        onConfirm={confirmWithoutCredentials}
        onCancel={() => setCredentialWarning(null)}
      />
    </div>
  );
}
