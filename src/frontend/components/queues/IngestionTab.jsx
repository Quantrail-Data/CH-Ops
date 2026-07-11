//@author: Sanjeev Kumar G
// IngestionTab.jsx
// Tab 1: S3Queue / AzureQueue ingestion monitoring (history data).

import React, { useEffect, useState, useCallback } from "react";
import Icon from "../common/Icon.jsx";
import DataTable from "../layout/DataTable.jsx";
import QueueCards from "./QueueCards.jsx";
import ThroughputChart from "./ThroughputChart.jsx";
import LatencySplitChart from "./LatencySplitChart.jsx";
import EmptyState from "./EmptyState.jsx";
import { fmtInt, fmtPct, fmtRelative } from "../../utils/queueFormat.js";
import { fmtRows } from "../../utils/costEstimator.js";
import {
  loadIngestionHealth, loadThroughput, loadLatencySplit,
  loadFailureSummary, loadFiles, loadPerTableHealth, tableExists,
} from "../../utils/queueQueries.js";

// Preset time ranges, in seconds back from now.
const RANGES = [
  { label: "1h", sec: 3600 },
  { label: "6h", sec: 21600 },
  { label: "24h", sec: 86400 },
  { label: "7d", sec: 604800 },
];

export default function IngestionTab({ source = "s3" }) {
  const [rangeSec, setRangeSec] = useState(86400);
  const [loading, setLoading] = useState(true);
  const [present, setPresent] = useState([]);        // which tables existed

  const [health, setHealth] = useState(null);
  const [throughput, setThroughput] = useState([]);
  const [latency, setLatency] = useState(null);
  const [failGroups, setFailGroups] = useState([]);
  const [perTable, setPerTable] = useState([]);
  const [err, setErr] = useState({});           // which sections failed to load

  const [failView, setFailView] = useState("summary"); // summary | all
  const [rawFailures, setRawFailures] = useState([]);

  // Search panel state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTable, setSearchTable] = useState("");
  const [searchFile, setSearchFile] = useState("");
  const [searchExc, setSearchExc] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const to = Math.floor(Date.now() / 1000);
    const from = to - rangeSec;

    // Presence check first. tableExists never throws, so this reliably decides
    // whether to show the empty state, independent of the data queries below.
    const wanted = source === "s3" ? ["s3queue_log"]
      : source === "azure" ? ["azure_queue_log"]
      : ["s3queue_log", "azure_queue_log"];
    let exists = [];
    try { exists = await Promise.all(wanted.map(tableExists)); }
    catch { exists = wanted.map(() => false); }
    const presentTables = wanted.filter((_, i) => exists[i]).map((n) => "system." + n);
    setPresent(presentTables);

    if (presentTables.length === 0) {
      // No S3Queue / AzureQueue engine in use: reset to a clean empty state and
      // skip the data queries entirely (they would error on the absent tables).
      setHealth(null); setThroughput([]); setLatency(null);
      setFailGroups([]); setPerTable([]); setErr({});
      setLoading(false);
      return;
    }

    // Load each section independently so one failing query (for example a column
    // absent on an older server) leaves the other panels intact, with only that
    // one panel falling back to n.a.
    const [h, tp, lat, fg, pt] = await Promise.allSettled([
      loadIngestionHealth(source, from, to),
      loadThroughput(source, from, to),
      loadLatencySplit(source, from, to),
      loadFailureSummary(source, from, to),
      loadPerTableHealth(source, from, to),
    ]);
    setHealth(h.status === "fulfilled" ? h.value : null);
    setThroughput(tp.status === "fulfilled" ? (tp.value.points || []) : []);
    setLatency(lat.status === "fulfilled" ? lat.value : null);
    setFailGroups(fg.status === "fulfilled" ? (fg.value.groups || []) : []);
    setPerTable(pt.status === "fulfilled" ? (pt.value.rows || []) : []);
    setErr({
      health: h.status === "rejected",
      throughput: tp.status === "rejected",
      latency: lat.status === "rejected",
      failures: fg.status === "rejected",
      perTable: pt.status === "rejected",
    });
    setLoading(false);
  }, [source, rangeSec]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Lazy-load raw failures only when that view is opened.
  useEffect(() => {
    if (failView !== "all") return;
    const to = Math.floor(Date.now() / 1000);
    const from = to - rangeSec;
    loadFiles(source, from, to, { statusFailed: true }, 500)
      .then((r) => setRawFailures(r.rows || []))
      .catch(() => setRawFailures([]));
  }, [failView, source, rangeSec]);

  async function runSearch() {
    setSearching(true);
    const to = Math.floor(Date.now() / 1000);
    const from = to - rangeSec;
    try {
      const r = await loadFiles(source, from, to, {
        table: searchTable || undefined,
        fileText: searchFile || undefined,
        exceptionText: searchExc || undefined,
      }, 500);
      setSearchResults(r.rows || []);
    } finally {
      setSearching(false);
    }
  }

  // This engine's log table is absent: the engine is not in use on this server.
  if (!loading && present.length === 0) {
    const engine = source === "azure" ? "AzureQueue" : "S3Queue";
    return (
      <EmptyState icon="ti-cloud-off" title={`${engine} is not in use on this server`}>
        No table using the {engine} engine has processed files here yet. Once a
        {" "}{engine} table starts ingesting, its history appears on this tab:
        throughput, failures, and latency.
      </EmptyState>
    );
  }

  // Health cards
  const cards = health ? [
    {
      label: "Success rate",
      value: fmtPct(health.success_rate),
      state: health.success_rate == null ? "neutral"
        : health.success_rate >= 99 ? "ok"
        : health.success_rate >= 90 ? "warn" : "bad",
      sub: `${fmtInt(health.processed)} of ${fmtInt(health.total_files)} files`,
    },
    { label: "Files processed", value: fmtInt(health.total_files), state: "neutral" },
    { label: "Rows ingested", value: fmtRows(health.rows_ingested), state: "neutral" },
    {
      label: "Failed files", value: fmtInt(health.failed),
      state: health.failed > 0 ? "bad" : "ok",
    },
    {
      label: "Last activity",
      value: fmtRelative(health.last_activity),
      state: "neutral",
    },
  ] : [];

  return (
    <div className="queue-tab">
      {/* Controls: time range */}
      <div className="queue-controls">
        <div className="queue-segment">
          {RANGES.map((r) => (
            <button
              key={r.label}
              className={"queue-seg-btn" + (rangeSec === r.sec ? " active" : "")}
              onClick={() => setRangeSec(r.sec)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadAll} title="Refresh">
          <Icon className="ti ti-refresh"></Icon>
        </button>
      </div>

      {loading ? (
        <div className="queue-loading"><span className="loading-spinner"></span> Loading ingestion data...</div>
      ) : (
        <>
          {health ? <QueueCards cards={cards} /> : (
            <div className="queue-na"><Icon className="ti ti-help-circle"></Icon> Health metrics unavailable (n.a.)</div>
          )}

          <div className="queue-grid-2">
            <section className="queue-panel">
              <h3 className="queue-panel-title">Throughput</h3>
              <ThroughputChart points={throughput} />
            </section>
            <section className="queue-panel">
              <h3 className="queue-panel-title">Where time goes</h3>
              {latency ? <LatencySplitChart latency={latency} /> : (
                <div className="queue-na"><Icon className="ti ti-help-circle"></Icon> Latency breakdown unavailable (n.a.)</div>
              )}
            </section>
          </div>

          {/* Failures */}
          <section className="queue-panel">
            <div className="queue-panel-head">
              <h3 className="queue-panel-title">Failures</h3>
              <div className="queue-segment">
                <button
                  className={"queue-seg-btn" + (failView === "summary" ? " active" : "")}
                  onClick={() => setFailView("summary")}
                >By error code</button>
                <button
                  className={"queue-seg-btn" + (failView === "all" ? " active" : "")}
                  onClick={() => setFailView("all")}
                >All failures</button>
              </div>
            </div>

            {failView === "summary" ? (
              err.failures ? (
                <div className="queue-na"><Icon className="ti ti-help-circle"></Icon> Failure summary unavailable (n.a.)</div>
              ) : failGroups.length === 0 ? (
                <div className="queue-none-good">
                  <Icon className="ti ti-circle-check"></Icon> No failures in this range.
                </div>
              ) : (
                <DataTable
                  variant="fixed"
                  rows={failGroups.map((g) => ({
                    "Error code": g.error_code ?? "unknown",
                    Failures: fmtInt(g.failures),
                    "First seen": g.first_seen,
                    "Last seen": g.last_seen,
                    "Affected tables": g.affected_tables,
                    "Sample exception": g.sample_exception,
                  }))}
                />
              )
            ) : (
              <DataTable variant="fixed" rows={rawFailures} />
            )}
          </section>

          {/* Per-table health (only if more than one queue table) */}
          {perTable.length > 1 && (
            <section className="queue-panel">
              <h3 className="queue-panel-title">Per-table health</h3>
              <DataTable
                variant="fixed"
                rows={perTable.map((t) => ({
                  Table: t.queue_table,
                  "Success rate": fmtPct(t.success_rate),
                  Failed: fmtInt(t.failed),
                  "Rows ingested": fmtRows(t.rows_ingested),
                  "Last activity": fmtRelative(t.last_activity),
                }))}
              />
            </section>
          )}

          {/* Search */}
          <section className="queue-panel">
            <button
              className="queue-disclosure"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Icon className={"ti " + (searchOpen ? "ti-chevron-down" : "ti-chevron-right")}></Icon>
              Search files
            </button>
            {searchOpen && (
              <div className="queue-search">
                <div className="queue-search-row">
                  <input className="form-input" placeholder="Table (db.table)"
                    value={searchTable} onChange={(e) => setSearchTable(e.target.value)} />
                  <input className="form-input" placeholder="File name contains"
                    value={searchFile} onChange={(e) => setSearchFile(e.target.value)} />
                  <input className="form-input" placeholder="Exception contains"
                    value={searchExc} onChange={(e) => setSearchExc(e.target.value)} />
                  <button className="btn btn-primary btn-sm" onClick={runSearch} disabled={searching}>
                    {searching ? "Searching..." : "Search"}
                  </button>
                </div>
                {searchResults && (
                  <DataTable variant="fixed" rows={searchResults} />
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}