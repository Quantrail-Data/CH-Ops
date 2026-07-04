// queryCompare.js - Logic for the Query Comparison tool (no UI)
//
// Functions that take one SQL string plus the editor's per-user credentials and
// return a tidy metrics object for one side of the comparison. Two modes:
//   estimateOne(sql, creds) -> EXPLAIN ESTIMATE/PLAN, never executes the query.
//   executeOne(sql, creds)  -> runs the query, then reads run stats and memory.
// Both run under the editor's entered ClickHouse® credentials (the same strict,
// per-user path the SQL Editor uses), and both enforce the SELECT-only rule so
// Comparison mode can never run a destructive statement. A shared autocomplete
// loader is included so both comparison editors share one word list.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { runEditorQuery } from "./api.js";
import { runEstimate, lookupMemoryUsage } from "./costEstimator.js";
import { isReadOnlySql } from "../../shared/sqlClassify.js";

// Read-only guard for Comparison mode, delegated to the shared SQL classifier so
// every surface (Comparison, Chart Builder, backend) agrees on what "read-only"
// means. Allows SELECT / WITH / SHOW / DESCRIBE / EXPLAIN / EXISTS; blocks writes,
// DDL and admin statements. Name kept for existing callers and tests.
export function isSelectOnly(sql) {
  return isReadOnlySql(sql);
}

const NON_SELECT_MESSAGE =
  "Comparison mode only supports read-only queries (SELECT, WITH, SHOW, " +
  "DESCRIBE, EXPLAIN, EXISTS). Other statements are blocked here for safety.";

const NO_CREDS_MESSAGE =
  "Connect with your ClickHouse credentials first.";

// ESTIMATE (no execution)
//
// Returns:
//   { ok: true,  mode: 'estimate', metrics: {...}, raw: <runEstimate result> }
//   { ok: false, mode: 'estimate', error: '...' }
export async function estimateOne(sql, creds) {
  if (!sql || !sql.trim()) {
    return { ok: false, mode: "estimate", error: "Query is empty." };
  }
  if (!creds || !creds.user) {
    return { ok: false, mode: "estimate", error: NO_CREDS_MESSAGE };
  }
  if (!isSelectOnly(sql)) {
    return { ok: false, mode: "estimate", error: NON_SELECT_MESSAGE };
  }

  try {
    const est = await runEstimate(sql, creds);

    // runEstimate reports its own "unsupported" and per-step errors.
    if (est.supported === false) {
      return {
        ok: false,
        mode: "estimate",
        error: est.reason || "Not supported.",
      };
    }
    if (est.estimateError) {
      return { ok: false, mode: "estimate", error: est.estimateError };
    }

    return {
      ok: true,
      mode: "estimate",
      raw: est,
      metrics: {
        rows: est.totalRows, // estimated rows read
        parts: est.totalParts, // parts touched
        marks: est.totalMarks, // marks (granule ranges) touched
        tables: est.tables.length,
      },
    };
  } catch (e) {
    return {
      ok: false,
      mode: "estimate",
      error: e.message || "Estimate failed.",
    };
  }
}

// EXECUTE (actually runs the query)
//
// Returns:
//   { ok: true,  mode: 'execute', metrics: {...}, rows, columns }
//   { ok: false, mode: 'execute', error: '...' }
export async function executeOne(sql, creds) {
  if (!sql || !sql.trim()) {
    return { ok: false, mode: "execute", error: "Query is empty." };
  }
  if (!creds || !creds.user) {
    return { ok: false, mode: "execute", error: NO_CREDS_MESSAGE };
  }
  if (!isSelectOnly(sql)) {
    return { ok: false, mode: "execute", error: NON_SELECT_MESSAGE };
  }

  try {
    const r = await runEditorQuery(sql, creds, { readOnly: true });
    const stats = r.stats || {};

    // Peak memory is written to query_log slightly after the query finishes,
    // so we look it up by query_id after a short delay. If it is not ready,
    // we simply leave memory as null.
    let memory = null;
    if (r.queryId) {
      await new Promise((res) => setTimeout(res, 350));
      memory = await lookupMemoryUsage(r.queryId, creds);
    }

    const num = (v) => (v == null || v === "" ? null : Number(v));

    return {
      ok: true,
      mode: "execute",
      rows: r.rows || [],
      columns: r.columns || [],
      queryId: r.queryId || null,
      metrics: {
        resultRows: Array.isArray(r.rows) ? r.rows.length : 0,
        readRows: num(stats.read_rows),
        readBytes: num(stats.read_bytes),
        writtenRows: num(stats.written_rows),
        elapsedMs:
          stats.elapsed_ns != null ? Number(stats.elapsed_ns) / 1e6 : null,
        memoryBytes: memory,
      },
    };
  } catch (e) {
    return {
      ok: false,
      mode: "execute",
      error: e.message || "Execution failed.",
    };
  }
}

// Autocomplete word loader
//
// Loads keywords, functions, and table names under the editor credentials,
// mirroring the main editor. Returns a sorted, de-duplicated word list.
export async function loadAcWords(creds) {
  if (!creds || !creds.user) return [];
  const [kw, fn, tb] = await Promise.all([
    runEditorQuery("SELECT keyword FROM system.keywords", creds).catch(() => ({
      rows: [],
    })),
    runEditorQuery("SELECT name FROM system.functions", creds).catch(() => ({
      rows: [],
    })),
    runEditorQuery(
      "SELECT database, name FROM system.tables WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY database, name",
      creds,
    ).catch(() => ({ rows: [] })),
  ]);
  const words = [];
  (kw.rows || []).forEach((r) => {
    if (r.keyword) words.push(r.keyword.toUpperCase());
  });
  (fn.rows || []).forEach((r) => {
    if (r.name) words.push(r.name);
  });
  (tb.rows || []).forEach((r) => {
    if (r.database) words.push(r.database);
    if (r.name) words.push(r.name);
    if (r.database && r.name) words.push(`${r.database}.${r.name}`);
  });
  return [...new Set(words)].sort();
}

// Verdict helpers
//
// For each metric, lower is better. compareMetric returns which side wins.
// Returns 'a', 'b', 'tie', or null (when a value is missing on either side).
export function compareMetric(aVal, bVal) {
  if (aVal == null || bVal == null) return null;
  if (aVal === bVal) return "tie";
  return aVal < bVal ? "a" : "b";
}

// Percentage difference of b relative to a, for display ("42% lower").
// Returns null when it cannot be computed.
export function pctDelta(aVal, bVal) {
  if (aVal == null || bVal == null || aVal === 0) return null;
  return ((bVal - aVal) / aVal) * 100;
}
