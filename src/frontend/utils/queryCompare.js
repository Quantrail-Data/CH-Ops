// queryCompare.js - Logic for the Query Comparison tool (no UI)
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { runEditorQuery } from "./api.js";
import { runEstimate, lookupMemoryUsage } from "./costEstimator.js";
import { isReadOnlySql } from "../../shared/sqlClassify.js";
import {
  buildCompletionOptions,
  loadFunctionRows,
} from "../components/editor/sqlEditorSetup.js";

// Read-only guard for Comparison mode. Allows SELECT / WITH / SHOW / DESCRIBE / EXPLAIN / EXISTS; blocks writes,
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

    // Peak memory is written to query_log slightly after the query finishes
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

export async function loadAcWords(creds) {
  if (!creds || !creds.user) return { options: [], dialect: null };
  const [kw, fn, tb] = await Promise.all([
    runEditorQuery("SELECT keyword FROM system.keywords", creds).catch(() => ({
      rows: [],
    })),
    // Same documented query the main editor uses, through the same helper, so
    // the two cannot drift apart.
    loadFunctionRows((q) => runEditorQuery(q, creds)),
    runEditorQuery(
      "SELECT database, name FROM system.tables WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY database, name",
      creds,
    ).catch(() => ({ rows: [] })),
  ]);
  const keywords = (kw.rows || []).map((r) => r.keyword).filter(Boolean);
  const functions = (fn || []).filter((r) => r && r.name);
  const tables = tb.rows || [];

  // Tagged options rather than a flat string array, matching the main editor.

  return {
    options: buildCompletionOptions({ keywords, functions, tables }),
    dialect: { keywords, functions: functions.map((r) => r.name) },
  };
}

// Verdict helpers

export function compareMetric(aVal, bVal) {
  if (aVal == null || bVal == null) return null;
  if (aVal === bVal) return "tie";
  return aVal < bVal ? "a" : "b";
}

export function pctDelta(aVal, bVal) {
  if (aVal == null || bVal == null || aVal === 0) return null;
  return ((bVal - aVal) / aVal) * 100;
}
