// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Main container component that layout and renders all dashboard widgets and analytics charts.

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useSearchParams } from "react-router-dom";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from "../../utils/api.js";
import DashboardFilters from "./DashboardFilters.jsx";
import DashboardSettings from "./DashboardSettings.jsx";
import {
  discoverFilters,
  describeConflict,
  resolveValues,
  chartsAffectedBy,
  missingRequired,
  waitingMessage,
} from "../../utils/dashboardParams.js";
import { buildChartOption, yAxisNameGap, needsLegend } from "./chartTypes.js";
import { initChart, disposeChart, withZoomable } from "../../utils/echarts.js";
import ChartToolbar, { savePng } from "../common/ChartToolbar.jsx";
import DataTable from "../layout/DataTable.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import { useToast } from "../layout/Toast.jsx";
import { useTheme, useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

// Filter values live in the URL so a dashboard link is shareable as you are
// looking at it. The app uses HashRouter, so the router's query string is
// already inside the fragment and never reaches a server log.
//
// Filter names are namespaced. A parameter may legitimately be called `d`
// (names match [A-Za-z_][A-Za-z0-9_]*), and without a prefix such a chart would
// silently break dashboard selection - an unpleasant thing to debug.
const DASH_KEY = "d";
const FILTER_PREFIX = "f.";

function readFilterParams(searchParams) {
  const out = {};
  for (const [k, v] of searchParams.entries()) {
    if (k.startsWith(FILTER_PREFIX)) out[k.slice(FILTER_PREFIX.length)] = v;
  }
  return out;
}

export default function DashboardView({ sidebar }) {
  const toast = useToast();
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const canEdit = myLevel >= ROLE_LEVEL.editor;
  const [dashboards, setDashboards] = useState([]);
  const [selDash, setSelDash] = useState(null);
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCols, setNewCols] = useState(2);
  const [showCreate, setShowCreate] = useState(false);
  const [del, setDel] = useState(null);
  const [delChart, setDelChart] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [fs, setFs] = useState(false);
  const [showLegends, setShowLegends] = useState(true);

  // Filter state.
  //   params  - discovery result for the loaded charts
  //   applied - the values the charts on screen were run with
  //   draft   - what the controls currently hold; only Apply promotes it
  const [params, setParams] = useState({
    filters: [],
    byChart: new Map(),
    conflicts: [],
    errors: [],
  });
  const [applied, setApplied] = useState({});
  const [draft, setDraft] = useState({});
  const [hoveredFilter, setHoveredFilter] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  // Page-level full screen. A CSS overlay rather than the browser's F11 mode,
  // matching how ChartToolbar and the editor do it, so app chrome and theming
  // survive and Escape can leave.
  const [pageFs, setPageFs] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  // rerunAffected patches individual tiles, so it needs the current list without
  // taking a dependency on it (which would rebuild the callback on every run).
  const chartsRef = useRef(charts);
  useEffect(() => {
    chartsRef.current = charts;
  }, [charts]);

  // Which dashboard has actually been loaded. The load effect has to watch
  // `dashboards` so it can resolve an id that arrives from the URL before the
  // list does - but any change to that array's identity would otherwise re-run
  // it. Saving a filter label replaces the array, so without this guard
  // renaming "region" to "Region" silently reloaded the dashboard and re-ran
  // every chart on it.
  const loadedDashRef = useRef(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState("idle"); // 'idle' | 'exiting' | 'entering'
  const transitionTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const settings = selDash?.filters || {};

  useEffect(() => {
    if (!pageFs) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setPageFs(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pageFs]);

  // ECharts sizes to its container, so every tile has to be told to re-measure
  // once the overlay has changed the layout.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 180);
    return () => clearTimeout(t);
  }, [pageFs]);

  // config.paramDefaults from the charts that declare each name. First chart to
  // declare it wins, which matches how the type is resolved.
  const chartDefaults = useMemo(() => {
    const out = {};
    for (const c of charts) {
      const cfg =
        typeof c.config === "string"
          ? (() => {
              try {
                return JSON.parse(c.config);
              } catch {
                return {};
              }
            })()
          : c.config || {};
      for (const [k, v] of Object.entries(cfg.paramDefaults || {})) {
        if (out[k] === undefined) out[k] = v;
      }
    }
    return out;
  }, [charts]);

  const conflictMessages = useMemo(
    () => params.conflicts.map(describeConflict),
    [params.conflicts],
  );

  async function loadDashboards() {
    try {
      setDashboards(await apiFetch("/api/dashboards"));
    } catch {}
  }
  useEffect(() => {
    loadDashboards();
  }, []);

  const renderChart = useCallback((chart, data, error) => {
    const cfg =
      typeof chart.config === "string"
        ? (() => {
            try {
              return JSON.parse(chart.config);
            } catch {
              return {};
            }
          })()
        : chart.config || {};
    if (error) return { _error: true, message: error };
    return buildChartOption(
      chart.chartType,
      chart.chartSubtype,
      data,
      cfg,
      chart.name,
      { xLabel: cfg?.xLabel, yLabel: cfg?.yLabel, showLegend: cfg?.showLegend },
    );
  }, []);

  const runChart = useCallback(
    async (chart, values, params) => {
      const missing = missingRequired(chart.id, params.byChart, values);
      if (missing.length) {
        return {
          ...chart,
          _rerunning: false,
          data: null,
          chartOption: { _waiting: true, message: waitingMessage(missing) },
        };
      }

      const mine = {};
      for (const p of params.byChart.get(chart.id) || []) {
        if (values[p.name] !== undefined) mine[p.name] = values[p.name];
      }

      try {
        const r = await runQuery(
          chart.sqlQuery,
          Object.keys(mine).length ? { params: mine } : {},
        );
        return {
          ...chart,
          _rerunning: false,
          data: r.rows || [],
          chartOption: renderChart(chart, r.rows || [], null),
        };
      } catch (e) {
        return {
          ...chart,
          _rerunning: false,
          data: null,
          chartOption: renderChart(chart, null, e.message),
        };
      }
    },
    [renderChart],
  );

  async function loadCharts(dashId, values, params, prefetched) {
    setLoading(true);
    setTransitioning(true);
    setTransitionPhase("exiting");

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    try {
      const c =
        prefetched || (await apiFetch(`/api/dashboards/${dashId}/charts`));
      const discovered = params || discoverFilters(c);
      const vals = values || {};
      const enriched = await Promise.all(
        c.map((chart) => runChart(chart, vals, discovered)),
      );
      enriched.sort((a, b) =>
        a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol,
      );

      const byId = new Map();
      for (const ch of enriched) byId.set(String(ch.id), ch);
      const deduped = Array.from(byId.values());
      deduped.sort((a, b) =>
        a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol,
      );

      transitionTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setTransitionPhase("entering");
        setCharts(deduped);
        setParams(discovered);

        setTimeout(() => {
          if (!mountedRef.current) return;
          setTransitioning(false);
          setTransitionPhase("idle");
          setLoading(false);
        }, 400);

        transitionTimerRef.current = null;
      }, 200);

      return discovered;
    } catch {
      if (!mountedRef.current) return;
      setTransitioning(false);
      setTransitionPhase("idle");
      setLoading(false);
      return (
        params || { filters: [], byChart: new Map(), conflicts: [], errors: [] }
      );
    }
  }

  const rerunAffected = useCallback(
    async (changedNames, values, params) => {
      const ids = new Set(chartsAffectedBy(changedNames, params.byChart));
      if (!ids.size) return;
      setCharts((prev) =>
        prev.map((c) => (ids.has(c.id) ? { ...c, _rerunning: true } : c)),
      );
      const targets = chartsRef.current.filter((c) => ids.has(c.id));
      const done = await Promise.all(
        targets.map((c) => runChart(c, values, params)),
      );
      const byId = new Map(done.map((c) => [c.id, c]));
      setCharts((prev) => prev.map((c) => byId.get(c.id) || c));
    },
    [runChart],
  );

  function selectDash(d) {
    setShowLegends(true);
    setShowSettings(false);
    const next = new URLSearchParams();
    next.set(DASH_KEY, String(d.id));
    setSearchParams(next, { replace: false });
  }

  const urlDashId = searchParams.get(DASH_KEY);
  useEffect(() => {
    if (!dashboards.length) return;
    const d = dashboards.find((x) => String(x.id) === String(urlDashId));
    if (!d) {
      if (urlDashId) setSelDash(null);
      loadedDashRef.current = null;
      return;
    }
    if (selDash?.id !== d.id) {
      setSelDash(d);
      setTransitionPhase("exiting");
      setTransitioning(true);
    }
    if (loadedDashRef.current === d.id) {
      if (transitioning) {
        setTransitionPhase("entering");
        setTimeout(() => {
          setTransitioning(false);
          setTransitionPhase("idle");
        }, 400);
      }
      return;
    }
    loadedDashRef.current = d.id;

    let cancelled = false;
    (async () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }

      const fetched = await apiFetch(`/api/dashboards/${d.id}/charts`).catch(
        () => [],
      );
      if (cancelled || !mountedRef.current) return;
      const discovered = discoverFilters(fetched);
      const chartDefs = {};
      for (const c of fetched) {
        const cfg =
          typeof c.config === "string"
            ? (() => {
                try {
                  return JSON.parse(c.config);
                } catch {
                  return {};
                }
              })()
            : c.config || {};
        for (const [k, v] of Object.entries(cfg.paramDefaults || {})) {
          if (chartDefs[k] === undefined) chartDefs[k] = v;
        }
      }
      const values = resolveValues(discovered.filters, {
        selected: readFilterParams(searchParams),
        dashboardDefaults: d.filters || {},
        chartDefaults: chartDefs,
      });
      setParams(discovered);
      setApplied(values);
      setDraft(values);
      await loadCharts(d.id, values, discovered, fetched);
    })();
    return () => {
      cancelled = true;
    };
  }, [urlDashId, dashboards]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (selDash && selDash.id) {
        loadCharts(selDash.id, applied, params);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selDash, applied, params]);

  function changeFilter(name, value) {
    setDraft((p) => ({ ...p, [name]: value }));
  }

  async function applyFilters() {
    const changed = Object.keys(draft).filter(
      (k) => (draft[k] ?? "") !== (applied[k] ?? ""),
    );
    if (!changed.length) return;

    const next = new URLSearchParams();
    if (urlDashId) next.set(DASH_KEY, urlDashId);
    for (const [k, v] of Object.entries(draft)) {
      if (v !== undefined && String(v) !== "")
        next.set(FILTER_PREFIX + k, String(v));
    }
    setSearchParams(next, { replace: true });

    setApplied(draft);
    await rerunAffected(changed, draft, params);
  }

  async function resetFilters() {
    const defaults = resolveValues(params.filters, {
      selected: {},
      dashboardDefaults: settings,
      chartDefaults,
    });
    const changed = Object.keys(defaults).filter(
      (k) => (defaults[k] ?? "") !== (applied[k] ?? ""),
    );
    setDraft(defaults);
    if (!changed.length) return;

    const next = new URLSearchParams();
    if (urlDashId) next.set(DASH_KEY, urlDashId);
    setSearchParams(next, { replace: true });
    setApplied(defaults);
    await rerunAffected(changed, defaults, params);
  }

  async function saveSettings(nextSettings) {
    try {
      const updated = await apiFetch(`/api/dashboards/${selDash.id}`, {
        method: "PUT",
        body: JSON.stringify({ filters: nextSettings }),
      });
      setSelDash(updated);
      setDashboards((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d)),
      );
      setShowSettings(false);
      toast.success("Filter settings saved.");
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function createDash() {
    if (!newName.trim()) return;
    try {
      const d = await apiFetch("/api/dashboards", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), columns: newCols }),
      });
      setDashboards((p) => [d, ...p]);
      setNewName("");
      setShowCreate(false);
      toast.success(`Dashboard "${d.name}" created.`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function deleteDash(id) {
    try {
      await apiFetch(`/api/dashboards/${id}`, { method: "DELETE", body: {} });
      loadDashboards();
      setSelDash(null);
      setCharts([]);
      setSearchParams(new URLSearchParams(), { replace: true });
      toast.success("Dashboard deleted.");
    } catch (e) {
      toast.error(e.message);
    }
    setDel(null);
  }

  async function deleteChart(id) {
    try {
      await apiFetch(`/api/dashboards/charts/${id}`, {
        method: "DELETE",
        body: {},
      });
      if (selDash) await loadCharts(selDash.id, applied);
      toast.success("Chart removed.");
    } catch (e) {
      toast.error(e.message);
    }
  }

  function onDragStart(e, i) {
    e.dataTransfer.effectAllowed = "move";
    setDragIdx(i);
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e, targetIdx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      return;
    }
    setCharts((prev) => {
      const next = [...prev];
      const aRow = next[dragIdx].gridRow,
        aCol = next[dragIdx].gridCol;
      next[dragIdx] = {
        ...next[dragIdx],
        gridRow: next[targetIdx].gridRow,
        gridCol: next[targetIdx].gridCol,
      };
      next[targetIdx] = { ...next[targetIdx], gridRow: aRow, gridCol: aCol };
      next.sort((a, b) =>
        a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol,
      );
      return next;
    });
    setHasUnsaved(true);
    setDragIdx(null);
  }

  async function saveLayout() {
    try {
      await Promise.all(
        charts.map((c) =>
          apiFetch(`/api/dashboards/charts/${c.id}`, {
            method: "PUT",
            body: JSON.stringify({ gridRow: c.gridRow, gridCol: c.gridCol }),
          }),
        ),
      );
      setHasUnsaved(false);
      toast.success("Layout saved.");
    } catch (e) {
      toast.error(e.message);
    }
  }

  const cols = selDash?.columns || 2;

  const legendSupportedTypes = [
    "grouped_bar",
    "stacked_bar",
    "multi_line",
    "stacked_line",
    "pie",
    "donut",
    "rose",
    "nested_pie",
    "bubble",
    "multi_category",
    "funnel",
    "radar",
  ];

  const legendSupportedChartTypes = [
    "bar",
    "line",
    "pie",
    "bubble",
    "funnel",
    "radar",
    "scatter",
  ];

  const hasLegendCharts = charts.some(
    (c) =>
      legendSupportedTypes.includes(c.chartSubtype) ||
      legendSupportedChartTypes.includes(c.chartType),
  );

  const gridClassName = [
    "dashboard-grid",
    transitioning ? "dashboard-grid-loading" : "dashboard-grid-loaded",
    !transitioning && charts.length > 0 ? "dashboard-grid-staggered" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="page-content"
      style={
        pageFs
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 9000,
              background: "var(--bg-page)",
              overflow: "auto",
              padding: 16,
              margin: 0,
            }
          : undefined
      }
    >
      {selDash && showSettings && canEdit && (
        <DashboardSettings
          filters={params.filters}
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-layout-dashboard"></Icon> Dashboards
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {selDash && hasLegendCharts && (
            <button
              className={`btn btn-sm ${showLegends ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setShowLegends(!showLegends)}
              title={showLegends ? "Hide legends" : "Show legends"}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Icon
                className={`ti ${showLegends ? "ti-eye" : "ti-eye-off"}`}
              ></Icon>
              <span style={{ fontSize: "12px" }}>Legends</span>
            </button>
          )}
          {selDash && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadCharts(selDash.id, applied, params)}
              title="Reload every chart"
            >
              <Icon className="ti ti-refresh"></Icon>
            </button>
          )}
          {selDash && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPageFs((v) => !v)}
              title={pageFs ? "Exit full screen" : "Full screen"}
              aria-label={pageFs ? "Exit full screen" : "Full screen"}
            >
              <Icon
                className={`ti ${pageFs ? "ti-arrows-minimize" : "ti-arrows-maximize"}`}
                style={{ fontSize: 14 }}
              ></Icon>
            </button>
          )}
          {/* Editors may create and edit; only admins may delete. The button
              used to be gated on isAdmin while the route accepted any editor. */}
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              showCreate ? setShowCreate(false) : setShowCreate(true)
            }
            disabled={!canEdit}
            style={!canEdit ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className={`ti ${showCreate ? "ti-x" : "ti-plus"}`}></Icon>{" "}
            {showCreate ? "Cancel" : "New"}
          </button>
        </div>
      </div>

      {showCreate && canEdit && (
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 16,
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Columns</label>
            <Select
              className="form-select"
              value={newCols}
              onChange={(e) => setNewCols(parseInt(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={createDash}
            disabled={!newName.trim()}
          >
            <Icon className="ti ti-plus"></Icon> Create
          </button>
        </div>
      )}

      {dashboards.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {dashboards.map((d) => (
            <div
              key={d.id}
              className="card"
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                border:
                  selDash?.id === d.id ? "2px solid var(--accent)" : undefined,
              }}
              onClick={() => selectDash(d)}
            >
              <Icon
                className="ti ti-layout-dashboard"
                style={{
                  color:
                    selDash?.id === d.id
                      ? "var(--accent)"
                      : "var(--icon-color)",
                }}
              ></Icon>
              <span style={{ fontWeight: selDash?.id === d.id ? 700 : 500 }}>
                {d.name}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {d.columns}col
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDel(d.id);
                }}
                style={{
                  padding: 2,
                  marginLeft: "auto",
                  opacity: !isAdmin ? 0.35 : 1,
                  cursor: !isAdmin ? "not-allowed" : "pointer",
                }}
                disabled={!isAdmin}
              >
                <Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon>
              </button>
            </div>
          ))}
        </div>
      )}

      {dashboards.length === 0 && !showCreate && (
        <div className="empty-state">
          <Icon className="ti ti-layout-dashboard"></Icon>
          <p>No dashboards. Create one to get started.</p>
        </div>
      )}

      {selDash && (
        <DashboardFilters
          filters={params.filters}
          settings={settings}
          draft={draft}
          applied={applied}
          onChange={changeFilter}
          onApply={applyFilters}
          onReset={resetFilters}
          onHoverFilter={setHoveredFilter}
          hoveredFilter={hoveredFilter}
          conflicts={conflictMessages}
          canEdit={canEdit}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {selDash && !!params.errors.length && (
        <div
          className="alert-banner warning"
          style={{ marginBottom: 12, fontSize: "13px" }}
        >
          <Icon className="ti ti-alert-triangle"></Icon>
          {params.errors.map((e) => `"${e.chartName}": ${e.message}`).join(" ")}
        </div>
      )}

      {(loading || transitioning) && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 24,
            transition: "opacity 0.3s ease-in-out",
            opacity: loading || transitioning ? 1 : 0,
          }}
        >
          <span className="loading-spinner"></span>
          <span
            style={{
              marginLeft: 12,
              color: "var(--text-muted)",
              fontSize: "13px",
            }}
          >
            {transitionPhase === "exiting"
              ? "Loading dashboard..."
              : "Updating charts..."}
          </span>
        </div>
      )}

      {selDash && !loading && charts.length === 0 && !transitioning && (
        <div className="empty-state">
          <Icon className="ti ti-chart-dots"></Icon>
          <p>No charts. Use Chart Builder to add some.</p>
        </div>
      )}

      {selDash && charts.length > 0 && !loading && !transitioning && (
        <div
          className={gridClassName}
          style={{
            transition:
              "opacity 0.35s ease-in-out, transform 0.35s ease-in-out",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Drag charts to swap positions.
            </span>
            {hasUnsaved && canEdit && (
              <button className="btn btn-primary btn-sm" onClick={saveLayout}>
                <Icon className="ti ti-device-floppy"></Icon> Save Layout
              </button>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 16,
            }}
          >
            {charts.map((chart, i) => (
              <div
                key={chart.id}
                className="chart-tile-wrapper"
                style={{
                  opacity: transitioning ? 0 : 1,
                  animationDelay: transitioning ? "0ms" : `${i * 40}ms`,
                }}
                draggable={!fs && canEdit}
                onDragStart={(e) => !fs && canEdit && onDragStart(e, i)}
                onDragOver={onDragOver}
                onDrop={(e) => canEdit && onDrop(e, i)}
              >
                <ChartTile
                  setFss={setFs}
                  sidebar={sidebar}
                  chart={chart}
                  onDelete={() =>
                    setDelChart({ id: chart.id, name: chart.name })
                  }
                  cols={cols}
                  isAdmin={isAdmin}
                  canEdit={canEdit}
                  showLegends={showLegends}
                  setShowLegends={setShowLegends}
                  legendSupportedTypes={legendSupportedTypes}
                  highlighted={
                    !!hoveredFilter &&
                    (params.byChart.get(chart.id) || []).some(
                      (p) => p.name === hoveredFilter,
                    )
                  }
                  filterNames={(params.byChart.get(chart.id) || []).map(
                    (p) => p.name,
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {del && isAdmin && (
        <ConfirmModal
          title="Delete Dashboard"
          message="Delete this dashboard? Charts will be unassigned."
          onConfirm={() => deleteDash(del)}
          onCancel={() => setDel(null)}
          danger
        />
      )}

      {delChart && isAdmin && (
        <ConfirmModal
          title="Delete Chart"
          message={`Delete "${delChart.name}"?`}
          onConfirm={async () => {
            await deleteChart(delChart.id);
            setDelChart(null);
          }}
          onCancel={() => setDelChart(null)}
          danger
        />
      )}
    </div>
  );
}

function ChartTile({
  chart,
  onDelete,
  sidebar,
  cols,
  setFss,
  isAdmin,
  canEdit,
  showLegends,
  legendSupportedTypes,
  highlighted = false,
  filterNames = [],
  setShowLegends,
}) {
  const ref = useRef(null);
  const inst = useRef(null);
  const [fs, setFs] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const { theme } = useTheme();
  const isDarkColor = theme === "dark" ? "white" : "black";

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!fs) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        setFs(false);
        setFss(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fs, setFss]);

  const hasLegend = useMemo(() => {
    const legend = chart?.chartOption?.legend;
    const series = chart?.chartOption?.series;
    if (legend?.show === false) return false;
    if (!Array.isArray(series) || series.length === 0) return false;
    return series.some((s) => Array.isArray(s?.data) && s?.data.length > 0);
  }, [chart]);

  const supportsLegend =
    legendSupportedTypes.includes(chart.chartSubtype) ||
    needsLegend(chart.chartType, chart.chartSubtype);

  function getContainerHeight() {
    if (fs) return "calc(100vh - 32px)";
    if (isSmallScreen) return "520px";
    return "580px";
  }

  function getChartHeight() {
    if (fs) return "calc(100vh - 100px)";
    if (isSmallScreen) return "420px";
    return "500px";
  }

  const barChartTypes = ["simple_bar", "grouped_bar", "stacked_bar"];
  const isBarChart = barChartTypes.includes(chart.chartSubtype);
  const isHeatmap =
    chart.chartType === "heatmap" || chart.chartSubtype === "heatmap";
  const isScatterLike =
    chart.chartSubtype === "scatter" ||
    chart.chartSubtype === "basic_scatter" ||
    chart.chartSubtype === "bubble" ||
    chart.chartType === "scatter" ||
    chart.chartType === "bubble";
  const pieChartTypes = ["pie", "donut", "rose", "nested_pie"];
  const isPieChart = pieChartTypes.includes(chart.chartSubtype);
  const funnelChartTypes = ["funnel"];
  const isFunnelChart =
    funnelChartTypes.includes(chart.chartSubtype) ||
    chart.chartType === "funnel";

  const tooltipWidth = fs ? 420 : isSmallScreen ? 220 : 300;
  const tooltipMaxHeight = fs ? 320 : 240;
  const tooltipExtraCss = `max-height: ${tooltipMaxHeight}px; overflow: auto; -webkit-overflow-scrolling: touch; width: ${tooltipWidth}px; pointer-events: auto;`;

  const resolvedLegend = fs
    ? {
        ...chart?.chartOption?.legend,
        show: supportsLegend && hasLegend && showLegends,
        type: "scroll",
        orient: "vertical",
        left: 0,
        top: 8,
        bottom: 8,
        width: 260,
        textStyle: {
          ...(chart?.chartOption?.legend?.textStyle || {}),
          color: isDarkColor,
          fontSize: 16,
        },
      }
    : isSmallScreen
      ? {
          ...chart?.chartOption?.legend,
          show: supportsLegend && hasLegend && showLegends,
          type: "scroll",
          orient: "horizontal",
          left: 0,
          right: 0,
          top: 0,
          width: "100%",
          pageIconColor: isDarkColor,
          pageIconInactiveColor: "var(--text-muted)",
          pageTextStyle: { color: isDarkColor },
          textStyle: {
            ...(chart?.chartOption?.legend?.textStyle || {}),
            color: isDarkColor,
          },
        }
      : cols === 4
        ? {
            ...chart?.chartOption?.legend,
            show: supportsLegend && hasLegend && showLegends,
            type: "scroll",
            left: 0,
            top: 0,
            bottom: 0,
            orient: "vertical",
            width: 135,
            pageIconColor: isDarkColor,
            pageIconInactiveColor: "var(--text-muted)",
            pageTextStyle: { color: isDarkColor },
            textStyle: {
              ...(chart?.chartOption?.legend?.textStyle || {}),
              color: isDarkColor,
            },
          }
        : {
            ...chart?.chartOption?.legend,
            show: supportsLegend && hasLegend && showLegends,
            type: "scroll",
            left: 0,
            right: 0,
            top: 0,
            orient: "horizontal",
            pageIconColor: isDarkColor,
            pageIconInactiveColor: "var(--text-muted)",
            pageTextStyle: { color: isDarkColor },
            textStyle: {
              ...(chart?.chartOption?.legend?.textStyle || {}),
              color: isDarkColor,
            },
          };

  const tickCount = useMemo(() => {
    const opt = chart?.chartOption;
    if (!opt) return 0;
    if (Array.isArray(opt.xAxis)) {
      const ax = opt.xAxis[0];
      if (ax?.data?.length) return ax.data.length;
    } else if (opt.xAxis?.data?.length) return opt.xAxis.data.length;
    if (Array.isArray(opt.series) && opt.series[0]?.data?.length)
      return opt.series[0].data.length;
    return 0;
  }, [chart]);

  const isFullscreen = fs;
  const axisFontSize = isFullscreen
    ? tickCount > 80
      ? 11
      : tickCount > 60
        ? 12
        : tickCount > 40
          ? 13
          : tickCount > 24
            ? 14
            : 15
    : tickCount > 80
      ? 7
      : tickCount > 60
        ? 8
        : tickCount > 40
          ? 9
          : tickCount > 24
            ? 10
            : 11;
  const dataLabelFontSize = isFullscreen
    ? tickCount > 80
      ? 11
      : tickCount > 60
        ? 12
        : tickCount > 40
          ? 12
          : tickCount > 24
            ? 13
            : 14
    : tickCount > 80
      ? 7
      : tickCount > 60
        ? 8
        : tickCount > 40
          ? 8
          : tickCount > 24
            ? 9
            : 10;
  const xRotate =
    isBarChart || isHeatmap
      ? tickCount > 80
        ? 65
        : tickCount > 40
          ? 55
          : tickCount > 20
            ? 45
            : 35
      : isScatterLike
        ? isSmallScreen
          ? 22
          : 15
        : tickCount > 40
          ? 30
          : tickCount > 24
            ? 20
            : 0;
  const axisNameGapX =
    isBarChart || isHeatmap
      ? tickCount > 50
        ? 132
        : 120
      : isScatterLike
        ? 58
        : 48;
  const axisMarginX =
    isBarChart || isHeatmap
      ? tickCount > 50
        ? 16
        : 20
      : tickCount > 40
        ? 10
        : 12;
  const seriesLabelWidth = isFullscreen
    ? tickCount > 80
      ? 60
      : tickCount > 60
        ? 72
        : tickCount > 40
          ? 84
          : tickCount > 24
            ? 96
            : 108
    : tickCount > 80
      ? 36
      : tickCount > 60
        ? 42
        : tickCount > 40
          ? 48
          : tickCount > 24
            ? 56
            : 64;

  const gridTop = fs
    ? Math.max(28, tickCount > 40 ? 40 : 28)
    : isSmallScreen
      ? supportsLegend && hasLegend && showLegends
        ? 76
        : Math.max(22, tickCount > 40 ? 28 : 22)
      : cols === 4
        ? supportsLegend && hasLegend && showLegends
          ? 24
          : 22
        : supportsLegend && hasLegend && showLegends
          ? Math.max(62, tickCount > 40 ? 68 : 62)
          : Math.max(24, tickCount > 40 ? 30 : 24);

  const gridLeft = fs
    ? supportsLegend && hasLegend && showLegends
      ? 300
      : 20
    : !isSmallScreen && cols === 4 && supportsLegend && hasLegend && showLegends
      ? 145
      : 20;

  const gridBottomAuto =
    isBarChart || isHeatmap
      ? tickCount > 80
        ? 250
        : tickCount > 60
          ? 230
          : tickCount > 40
            ? 210
            : tickCount > 24
              ? 185
              : 165
      : isScatterLike
        ? tickCount > 40
          ? 108
          : 94
        : tickCount > 40
          ? 116
          : 98;

  const isLine =
    Array.isArray(chart?.chartOption?.series) &&
    chart.chartOption.series.some((s) => s.type === "line");
  const isStackedArea =
    Array.isArray(chart?.chartOption?.series) &&
    chart.chartOption.series.some(
      (s) => s.stack && (s.areaStyle || s.type === "line"),
    );

  const shouldShowDataLabels = (() => {
    if (isHeatmap) {
      const totalHeatmapCells = Array.isArray(chart?.chartOption?.series)
        ? chart.chartOption.series.reduce((acc, s) => {
            if (s.type === "heatmap" && Array.isArray(s.data)) {
              return acc + s.data.length;
            }
            return acc;
          }, 0)
        : 0;
      if (totalHeatmapCells > 15) return false;
      return true;
    }
    if (isPieChart) return true;
    if (fs) {
      if (tickCount > 150) return false;
      if (isBarChart && tickCount > 35) return false;
      if (!isBarChart && tickCount > 40) return false;
      return true;
    }

    if (isLine) {
      if (isSmallScreen) {
        return tickCount <= 20;
      }
      return tickCount <= 25;
    }
    if (isSmallScreen) {
      if (tickCount > 20) return false;
      if (isBarChart && tickCount > 15) return false;
      if (!isBarChart && tickCount > 25) return false;
    }
    if (!isSmallScreen && !fs) {
      if (tickCount > 50) return false;
      if (isBarChart && tickCount > 35) return false;
      if (!isBarChart && tickCount > 40) return false;
    }
    return true;
  })();

  const shouldShowFunnelLabels = (() => {
    if (fs) return true;
    if (!isFunnelChart) return true;
    const funnelCount = Array.isArray(chart?.chartOption?.series)
      ? chart.chartOption.series
          .filter((s) => s?.type === "funnel")
          .reduce(
            (acc, s) => acc + (Array.isArray(s?.data) ? s.data.length : 0),
            0,
          )
      : 0;
    if (isSmallScreen && funnelCount > 10) return false;
    if (!isSmallScreen && funnelCount > 16) return false;
    return true;
  })();

  function countSunburstNodes(dataNode) {
    if (!dataNode) return 0;
    if (Array.isArray(dataNode)) {
      return dataNode.reduce((acc, n) => acc + countSunburstNodes(n), 0);
    }
    let count = 1;
    if (Array.isArray(dataNode.children)) {
      count += dataNode.children.reduce(
        (acc, c) => acc + countSunburstNodes(c),
        0,
      );
    }
    return count;
  }

  const opt = {
    ...chart.chartOption,
    responsive: true,
    maintainAspectRatio: false,
    grid: {
      ...chart?.chartOption?.grid,
      top: gridTop,
      left: gridLeft,
      right: 24,
      bottom: gridBottomAuto,
      containLabel: true,
      width: fs ? undefined : undefined,
      height: fs ? undefined : undefined,
    },
    toolbox: { show: false },
    legend: resolvedLegend,
    xAxis: Array.isArray(chart?.chartOption?.xAxis)
      ? chart.chartOption.xAxis.map((axis) => ({
          ...axis,
          type: isBarChart || isHeatmap ? "category" : axis?.type,
          nameGap: axisNameGapX,
          nameLocation: "middle",
          position: "bottom",
          axisLabel: {
            ...axis?.axisLabel,
            rotate: xRotate,
            align: isBarChart || isHeatmap || xRotate > 0 ? "right" : "left",
            color: isDarkColor,
            margin: Math.max(axis?.axisLabel?.margin || 8, axisMarginX),
            hideOverlap: false,
            showMinLabel: true,
            showMaxLabel: true,
            interval: 0,
            fontSize: axisFontSize,
            formatter: (v) => {
              try {
                const n = Number(v);
                if (Number.isFinite(n)) {
                  if (Math.abs(n) >= 1000000)
                    return `${(n / 1000000).toFixed(1)}M`;
                  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                }
                const s = String(v);
                const maxLen =
                  tickCount > 80
                    ? 8
                    : tickCount > 60
                      ? 10
                      : tickCount > 40
                        ? 12
                        : 16;
                return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
              } catch {
                return v;
              }
            },
          },
          axisLine: { show: false },
          nameTextStyle: {
            ...(axis?.nameTextStyle || {}),
            color: isDarkColor,
            fontSize: Math.max(8, axisFontSize - 1),
            fontWeight: "bold",
          },
        }))
      : {
          ...chart?.chartOption?.xAxis,
          type:
            isBarChart || isHeatmap
              ? "category"
              : chart?.chartOption?.xAxis?.type,
          nameGap: axisNameGapX,
          nameLocation: "middle",
          position: "bottom",
          axisLabel: {
            ...chart?.chartOption?.xAxis?.axisLabel,
            rotate: xRotate,
            align: isBarChart || isHeatmap || xRotate > 0 ? "right" : "left",
            color: isDarkColor,
            margin: Math.max(
              chart?.chartOption?.xAxis?.axisLabel?.margin || 8,
              axisMarginX,
            ),
            hideOverlap: false,
            showMinLabel: true,
            showMaxLabel: true,
            interval: 0,
            fontSize: axisFontSize,
            formatter: (v) => {
              try {
                const n = Number(v);
                if (Number.isFinite(n)) {
                  if (Math.abs(n) >= 1000000)
                    return `${(n / 1000000).toFixed(1)}M`;
                  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                }
                const s = String(v);
                const maxLen =
                  tickCount > 80
                    ? 8
                    : tickCount > 60
                      ? 10
                      : tickCount > 40
                        ? 12
                        : 16;
                return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
              } catch {
                return v;
              }
            },
          },
          axisLine: { show: false },
          nameTextStyle: {
            ...(chart?.chartOption?.xAxis?.nameTextStyle || {}),
            color: isDarkColor,
            fontSize: Math.max(8, axisFontSize - 1),
            fontWeight: "bold",
          },
        },
    yAxis: Array.isArray(chart?.chartOption?.yAxis)
      ? chart.chartOption.yAxis.map((axis) => ({
          ...axis,
          position: "left",
          nameLocation: axis?.nameLocation || "middle",
          nameGap: Math.max(
            axis?.nameGap || 25,
            yAxisNameGap(chart?.chartOption),
          ),
          axisLabel: {
            ...axis?.axisLabel,
            rotate: 0,
            align: "right",
            color: isDarkColor,
            hideOverlap: false,
            showMinLabel: true,
            showMaxLabel: true,
            interval: 0,
            fontSize: axisFontSize,
            formatter: (v) => {
              try {
                const n = Number(v);
                if (Number.isFinite(n)) {
                  if (Math.abs(n) >= 1000000)
                    return `${(n / 1000000).toFixed(1)}M`;
                  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                }
                return v;
              } catch {
                return v;
              }
            },
          },
          nameTextStyle: {
            ...(axis?.nameTextStyle || {}),
            color: isDarkColor,
            fontSize: Math.max(8, axisFontSize - 1),
            fontWeight: "bold",
          },
          axisLine: { show: false },
        }))
      : {
          ...chart?.chartOption?.yAxis,
          position: "left",
          nameLocation: chart?.chartOption?.yAxis?.nameLocation || "middle",
          nameGap: Math.max(
            chart?.chartOption?.yAxis?.nameGap || 25,
            yAxisNameGap(chart?.chartOption),
          ),
          axisLabel: {
            ...chart?.chartOption?.yAxis?.axisLabel,
            rotate: 0,
            align: "right",
            color: isDarkColor,
            hideOverlap: false,
            showMinLabel: true,
            showMaxLabel: true,
            interval: 0,
            fontSize: axisFontSize,
            formatter: (v) => {
              try {
                const n = Number(v);
                if (Number.isFinite(n)) {
                  if (Math.abs(n) >= 1000000)
                    return `${(n / 1000000).toFixed(1)}M`;
                  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                }
                return v;
              } catch {
                return v;
              }
            },
          },
          nameTextStyle: {
            ...(chart?.chartOption?.yAxis?.nameTextStyle || {}),
            color: isDarkColor,
            fontSize: Math.max(8, axisFontSize - 1),
            fontWeight: "bold",
          },
          axisLine: { show: false },
        },
  };

  opt.tooltip = {
    ...(opt.tooltip || {}),
    confine: true,
    enterable: true,
    extraCssText: tooltipExtraCss,
  };

  if (isHeatmap) {
    if (Array.isArray(opt.series)) {
      opt.series = opt.series.map((s) => {
        if (!s || s.type !== "heatmap") return s;

        const totalHeatmapCells = Array.isArray(s.data) ? s.data.length : 0;
        const shouldHideHeatmapLabels = totalHeatmapCells > 15;

        return {
          ...s,
          label: {
            ...(s.label || {}),
            show: shouldHideHeatmapLabels
              ? false
              : s.label?.show !== undefined
                ? s.label.show
                : true,
            color: isDarkColor,
            fontSize: fs
              ? Math.min(14, axisFontSize + 3)
              : Math.min(10, axisFontSize),
            formatter: (params) => {
              if (params && params.value && params.value.length >= 3) {
                const val = params.value[2];
                if (typeof val === "number") {
                  if (Math.abs(val) >= 1000000)
                    return `${(val / 1000000).toFixed(1)}M`;
                  if (Math.abs(val) >= 1000)
                    return `${(val / 1000).toFixed(1)}K`;
                  return val;
                }
                return val;
              }
              return "";
            },
          },
          emphasis: {
            ...(s.emphasis || {}),
            label: {
              ...((s.emphasis && s.emphasis.label) || {}),
              show: true,
              color: isDarkColor,
              fontSize: fs ? 16 : 12,
            },
          },
        };
      });
    }
  }

  if (Array.isArray(opt.series) && opt.series.length) {
    opt.series = opt.series.map((s) => {
      if (!s || !s.type) return s;
      if (s.type !== "bar" && s.type !== "line" && s.type !== "scatter")
        return s;
      // In fullscreen, use larger label font sizes
      const labelFont = fs
        ? Math.max(13, dataLabelFontSize + 3)
        : dataLabelFontSize;
      const labelWidth = fs
        ? tickCount > 80
          ? 60
          : tickCount > 60
            ? 72
            : tickCount > 40
              ? 84
              : tickCount > 24
                ? 96
                : 108
        : seriesLabelWidth;
      return {
        ...s,
        clip: true,
        labelLayout: {
          hideOverlap: true,
          moveOverlap: "shiftY",
        },
        label: {
          ...(s.label || {}),
          show: shouldShowDataLabels,
          position: s.type === "bar" ? "top" : "top",
          distance: tickCount > 50 ? 5 : 8,
          color: isDarkColor,
          overflow: "truncate",
          width: labelWidth,
          hideOverlap: true,
          fontSize: labelFont,
          formatter: (p) => {
            try {
              const raw = Array.isArray(p?.value)
                ? p.value[p.value.length - 1]
                : p?.value;
              const n = Number(raw);
              if (Number.isFinite(n)) {
                if (Math.abs(n) >= 1000000)
                  return `${(n / 1000000).toFixed(1)}M`;
                if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
                return `${n}`;
              }
              const t = String(raw ?? "");
              const maxLen =
                tickCount > 80
                  ? 5
                  : tickCount > 60
                    ? 6
                    : tickCount > 40
                      ? 7
                      : 8;
              return t.length > maxLen ? t.slice(0, maxLen - 1) + "…" : t;
            } catch {
              return p?.value;
            }
          },
        },
        emphasis: {
          ...(s.emphasis || {}),
          label: {
            ...((s.emphasis && s.emphasis.label) || {}),
            show: true,
            position: "top",
            distance: fs ? 16 : 10,
            color: isDarkColor,
            hideOverlap: false,
            fontSize: fs ? 16 : 12,
          },
        },
      };
    });
  }

  const pieSubtypes = ["pie", "donut", "rose", "nested_pie"];
  const isPie =
    Array.isArray(opt.series) &&
    (opt.series.some((s) => s.type === "pie") ||
      pieSubtypes.includes(chart.chartSubtype));
  const lineDataLength =
    Array.isArray(opt.series) && opt.series.some((s) => s.data?.length > 200);

  if (
    Array.isArray(opt.series) &&
    (opt.series.some((s) => s.type === "pie") ||
      pieSubtypes.includes(chart.chartSubtype))
  ) {
    const pieSeries = opt.series.filter((s) => s.type === "pie");
    const pieSliceCount = pieSeries.reduce(
      (acc, s) => acc + (Array.isArray(s?.data) ? s.data.length : 0),
      0,
    );
    const hidePieLabels = pieSliceCount > 16;

    opt.series = (opt.series || []).map((s) => {
      if (s.type !== "pie") return s;
      const defaultBaseRadius =
        chart.chartSubtype === "pie" ? ["0%", "64%"] : ["40%", "64%"];
      const baseRadius = s.radius || defaultBaseRadius;
      const finalRadius = fs
        ? chart.chartSubtype === "pie"
          ? ["0%", "72%"]
          : ["40%", "72%"]
        : isSmallScreen
          ? chart.chartSubtype === "pie"
            ? ["0%", "56%"]
            : ["30%", "56%"]
          : chart.chartSubtype === "pie"
            ? ["0%", "54%"]
            : ["28%", "54%"];
      const finalCenter = fs
        ? s.center || ["50%", "50%"]
        : isSmallScreen
          ? s.center || ["50%", "55%"]
          : s.center || ["50%", "57%"];
      return {
        ...s,
        avoidLabelOverlap: true,
        label: {
          ...(s.label || {}),
          show: !hidePieLabels && shouldShowDataLabels,
          formatter:
            s.label?.formatter ||
            function (params) {
              return params.name
                ? `${params.name}\n${params.percent}%`
                : `${params.percent}%`;
            },
          color: isDarkColor,
          fontSize: fs ? 15 : 11,
          overflow: "truncate",
          width: fs ? 340 : isSmallScreen ? 160 : 220,
          lineHeight: fs ? 26 : 18,
        },
        labelLine: {
          ...(s.labelLine || {}),
          length: fs ? 16 : 8,
          length2: fs ? 16 : 8,
          smooth: false,
        },
        radius: finalRadius,
        center: finalCenter,
      };
    });

    opt.legend = {
      ...(opt.legend || {}),
      textStyle: {
        ...(opt.legend?.textStyle || {}),
        fontSize: fs ? 16 : isSmallScreen ? 10 : 12,
        color: isDarkColor,
      },
      itemGap: fs ? 18 : 12,
      pageIconColor: isDarkColor,
    };

    opt.grid = {
      ...(opt.grid || {}),
      top: fs ? opt.grid?.top || gridTop : isSmallScreen ? 72 : 80,
    };
  }

  if (isStackedArea) {
    opt.tooltip = {
      ...(opt.tooltip || {}),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      enterable: true,
      extraCssText: tooltipExtraCss,
      formatter: function (params) {
        try {
          if (!Array.isArray(params)) return params?.name || "";
          const axisLabel = params[0]?.axisValue ?? params[0]?.name ?? "";
          const total = params.reduce(
            (s, p) => s + (Number(p?.value ?? 0) || 0),
            0,
          );
          const lines = [];
          lines.push(axisLabel);
          for (const p of params) {
            const value = Number(p?.value ?? 0) || 0;
            const pct = total ? ((value / total) * 100).toFixed(1) + "%" : "";
            lines.push(
              `${p.seriesName}: ${value}${pct ? " (" + pct + ")" : ""}`,
            );
          }
          return lines.join("<br/>");
        } catch (e) {
          return "";
        }
      },
    };
  } else if (
    Array.isArray(opt.series) &&
    opt.series.some((s) => s.type === "line" && s.data?.length > 50)
  ) {
    opt.tooltip = {
      ...(opt.tooltip || {}),
      trigger: "axis",
      confine: true,
      enterable: true,
      extraCssText: tooltipExtraCss,
      formatter: function (params) {
        try {
          if (!Array.isArray(params)) return params?.name || "";
          const lines = [];
          for (const p of params) {
            const value = Number(p?.value ?? 0) || 0;
            lines.push(`${p.seriesName}: ${value}`);
          }
          return lines.join("<br/>");
        } catch (e) {
          return "";
        }
      },
    };
  } else {
    opt.tooltip = {
      ...(opt.tooltip || {}),
      confine: true,
      enterable: true,
      extraCssText: tooltipExtraCss,
    };
  }

  if (Array.isArray(opt.series)) {
    opt.series = opt.series.map((s) => {
      if (!s || s.type !== "funnel") return s;
      return {
        ...s,
        minSize: s.minSize ?? "0%",
        maxSize: s.maxSize ?? "100%",
        gap: Math.max(0, s.gap ?? 1),
        left:
          fs && supportsLegend && hasLegend && showLegends
            ? "22%"
            : (s.left ?? "10%"),
        top:
          fs && supportsLegend && hasLegend && showLegends
            ? "8%"
            : (s.top ?? "10%"),
        width:
          fs && supportsLegend && hasLegend && showLegends
            ? "74%"
            : (s.width ?? "80%"),
        height:
          fs && supportsLegend && hasLegend && showLegends
            ? "84%"
            : (s.height ?? "80%"),
        labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
        label: {
          ...(s.label || {}),
          show: shouldShowFunnelLabels,
          color: isDarkColor,
          overflow: "truncate",
          width: fs ? 320 : isSmallScreen ? 110 : 160,
          fontSize: fs ? 16 : isSmallScreen ? 10 : 11,
        },
        labelLine: {
          ...(s.labelLine || {}),
          show: shouldShowFunnelLabels,
          lineStyle: {
            ...(s.labelLine?.lineStyle || {}),
            color: isDarkColor,
            opacity: 1,
          },
        },
        itemStyle: {
          ...(s.itemStyle || {}),
          borderColor: isDarkColor,
        },
        emphasis: {
          ...(s.emphasis || {}),
          label: {
            ...((s.emphasis && s.emphasis.label) || {}),
            show: true,
            color: isDarkColor,
            fontSize: fs ? 18 : 12,
          },
          labelLine: {
            ...((s.emphasis && s.emphasis.labelLine) || {}),
            show: true,
            lineStyle: {
              ...((s.emphasis &&
                s.emphasis.labelLine &&
                s.emphasis.labelLine.lineStyle) ||
                {}),
              color: isDarkColor,
              opacity: 1,
            },
          },
          itemStyle: {
            ...((s.emphasis && s.emphasis.itemStyle) || {}),
            borderColor: isDarkColor,
          },
        },
      };
    });
  }

  const isSankey =
    Array.isArray(opt.series) && opt.series.some((s) => s.type === "sankey");

  if (isSankey) {
    opt.series = opt.series.map((s) => {
      if (s.type !== "sankey") return s;
      return {
        ...s,
        label: {
          ...(s.label || {}),
          color: isDarkColor,
          fontSize: fs ? 18 : 14,
        },
      };
    });
  }

  if (theme === "dark") {
    const shadowlessSeriesTypes = ["sankey", "sunburst", "graph", "tree"];
    if (Array.isArray(opt.series)) {
      const borderColor = "rgba(0,0,0,0.65)";
      opt.series = opt.series.map((s) => {
        if (!s || !s.type) return s;
        if (s.type === "sankey") {
          return {
            ...s,
            label: {
              ...(s.label || {}),
              color: isDarkColor,
              fontSize: fs ? 18 : 14,
            },
            itemStyle: {
              ...(s.itemStyle || {}),
              borderColor: "rgba(255,255,255,0.08)",
              borderWidth: 1,
            },
            emphasis: {
              ...(s.emphasis || {}),
              focus: "adjacency",
              itemStyle: {
                ...(s.emphasis?.itemStyle || {}),
                borderColor: "rgba(255,255,255,0.18)",
                borderWidth: 1.5,
              },
            },
            lineStyle: {
              ...(s.lineStyle || {}),
              color: "rgba(255,255,255,0.12)",
              opacity: 0.8,
              curveness: s.lineStyle?.curveness ?? 0.2,
            },
          };
        }
        if (!shadowlessSeriesTypes.includes(s.type)) return s;
        const enhanceLabelStyling = (lbl) => {
          const baseTextStyle = {
            ...(lbl?.textStyle || {}),
            color: isDarkColor,
            textBorderColor: borderColor,
            textBorderWidth: 2,
            textShadowColor: "transparent",
            textShadowBlur: 0,
            fontSize: fs
              ? lbl?.fontSize
                ? lbl.fontSize + 4
                : 16
              : lbl?.fontSize || 12,
          };
          if (!lbl) return { textStyle: baseTextStyle };
          return { ...lbl, textStyle: baseTextStyle };
        };
        return {
          ...s,
          label: enhanceLabelStyling(s.label),
          emphasis: s.emphasis
            ? { ...s.emphasis, label: enhanceLabelStyling(s.emphasis.label) }
            : s.emphasis,
          lineStyle: s.lineStyle
            ? {
                ...(s.lineStyle || {}),
                textStyle: {
                  ...(s.lineStyle?.textStyle || {}),
                  color: isDarkColor,
                  textBorderColor: borderColor,
                  textBorderWidth: 2,
                  textShadowColor: "transparent",
                  textShadowBlur: 0,
                },
              }
            : s.lineStyle,
          itemStyle: s.itemStyle
            ? {
                ...(s.itemStyle || {}),
                textStyle: {
                  ...(s.itemStyle?.textStyle || {}),
                  color: isDarkColor,
                  textBorderColor: borderColor,
                  textBorderWidth: 2,
                  textShadowColor: "transparent",
                  textShadowBlur: 0,
                },
              }
            : s.itemStyle,
        };
      });
      opt.legend = {
        ...(opt.legend || {}),
        textStyle: {
          ...(opt.legend?.textStyle || {}),
          color: isDarkColor,
          textBorderColor: "rgba(0,0,0,0.65)",
          textBorderWidth: 2,
          textShadowColor: "transparent",
          textShadowBlur: 0,
          fontSize: fs ? 16 : 12,
        },
      };
    }
  }

  const isSunBurst =
    Array.isArray(opt.series) && opt.series.some((s) => s.type === "sunburst");
  const isSunBurstVisualmap = Object.keys(opt?.visualMap || {})?.length > 0;

  if (isSunBurst) {
    let sunburstNodeCount = 0;
    opt.series = opt.series.map((s) => {
      if (s.type !== "sunburst") return s;
      const nodeCount = Array.isArray(s.data)
        ? s.data.reduce((a, n) => a + countSunburstNodes(n), 0)
        : countSunburstNodes(s.data);
      sunburstNodeCount += nodeCount;
      const hideSunburst = nodeCount > 15;
      return {
        ...s,
        radius: isSunBurstVisualmap ? ["3%", "70%"] : ["5%", "90%"],
        levels: [
          {},
          {
            label: {
              position: "outside",
              rotate: "tangential",
              distance: fs ? 20 : 10,
              rotate: 0,
              show: !hideSunburst,
              fontSize: fs ? 16 : 11,
            },
            labelLine: {
              show: true,
              length: fs ? 30 : 20,
              length2: fs ? 20 : 10,
              smooth: false,
            },
          },
          {
            label: {
              position: "outside",
              distance: fs ? 20 : 10,
              rotate: 0,
              silent: true,
              show: !hideSunburst,
              fontSize: fs ? 14 : 10,
            },
            labelLine: {
              show: true,
              length: fs ? 30 : 20,
              length2: fs ? 20 : 10,
              smooth: false,
            },
          },
        ],
      };
    });

    const sunburstNodes = [];
    const collectNames = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collectNames);
        return;
      }
      if (node.name) sunburstNodes.push(node.name);
      if (Array.isArray(node.children)) {
        node.children.forEach(collectNames);
      }
    };
    opt.series.forEach((s) => {
      if (!s || s.type !== "sunburst") return;
      if (Array.isArray(s.data)) s.data.forEach(collectNames);
      else collectNames(s.data);
    });
    const uniqueLegendData = Array.from(new Set(sunburstNodes)).slice(0, 200);
    if (!opt.legend) opt.legend = {};
    if (uniqueLegendData.length) {
      opt.legend.data = uniqueLegendData;
      opt.legend.show =
        supportsLegend &&
        hasLegend &&
        showLegends &&
        uniqueLegendData.length > 0;
      if (!opt.legend.orient)
        opt.legend.orient = fs
          ? "vertical"
          : isSmallScreen
            ? "horizontal"
            : cols === 4
              ? "vertical"
              : "vertical";
      opt.legend.textStyle = {
        ...(opt.legend.textStyle || {}),
        color: isDarkColor,
        fontSize: fs ? 16 : 12,
      };
      opt.legend.type = opt.legend.type || "scroll";
      opt.legend.pageIconColor = isDarkColor;
      opt.legend.pageIconInactiveColor =
        opt.legend.pageIconInactiveColor || "var(--text-muted)";
      opt.legend.pageTextStyle = {
        ...(opt.legend.pageTextStyle || {}),
        fontSize: fs ? 14 : 11,
      };
    } else {
      opt.legend.show = supportsLegend && hasLegend && showLegends;
    }
  }

  useEffect(() => {
    if (
      !ref.current ||
      !opt ||
      opt._kpi ||
      opt._error ||
      opt._table ||
      opt._waiting
    )
      return;
    try {
      inst.current = initChart(ref.current);
      inst.current.clear();
      inst.current.setOption(withZoomable(opt), true);
      setTimeout(() => inst.current?.resize(), 50);
    } catch {}
    return () => {
      if (ref.current) disposeChart(ref.current);
    };
  }, [opt, theme]);

  useEffect(() => {
    setTimeout(() => inst.current?.resize(), 150);
  }, [fs, isSmallScreen, cols, showLegends]);

  function zoomIn() {
    if (inst.current) {
      const option = inst.current.getOption();
      const dataZoom = option.dataZoom;
      if (dataZoom && dataZoom[0]) {
        let start = dataZoom[0].start !== undefined ? dataZoom[0].start : 0;
        let end = dataZoom[0].end !== undefined ? dataZoom[0].end : 100;
        const range = end - start;
        const newStart = Math.max(0, start + range * 0.1);
        const newEnd = Math.min(100, end - range * 0.1);
        inst.current.dispatchAction({
          type: "dataZoom",
          start: newStart,
          end: newEnd,
          dataZoomIndex: 0,
        });
      } else {
        inst.current.dispatchAction({
          type: "dataZoom",
          start: 0,
          end: 50,
          dataZoomIndex: 0,
        });
      }
    }
  }

  function zoomOut() {
    if (inst.current) {
      const option = inst.current.getOption();
      const dataZoom = option.dataZoom;
      if (dataZoom && dataZoom[0]) {
        let start = dataZoom[0].start !== undefined ? dataZoom[0].start : 0;
        let end = dataZoom[0].end !== undefined ? dataZoom[0].end : 100;
        const range = end - start;
        const newStart = Math.max(0, start - range * 0.1);
        const newEnd = Math.min(100, end + range * 0.1);
        inst.current.dispatchAction({
          type: "dataZoom",
          start: newStart,
          end: newEnd,
          dataZoomIndex: 0,
        });
      } else {
        inst.current.dispatchAction({
          type: "dataZoom",
          start: 50,
          end: 100,
          dataZoomIndex: 0,
        });
      }
    }
  }

  function resetZoom() {
    if (inst.current) {
      inst.current.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
        dataZoomIndex: 0,
      });
    }
  }

  const wrap = fs
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg-page)",
        padding: 16,
        overflow: "auto",
        cursor: "default",
      }
    : {
        width: "100%",
        height: getContainerHeight(),
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      };

  const pieChartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
    legendFun: isSmallScreen && supportsLegend && hasLegend,
  };
  const chartControlsFlags = {
    zoomFun: true,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
    legendFun: isSmallScreen && supportsLegend && hasLegend,
  };
  const sankeyControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
    legendFun: isSmallScreen && supportsLegend && hasLegend,
  };
  const funnelControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
    legendFun: isSmallScreen && supportsLegend && hasLegend,
  };

  return (
    <div
      className="card"
      style={{
        padding: 16,
        ...wrap,
        ...(highlighted
          ? { outline: "2px solid var(--accent)", outlineOffset: -2 }
          : {}),
        ...(chart._rerunning ? { opacity: 0.6 } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            minWidth: 0,
            flex: 1,
            paddingRight: 8,
          }}
          title={
            filterNames.length
              ? `Filters: ${filterNames.join(", ")}`
              : "No filters affect this chart"
          }
        >
          {chart.name}
          {chart._rerunning && (
            <span className="loading-spinner" style={{ marginLeft: 8 }} />
          )}
        </span>
        <div
          style={{
            display: "flex",
            gap: 4,
            alignItems: "center",
            flexWrap: "nowrap",
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          {!opt._error && !opt._waiting && !opt._kpi && !opt._table && (
            <ChartToolbar
              zoomable={!!opt?.xAxis}
              fullscreen={fs}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomReset={resetZoom}
              onSave={() => savePng(inst.current, chart.name)}
              onToggleFullscreen={() => {
                setFs((prev) => {
                  const next = !prev;
                  setFss(next);
                  return next;
                });
              }}
              onToggleLegend={() => {
                if (setShowLegends) setShowLegends((prev) => !prev);
              }}
              legendVisible={showLegends}
              style={{ flexWrap: "nowrap" }}
              isWantFeature={
                chart.chartType === "pie"
                  ? pieChartControlsFlags
                  : chart.chartType === "funnel" ||
                      chart.chartSubtype === "funnel"
                    ? funnelControlsFlags
                    : chart.chartType === "sankey"
                      ? sankeyControlsFlags
                      : chartControlsFlags
              }
            />
          )}
          {opt && (opt._error || opt._waiting || opt._kpi || opt._table) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setFs((prev) => {
                  const next = !prev;
                  setFss(next);
                  return next;
                });
              }}
              title={fs ? "Exit full screen" : "Full screen"}
            >
              <Icon
                className={`ti ${fs ? "ti-arrows-minimize" : "ti-arrows-maximize"}`}
                style={{ fontSize: 14 }}
              ></Icon>
            </button>
          )}
          {isAdmin && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={onDelete}
              title="Delete chart (admin only)"
              disabled={!canEdit}
              style={!canEdit ? { opacity: 0.35, cursor: "not-allowed" } : {}}
            >
              <Icon className="ti ti-trash" style={{ fontSize: 14 }}></Icon>
            </button>
          )}
        </div>
      </div>
      {opt?._error && (
        <div className="alert-banner danger" style={{ fontSize: "13px" }}>
          <Icon className="ti ti-alert-circle"></Icon> {opt.message}
        </div>
      )}
      {opt?._waiting && (
        <div className="alert-banner warning" style={{ fontSize: "13px" }}>
          <Icon className="ti ti-clock"></Icon> {opt.message}
        </div>
      )}
      {opt?._kpi && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {opt.label}
          </div>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: "var(--accent)",
              fontFamily: "var(--font-table)",
            }}
          >
            {opt.value}
          </div>
        </div>
      )}
      {opt?._table && (
        <DataTable rows={opt.data} maxRows={fs ? opt?.data?.length || 10 : 5} />
      )}
      {!opt?._kpi && !opt?._table && !opt?._error && !opt?._waiting && (
        <div
          ref={ref}
          style={{
            height: getChartHeight(),
            width: "100%",
            flex: 1,
            position: "relative",
            display: "flex",
            paddingRight: 0,
          }}
        />
      )}
    </div>
  );
}
