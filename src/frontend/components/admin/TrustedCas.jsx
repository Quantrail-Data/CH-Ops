// TrustedCas.jsx - manage the certificate authorities CHOps trusts.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import { useAuth } from "../../App.jsx";

export default function TrustedCas() {
  const toast = useToast();
  const [cas, setCas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pem, setPem] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [usage, setUsage] = useState(null);
  const { auth } = useAuth();

  const isAdmins = () => auth?.role !== "readonly" && auth?.role !== "editor";

  useEffect(() => {
    if (isAdmins()) {
      load();
    } else {
      setLoading(false);
    }
  }, []);

  async function load() {
    try {
      setCas(await apiFetch("/api/trusted-cas"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    setBusy(true);
    try {
      setCas(
        await apiFetch("/api/trusted-cas", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), pem }),
        }),
      );
      setAdding(false);
      setName("");
      setPem("");
      toast.success("Certificate authority added.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      setCas(await apiFetch(`/api/trusted-cas/${id}`, { method: "DELETE" }));
      setDeleting(null);
      toast.success("Removed.");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function checkUsage(ca) {
    setUsage({ name: ca.name, loading: true });
    try {
      setUsage({
        ...(await apiFetch(`/api/trusted-cas/${ca.id}/usage`)),
        loading: false,
      });
    } catch (err) {
      setUsage(null);
      toast.error(err.message);
    }
  }

    if (!isAdmins()) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
           <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="icon icon-tabler icons-tabler-outline icon-tabler-certificate"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M12 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
              <path d="M13 17.5v4.5l2 -1.5l2 1.5v-4.5" />
              <path d="M10 19h-5a2 2 0 0 1 -2 -2v-10c0 -1.1 .9 -2 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -1 1.73" />
              <path d="M6 9l12 0" />
              <path d="M6 12l3 0" />
              <path d="M6 15l2 0" />
            </svg> Trusted Certificate Authorities
          </h2>
        </div>
        <div className="alert-banner info" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-lock"></Icon>
          <span>
            Trusted Certificate Authorities is only available for
            administrators.
          </span>
        </div>
        <div className="empty-state" style={{height:"50vh" }}>
          <Icon className="ti ti-lock"></Icon>
          <p>
            <span>
              Trusted Certificate Authorities is only available for
              administrators.
            </span>
          </p>
        </div>
      </div>
    );
  }


  if (loading)
    return (
      <div className="page-content">
        <div className="loading-spinner" />
      </div>
    );

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-contract" /> Trusted certificate authorities
        </h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setAdding(true)}
        >
          <Icon className="ti ti-plus" /> Add
        </button>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          marginBottom: 20,
          maxWidth: 700,
        }}
      >
        Add your organisation's certificate authority here if ClickHouse uses
        HTTPS with a certificate you issued yourself. Without it, CHOps cannot
        verify the connection and reports "unable to verify the first
        certificate". These are added to the authorities your system already
        trusts, so public certificates keep working.
      </p>

      {!cas.length && (
        <div className="empty-state" style={{ padding: 40 ,height:"60vh"}}>
          No certificate authorities added. CHOps uses the system list only.
        </div>
      )}

      {cas.map((ca) => (
        <div
          key={ca.id}
          className="card"
          style={{ padding: 16, marginBottom: 12 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{ca.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <div>Subject: {ca.subject}</div>
                <div>Fingerprint: {ca.fingerprint?.slice(0, 32)}...</div>
                <div>
                  Expires: {ca.notAfter}{" "}
                  {ca.daysUntilExpiry != null && (
                    <strong
                      style={{
                        color:
                          ca.daysUntilExpiry < 30 ? "var(--danger)" : "inherit",
                      }}
                    >
                      ({ca.daysUntilExpiry} days)
                    </strong>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => checkUsage(ca)}
              >
                Which clusters use this
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setDeleting(ca)}
              >
                <Icon className="ti ti-trash" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {adding && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 640, width: "94%" }}>
            <div style={{ fontWeight: 600, marginBottom: 14 }}>
              Add a certificate authority
            </div>

            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                style={{ width: "100%" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Internal CA"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Certificate</label>
              <textarea
                className="form-input"
                rows={10}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
                value={pem}
                onChange={(e) => setPem(e.target.value)}
                placeholder={
                  "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                }
              />
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                Paste the whole block, including the BEGIN and END lines. This
                must be the certificate authority, not the server certificate.
              </div>
            </div>

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={busy || !name.trim() || !pem.trim()}
                onClick={add}
              >
                {busy ? "Checking..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {usage && (
        <div className="modal-overlay" onClick={() => setUsage(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 520, width: "94%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              Clusters using {usage.name}
            </div>
            {usage.loading ? (
              <div className="loading-spinner" />
            ) : (
              <>
                {usage.results?.map((r) => (
                  <div
                    key={r.cluster}
                    style={{ fontSize: 13, marginBottom: 6 }}
                  >
                    <strong>{r.cluster}</strong>
                    {": "}
                    {r.status === "uses-this" && "uses this authority"}
                    {r.status === "other" &&
                      `uses a different one (${r.issuer || "unknown"})`}
                    {r.status === "not-tls" && "not using TLS"}
                    {r.status === "unreachable" && "could not be reached"}
                  </div>
                ))}
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 12,
                  }}
                >
                  Only clusters that responded are listed accurately. One that
                  is down shows as unreachable, not as unaffected.
                </p>
              </>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setUsage(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <ConfirmModal
          title="Remove this certificate authority?"
          message={`"${deleting.name}" will no longer be trusted. Any cluster whose certificate it signed will stop connecting until it is added again. Use the usage check first if you are unsure.`}
          confirmText="Remove"
          onConfirm={() => remove(deleting.id)}
          onCancel={() => setDeleting(null)}
          danger
        />
      )}
    </div>
  );
}
