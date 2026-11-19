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

import { useState, useEffect, useMemo } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useAuth, useTheme, useConnection } from "../../App.jsx";
import { editorDisconnect, runQuery } from "../../utils/api.js";
import Breadcrumb from "./Breadcrumb.jsx";
import { Kbd, Badge, Button, shortcutLabel } from "../ui/index.jsx";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu.jsx";
import { Slider } from "../ui/slider.jsx";
import { Switch } from "../ui/switch.jsx";
import { AnimatedThemeToggler } from "../ui/animated-theme-toggler.jsx";
import { useBackgroundMotion, setBackgroundMotion } from "../../utils/backgroundMotion.js";
import { roleTone } from "../../utils/roles.js";

// Text size limits for the user menu slider, in percent.
const FONT_SCALE_MIN = 75;
const FONT_SCALE_MAX = 200;

// The saved text size: a number in percent, or null for Auto.
// No saved value means Auto.
function readSavedFontScale() {
  const saved = localStorage.getItem("chops_fontscale");
  if (!saved || saved === "auto") return null;
  const value = parseFloat(saved);
  return Number.isFinite(value) ? value : null;
}

// The size that the Auto CSS rule gives now, in percent of 16px.
function readAutoFontScale() {
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round((px / 16) * 100);
}

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

  // Text size in percent, or null for "Auto". Auto is the default: global.css
  // makes the text a little larger on wide screens. A number is a fixed size.
  const [fontScale, setFontScale] = useState(() => readSavedFontScale());
  // The shadcn DropdownMenu closes itself on an outside click and on Escape.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isBackgroundMotionOn = useBackgroundMotion();

  // The Magic UI toggler animates the change. It needs the new theme on <html>
  // at once, so set data-theme here; App.jsx then saves it as before.
  function changeTheme(nextTheme) {
    document.documentElement.setAttribute("data-theme", nextTheme);
    toggleTheme();
  }

  // Server clock: the selected node's timezone plus a one-time skew correction
  // between the server clock and this browser, so the displayed time is the
  // real time on the ClickHouse® server regardless of the browser's timezone
  // or a drifting local clock. Fetched once per connect / node switch, then
  // it free-runs locally (never hits the server per second).
  const [serverTz, setServerTz] = useState(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockTick, setClockTick] = useState(Date.now());

  function applyFontScale(val) {
    const v = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(val / 5) * 5));
    setFontScale(v);
    localStorage.setItem("chops_fontscale", String(v));
    document.documentElement.style.fontSize = (v / 100) * 16 + "px";
  }

  // Back to Auto: remove the fixed size, so the CSS size for the screen applies.
  function switchToAutoFontScale() {
    setFontScale(null);
    localStorage.setItem("chops_fontscale", "auto");
    document.documentElement.style.removeProperty("font-size");
  }

  // The size that Auto gives now, in percent, to show on the slider.
  const shownFontScale = fontScale ?? readAutoFontScale();

  useEffect(() => {
    if (fontScale === null) document.documentElement.style.removeProperty("font-size");
    else document.documentElement.style.fontSize = (fontScale / 100) * 16 + "px";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once on mount, as before. The missing values would run it again.
  }, []);

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
    applyFontScale(shownFontScale + delta);
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

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={handleRefresh}
          title="Refresh"
          aria-label="Refresh"
        >
          <Icon className="ti ti-refresh"></Icon>
          <span className="navbar-btn-label sr-only">Refresh</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          nativeButton={false}
          render={<a href="/docs/" target="_blank" />}
          title="Documentation"
          aria-label="Documentation"
        >
          <Icon className="ti ti-book"></Icon>
          <span className="navbar-btn-label sr-only">Docs</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          nativeButton={false}
          render={<a href="https://github.com/Quantrail-Data/CH-Ops" target="_blank" rel="noopener noreferrer" />}
          title="GitHub repository"
          aria-label="GitHub repository"
        >
          <Icon className="ti ti-brand-github"></Icon>
          <span className="navbar-btn-label sr-only">GitHub</span>
        </Button>
        <AnimatedThemeToggler
          theme={theme}
          onThemeChange={changeTheme}
          duration={450}
          className="tw:inline-flex tw:size-7 tw:items-center tw:justify-center tw:rounded-[var(--radius-sm)] tw:border tw:border-[var(--border-strong)] tw:bg-[var(--bg-surface)] tw:text-[var(--text-primary)] tw:hover:bg-[var(--bg-hover)] tw:cursor-pointer"
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
        />

        {/* User menu (rightmost): who is signed in, text size, versions, Sign Out */}
        <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
          <DropdownMenuTrigger
            render={<button type="button" className="navbar-user-btn" style={{ marginLeft: 4 }} />}
          >
            <span className="avatar" aria-hidden="true">
              {String(auth?.username || "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="navbar-user-name">{auth?.username}</span>
            <Icon
              className="ti ti-chevron-down"
              style={{ fontSize: "0.75rem", opacity: 0.6 }}
            ></Icon>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="tw:w-[280px] tw:p-0 tw:rounded-[var(--radius-md)] tw:border tw:border-[var(--border-strong)] tw:bg-[var(--bg-raised)] tw:shadow-[var(--shadow-md)] tw:ring-0"
          >
            {/* User info */}
            <div className="tw:px-3.5 tw:py-2.5 tw:text-xs tw:text-[var(--text-muted)]">
              Signed in as{" "}
              <strong className="tw:text-[var(--text-primary)]">{auth?.username}</strong>
              {auth?.role && (
                <Badge tone={roleTone(auth.role)} style={{ marginLeft: 6 }}>
                  {auth.role}
                </Badge>
              )}
            </div>
            <DropdownMenuSeparator className="tw:m-0" />

            {/* Text size. Arrow keys belong to the slider here, not to the menu. */}
            <div
              className="tw:px-3.5 tw:py-2.5"
              onWheel={handleSliderWheel}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="tw:mb-1.5 tw:flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:text-[var(--text-secondary)]">
                <Icon className="ti ti-text-resize" style={{ fontSize: "0.875rem" }}></Icon> Text Size
              </div>
              <div className="tw:flex tw:items-center tw:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Smaller text"
                  onClick={() => applyFontScale(shownFontScale - 5)}
                  disabled={shownFontScale <= FONT_SCALE_MIN}
                >
                  -
                </Button>
                <Slider
                  aria-label="Text size"
                  min={75}
                  max={200}
                  step={5}
                  value={shownFontScale}
                  onValueChange={(value) => applyFontScale(Array.isArray(value) ? value[0] : value)}
                  className="tw:flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Larger text"
                  onClick={() => applyFontScale(shownFontScale + 5)}
                  disabled={shownFontScale >= FONT_SCALE_MAX}
                >
                  +
                </Button>
              </div>
              <div className="tw:mt-0.5 tw:flex tw:justify-between tw:text-[11px] tw:text-[var(--text-muted)]">
                <span>{FONT_SCALE_MIN}%</span>
                <span className="tw:font-semibold tw:text-[var(--text-primary)]">
                  {fontScale === null ? `Auto (${shownFontScale}%)` : `${fontScale}%`}
                </span>
                <span>{FONT_SCALE_MAX}%</span>
              </div>
              {fontScale !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={switchToAutoFontScale}
                  className="tw:mt-1 tw:w-full tw:text-xs"
                >
                  Use Auto (fits the screen)
                </Button>
              )}
            </div>
            <DropdownMenuSeparator className="tw:m-0" />

            {/* Animated page background (floating particles) on or off */}
            <label className="tw:flex tw:cursor-pointer tw:items-center tw:justify-between tw:gap-3 tw:px-3.5 tw:py-2.5 tw:text-xs tw:font-semibold tw:text-[var(--text-secondary)]">
              <span className="tw:flex tw:items-center tw:gap-1">
                <Icon className="ti ti-sparkles-2" style={{ fontSize: "0.875rem" }}></Icon> Background animation
              </span>
              <Switch
                checked={isBackgroundMotionOn}
                onCheckedChange={(checked) => setBackgroundMotion(checked)}
                aria-label="Background animation"
              />
            </label>
            <DropdownMenuSeparator className="tw:m-0" />

            {/* Version info (read-only) */}
            <div className="tw:px-3.5 tw:py-2 tw:font-mono tw:text-xs tw:text-[var(--text-muted)]">
              <div className="tw:mb-1 tw:flex tw:justify-between tw:gap-3">
                <span className="tw:shrink-0">App version</span>
                <span className="tw:text-right tw:text-[var(--text-secondary)]">
                  {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?"}
                </span>
              </div>
              <div className="tw:flex tw:justify-between tw:gap-3">
                <span className="tw:shrink-0">ClickHouse®</span>
                <span className="tw:text-right tw:text-[var(--text-secondary)]">
                  {typeof __CH_VERSION__ !== "undefined" ? __CH_VERSION__ : "?"}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator className="tw:m-0" />

            <DropdownMenuGroup className="tw:p-1">
              <DropdownMenuItem variant="destructive" onClick={logout} className="tw:gap-2 tw:px-2.5 tw:py-2">
                <Icon className="ti ti-logout" style={{ fontSize: "1rem" }}></Icon> Sign Out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}