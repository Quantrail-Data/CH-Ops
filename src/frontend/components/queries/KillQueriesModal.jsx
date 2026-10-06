// KillQueriesModal.jsx - confirm, run and verify a kill of one or more queries
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

// One statement per id, never a predicate, so a kill cannot catch a newer query.

// The kill response says nothing, so success comes from re-reading processes.

import React, { useEffect, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import { runQuery } from "../../utils/api.js";
import {
  buildKillSql,
  diffKilled,
  isSafeQueryId,
  KILL_CONCURRENCY,
  runBounded,
  TYPED_CONFIRM_THRESHOLD,
} from "./processesModel.js";

export default function KillQueriesModal({ targets, scopeLabel, defaultSync = false, onVerify, onClose, onFinished }) {
  const [phase, setPhase] = useState("confirm"); // confirm | running | done
  const [sync, setSync] = useState(!!defaultSync);
  const [typed, setTyped] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const cancelled = useRef(false);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && phase !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  // Re-checked here: query_id is client-settable in ClickHouse.
  const ids = targets.map((t) => t.query_id).filter(isSafeQueryId);
  const rejected = targets.length - ids.length;

  const needsTyped = ids.length >= TYPED_CONFIRM_THRESHOLD;
  const confirmWord = String(ids.length);
  const canConfirm = ids.length > 0 && (!needsTyped || typed.trim() === confirmWord);

  async function execute() {
    setPhase("running");
    setProgress({ done: 0, total: ids.length });

    const outcomes = await runBounded(
      ids,
      (id) => runQuery(buildKillSql(id, { sync })),
      {
        limit: KILL_CONCURRENCY,
        onProgress: (done, total) => {
          if (!cancelled.current) setProgress({ done, total });
        },
      },
    );

    const failed = outcomes.filter((o) => !o.ok);

    // ASYNC returns as soon as the flag is set, so give them a moment to notice.
    await new Promise((r) => setTimeout(r, 600));

    let gone = [];
    let stillRunning;
    try {
      const fresh = await onVerify();
      ({ gone, stillRunning } = diffKilled(ids, fresh));
    } catch {
      // Unknown. Say so rather than claim success.
      gone = [];
      stillRunning = [];
    }

    if (cancelled.current) return;
    setResult({ requested: ids.length, gone, stillRunning, failed, verified: gone.length + stillRunning.length > 0 });
    setPhase("done");
    onFinished?.();
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={phase === "running" ? undefined : onClose} style={{ zIndex: 1400 }}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: "92%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Icon className="ti ti-alert-triangle" style={{ color: "var(--color-danger)" }} />
          <span style={{ fontWeight: 600 }}>
            {phase === "done" ? "Kill result" : `Kill queries (${sync ? "SYNC" : "ASYNC"})`}
          </span>
          {phase !== "running" && (
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onClose}>
              <Icon className="ti ti-x" />
            </button>
          )}
        </div>

        {phase === "confirm" && (
          <>
            <p style={{ fontSize: 14, marginBottom: 10 }}>
              Kill <strong>{ids.length.toLocaleString()}</strong>{" "}
              {ids.length === 1 ? "query" : "queries"} {scopeLabel}.
            </p>

            <div
              className="alert-banner info"
              style={{ marginBottom: 12, fontSize: 12, alignItems: "flex-start" }}
            >
              <Icon className="ti ti-info-circle" />
              <span>
                Only the queries listed here are killed, each by its own id. Anything started since
                the last refresh is not affected, so you may need to run this again.
              </span>
            </div>

            {rejected > 0 && (
              <div className="alert-banner warning" style={{ marginBottom: 12, fontSize: 12 }}>
                <Icon className="ti ti-alert-triangle" />
                <span>
                  {rejected} {rejected === 1 ? "query was" : "queries were"} skipped: the id contains
                  characters that are not safe to send.
                </span>
              </div>
            )}

            <div
              style={{
                maxHeight: 140,
                overflow: "auto",
                fontFamily: "var(--font-code, monospace)",
                fontSize: 11,
                color: "var(--text-muted)",
                border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
                borderRadius: 6,
                padding: 8,
                marginBottom: 12,
              }}
            >
              {targets.slice(0, 40).map((t) => (
                <div key={t.query_id} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.user} {t.query_id}
                </div>
              ))}
              {targets.length > 40 && <div>and {targets.length - 40} more</div>}
            </div>

            <fieldset
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm, 6px)",
                padding: "8px 12px 10px",
                marginBottom: 12,
              }}
            >
              <legend style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 4px" }}>Mode</legend>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, cursor: "pointer", marginBottom: 6 }}>
                <input type="radio" name="kill-mode" checked={!sync} onChange={() => setSync(false)} />
                <span>
                  <strong>ASYNC</strong>
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    flags each query and returns at once. The result below comes from re-reading
                    system.processes afterwards.
                  </span>
                </span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, cursor: "pointer" }}>
                <input type="radio" name="kill-mode" checked={sync} onChange={() => setSync(true)} />
                <span>
                  <strong>SYNC</strong>
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    holds each request open until the query has actually stopped.
                    {ids.length > 1 &&
                      ` With ${ids.length.toLocaleString()} targets that waits on every one and will take a while.`}
                    {" "}A query stuck in an uninterruptible stage can hold its request open for a long time.
                  </span>
                </span>
              </label>
            </fieldset>

            {needsTyped && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Type <strong>{confirmWord}</strong> to confirm
                </label>
                <input
                  className="form-input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmWord}
                  autoFocus
                  style={{ width: 140 }}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={execute}
                disabled={!canConfirm}
                style={!canConfirm ? { opacity: 0.4, cursor: "not-allowed" } : {}}
              >
                <Icon className="ti ti-player-stop" /> Kill {ids.length.toLocaleString()}{" "}
                {sync ? "(SYNC)" : "(ASYNC)"}
              </button>
            </div>
          </>
        )}

        {phase === "running" && (
          <>
            <p style={{ fontSize: 14, marginBottom: 10 }}>
              Killing {progress.done.toLocaleString()} of {progress.total.toLocaleString()}...
            </p>
            <div style={{ height: 8, background: "var(--bg-page)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: 8, width: `${pct}%`, background: "var(--color-danger)", transition: "width .2s" }} />
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              {KILL_CONCURRENCY} at a time, {sync ? "SYNC" : "ASYNC"}. Refresh is paused until this finishes.
            </p>
          </>
        )}

        {phase === "done" && result && (
          <>
            {!result.verified ? (
              <div className="alert-banner warning" style={{ marginBottom: 12, fontSize: 13 }}>
                <Icon className="ti ti-alert-triangle" />
                <span>
                  {result.requested.toLocaleString()} kill requests were sent, but the follow-up
                  check did not complete, so the outcome is unconfirmed. Refresh to see the current
                  state.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <Stat label="Requested" value={result.requested} />
                <Stat label="Gone" value={result.gone.length} tone="success" />
                <Stat label="Still running" value={result.stillRunning.length} tone={result.stillRunning.length ? "danger" : undefined} />
              </div>
            )}

            {result.verified && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                Sent as {sync ? "SYNC" : "ASYNC"}. Gone counts queries no longer in
                system.processes, and some of those may have finished on their own rather than been
                killed.
              </p>
            )}

            {result.stillRunning.length > 0 && (
              <div className="alert-banner warning" style={{ marginBottom: 12, fontSize: 12 }}>
                <Icon className="ti ti-alert-triangle" />
                <span>
                  {result.stillRunning.length} still running. A query can only stop at a
                  cancellation point, so one in an uninterruptible stage may take longer or refuse.
                </span>
              </div>
            )}

            {result.failed.length > 0 && (
              <div
                style={{
                  maxHeight: 120,
                  overflow: "auto",
                  fontSize: 11,
                  color: "var(--color-danger)",
                  marginBottom: 12,
                }}
              >
                {result.failed.slice(0, 10).map((f) => (
                  <div key={f.item}>
                    {f.item}: {f.error}
                  </div>
                ))}
                {result.failed.length > 10 && <div>and {result.failed.length - 10} more</div>}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color =
    tone === "success" ? "var(--color-success, #34d399)" : tone === "danger" ? "var(--color-danger)" : "var(--text-primary)";
  return (
    <div style={{ flex: 1, minWidth: 110, background: "var(--bg-page)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 600, color }}>{value.toLocaleString()}</div>
    </div>
  );
}
