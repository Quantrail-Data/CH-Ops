// CurrentQueries.jsx - live view of system.processes
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Split out of QueriesSection.jsx. 

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import ChartCard from "../layout/ChartCard.jsx";
import SortableDataTable from "../layout/SortableDataTable.jsx";
import QueryDetailModal from "./QueryDetailModal.jsx";
import KillQueriesModal from "./KillQueriesModal.jsx";
import { useAuth } from "../../App.jsx";
import { runQuery } from "../../utils/api.js";
import { fmtBytes, fmtDuration, fmtPercent, fmtRows, num } from "../../utils/format.js";
import {
  applyFilters,
  buildFilterOptionsSql,
  buildProcessesSql,
  DEFAULT_REFRESH_MS,
  DEFAULT_SORT,
  deriveRows,
  distinctValues,
  mergeOptions,
  PROCESS_COLUMNS,
  REFRESH_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_FIELDS,
  totalRunning,
  sortRows,
  summarise,
} from "./processesModel.js";
import {
  CONCURRENCY_HISTORY_LIMIT,
  concurrencyOption,
  longestRunningOption,
  memoryByUserOption,
  queriesPerUserOption,
  readBytesByUserOption,
} from "./currentQueriesCharts.js";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

// .cui-select is width:100%, so these have to be set explicitly.
const USER_SELECT_WIDTH = 190;
const KIND_SELECT_WIDTH = 150;
const REFRESH_SELECT_WIDTH = 96;
const SEARCH_WIDTH = 360;
const SEARCH_FIELD_WIDTH = 140;

// ChartCard adds its own 80px, so pass this to all of them or heights diverge.
const CHART_HEIGHT = 260;
// Inline styles cannot carry a media query, so the grid measures itself.
const TWO_COLUMN_MIN_WIDTH = 760;

// Callback ref: the grid only exists while open, so a mount effect would miss it.
function useColumnCount() {
  const [cols, setCols] = useState(2);
  const observer = useRef(null);

  const attach = useCallback((node) => {
    if (observer.current) {
      observer.current.disconnect();
      observer.current = null;
    }
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setCols(entry.contentRect.width < TWO_COLUMN_MIN_WIDTH ? 1 : 2);
    });
    ro.observe(node);
    observer.current = ro;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [cols, attach];
}

// Label above the control, not inside it.
function FilterField({ label, htmlFor, children, grow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: grow ? "1 1 220px" : "0 0 auto", minWidth: 0 }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="card" style={{ padding: 14, flex: 1, minWidth: 128 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function CurrentQueries() {
  const { auth } = useAuth();
  const isAdmin = (ROLE_LEVEL[auth?.role || "readonly"] || 0) >= ROLE_LEVEL.admin;

  const [rawRows, setRawRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [total, setTotal] = useState(null);
  const [shownTerm, setShownTerm] = useState("");

  const [sort, setSort] = useState(DEFAULT_SORT);
  const [userFilter, setUserFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("");
  // Typed versus sent. Search is in SQL, so Enter skips the debounce.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [hideInternal, setHideInternal] = useState(false);
  const [initialOnly, setInitialOnly] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);

  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [vanished, setVanished] = useState(0);
  const [activeRow, setActiveRow] = useState(null);
  const [activeRowModal, setActiveRowModal] = useState(null);
  const [killTargets, setKillTargets] = useState(null);
  const [killScope, setKillScope] = useState("");
  const [killSync, setKillSync] = useState(false);

  const [refreshMs, setRefreshMs] = useState(DEFAULT_REFRESH_MS);
  const [paused, setPaused] = useState(false);

  // The live snapshot alone leaves these empty when nothing is running.
  const [logUsers, setLogUsers] = useState([]);
  const [logKinds, setLogKinds] = useState([]);

  // State, not a ref, so the chart re-renders on its own.
  const [history, setHistory] = useState([]);

  const [chartCols, attachChartGrid] = useColumnCount();

  // noRowLimit is load bearing: Max Rows would truncate and skew every total.
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const { sql, params } = buildProcessesSql({ search: appliedSearch, searchField });
    const res = await runQuery(sql, { readOnly: true, noRowLimit: true, params });
    return res?.rows || [];
  }, [appliedSearch, searchField]);

  const refresh = useCallback(async () => {
    try {
      const rows = await load();
      setRawRows(rows);
      // Null when nothing matched, since the count travels on the rows.
      setTotal(totalRunning(rows));
      setShownTerm(appliedSearch);
      setError(null);
      setLastLoadedAt(new Date());
      return deriveRows(rows);
    } catch (err) {
      setError(err?.message || "Could not read system.processes.");
      return [];
    } finally {
      setLoading(false);
    }
  }, [load, appliedSearch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Once. query_log may be off or empty, in which case we use the live values.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await runQuery(buildFilterOptionsSql(7), { readOnly: true });
        const row = res?.rows?.[0];
        if (cancelled || !row) return;
        setLogUsers(Array.isArray(row.users) ? row.users : []);
        setLogKinds(Array.isArray(row.kinds) ? row.kinds : []);
      } catch {
        /* query_log unavailable, live values are enough */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Stop polling during a kill so the verify step sees its own snapshot.
  const frozen = paused || refreshMs === 0 || !!killTargets;

  useEffect(() => {
    if (frozen) return undefined;
    const t = setInterval(refresh, refreshMs);
    return () => clearInterval(t);
  }, [frozen, refreshMs, refresh]);

  const derived = useMemo(() => deriveRows(rawRows), [rawRows]);

  const filtered = useMemo(
    () =>
      applyFilters(derived, {
        users: userFilter ? [userFilter] : [],
        kinds: kindFilter ? [kindFilter] : [],
        hideInternal,
        initialOnly,
      }),
    [derived, userFilter, kindFilter, hideInternal, initialOnly],
  );

  const sorted = useMemo(() => sortRows(filtered, sort.key, sort.dir), [filtered, sort]);
  const summary = useMemo(() => summarise(filtered), [filtered]);

  const users = useMemo(
    () => mergeOptions(logUsers, distinctValues(derived, "user")),
    [logUsers, derived],
  );
  const kinds = useMemo(
    () => mergeOptions(logKinds, distinctValues(derived, "query_kind")),
    [logKinds, derived],
  );

  const filterActive = !!(userFilter || kindFilter || appliedSearch || hideInternal || initialOnly);

  // Prune on every poll or the kill button counts queries that finished ages ago.
  useEffect(() => {
    if (selectedKeys.size === 0) {
      if (vanished !== 0) setVanished(0);
      return;
    }
    const live = new Set(derived.map((r) => r.query_id));
    const next = new Set();
    let lost = 0;
    selectedKeys.forEach((id) => (live.has(id) ? next.add(id) : (lost += 1)));
    if (lost !== vanished) setVanished(lost);
    if (next.size !== selectedKeys.size) setSelectedKeys(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- would re-run per click
  }, [derived]);

  // Follow the live row so the numbers keep climbing, close when it is gone.
  useEffect(() => {
    if (!activeRow) return;
    const fresh = derived.find((r) => r.query_id === activeRow.query_id);
    if (fresh) {
      if (fresh !== activeRow) setActiveRow(fresh);
    } else {
      setActiveRow(null);
    }
  }, [derived, activeRow]);

  useEffect(() => {
    if (loading || appliedSearch) return;
    const s = summarise(derived);
    const now = new Date();
    const sample = {
      label: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
      count: s.running,
      memory: s.memory,
    };
    setHistory((prev) => [...prev, sample].slice(-CONCURRENCY_HISTORY_LIMIT));
  }, [derived, loading, appliedSearch]);

  const selectedRows = useMemo(
    () => sorted.filter((r) => selectedKeys.has(r.query_id)),
    [sorted, selectedKeys],
  );

  const cellRenderers = useMemo(
    () => ({
      query_id: (v) => (
        <span style={{ fontFamily: "var(--font-code, monospace)", fontSize: 11, color: "var(--text-secondary)" }}>
          {v}
        </span>
      ),
      user: (v) => <span style={{ fontWeight: 500 }}>{v || "(unknown)"}</span>,
      elapsed: (v) => fmtDuration(v),
      memory_usage: (v) => fmtBytes(v),
      peak_memory_usage: (v) => fmtBytes(v),
      read_rows: (v) => fmtRows(v),
      read_bytes: (v) => fmtBytes(v),
      written_rows: (v) => (num(v) ? fmtRows(v) : "-"),
      written_bytes: (v) => (num(v) ? fmtBytes(v) : "-"),
      peak_threads_usage: (v) => (num(v) ? String(v) : "-"),
      progress: (v) =>
        v === null ? (
          <span style={{ color: "var(--text-muted)" }} title="ClickHouse has not estimated a total yet">
            -
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <span
              style={{
                width: 42,
                height: 5,
                borderRadius: 3,
                background: "var(--bg-page)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  display: "block",
                  height: 5,
                  width: `${Math.round(v * 100)}%`,
                  background: "var(--color-success, #34d399)",
                }}
              />
            </span>
            {fmtPercent(v)}
          </span>
        ),
      query_preview: (v, row) => (
        <span
          style={{
            fontFamily: "var(--font-code, monospace)",
            fontSize: 12,
            color: row.is_cancelled ? "var(--text-muted)" : undefined,
            display: "inline-block",
            maxWidth: 460,
            overflow: "hidden",
            textOverflow: "ellipsis",
            verticalAlign: "bottom",
          }}
          title={v}
        >
          {row.is_cancelled && <Icon className="ti ti-alert-triangle" style={{ marginRight: 4 }} />}
          {v}
        </span>
      ),
    }),
    [],
  );

  function openKill(rows, scope, { sync = false } = {}) {
    setKillTargets(rows);
    setKillScope(scope);
    setKillSync(sync);
  }

  function clearFilters() {
    setUserFilter("");
    setKindFilter("");
    setSearch("");
    setAppliedSearch("");
    setSearchField("");
    setHideInternal(false);
    setInitialOnly(false);
  }

  const chartRows = filtered;

  return (
    <div>
      {error && (
        <div className="alert-banner danger" style={{ marginBottom: 12 }}>
          <Icon className="ti ti-alert-triangle" />
          <span>{error}</span>
        </div>
      )}

      {/* Drives the table, the charts and the metric strip, so it sits above all three. */}
      <div
        className="card"
        style={{ padding: 12, marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <FilterField label="User" htmlFor="cq-user">
          <Select
            id="cq-user"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            aria-label="Filter by user"
            style={{ width: USER_SELECT_WIDTH }}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Kind" htmlFor="cq-kind">
          <Select
            id="cq-kind"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            aria-label="Filter by query kind"
            style={{ width: KIND_SELECT_WIDTH }}
          >
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Search in" htmlFor="cq-search-field">
          <Select
            id="cq-search-field"
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
            aria-label="Field to search"
            style={{ width: SEARCH_FIELD_WIDTH }}
          >
            {SEARCH_FIELDS.map((f) => (
              <option key={f.value || "all"} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Search" htmlFor="cq-search" grow>
          <input
            id="cq-search"
            className="form-input"
            placeholder={
              searchField
                ? `Search ${(SEARCH_FIELDS.find((f) => f.value === searchField) || {}).label.toLowerCase()}`
                : "Query text, user or id"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setAppliedSearch(search);
            }}
            title="Enter searches straight away"
            style={{ width: "100%", maxWidth: SEARCH_WIDTH, minWidth: 0 }}
          />
        </FilterField>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} />
            Hide internal
          </label>
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}
            title="Hide the secondary queries a distributed query spawns on other shards"
          >
            <input type="checkbox" checked={initialOnly} onChange={(e) => setInitialOnly(e.target.checked)} />
            Initial only
          </label>
        </div>

        {filterActive && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ marginBottom: 4 }}>
            <Icon className="ti ti-x" /> Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end", gap: 6 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Resume auto refresh" : "Pause auto refresh"}
            style={{ marginBottom: 4 }}
          >
            <Icon className={`ti ${paused ? "ti-player-play" : "ti-player-pause"}`} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={refresh} title="Refresh now" style={{ marginBottom: 4 }}>
            <Icon className="ti ti-refresh" />
          </button>
          <FilterField label="Refresh" htmlFor="cq-refresh">
            <Select
              id="cq-refresh"
              value={String(refreshMs)}
              onChange={(e) => setRefreshMs(Number(e.target.value))}
              aria-label="Auto refresh interval"
              style={{ width: REFRESH_SELECT_WIDTH }}
            >
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.value} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FilterField>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <MetricCard label="Running" value={summary.running.toLocaleString()} hint={filterActive ? "filtered" : undefined} />
        <MetricCard label="Users" value={summary.users.toLocaleString()} />
        <MetricCard label="Memory" value={fmtBytes(summary.memory)} />
        <MetricCard label="Longest" value={fmtDuration(summary.longest)} />
        <MetricCard label="Read" value={fmtBytes(summary.readBytes)} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: chartsOpen ? 12 : 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setChartsOpen((v) => !v)}>
          <Icon className={`ti ${chartsOpen ? "ti-chevron-down" : "ti-chevron-right"}`} /> Workload
          breakdown
        </button>
        {!chartsOpen && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            memory and read volume per user, longest running, concurrency over time
          </span>
        )}
        {chartsOpen && filterActive && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            reflecting the current filter, not the whole server
          </span>
        )}
      </div>

      {chartsOpen && (
        <div
          ref={attachChartGrid}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${chartCols}, minmax(0, 1fr))`,
            gap: 12,
            marginBottom: 14,
          }}
        >
          <ChartCard
            title="Memory by user"
            option={memoryByUserOption(chartRows)}
            height={CHART_HEIGHT}
            chartType="pie"
          />
          <ChartCard title="Queries per user, by kind" option={queriesPerUserOption(chartRows)} height={CHART_HEIGHT} />
          <ChartCard title="Read bytes by user" option={readBytesByUserOption(chartRows)} height={CHART_HEIGHT} />
          <ChartCard title="Longest running" option={longestRunningOption(chartRows)} height={CHART_HEIGHT} />
          {/* Time series, needs the full row. */}
          <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
            <ChartCard
              title={`Concurrency, last ${history.length} samples`}
              option={concurrencyOption(history)}
              height={CHART_HEIGHT}
            />
          </div>
        </div>
      )}

      {/* Above the table, driven by the checkboxes. A per-row button on a page
          that refreshes under you invites a mis-click. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
          minHeight: 32,
        }}
      >
        <span style={{ fontSize: 13, color: selectedKeys.size ? "var(--text-primary)" : "var(--text-muted)" }}>
          {selectedKeys.size
            ? `${selectedKeys.size.toLocaleString()} selected`
            : "Select queries to kill"}
          {vanished > 0 && (
            <span style={{ color: "var(--text-muted)" }}> ({vanished} have since finished)</span>
          )}
        </span>

        {selectedKeys.size > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedKeys(new Set())}>
            Clear selection
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {userFilter && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={!isAdmin || sorted.length === 0}
              style={!isAdmin || sorted.length === 0 ? { opacity: 0.35, cursor: "not-allowed" } : {}}
              onClick={() => openKill(sorted, `currently listed for ${userFilter}`)}
              title={
                isAdmin
                  ? `Kill the ${sorted.length} queries listed for ${userFilter}. Anything started since the last refresh is not affected.`
                  : "Admin access required"
              }
            >
              <Icon className="ti ti-player-stop" /> Kill {sorted.length.toLocaleString()} listed from {userFilter}
            </button>
          )}
          <button
            className="btn btn-danger btn-sm"
            disabled={!isAdmin || selectedKeys.size === 0}
            style={!isAdmin || selectedKeys.size === 0 ? { opacity: 0.35, cursor: "not-allowed" } : {}}
            onClick={() => openKill(selectedRows, "you selected")}
            title={isAdmin ? "Kill the selected queries" : "Admin access required"}
          >
            <Icon className="ti ti-player-stop" />{" "}
            {selectedKeys.size ? `Kill ${selectedKeys.size.toLocaleString()} selected` : "Kill selected"}
          </button>
        </div>
      </div>

      <SortableDataTable
        rows={sorted}
        columns={PROCESS_COLUMNS}
        rowKey="query_id"
        cellRenderers={cellRenderers}
        sort={sort}
        onSortChange={setSort}
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        onRowClick={setActiveRow}
        onClickSetData = {setActiveRowModal}
        activeKey={activeRow?.query_id}
        emptyMessage={
          loading
            ? "Reading system.processes..."
            : filterActive
              ? "No queries match these filters."
              : "No queries are running right now."
        }
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 2px", fontSize: 11, color: "var(--text-muted)" }}>
        <span>
          {sorted.length.toLocaleString()} shown
          {filterActive && total !== null && ` of ${total.toLocaleString()} running`}
        </span>
        {search.trim() !== shownTerm.trim() && <span>searching...</span>}
        {lastLoadedAt && <span>updated {lastLoadedAt.toLocaleTimeString()}</span>}
        {frozen && <span>auto refresh off</span>}
      </div>

      {activeRowModal && (
        <QueryDetailModal
          row={activeRowModal}
          rowData = {activeRow}
          onClose={() =>{ setActiveRow(null); setActiveRowModal(null);}}
          canKill={isAdmin}
          onKill={(row, opts) => openKill([row], "", opts)}
        />
      )}

      {killTargets && (
        <KillQueriesModal
          targets={killTargets}
          scopeLabel={killScope}
          defaultSync={killSync}
          onVerify={async () => deriveRows(await load())}
          onClose={() => setKillTargets(null)}
          onFinished={refresh}
        />
      )}
    </div>
  );
}
