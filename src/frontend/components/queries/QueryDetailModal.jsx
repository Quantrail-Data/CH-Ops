// QueryDetailModal.jsx - everything system.processes knows about one query
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Centred modal, not a side panel, so the table does not resize when it opens.

// Heavy columns are fetched here: processes, then query_log, then the preview.

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import { OPEN_IN_DESTINATIONS } from "./OpenInMenu.jsx";
import { useToast } from "../layout/Toast.jsx";
import { runQuery } from "../../utils/api.js";
import {
  buildFullQuerySql,
  buildQueryLogFallbackSql,
  httpMethodName,
  interfaceName,
} from "./processesModel.js";
import { fmtBytes, fmtDuration, fmtPercent, fmtRows } from "../../utils/format.js";

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--border-default)" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          justifyContent: "flex-start",
          gap: 6,
          padding: "10px 0",
          fontWeight: 600,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-secondary)",
        }}
      >
        <Icon className={`ti ${open ? "ti-chevron-down" : "ti-chevron-right"}`} />
        {title}
      </button>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  );
}

function Field({ label, value, mono }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 12, alignItems: "baseline" }}>
      <span style={{ color: "var(--text-muted)", minWidth: 120, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: "var(--text-primary)",
          fontFamily: mono ? "var(--font-code, monospace)" : undefined,
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MapTable({ data, emptyLabel }) {
  const entries = data && typeof data === "object" ? Object.entries(data) : [];
  if (!entries.length) return <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{emptyLabel}</div>;
  return (
    <div style={{ maxHeight: 240, overflow: "auto" }}>
      <table className="data-table" style={{ fontSize: 12 }}>
        <tbody>
          {entries
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => (
              <tr key={k}>
                <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{k}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {typeof v === "number" ? v.toLocaleString("en-US") : String(v)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QueryDetailModal({ row, onClose, onKill, canKill }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [openIn, setOpenIn] = useState("");
  const [detail, setDetail] = useState(null);
  const [source, setSource] = useState(null); // processes | query_log | preview
  const [loading, setLoading] = useState(false);

  const queryId = row?.query_id;

  const load = useCallback(async () => {
    if (!queryId) return;
    setLoading(true);
    setDetail(null);
    setSource(null);
    try {
      const live = await runQuery(buildFullQuerySql(queryId), { readOnly: true });
      if (live?.rows?.length) {
        setDetail(live.rows[0]);
        setSource("processes");
        return;
      }
      const logged = await runQuery(buildQueryLogFallbackSql(queryId), { readOnly: true });
      if (logged?.rows?.length) {
        setDetail(logged.rows[0]);
        setSource("query_log");
        return;
      }
      setSource("preview");
    } catch {
      // Not fatal, the preview is still worth showing.
      setSource("preview");
    } finally {
      setLoading(false);
    }
  }, [queryId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;

  const text = detail?.query || row.query_preview || "";
  const isPreviewOnly = source === "preview" || (!detail && !loading);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1350 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760, width: "94%", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-label="Query detail"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Query detail</span>
          <code
            style={{
              fontFamily: "var(--font-code, monospace)",
              fontSize: 12,
              color: "var(--accent)",
              wordBreak: "break-all",
            }}
          >
            {row.query_id}
          </code>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(text);
                  toast.success("Query text copied");
                } catch {
                  /* clipboard unavailable */
                }
              }}
              title="Copy query text"
            >
              <Icon className="ti ti-copy" />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              <Icon className="ti ti-x" />
            </button>
          </div>
        </div>

        {row.is_cancelled && (
          <div className="alert-banner warning" style={{ marginBottom: 10, fontSize: 12 }}>
            <Icon className="ti ti-alert-triangle" />
            <span>Cancellation requested. The query is winding down.</span>
          </div>
        )}

        <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
          <Section title="Query text">
            {loading ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
                Loading full text...
              </div>
            ) : (
              <>
                {isPreviewOnly && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                    This query is no longer running and was not found in the query log. Showing the
                    truncated preview captured while it was live.
                  </div>
                )}
                {source === "query_log" && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                    Finished while you were looking. Text recovered from the query log.
                  </div>
                )}
                <pre
                  className="profiler-popup-code"
                  style={{
                    maxHeight: 260,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: 12,
                    margin: 0,
                  }}
                >
                  {text || "(query text not available)"}
                </pre>
              </>
            )}
          </Section>

          <Section title="Progress and resources">
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                <span>Progress</span>
                <span>
                  {row.progress === null
                    ? "unknown"
                    : `${fmtPercent(row.progress, 1)} of ~${fmtRows(row.total_rows_approx)} rows`}
                </span>
              </div>
              <div style={{ height: 6, background: "var(--bg-page)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: 6,
                    width: row.progress === null ? "100%" : `${Math.round(row.progress * 100)}%`,
                    background: row.progress === null ? "var(--border-default)" : "var(--color-success, #34d399)",
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
            <Field label="Elapsed" value={fmtDuration(row.elapsed)} />
            <Field label="Memory" value={fmtBytes(row.memory_usage)} />
            <Field label="Peak memory" value={fmtBytes(row.peak_memory_usage)} />
            <Field label="Read" value={`${fmtRows(row.read_rows)} rows, ${fmtBytes(row.read_bytes)}`} />
            <Field
              label="Written"
              value={
                row.written_rows || row.written_bytes
                  ? `${fmtRows(row.written_rows)} rows, ${fmtBytes(row.written_bytes)}`
                  : null
              }
            />
            <Field label="Peak threads" value={row.peak_threads_usage || null} />
            <Field
              label="Thread count"
              value={Array.isArray(detail?.thread_ids) ? detail.thread_ids.length : null}
            />
          </Section>

          <Section title="Identity">
            <Field label="User" value={row.user} />
            <Field label="Kind" value={row.query_kind} />
            <Field label="Database" value={row.current_database} />
            <Field label="Internal" value={row.is_internal ? "yes" : null} />
            <Field label="All data sent" value={String(row.is_all_data_sent) === "1" ? "yes" : null} />
          </Section>

          <Section title="Client" defaultOpen={false}>
            <Field label="Address" value={row.address} mono />
            <Field label="Port" value={row.port} />
            <Field label="Interface" value={interfaceName(row.interface)} />
            <Field label="HTTP method" value={row.interface === 2 ? httpMethodName(row.http_method) : null} />
            <Field label="OS user" value={row.os_user} />
            <Field label="Client host" value={row.client_hostname} />
            <Field label="Client name" value={row.client_name} />
            <Field label="Agent" value={row.client_agent} />
            <Field label="User agent" value={row.http_user_agent} />
            <Field label="Forwarded for" value={row.forwarded_for} />
            <Field label="Quota key" value={row.quota_key} />
          </Section>

          <Section title="Distributed" defaultOpen={false}>
            <Field label="Initial query" value={row.is_initial_query ? "yes" : "no"} />
            <Field label="Initial user" value={row.initial_user} />
            <Field label="Initial id" value={row.initial_query_id} mono />
            <Field label="Initial address" value={row.initial_address} mono />
            <Field label="Depth" value={row.distributed_depth} />
          </Section>

          <Section title="ProfileEvents" defaultOpen={false}>
            <MapTable
              data={detail?.ProfileEvents}
              emptyLabel={loading ? "Loading..." : "Not available for this query."}
            />
          </Section>

          <Section title="Settings" defaultOpen={false}>
            <MapTable
              data={detail?.Settings}
              emptyLabel={loading ? "Loading..." : "No user-level settings were modified."}
            />
          </Section>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            paddingTop: 12,
            marginTop: 4,
            borderTop: "1px solid var(--border-default)",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Select
            value={openIn}
            onChange={(e) => setOpenIn(e.target.value)}
            aria-label="Open this query in"
            style={{ width: 190 }}
          >
            <option value="">Open in...</option>
            {OPEN_IN_DESTINATIONS.map((d) => (
              <option key={d.key} value={d.route}>
                {d.label}
              </option>
            ))}
          </Select>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!openIn}
            style={!openIn ? { opacity: 0.4, cursor: "not-allowed" } : {}}
            onClick={() => {
              if (!openIn) return;
              navigate(`/${openIn}?qid=${encodeURIComponent(row.query_id)}`);
              onClose();
            }}
          >
            <Icon className="ti ti-external-link" /> Open
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {canKill && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                async returns at once, sync waits for the query to stop
              </span>
            )}
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onKill(row, { sync: false })}
              disabled={!canKill}
              style={!canKill ? { opacity: 0.35, cursor: "not-allowed" } : {}}
              title={canKill ? "Send the kill and return immediately" : "Admin access required"}
            >
              <Icon className="ti ti-player-stop" /> Kill async
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onKill(row, { sync: true })}
              disabled={!canKill}
              style={!canKill ? { opacity: 0.35, cursor: "not-allowed" } : {}}
              title={canKill ? "Wait until the query has actually stopped" : "Admin access required"}
            >
              <Icon className="ti ti-player-stop" /> Kill sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
