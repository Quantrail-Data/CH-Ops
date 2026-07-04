// CrashLog - View and search ClickHouse® crash logs
//
// Provides access to system.crash_log with two modes: Overview and Search.
// The Overview is a metrics dashboard (time range only, plus an All option,
// since crashes are rare): stat cards (total crashes, distinct signals, last
// crash, crashed versions), the crash incidents table, crashes by signal, and
// crashes by build version. Because system.crash_log only exists once a fatal
// error has occurred and its columns vary across ClickHouse® versions, the
// overview probes the available columns first and adapts (and shows a friendly
// empty state when the table is absent). The Search view filters by time
// range, query text, signal description, and exception trace.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useState, useEffect, useCallback } from "react";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "../../hooks/useQuery.js";
import { runQuery } from "../../utils/api.js";
import DataTable from "../layout/DataTable.jsx";
import { DateTimePicker } from "../layout/DateTimePicker.jsx";
import { useToast } from "../layout/Toast.jsx";
import ChartCard from "../layout/ChartCard.jsx";

const pad = (n) => String(n).padStart(2, "0");
const fmtAgo = (h) => {
  const d = new Date(Date.now() - h * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function CrashLog({ sidebar }) {
  const { tab: routeTab = "overview" } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/logs/crash/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-alert-triangle"></Icon> Crash Log
        </h2>
      </div>
      <div className="tab-bar">
        <div
          className={`tab-item ${routeTab === "overview" ? "active" : ""}`}
          onClick={() => handleTabChange("overview")}
        >
          <Icon className="ti ti-chart-dots-3"></Icon> Overview
        </div>
        <div
          className={`tab-item ${routeTab === "search" ? "active" : ""}`}
          onClick={() => handleTabChange("search")}
        >
          <Icon className="ti ti-search"></Icon> Search
        </div>
      </div>
      {routeTab === "overview" && <CrashLogOverview />}
      {routeTab === "search" && <CrashLogSearch sidebar={sidebar} />}
    </div>
  );
}

/* Overview dashboard */

const RANGE_HOURS = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "48h": 48,
  "7d": 168,
  "30d": 720,
};
const PRESETS = ["1h", "6h", "24h", "48h", "7d", "30d", "All"];

const PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#14b8a6",
];

// Common POSIX signal numbers -> names, for readable labels.
const SIGNALS = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  4: "SIGILL",
  5: "SIGTRAP",
  6: "SIGABRT",
  7: "SIGBUS",
  8: "SIGFPE",
  9: "SIGKILL",
  10: "SIGUSR1",
  11: "SIGSEGV",
  12: "SIGUSR2",
  13: "SIGPIPE",
  14: "SIGALRM",
  15: "SIGTERM",
  16: "SIGSTKFLT",
  17: "SIGCHLD",
  18: "SIGCONT",
  19: "SIGSTOP",
  24: "SIGXCPU",
  25: "SIGXFSZ",
  31: "SIGSYS",
};
const signalLabel = (s) => {
  const n = Number(s);
  const nm = SIGNALS[n];
  return nm ? `${n} (${nm})` : `signal ${s}`;
};

const fmtInt = (v) => (Number(v) || 0).toLocaleString("en-US");

// Horizontal ranked bar (label column + value column), one colour per bar,
// value labels on the right. Long labels truncate, so nothing overlaps.
function rankedBarOption(rows, labelKey, valueKey) {
  const data = rows.map((r) => ({
    name: String(r[labelKey]),
    v: Number(r[valueKey]) || 0,
  }));
  const maxV = data.reduce((a, d) => Math.max(a, d.v), 0);
  const axMax = maxV > 0 ? Math.ceil(maxV * 1.15) : 1;
  return {
    grid: { left: 8, right: 40, top: 10, bottom: 10, containLabel: true },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "shadow" },
      formatter: (p) => `${p[0].name}: ${fmtInt(p[0].value)}`,
    },
    xAxis: { type: "value", max: axMax, minInterval: 1 },
    yAxis: {
      type: "category",
      inverse: true,
      data: data.map((d) => d.name),
      axisLabel: { width: 160, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 18,
        label: {
          show: true,
          position: "right",
          formatter: (p) => fmtInt(p.value),
          fontSize: 11,
        },
        data: data.map((d, i) => ({
          value: d.v,
          itemStyle: {
            color: PALETTE[i % PALETTE.length],
            borderRadius: [0, 3, 3, 0],
          },
        })),
      },
    ],
  };
}

function Stat({ label, value, icon, color, small }) {
  return (
    <div
      className="card"
      style={{
        padding: 18,
        display: "flex",
        alignItems: "center",
        gap: 14,
        minHeight: 84,
      }}
    >
      {icon && (
        <Icon
          className={`ti ${icon}`}
          style={{
            fontSize: 28,
            color: color || "var(--accent)",
            opacity: 0.9,
            flexShrink: 0,
          }}
        ></Icon>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: small ? "1.05rem" : "1.5rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            lineHeight: 1.15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function SectionError({ title, message }) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        minHeight: 100,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--text-secondary)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          color: "var(--color-danger)",
          fontSize: "13px",
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        <Icon
          className="ti ti-alert-circle"
          style={{ flexShrink: 0, marginTop: 2 }}
        ></Icon>
        <span>{message}</span>
      </div>
    </div>
  );
}

function CrashLogOverview() {
  const [duration, setDuration] = useState("30d");
  const [from, setFrom] = useState(fmtAgo(720));
  const [to, setTo] = useState(fmtNow());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState({
    exists: false,
    summary: [],
    incidents: [],
    incidentCols: [],
    bySignal: [],
    byVersion: [],
    hasVersion: false,
  });
  const [errs, setErrs] = useState({});
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  function applyDuration(d) {
    setDuration(d);
    if (d !== "All") {
      setFrom(fmtAgo(RANGE_HOURS[d] || 720));
      setTo(fmtNow());
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const f = from,
      t = to;
    const next = {
      exists: false,
      summary: [],
      incidents: [],
      incidentCols: [],
      bySignal: [],
      byVersion: [],
      hasVersion: false,
    };
    const e = {};

    // Probe columns first: system.crash_log may not exist, and its columns
    // differ across versions.
    let cols = new Set();
    try {
      const res = await runQueryProbe();
      cols = res;
    } catch (err) {
      e.probe = err.message || "Query failed";
    }

    next.exists = cols.size > 0;

    if (next.exists) {
      const avail = (n) => cols.has(n);
      const useTime = avail("event_time") && duration !== "All";
      const timeWhere = useTime
        ? `WHERE event_time BETWEEN '${f}' AND '${t}'`
        : "";
      next.hasVersion = avail("version");

      // 1) summary
      try {
        const parts = ["count() AS total"];
        if (avail("signal")) parts.push("uniqExact(signal) AS signals");
        if (avail("event_time")) parts.push("max(event_time) AS last_crash");
        if (avail("version")) parts.push("uniqExact(version) AS versions");
        const res = await runQuery(
          `SELECT ${parts.join(", ")} FROM system.crash_log ${timeWhere}`,
        );
        next.summary = res.rows || [];
      } catch (err) {
        e.summary = err.message || "Query failed";
      }

      // 2) incidents (most recent first)
      try {
        const cset = [];
        if (avail("event_time")) cset.push("event_time");
        if (avail("signal")) cset.push("signal");
        if (avail("signal_description")) cset.push("signal_description");
        if (avail("query_id")) cset.push("query_id");
        if (avail("version")) cset.push("version");
        if (cset.length) {
          const orderCol = avail("event_time")
            ? "event_time"
            : avail("timestamp_ns")
              ? "timestamp_ns"
              : cset[0];
          const res = await runQuery(
            `SELECT ${cset.join(", ")} FROM system.crash_log ${timeWhere} ORDER BY ${orderCol} DESC LIMIT 100`,
          );
          next.incidents = res.rows || [];
          next.incidentCols = cset;
        }
      } catch (err) {
        e.incidents = err.message || "Query failed";
      }

      // 3) crashes by signal
      if (avail("signal")) {
        try {
          const res = await runQuery(
            `SELECT signal, count() AS cnt FROM system.crash_log ${timeWhere} GROUP BY signal ORDER BY cnt DESC LIMIT 15`,
          );
          next.bySignal = res.rows || [];
        } catch (err) {
          e.bySignal = err.message || "Query failed";
        }
      }

      // 4) crashes by build version
      if (avail("version")) {
        try {
          const res = await runQuery(
            `SELECT version, count() AS cnt FROM system.crash_log ${timeWhere} GROUP BY version ORDER BY cnt DESC LIMIT 15`,
          );
          next.byVersion = res.rows || [];
        } catch (err) {
          e.byVersion = err.message || "Query failed";
        }
      }
    }

    setData(next);
    setErrs(e);
    setLoaded(true);
    setLoading(false);
  }, [from, to, duration]);

  const summaryRow = data.summary?.[0] || {};
  const total = Number(summaryRow.total) || 0;
  const signals = Number(summaryRow.signals) || 0;
  const versions = Number(summaryRow.versions) || 0;
  const rawLast = summaryRow.last_crash;
  const lastCrash =
    total > 0 && rawLast && !String(rawLast).startsWith("1970") ? rawLast : "-";

  const hasErrs = Object.keys(errs).length > 0;
  const tableMissing = loaded && !data.exists && !errs.probe;

  const signalRows = (data.bySignal || []).map((r) => ({
    name: signalLabel(r.signal),
    cnt: Number(r.cnt) || 0,
  }));
  const versionRows = (data.byVersion || []).map((r) => ({
    name: String(r.version || "-"),
    cnt: Number(r.cnt) || 0,
  }));

  const incidentRows = (data.incidents || []).map((r) => ({ ...r }));
  // signal gets a short readable label. query_id and signal_description are
  // left to DataTable so they truncate and expand on click, the same as Search.
  const incidentRenderers = {
    signal: (v) => signalLabel(v),
  };

  return (
    <div>
      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div className="form-group">
          <label className="form-label">Quick</label>
          <div style={{ display: "flex", gap: 4 }}>
            {PRESETS.map((d) => (
              <button
                key={d}
                className={`btn btn-sm ${duration === d ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "8px 12px", minWidth: 48 }}
                onClick={() => applyDuration(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          style={{ padding: "8px 14px" }}
          onClick={load}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="loading-spinner"></span> Loading...
            </>
          ) : (
            <>
              <Icon className="ti ti-player-play"></Icon> Load
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <span className="loading-spinner"></span>
        </div>
      ) : !loaded ? (
        <div className="empty-state">
          <Icon
            className="ti ti-player-play"
            style={{ color: "#fb923c" }}
          ></Icon>
          <p>Select a time range and click Load.</p>
        </div>
      ) : errs.probe ? (
        <SectionError title="Crash Log" message={errs.probe} />
      ) : tableMissing ? (
        <div className="empty-state">
          <Icon
            className="ti ti-shield-check"
            style={{ color: "#34d399" }}
          ></Icon>
          <p>
            system.crash_log is not present. It is created only when a fatal
            error occurs, so an absent table means no crashes have been
            recorded.
          </p>
        </div>
      ) : total === 0 && !hasErrs ? (
        <div className="empty-state">
          <Icon
            className="ti ti-shield-check"
            style={{ color: "#34d399" }}
          ></Icon>
          <p>
            No crashes recorded{" "}
            {duration === "All" ? "on this server" : "in the selected range"}.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <Stat
              label="Total Crashes"
              value={fmtInt(total)}
              icon="ti-skull"
              color="var(--color-danger)"
            />
            <Stat
              label="Distinct Signals"
              value={fmtInt(signals)}
              icon="ti-bolt"
              color="var(--color-warning)"
            />
            <Stat
              label="Crashed Versions"
              value={data.hasVersion ? fmtInt(versions) : "-"}
              icon="ti-versions"
              color="var(--accent)"
            />
            <Stat
              label="Last Crash"
              value={lastCrash}
              icon="ti-clock"
              color="var(--text-secondary)"
              small
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: data.hasVersion ? "1fr 1fr" : "1fr",
              gap: 16,
            }}
          >
            {errs.bySignal ? (
              <SectionError title="Crashes by Signal" message={errs.bySignal} />
            ) : signalRows.length ? (
              <ChartCard
                key={`sig-${themeKey}`}
                title="Crashes by Signal"
                height={Math.max(200, signalRows.length * 30 + 40)}
                option={rankedBarOption(signalRows, "name", "cnt")}
              />
            ) : null}
            {data.hasVersion &&
              (errs.byVersion ? (
                <SectionError
                  title="Crashes by Version"
                  message={errs.byVersion}
                />
              ) : versionRows.length ? (
                <ChartCard
                  key={`ver-${themeKey}`}
                  title="Crashes by Version"
                  height={Math.max(200, versionRows.length * 30 + 40)}
                  option={rankedBarOption(versionRows, "name", "cnt")}
                />
              ) : null)}
          </div>

          {errs.incidents ? (
            <SectionError title="Crash Incidents" message={errs.incidents} />
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 12,
                }}
              >
                Crash Incidents
              </div>
              <div className="ov-log-table">
                <DataTable
                  rows={incidentRows}
                  columns={data.incidentCols}
                  cellRenderers={incidentRenderers}
                  variant="single"
                  s_no={true}
                  maxHeight={480}
                  emptyMessage="No crash incidents in range."
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Probe which columns system.crash_log exposes (empty set => table absent).
async function runQueryProbe() {
  const res = await runQuery(
    "SELECT name FROM system.columns WHERE database = 'system' AND table = 'crash_log'",
  );
  return new Set((res.rows || []).map((r) => r.name).filter(Boolean));
}

function CrashLogSearch({ sidebar }) {
  const toast = useToast();
  const [from, setFrom] = useState(fmtAgo(168));
  const [to, setTo] = useState(fmtNow());
  const [queryText, setQueryText] = useState("");
  const [signalDesc, setSignalDesc] = useState("");
  const [exceptionTrace, setExceptionTrace] = useState("");
  const [rowLimit, setRowLimit] = useState(500);
  const [submitted, setSubmitted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const q = useQuery();


  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);


  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const schemaRows_ = await runQuery(
        "SELECT name FROM system.columns WHERE database = 'system' AND table = 'crash_log'",
      );
      const colsRaw = schemaRows_.rows || [];
      const colNames = new Set(
        (Array.isArray(colsRaw)
          ? colsRaw.map((r) =>
              typeof r === "object"
                ? r.name || r.column_name || Object.values(r)[0]
                : r,
            )
          : []
        ).filter(Boolean),
      );

      if (colNames.size === 0) return;

      const available = (name) => colNames.has(name);

      const selectCols = [];
      if (available("timestamp_ns")) selectCols.push("timestamp_ns");
      if (available("event_time")) selectCols.push("event_time");
      if (available("signal")) selectCols.push("signal");
      if (available("signal_name")) selectCols.push("signal_name");
      if (available("query_id")) selectCols.push("query_id");
      if (available("query")) selectCols.push("query");
      if (available("signal_description"))
        selectCols.push("signal_description");
      if (available("current_exception_trace_full"))
        selectCols.push("current_exception_trace_full");
      if (available("current_exception_trace"))
        selectCols.push("current_exception_trace");

      if (selectCols.length === 0) {
        toast.error(
          "system.crash_log appears to have no usable columns to select.",
        );
        return;
      }

      const conds = [];
      if (available("event_time")) {
        conds.push(`event_time BETWEEN '${from}' AND '${to}'`);
      } else if (available("timestamp_ns")) {
        const fromTs = Date.parse(from);
        const toTs = Date.parse(to);
        if (!isNaN(fromTs) && !isNaN(toTs)) {
          conds.push(`timestamp_ns BETWEEN ${fromTs * 1e6} AND ${toTs * 1e6}`);
        }
      }

      if (queryText.trim() && available("query")) {
        conds.push(`query LIKE '%${queryText.trim()}%'`);
      } else if (queryText.trim() && available("query_id")) {
        toast.info(
          'Text search skipped: "query" column not available on this server.',
        );
      }

      if (signalDesc.trim() && available("signal_description")) {
        conds.push(`signal_description LIKE '%${signalDesc.trim()}%'`);
      } else if (signalDesc.trim()) {
        toast.info(
          'Signal description filter skipped: "signal_description" column not available on this server.',
        );
      }

      if (exceptionTrace.trim()) {
        if (available("current_exception_trace_full")) {
          conds.push(
            `current_exception_trace_full LIKE '%${exceptionTrace.trim()}%'`,
          );
        } else if (available("current_exception_trace")) {
          conds.push(
            `arrayExists(x -> ilike(x, '%${exceptionTrace.trim()}%'), current_exception_trace)`,
          );
        } else {
          toast.info(
            "Exception trace filter skipped: no exception trace column available on this server.",
          );
        }
      }

      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const select = selectCols.join(", ");

      setSubmitted(true);
      setFiltersOpen(false);

      const sql = `SELECT ${select} FROM system.crash_log ${where} ORDER BY ${available("event_time") ? "event_time" : available("timestamp_ns") ? "timestamp_ns" : selectCols[0]} DESC LIMIT ${rowLimit}`;

      await q.execute(sql);
    } catch (err) {
    setLoading(false);
    setError(err?.message || err);
      
    }
    finally{
      setLoading(false);
    }
  }

  // handle the Date change infinity like FROM > TO -->( Kathirdhasan )
  const handleDateOnChange = (date, label) => {
    if (label === "From") {
      setFrom(date);
      if (to && new Date(date) > new Date(to)) {
        setFrom(fmtAgo(168));
        toast.warning("From Date must be earlier than To Date!");
      }
    }

    if (label === "To") {
      setTo(date);
      if (from && new Date(from) > new Date(date)) {
        setTo(fmtNow());
        toast.warning("To date cannot be less than From date!");
      }
    }
  };

  const widthStyle = {
    width: `${(window?.innerWidth - (sidebar ? 650 : 900)) / (sidebar ? 5 : 5)}px`,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 15,
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "15px",
          }}
        >
          <Icon className="ti ti-search" style={{ fontSize: "15px" }}></Icon>
          Search
        </label>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Icon
            className={`ti ${filtersOpen ? "ti-chevron-up" : "ti-chevron-down"}`}
          ></Icon>{" "}
          {filtersOpen ? "Collapse" : "Expand"} Filters
        </button>
      </div>

      {filtersOpen && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <form onSubmit={handleSearch}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 5,
                marginBottom: 14,
              }}
            >
              <div>
                <DateTimePicker
                  label="From *"
                  value={from}
                  onChange={handleDateOnChange}
                  name="From"
                />
              </div>
              <div>
                {" "}
                <DateTimePicker
                  label="To *"
                  value={to}
                  onChange={handleDateOnChange}
                  name="To"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Query (text)</label>
                <input
                  className="form-input"
                  style={widthStyle}
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="partial..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Signal Description</label>
                <input
                  className="form-input"
                  value={signalDesc}
                  style={widthStyle}
                  onChange={(e) => setSignalDesc(e.target.value)}
                  placeholder="partial..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Exception Trace</label>
                <input
                  className="form-input"
                  value={exceptionTrace}
                  style={widthStyle}
                  onChange={(e) => setExceptionTrace(e.target.value)}
                  placeholder="partial..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Row Limit</label>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={100000}
                  value={rowLimit}
                  onChange={(e) => setRowLimit(parseInt(e.target.value) || 500)}
                  style={{ width: 100 }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "flex-end",
                  height: "60px",
                  marginLeft: "10px",
                }}
              >
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="loading-spinner"></span> Searching...
                    </>
                  ) : (
                    <>
                      <Icon className="ti ti-search"></Icon> Search
                    </>
                  )}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                alignItems: "flex-end",
              }}
            ></div>
          </form>
        </div>
      )}
      {submitted && !q.loading && (
        <DataTable
          rows={q.data || []}
          emptyMessage="No crash entries found."
          variant="single"
          s_no={true}
        />
      )}
    </div>
  );
}
