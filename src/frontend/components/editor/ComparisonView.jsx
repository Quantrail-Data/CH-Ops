// ComparisonView - Side-by-side query comparison page
//
// Left = current query, right = experimental rewrite. Each side independently
// runs Estimate (shows that one query's cost estimate, no comparison) or Execute
// (runs the query and shows up to a capped number of result rows). A separate
// Compare action estimates BOTH queries together and shows the side-by-side
// metric comparison. The whole view runs under its own per-user ClickHouse®
// credentials (a compact connect step), independent of the main editor, and
// supports a fullscreen mode. Only SELECT queries are allowed (enforced in
// queryCompare) because Execute really runs on the cluster.
//
// Performance: each pane and its result area are memoized, and the run handlers
// read the live SQL from refs so they keep a stable identity. Typing in one
// editor therefore re-renders only that editor, never the other pane, the
// result tables, or the comparison panel.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import SqlInput from "./SqlInput.jsx";
import ComparisonMetrics from "./ComparisonMetrics.jsx";
import CostEstimatePanel from "./CostEstimatePanel.jsx";
import ModeSelect from "./ModeSelect.jsx";
import DataTable from "../layout/DataTable.jsx";
import Icon from "../common/Icon.jsx";
import { useConnection } from "../../App.jsx";
import {
  runEditorQuery,
  editorConnectionStatus,
  editorDisconnect,
} from "../../utils/api.js";
import {
  estimateOne,
  executeOne,
  loadAcWords,
} from "../../utils/queryCompare.js";

// Keep at most this many result rows in the DOM, and show roughly ten at a time
// inside a scrollable area (vertical scroll for the rest, horizontal for width).
// Height = header (~37px) + 10 data rows (~35px each).
const RESULT_MAX_ROWS = 100;
const RESULT_MAX_HEIGHT = "390px";

// Memoized result area for one side: estimate panel or execute table, or the
// matching error banner. Memoized so typing in the editor (which does not change
// `estimate`/`exec`) never re-renders the result table or the cost panel.
const PaneResults = memo(function PaneResults({ estimate, exec }) {
  return (
    <>
      {estimate && !estimate.ok && (
        <div className="alert-banner danger cmp-pane-error">
          <Icon className="ti ti-alert-circle"></Icon>
          <span>{estimate.error}</span>
        </div>
      )}
      {estimate && estimate.ok && (
        <div className="cmp-pane-estimate">
          <CostEstimatePanel estimate={estimate.raw} />
        </div>
      )}

      {exec && !exec.ok && (
        <div className="alert-banner danger cmp-pane-error">
          <Icon className="ti ti-alert-circle"></Icon>
          <span>{exec.error}</span>
        </div>
      )}
      {exec && exec.ok && (
        <div className="cmp-pane-results">
          <DataTable
            rows={exec.rows}
            columns={exec.columns}
            maxRows={RESULT_MAX_ROWS}
            maxHeight={RESULT_MAX_HEIGHT}
          />
          {exec.metrics && exec.metrics.resultRows > RESULT_MAX_ROWS && (
            <p className="cmp-rows-note">
              Results truncated to the first {RESULT_MAX_ROWS} rows (
              {exec.metrics.resultRows.toLocaleString()} total).
            </p>
          )}
        </div>
      )}
    </>
  );
});

// Memoized single side: header, editor, right-aligned action buttons, results.
// Re-renders only when its own props change, so typing in the other pane is free.
const ComparePane = memo(function ComparePane({
  side,
  title,
  sql,
  onChange,
  acWords,
  onEstimate,
  onExecute,
  busy,
  estimate,
  exec,
  connected,
}) {
  const placeholder =
    side === "left"
      ? "Paste your current query here..."
      : "Write your rewritten query here...";
  const disabled = !!busy || !sql.trim() || !connected;

  return (
    <div className={"cmp-pane cmp-pane-" + side}>
      <div className="cmp-pane-header">{title}</div>

      <SqlInput
        value={sql}
        onChange={onChange}
        acWords={acWords}
        onRun={onExecute}
        placeholder={placeholder}
      />

      <div className="cmp-pane-buttons">
        <button
          className="btn btn-secondary btn-sm"
          disabled={disabled}
          onClick={onEstimate}
        >
          {busy === "estimate" ? "Working..." : "Estimate"}
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={disabled}
          onClick={onExecute}
        >
          {busy === "execute" ? "Working..." : "Execute"}
        </button>
      </div>

      <PaneResults estimate={estimate} exec={exec} />
    </div>
  );
});

export default function ComparisonView({ mode, onModeChange }) {
  const { selectedNode, port } = useConnection();

  // Per-user editor credentials (independent of the main editor)
  const [editorCreds, setEditorCreds] = useState(null);
  const editorConnected = !!editorCreds;
  const [connUser, setConnUser] = useState("");
  const [connPassword, setConnPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState(null);

  // Live credentials in a ref so the run handlers stay stable across renders.
  const credsRef = useRef(null);
  useEffect(() => {
    credsRef.current = editorCreds;
  }, [editorCreds]);

  // Per-side query state (state for rendering, refs for stable handlers)
  const [leftSql, setLeftSql] = useState("");
  const [rightSql, setRightSql] = useState("");
  const leftSqlRef = useRef("");
  const rightSqlRef = useRef("");

  const onLeftChange = useCallback((v) => {
    leftSqlRef.current = v;
    setLeftSql(v);
  }, []);
  const onRightChange = useCallback((v) => {
    rightSqlRef.current = v;
    setRightSql(v);
  }, []);

  const [leftEstimate, setLeftEstimate] = useState(null);
  const [rightEstimate, setRightEstimate] = useState(null);
  const [leftExec, setLeftExec] = useState(null);
  const [rightExec, setRightExec] = useState(null);
  const [leftBusy, setLeftBusy] = useState(null); // 'estimate' | 'execute' | null
  const [rightBusy, setRightBusy] = useState(null);

  // Compare (both sides) + fullscreen
  const [compareData, setCompareData] = useState(null); // { left, right } | null
  const [comparing, setComparing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [acWords, setAcWords] = useState([]);


    // default cred password view flag
  const [isViewFlag, setIsViewFlag] = useState(false);

  // After a page reload the (jti, 'editor') credential session may still be live
  // server-side (it shares the 2h JWT lifetime). Restore the connected state from
  // it so the user does not have to reconnect. Never carries a password.
  useEffect(() => {
    let cancelled = false;
    editorConnectionStatus()
      .then((s) => {
        if (!cancelled && s?.connected && s.chUser) {
          setEditorCreds({ user: s.chUser });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Validate the entered credentials by running a trivial query as that user.
  async function handleConnect() {
    if (!connUser.trim()) {
      setConnError("Username is required.");
      return;
    }
    setConnecting(true);
    setConnError(null);
    const candidate = { user: connUser.trim(), password: connPassword };
    try {
      await runEditorQuery("SELECT 1", candidate);
      setEditorCreds(candidate);
    } catch (e) {
      setConnError(e.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await editorDisconnect();
    } catch {
      /* best effort; clear locally regardless */
    }
    setEditorCreds(null);
    setConnUser("");
    setConnPassword("");
    setConnError(null);
    setAcWords([]);
    setLeftEstimate(null);
    setRightEstimate(null);
    setLeftExec(null);
    setRightExec(null);
    setCompareData(null);
  }

  // Load autocomplete words once connected (under the editor credentials).
  useEffect(() => {
    if (!editorConnected) {
      setAcWords([]);
      return;
    }
    let cancelled = false;
    loadAcWords(editorCreds).then((words) => {
      if (!cancelled) setAcWords(words);
    });
    return () => {
      cancelled = true;
    };
  }, [editorConnected, editorCreds]);

  // Exit fullscreen on Escape.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Stable run handlers (read live SQL + creds from refs)
  const onEstimateLeft = useCallback(async () => {
    if (!credsRef.current) return;
    setLeftBusy("estimate");
    setLeftExec(null);
    try {
      setLeftEstimate(await estimateOne(leftSqlRef.current, credsRef.current));
    } finally {
      setLeftBusy(null);
    }
  }, []);
  const onExecuteLeft = useCallback(async () => {
    if (!credsRef.current) return;
    setLeftBusy("execute");
    setLeftEstimate(null);
    try {
      setLeftExec(await executeOne(leftSqlRef.current, credsRef.current));
    } finally {
      setLeftBusy(null);
    }
  }, []);
  const onEstimateRight = useCallback(async () => {
    if (!credsRef.current) return;
    setRightBusy("estimate");
    setRightExec(null);
    try {
      setRightEstimate(
        await estimateOne(rightSqlRef.current, credsRef.current),
      );
    } finally {
      setRightBusy(null);
    }
  }, []);
  const onExecuteRight = useCallback(async () => {
    if (!credsRef.current) return;
    setRightBusy("execute");
    setRightEstimate(null);
    try {
      setRightExec(await executeOne(rightSqlRef.current, credsRef.current));
    } finally {
      setRightBusy(null);
    }
  }, []);

  // Compare estimates BOTH queries together so the comparison is always a fresh,
  // consistent pair (this is what keeps the per-metric badges stable on re-run).
  const runCompare = useCallback(async () => {
    if (!credsRef.current) return;
    setComparing(true);
    setLeftEstimate(null);
    setRightEstimate(null);
    try {
      const [l, r] = await Promise.all([
        estimateOne(leftSqlRef.current, credsRef.current),
        estimateOne(rightSqlRef.current, credsRef.current),
      ]);
      setCompareData({ left: l, right: r });
    } finally {
      setComparing(false);
    }
  }, []);

  const canCompare =
    editorConnected && !!leftSql.trim() && !!rightSql.trim() && !comparing;

  return (
    <div className={"cmp-root" + (fullscreen ? " cmp-fullscreen" : "")}>
      {/* Toolbar: connect on the left, Compare + Fullscreen on the right. */}
      <div className="cmp-toolbar">
        <div className="cmp-toolbar-left">
          <ModeSelect mode={mode} onChange={onModeChange} />
          {!editorConnected ?(
            <>
              <span className="cmp-connect-field">
                <Icon
                  className="ti ti-user"
                  style={{ fontSize: 15, opacity: 0.55 }}
                  aria-hidden="true"
                ></Icon>
                <input
                  className="form-input"
                  style={{
                    height: 28,
                    width: 150,
                    fontSize: "12px",
                    padding: "0 6px",
                  }}
                  placeholder="user"
                  title="ClickHouse username"
                  aria-label="ClickHouse username"
                  value={connUser}
                  onChange={(e) => setConnUser(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnect();
                  }}
                  autoComplete="off"
                />
              </span>
              <span className="cmp-connect-field" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon
                  className="ti ti-lock"
                  style={{ fontSize: 15, opacity: 0.55 }}
                  aria-hidden="true"
                ></Icon>
                <div
                style={{
                  position:"relative"
                }}
                >
                  <input
                    className="form-input"
                    type={isViewFlag ? "text" : "password"}
                    style={{
                      height: 28,
                      width: 150,
                      fontSize: "12px",
                      padding: "0 6px",
                    }}
                    placeholder="password"
                    title="ClickHouse password"
                    aria-label="ClickHouse password"
                    value={connPassword}
                    onChange={(e) => setConnPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConnect();
                    }}
                    autoComplete="off"
                  />
                  <div onClick={() => setIsViewFlag(!isViewFlag)}>
                    <Icon
                      className={isViewFlag ? "ti ti-eye-off" : "ti ti-eye"}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "17%",
                        fontSize: "17px",
                      }}
                    />
                  </div>
                </div>
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleConnect}
                disabled={connecting || !connUser.trim()}
                title={`Connect to ${selectedNode || "node"}:${port}`}
              >
                {connecting ? (
                  <span className="loading-spinner"></span>
                ) : (
                  <Icon className="ti ti-plug"></Icon>
                )}{" "}
                Go
              </button>
              {connError && (
                <span className="cmp-connect-error" title={connError}>
                  {connError}
                </span>
              )}
            </>
          ) : (
            <div className="cmp-connect-status">
              <Icon
                className="ti ti-plug-connected"
                style={{ fontSize: 15, color: "var(--color-success)" }}
              ></Icon>
              <span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {editorCreds.user}
                </strong>
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  @ {selectedNode}:{port}
                </span>
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDisconnect}
                title="Disconnect and clear credentials"
                style={{ padding: "2px 6px" }}
              >
                <Icon className="ti ti-logout"></Icon>
              </button>
            </div>
          )}
        </div>

        <div className="cmp-toolbar-right">
          <button
            className="btn btn-primary btn-sm"
            onClick={runCompare}
            disabled={!canCompare}
            title="Estimate both queries and compare them"
          >
            <Icon className="ti ti-versions"></Icon>{" "}
            {comparing ? "Comparing..." : "Compare"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Icon
              className={"ti " + (fullscreen ? "ti-minimize" : "ti-maximize")}
            ></Icon>{" "}
            {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      {!editorConnected && (
        <p className="cmp-connect-hint">
          Connect with your ClickHouse credentials to estimate, execute, or
          compare queries. Only SELECT queries are allowed in comparison mode.
        </p>
      )}

      <div className="cmp-split">
        <ComparePane
          side="left"
          title="Current query"
          sql={leftSql}
          onChange={onLeftChange}
          acWords={acWords}
          onEstimate={onEstimateLeft}
          onExecute={onExecuteLeft}
          busy={leftBusy}
          estimate={leftEstimate}
          exec={leftExec}
          connected={editorConnected}
        />
        <ComparePane
          side="right"
          title="Experimental query"
          sql={rightSql}
          onChange={onRightChange}
          acWords={acWords}
          onEstimate={onEstimateRight}
          onExecute={onExecuteRight}
          busy={rightBusy}
          estimate={rightEstimate}
          exec={rightExec}
          connected={editorConnected}
        />
      </div>

      {compareData && (
        <div className="cmp-metrics-wrap">
          <h3 className="cmp-metrics-title">Comparison (Estimated)</h3>
          <ComparisonMetrics
            left={compareData.left}
            right={compareData.right}
            mode="estimate"
          />
        </div>
      )}
    </div>
  );
}
