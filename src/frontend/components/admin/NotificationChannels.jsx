// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Configures and displays the delivery channels (e.g., Email, Slack) for system alerts.

import { useEffect, useState } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import { useAuth } from "../../App.jsx";
import useEmptyContainerHeight from "../../hooks/useEmptyContainerHeight.js";
import { Button, Input, FormField, Notice } from "../ui/index.jsx";


const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };
const TYPES = [
  {
    key: "email",
    label: "Email (SMTP)",
    icon: "ti-mail",
    fields: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "from", "to"],
  },
  {
    key: "slack",
    label: "Slack",
    icon: "ti-brand-slack",
    fields: ["bot_token", "channel_id"],
  },
  {
    key: "google_chat",
    label: "Google Chat",
    icon: "ti-message-circle",
    fields: ["webhook_url"],
  },
  {
    key: "teams",
    label: "Microsoft Teams",
    icon: "ti-brand-teams",
    fields: ["webhook_url"],
  },
  {
    key: "pagerduty",
    label: "PagerDuty",
    icon: "ti-bell-ringing",
    fields: ["routing_key"],
  },
];

const LABELS = {
  smtp_host: "SMTP Host",
  smtp_port: "SMTP Port",
  smtp_user: "SMTP User",
  smtp_pass: "SMTP Password",
  from: "From",
  to: "To (comma-sep)",
  bot_token: "Bot Token",
  channel_id: "Channel ID",
  webhook_url: "Webhook URL",
  routing_key: "Integration Key",
};

export default function NotificationChannels({mainRef}) {
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [channels, setChannels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [result, setResult] = useState(null);
  const [f, setF] = useState({
    name: "",
    type: "email",
    config: {},
    enabled: true,
  });
  const [showKey, setShowKey] = useState(false);

    // calculate the Height of application main container app-main
  const {memoHeightAppMain} = useEmptyContainerHeight(900,mainRef)


  async function load() {
    try {
      const r = await apiFetch("/api/alerts/channels");
      setChannels(Array.isArray(r) ? r : []);
    } catch {
      // Keep the current data when the request fails.
    }
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);

  function reset() {
    setF({ name: "", type: "email", config: {}, enabled: true });
    setEditing(null);
  }

  async function save() {
    try {
      if (editing) {
        await apiFetch(`/api/alerts/channels/${editing}`, {
          method: "PUT",
          body: JSON.stringify(f),
        });
        setResult({ ok: true, msg: "Updated" });
      } else {
        await apiFetch("/api/alerts/channels", {
          method: "POST",
          body: JSON.stringify(f),
        });
        setResult({ ok: true, msg: "Created" });
      }
      reset();
      setShowForm(false);
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
  }

  async function remove(id) {
    try {
      await apiFetch(`/api/alerts/channels/${id}`, {
        method: "DELETE",
        body: {},
      });
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    setDel(null);
  }

  async function test(id) {
    try {
      const r = await apiFetch(`/api/alerts/channels/${id}/test`, {
        method: "POST",
      });
      setResult(
        r.ok
          ? { ok: true, msg: "Test sent." }
          : { ok: false, msg: `Test failed: ${r.error}` },
      );
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
  }

  const selType = TYPES.find((t) => t.key === f.type) || TYPES[0];

  if (!loaded) {
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner"></div> Loading...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
            <Icon className="ti ti-send"></Icon> Notification Channels
          </h2>
        </div>
        <Notice tone="info" icon="ti-lock" style={{ marginBottom: 14 }}>
          <span>
            Alert channels management is only available for administrators.
          </span>
        </Notice>
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>Alert channels management is only available for administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-send"></Icon> Notification Channels
        </h2>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <Button variant="secondary" size="sm" onClick={load}>
            <Icon className="ti ti-refresh"></Icon>
          </Button>
          <Button
            variant="primary" size="sm"
            onClick={() => {
              reset();
              setShowForm(!showForm);
            }}
          >
            <Icon className={`ti ${showForm ? "ti-x" : "ti-plus"}`}></Icon>{" "}
            {showForm ? "Cancel" : "New"}
          </Button>
        </div>
      </div>
      {result && (
        <Notice
          tone={result.ok ? "success" : "danger"}
          icon={result.ok ? "ti-check" : "ti-alert-circle"}
          onDismiss={() => setResult(null)}
          style={{ marginBottom: 14 }}
        >
          {result.msg}
        </Notice>
      )}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <FormField label="Name">
              <Input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </FormField>
            <FormField label="Type">
              <Select
                className="form-select"
                value={f.type}
                onChange={(e) =>
                  setF({ ...f, type: e.target.value, config: {} })
                }
              >
                {TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
              gap: 14,
              marginBottom: 14,
            }}
          >
            {selType.fields.map((fld) => (
              <FormField label={<>{LABELS[fld] || fld}</>} key={fld}>
                <div
                  style={
                    fld.includes("pass") ||
                    fld.includes("token") ||
                    fld.includes("key")
                      ? { position: "relative", width: "100%", maxWidth: 520 }
                      : {}
                  }
                >
                  <Input
                    style={{
                      width: "100%",
                      fontFamily: "var(--font-code)",
                      fontSize: "0.875rem",
                      paddingRight: "46px",
                    }}
                    type={
                      (fld.includes("pass") ||
                        fld.includes("token") ||
                        fld.includes("key")) &&
                      !showKey
                        ? "password"
                        : "text"
                    }
                    value={f.config[fld] || ""}
                    onChange={(e) =>
                      setF((p) => ({
                        ...p,
                        config: { ...p.config, [fld]: e.target.value },
                      }))
                    }
                  />
                  {(fld.includes("pass") ||
                    fld.includes("token") ||
                    fld.includes("key")) && (
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? "Hide" : "Show"}
                      style={{
                        position: "absolute",
                        right: "14px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        margin: 0,
                        lineHeight: 1,
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2,
                      }}
                    >
                      {showKey ? (
                        <Icon
                          className="ti ti-eye-off"
                          style={{ fontSize: "1.25rem" }}
                        />
                      ) : (
                        <Icon className="ti ti-eye" style={{ fontSize: "1.25rem" }} />
                      )}
                    </button>
                  )}
                </div>
              </FormField>
            ))}
          </div>
          <Button variant="primary" onClick={save} disabled={!f.name}>
            <Icon className="ti ti-device-floppy"></Icon>{" "}
            {editing ? "Update" : "Create"}
          </Button>
        </div>
      )}
      {channels.length === 0 ? (
         <div className="empty-state" style={{ padding: 40,height:`${memoHeightAppMain}px`}}>
          <Icon className="ti ti-mail-forward" style={{ fontSize: "2.25rem" }}></Icon>
          <p>No channels yet.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(350px,1fr))",
            gap: 14,
          }}
        >
          {channels.map((ch) => {
            const ti = TYPES.find((t) => t.key === ch.type);
            const cfg = typeof ch.config === "object" ? ch.config : {};
            return (
              <div
                key={ch.id}
                className="card"
                style={{ padding: 16, overflow: "auto" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <Icon
                    className={`ti ${ti?.icon || "ti-send"}`}
                    style={{ fontSize: "1.25rem", color: "var(--accent)" }}
                  ></Icon>
                  <strong>{ch.name}</strong>
                </div>
                <span
                  className={`badge ${ch.enabled ? "badge-green" : "badge-gray"}`}
                  style={{ margin: "0px 0px 15px 0px" }}
                >
                  {ch.enabled ? "Active" : "Disabled"}
                </span>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                    marginBottom: 10,
                  }}
                >
                  Type: {ti?.label || ch.type}
                </div>
                {ch.lastTestAt && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginBottom: 8,
                    }}
                  >
                    Last test:{" "}
                    {ch.lastTestOk ? (
                      <span style={{ color: "var(--color-success)" }}>OK</span>
                    ) : (
                      <span style={{ color: "var(--color-danger)" }}>
                        {ch.lastTestError || "Failed"}
                      </span>
                    )}{" "}
                    at {new Date(ch.lastTestAt).toLocaleString()}
                  </div>
                )}
                {ch?.lastSendAt && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginTop: 8,
                    }}
                  >
                    Last notification:{" "}
                    {ch.lastTestOk ? (
                      <span style={{ color: "var(--color-success)" }}>OK</span>
                    ) : (
                      <span style={{ color: "var(--color-danger)" }}>FAIL</span>
                    )}
                    {new Date(ch?.lastSendAt).toLocaleString()}
                  </div>
                )}

                {ch?.lastSendError && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-danger)",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 8px",
                      marginTop: 6,
                      overflowWrap: "anywhere",
                    }}
                  >
                    <strong>Last notification failed:</strong>{" "}
                    {ch?.lastSendError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <Button
                    variant="secondary" size="sm"
                    onClick={() => {
                      setF({
                        name: ch.name,
                        type: ch.type,
                        config: cfg,
                        enabled: ch.enabled,
                      });
                      setEditing(ch.id);
                      setShowForm(true);
                    }}
                  >
                    <Icon className="ti ti-edit"></Icon>
                  </Button>
                  <Button
                    variant="secondary" size="sm"
                    onClick={() => test(ch.id)}
                  >
                    <Icon className="ti ti-send"></Icon> Test
                  </Button>
                  <Button
                    variant="danger" size="sm"
                    onClick={() => setDel(ch.id)}
                  >
                    <Icon className="ti ti-trash"></Icon>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {del && (
        <ConfirmModal
          title="Delete Channel"
          message="Delete this channel?"
          onConfirm={() => remove(del)}
          onCancel={() => setDel(null)}
          danger
        />
      )}
    </div>
  );
}
