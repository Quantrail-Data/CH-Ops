// Navbar - Top bar with breadcrumb, search, node switching and user controls
//
// Style guide shell: the top bar sits beside the full-height sidebar (which
// holds the brand and cluster picker). It shows the breadcrumb, the command
// palette search field, the node dropdown, and a combined
// connection-status + live server clock: a green, ticking clock showing the
// selected node's server time when connected, and a red, frozen clock-off
// icon (no time) when disconnected.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { useState, useRef, useEffect, useMemo } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useAuth, useTheme, useConnection } from "../../App.jsx";
import { editorDisconnect, runQuery } from "../../utils/api.js";
import Breadcrumb from "./Breadcrumb.jsx";
import { Kbd, Badge, shortcutLabel } from "../ui/index.jsx";
import { roleTone } from "../../utils/roles.js";

// Solid raised menu panel (Midnight: no glass).
const dropdownStyle = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 4,
  background: "var(--bg-raised)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-md)",
  zIndex: 1200,
};

export default function Navbar({ route, onRefresh, onOpenSearch }) {
  const { auth, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    selectedClusterId,
    nodes,
    selectedNode,
    connected,
    error,
    nodeName,
    setConnection,
    testConnection,
    reloadConfig,
  } = useConnection();
  const [, setConnecting] = useState(false);

  const [fontScale, setFontScale] = useState(() =>
    parseFloat(localStorage.getItem("chops_fontscale") || "100"),
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const sliderRef = useRef(null);

  // Server clock: the selected node's timezone plus a one-time skew correction
  // between the server clock and this browser, so the displayed time is the
  // real time on the ClickHouse® server regardless of the browser's timezone
  // or a drifting local clock. Fetched once per connect / node switch, then
  // it free-runs locally (never hits the server per second).
  const [serverTz, setServerTz] = useState(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockTick, setClockTick] = useState(Date.now());

  function applyFontScale(val) {
    const v = Math.min(200, Math.max(75, Math.round(val / 5) * 5));
    setFontScale(v);
    localStorage.setItem("chops_fontscale", String(v));
    document.documentElement.style.fontSize = (v / 100) * 16 + "px";
  }

  useEffect(() => {
    document.documentElement.style.fontSize = (fontScale / 100) * 16 + "px";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once on mount, as before. The missing values would run it again.
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = () => setUserMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [userMenuOpen]);

  // Fetch the server timezone and the server's current instant whenever the
  // connected node (or cluster) changes. serverTimeZone() gives the IANA zone
  // for the label; toUnixTimestamp(now()) lets us correct for clock skew.
  // Falls back to timezone() for older ClickHouse® servers.
  useEffect(() => {
    if (!connected) {
      setServerTz(null);
      return;
    }
    let cancelled = false;

    async function loadServerClock() {
      try {
        let res;
        try {
          res = await runQuery(
            "SELECT serverTimeZone() AS tz, toUnixTimestamp(now()) AS epoch",
            { readOnly: true },
          );
        } catch {
          // Older servers may not have serverTimeZone(); timezone() is the alias.
          res = await runQuery(
            "SELECT timezone() AS tz, toUnixTimestamp(now()) AS epoch",
            { readOnly: true },
          );
        }
        const row = res?.rows?.[0] || {};
        if (cancelled) return;
        const tz = row.tz || "UTC";
        const epochMs = Number(row.epoch) * 1000;
        setServerTz(tz);
        setServerOffsetMs(Number.isFinite(epochMs) ? epochMs - Date.now() : 0);
      } catch {
        if (!cancelled) setServerTz(null);
      }
    }

    loadServerClock();
    return () => {
      cancelled = true;
    };
  }, [connected, selectedNode, selectedClusterId]);

  // Tick once a second, but only while connected and with a known timezone, so
  // the red (disconnected) clock never ticks.
  useEffect(() => {
    if (!connected || !serverTz) return;
    const id = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connected, serverTz]);

  // The formatted server time. Intl renders the current instant in the server
  // timezone; try/catch guards against an unexpected zone string crashing the
  // navbar.
  const serverClock = useMemo(() => {
    if (!connected || !serverTz) return null;
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: serverTz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(clockTick + serverOffsetMs));
    } catch {
      return null;
    }
  }, [connected, serverTz, serverOffsetMs, clockTick]);

  // Mouse wheel on font slider
  function handleSliderWheel(e) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    applyFontScale(fontScale + delta);
  }


    async function handleNodeChange(name) {
    const node = nodes.find((n) => n.name === name);
    if (node) {
      localStorage?.setItem("chops_nodename",node?.name)
      setConnecting(true);
      setConnection((prev) => ({
        ...prev,
        selectedNode: node?.host,
        user: node.user || "default",
        port: node.port || 8123,
        nodeName:name
      }));
      await testConnection(node?.name, node?.user, node?.port);
      onRefresh();
      setConnecting(false);
    }
    await editorDisconnect();
  }

  function handleRefresh() {
    if (reloadConfig) reloadConfig();
    onRefresh();
  }

  return (
    <header className="navbar">
      {/* Left: where you are */}
      <Breadcrumb route={route} />

      {/* Right: search, node, live clock, actions, account */}
      <div className="navbar-actions" style={{ flex: "0 0 auto", minWidth: 0 }}>
        <button
          className="navbar-search"
          onClick={onOpenSearch}
          title={`Search pages (${shortcutLabel("K")})`}
          aria-label="Search"
        >
          <Icon className="ti ti-search"></Icon>
          <span className="navbar-search-label">Search pages, tables, queries</span>
          <Kbd>{shortcutLabel("K")}</Kbd>
        </button>

        <div className="conn-group">
          <Select
            className="form-select conn-select"
            value={nodeName || ""}
            onChange={(e) => handleNodeChange(e.target.value)}
            aria-label="Node"
            title="Switch node"
          >
            {nodes.map((n) => (
              <option key={n.name} value={n.name}>
                {n.name || n.host}
              </option>
            ))}
            {!nodes.length && <option value="">No nodes</option>}
          </Select>
        </div>

        {/* Connection status + live server clock, combined.
            Connected    -> green ticking clock + server time.
            Disconnected -> red, frozen clock-off icon, no time shown. */}
        <div
          className="conn-group navbar-clock"
          title={
            connected
              ? `Connected. Server time${serverTz ? ` in ${serverTz}` : ""}. Use this when setting time-range filters.`
              : error || "Disconnected"
          }
        >
          <span
            className="conn-label"
            style={{
              color: connected
                ? "var(--color-success)"
                : "var(--color-danger)",
              display: "inline-flex",
            }}
          >
            <Icon
              className={`ti ti-${connected ? "clock" : "clock-off"}`}
            ></Icon>
          </span>
          {serverClock && (
            <span className="navbar-clock-time">
              {serverClock}{" "}
              <span className="navbar-clock-tz">{serverTz}</span>
            </span>
          )}
        </div>

        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={handleRefresh}
          title="Refresh"
          aria-label="Refresh"
        >
          <Icon className="ti ti-refresh"></Icon>
          <span className="navbar-btn-label sr-only">Refresh</span>
        </button>
        <a
          href="/docs/"
          target="_blank"
          className="btn btn-ghost btn-sm btn-icon"
          title="Documentation"
          aria-label="Documentation"
        >
          <Icon className="ti ti-book"></Icon>
          <span className="navbar-btn-label sr-only">Docs</span>
        </a>
        <a
          href="https://github.com/Quantrail-Data/CH-Ops"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm btn-icon"
          title="GitHub repository"
          aria-label="GitHub repository"
        >
          <Icon className="ti ti-brand-github"></Icon>
          <span className="navbar-btn-label sr-only">GitHub</span>
        </a>
        <button
          className="btn btn-secondary btn-sm btn-icon"
          onClick={toggleTheme}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          <Icon className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"}`}></Icon>
          <span className="navbar-btn-label sr-only">
            {theme === "dark" ? "Light" : "Dark"}
          </span>
        </button>

        {/* User dropdown (rightmost) - contains Sign Out + Text Size */}
        <div style={{ position: "relative", marginLeft: 4 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(!userMenuOpen);
            }}
            className="navbar-user-btn"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
            <span className="avatar" aria-hidden="true">
              {String(auth?.username || "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="navbar-user-name">{auth?.username}</span>
            <Icon
              className="ti ti-chevron-down"
              style={{ fontSize: 12, opacity: 0.6 }}
            ></Icon>
          </button>
          {userMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ ...dropdownStyle, minWidth: 220, overflow: "hidden" }}
            >
              {/* User info */}
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border-default)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Signed in as{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {auth?.username}
                </strong>
                {auth?.role && (
                  <Badge tone={roleTone(auth.role)} style={{ marginLeft: 6 }}>
                    {auth.role}
                  </Badge>
                )}
              </div>

              {/* Text size control */}
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border-default)",
                }}
                onWheel={handleSliderWheel}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon className="ti ti-text-resize" style={{ fontSize: 14 }}></Icon>{" "}
                  Text Size
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => applyFontScale(fontScale - 5)}
                    disabled={fontScale <= 75}
                    style={{
                      padding: "2px 6px",
                      fontSize: "14px",
                      lineHeight: 1,
                    }}
                  >
                    -
                  </button>
                  <input
                    ref={sliderRef}
                    type="range"
                    min={75}
                    max={200}
                    step={5}
                    value={fontScale}
                    onChange={(e) => applyFontScale(parseInt(e.target.value))}
                    style={{
                      flex: 1,
                      accentColor: "var(--accent)",
                      cursor: "pointer",
                    }}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => applyFontScale(fontScale + 5)}
                    disabled={fontScale >= 200}
                    style={{
                      padding: "2px 6px",
                      fontSize: "14px",
                      lineHeight: 1,
                    }}
                  >
                    +
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  <span>75%</span>
                  <span
                    style={{ color: "var(--text-primary)", fontWeight: 600 }}
                  >
                    {fontScale}%
                  </span>
                  <span>200%</span>
                </div>
                {fontScale !== 100 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => applyFontScale(100)}
                    style={{ width: "100%", marginTop: 4, fontSize: "12px" }}
                  >
                    Reset to 100%
                  </button>
                )}
              </div>

              {/* Version info (read-only) */}
              <div
                style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border-default)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-code)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 3,
                  }}
                >
                  <span>App version</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {typeof __APP_VERSION__ !== "undefined"
                      ? __APP_VERSION__
                      : "?"}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>ClickHouse®</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {typeof __CH_VERSION__ !== "undefined"
                      ? __CH_VERSION__
                      : "?"}
                  </span>
                </div>
              </div>

              {/* Sign out */}
              <button
                onClick={logout}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "var(--color-danger)",
                  fontFamily: "var(--font-ui)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Icon className="ti ti-logout" style={{ fontSize: 16 }}></Icon> Sign
                Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}