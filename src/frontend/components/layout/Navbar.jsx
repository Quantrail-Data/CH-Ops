// Navbar - Top navigation bar with cluster switching and user controls
//
// The main navigation header that sits at the top of every page. It shows
// the CHOps branding, cluster/node selection dropdowns, connection status
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState, useRef, useEffect } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useAuth, useTheme, useConnection } from "../../App.jsx";

import chopsLightLogo from "../../assets/chops-light.svg";
import chopsDarkLogo from "../../assets/chops-dark.svg";

// Dropdown is translucent (96% opaque) with a strong blur so you can barely
// see through it, but it still feels like glass rather than a solid box.
const dropdownStyle = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 4,
  background: "var(--glass-dropdown)",
  backdropFilter: "blur(40px) saturate(1.8)",
  WebkitBackdropFilter: "blur(40px) saturate(1.8)",
  border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 1200,
};

export default function Navbar({ onRefresh, onOpenSearch }) {
  const { auth, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    clusters,
    selectedClusterId,
    nodes,
    selectedNode,
    user,
    password,
    connected,
    error,
    clusterName,
    setConnection,
    testConnection,
    reloadConfig,
    switchCluster,
  } = useConnection();
  const [connecting, setConnecting] = useState(false);

  const [fontScale, setFontScale] = useState(() =>
    parseFloat(localStorage.getItem("chops_fontscale") || "100"),
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const sliderRef = useRef(null);

  function applyFontScale(val) {
    const v = Math.min(200, Math.max(75, Math.round(val / 5) * 5));
    setFontScale(v);
    localStorage.setItem("chops_fontscale", String(v));
    document.documentElement.style.fontSize = (v / 100) * 16 + "px";
  }

  useEffect(() => {
    document.documentElement.style.fontSize = (fontScale / 100) * 16 + "px";
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = () => setUserMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [userMenuOpen]);

  // Mouse wheel on font slider
  function handleSliderWheel(e) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    applyFontScale(fontScale + delta);
  }

  // handlenodechange function for change the node in selection option and check the connection => (praveen kumar)
  // async function handleNodeChange(host) {
  //   const node = nodes.find((n) => n.host === host);
  //   if (node) {
  //     setConnecting(true);
  //     setConnection((prev) => ({
  //       ...prev,
  //       selectedNode: host,
  //       user: node.user || "default",
  //       password: node.password || "",
  //       port: node.port || 8123,
  //     }));
  //     await testConnection(node?.host, node?.user, node?.password, node?.port);
  //     onRefresh();
  //     setConnecting(false);
  //   } else setConnection((prev) => ({ ...prev, selectedNode: host }));
  // }

  // storing the chops node details in localstorage => praveenkumar
    async function handleNodeChange(host) {
    const node = nodes.find((n) => n.host === host);
    if (node) {
      localStorage?.setItem("chops_nodename",node?.name)
      setConnecting(true);
      setConnection((prev) => ({
        ...prev,
        selectedNode: host,
        user: node.user || "default",
        password: node.password || "",
        port: node.port || 8123,
        nodeName:node?.name
      }));
      await testConnection(node?.host, node?.user, node?.password, node?.port);
      onRefresh();
      setConnecting(false);
    } else setConnection((prev) => ({ ...prev, selectedNode: host }));
  }

  async function handleConnect() {
    setConnecting(true);
    const node = nodes.find((n) => n.host === selectedNode) || nodes[0];
    await testConnection(
      selectedNode || node?.host,
      user,
      password,
      node?.port,
    );
    setConnecting(false);
  }

  function handleRefresh() {
    if (reloadConfig) reloadConfig();
    onRefresh();
  }

  async function handleChangeCluster(e) {
    switchCluster(e.target.value);
    if (nodes?.length > 0) {
      const firstNode = nodes[0];
      setConnecting(true);
      await testConnection(
        firstNode?.host,
        firstNode?.user,
        firstNode?.password,
        firstNode?.port,
      );
      onRefresh();
      setConnecting(false);
    }
  }

  return (
    <header className="navbar">
      {/* Left: Brand */}
      <a
        href="https://www.ch-ops.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="navbar-brand"
        title={`CHOps v${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?"}`}
        style={{ flex: "0 0 auto", minWidth: 0, textDecoration: "none" }}
      >
        {/* <Icon className="ti ti-database"></Icon>
        <span className="navbar-title">CHOps</span> */}

         <img
          style={{ width: "100px",position:"relative",right:"10px" }}
          src={theme === "dark" ? chopsLightLogo : chopsDarkLogo}
        />
      </a>

      {/* Center: Connection */}
      <div
        className="navbar-connection"
        style={{ flex: "1 1 auto", minWidth: 0, justifyContent: "center" }}
      >
        {clusters.length > 0 && (
          <div className="conn-group">
            <span className="conn-label">
              <Icon className="ti ti-topology-star"></Icon>
            </span>
            <Select
              className="form-select conn-select"
              value={selectedClusterId}
              onChange={(e) => handleChangeCluster(e)}
              style={{
                Width: 120,
                fontWeight: 600,
                height: "38px",
                fontSize: "13px",
              }}
              title="Switch cluster"
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="conn-group">
          <span className="conn-label">
            <Icon className="ti ti-server"></Icon>
          </span>
          <Select
            className="form-select conn-select"
            value={selectedNode || ""}
            style={{
              Width: 120,
              fontWeight: 600,
              height: "38px",
              fontSize: "13px",
            }}
            onChange={(e) => handleNodeChange(e.target.value)}
          >
            {nodes.map((n) => (
              <option key={n.host} value={n.host}>
                {n.name || n.host}
              </option>
            ))}
            {!nodes.length && <option value="">No nodes</option>}
          </Select>
        </div>
        <div
          className={`conn-indicator ${connected ? "connected" : "disconnected"}`}
          title={connected ? "Connected" : error || "Disconnected"}
        ></div>
      </div>

      {/* Right: Actions + User dropdown */}
      <div className="navbar-actions" style={{ flex: "0 0 auto", minWidth: 0 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onOpenSearch}
          title="Search pages (Ctrl/Cmd + K)"
          aria-label="Search"
        >
          <Icon className="ti ti-search"></Icon>
          <span className="navbar-btn-label">Search</span>
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleRefresh}
          title="Refresh"
          aria-label="Refresh"
        >
          <Icon className="ti ti-refresh"></Icon>
          <span className="navbar-btn-label">Refresh</span>
        </button>
        <a
          href="/docs/"
          target="_blank"
          className="btn btn-ghost btn-sm"
          title="Documentation"
          style={{ textDecoration: "none" }}
        >
          <Icon className="ti ti-book"></Icon>
          <span className="navbar-btn-label">Docs</span>
        </a>
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggleTheme}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          <Icon className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"}`}></Icon>
          <span className="navbar-btn-label">
            {theme === "dark" ? "Light" : "Dark"}
          </span>
        </button>
        <a
          href="https://github.com/Quantrail-Data/CH-Ops"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          title="GitHub repository"
          aria-label="GitHub repository"
          style={{ textDecoration: "none" }}
        >
          <Icon className="ti ti-brand-github"></Icon>
          <span className="navbar-btn-label">GitHub</span>
        </a>

        {/* User dropdown (rightmost) - contains Sign Out + Text Size */}
        <div style={{ position: "relative", marginLeft: 4 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(!userMenuOpen);
            }}
            style={{
              cursor: "pointer",
              border: "1px solid var(--accent-border)",
              background: "var(--accent-soft)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 10px",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: "13px",
              fontFamily: "var(--font-ui)",
              color: "var(--text-primary)",
            }}
          >
            <Icon
              className="ti ti-user"
              style={{ fontSize: 16, color: "var(--icon-color)" }}
            ></Icon>
            <span>{auth?.username}</span>
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
                  <span
                    className={`badge ${auth.role === "superadmin" ? "badge-amber" : auth.role === "admin" ? "badge-purple" : auth.role === "editor" ? "badge-blue" : "badge-gray"}`}
                    style={{ marginLeft: 6 }}
                  >
                    {auth.role}
                  </span>
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
