// costEstimator.js - Query cost estimation via EXPLAIN ESTIMATE and PLAN
//
// Pure utility module that runs EXPLAIN ESTIMATE and EXPLAIN PLAN on SELECT
// queries to estimate rows, parts, and marks per table. Also looks up primary
// keys, sorting keys, and data skipping indexes for each table. Provides
// formatted output consumed by the CostEstimatePanel component. Memory usage
// lookup after execution is also available via query_id.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { runQuery, runEditorQuery } from './api.js';

// Pick the query function: with editor credentials, use the strict editor path;
// without, fall back to the normal shared path (keeps any other caller working).
function runner(creds) {
  return creds ? (sql) => runEditorQuery(sql, creds) : runQuery;
}

// Helpers

// Escape single quotes for SQL string literals.
// ClickHouse query IDs and table names from system tables are safe,
// but this prevents breakage if unexpected characters appear.
function esc(s) {
  return String(s).replace(/'/g, "''");
}

// Remove trailing FORMAT clause and semicolons before wrapping in EXPLAIN.
// The FORMAT keyword confuses the EXPLAIN parser if left in place.
function stripFormatAndSemicolons(sql) {
  let q = sql.replace(/\s+$/, '');
  q = q.replace(/;+\s*$/, '');
  q = q.replace(/\s+FORMAT\s+[A-Za-z0-9_]+\s*$/i, '');
  return q;
}

function isSelectLike(sql) {
  const first = sql.trim().split(/\s+/)[0]?.toUpperCase() || '';
  return ['SELECT', 'WITH'].includes(first);
}

// Formatting

export function fmtBytes(n) {
  n = Number(n) || 0;
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

export function fmtRows(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Run Estimate
//
// This is the main function. It runs 3 steps:
//   1. EXPLAIN ESTIMATE - how many rows/parts/marks per table
//   2. EXPLAIN PLAN - the execution plan tree
//   3. Index lookup - primary key + skip indexes for each table from step 1
//
// Steps 1 and 2 run in parallel. Step 3 runs after step 1 finishes
// (because we need table names from the EXPLAIN ESTIMATE results).
//
// Returns a structured result object consumed by CostEstimatePanel.jsx.

export async function runEstimate(sql, creds) {
  const run = runner(creds);
  const cleaned = stripFormatAndSemicolons(sql);

  if (!isSelectLike(cleaned)) {
    return {
      supported: false,
      reason: 'Cost estimation is only available for SELECT queries (including WITH ... SELECT).',
    };
  }

  const result = {
    supported: true,
    tables: [],
    totalRows: 0,
    totalParts: 0,
    totalMarks: 0,
    plan: '',
    indexes: [],
    estimateError: null,
    planError: null,
  };

  // Step 1 + 2: run in parallel
  // const [estimateRes, planRes] = await Promise.allSettled([
  //   runQuery(`EXPLAIN ESTIMATE ${cleaned}`),
  //   runQuery(`EXPLAIN PLAN ${cleaned}`),
  // ]);

  const [estimateRes, planRes] = await Promise.allSettled([
    run(`EXPLAIN ESTIMATE ${cleaned}`),
    run(`EXPLAIN PLAN ${cleaned}`),
  ]);

  // Parse EXPLAIN ESTIMATE results.
  // ClickHouse returns columns: database, table, parts, rows, marks.
  // These column names have been stable across all ClickHouse versions
  // that support EXPLAIN ESTIMATE (21.1+).
  if (estimateRes.status === 'fulfilled') {
    const rows = estimateRes.value?.rows || [];
    for (const row of rows) {
      const te = {
        database: String(row.database || ''),
        table: String(row.table || ''),
        parts: parseInt(row.parts || 0, 10),
        rows: parseInt(row.rows || 0, 10),
        marks: parseInt(row.marks || 0, 10),
      };
      result.tables.push(te);
      result.totalRows += te.rows;
      result.totalParts += te.parts;
      result.totalMarks += te.marks;
    }
  } else {
    result.estimateError = estimateRes.reason?.message || 'EXPLAIN ESTIMATE failed';
  }

  // Parse EXPLAIN PLAN results.
  // The response contains one row per line of the plan tree, with a single column.
  if (planRes.status === 'fulfilled') {
    const rows = planRes.value?.rows || [];
    result.plan = rows.map(r => {
      const keys = Object.keys(r);
      return String(r.explain || r[keys[0]] || '');
    }).join('\n');
  } else {
    result.planError = planRes.reason?.message || 'EXPLAIN PLAN failed';
  }

  // Step 3: look up indexes for each unique table found in step 1.
  // If step 1 failed, this is skipped (no tables to look up).
  const uniqueTables = [];
  const seen = new Set();
  for (const t of result.tables) {
    const key = `${t.database}.${t.table}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTables.push({ database: t.database, table: t.table });
    }
  }

  if (uniqueTables.length > 0) {
    const indexResults = await Promise.allSettled(
      uniqueTables.map(t => lookupTableIndexes(t.database, t.table, creds))
    );
    indexResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        result.indexes.push(r.value);
      } else {
        result.indexes.push({
          database: uniqueTables[i].database,
          table: uniqueTables[i].table,
          primaryKey: '', sortingKey: '', engine: '',
          totalRows: 0, totalBytes: 0,
          skippingIndexes: [],
          error: r.reason?.message,
        });
      }
    });
  }

  return result;
}

// Index Lookup
//
// For a given database.table, fetches:
// - Primary key and sorting key from system.tables
// - Data skipping indexes from system.data_skipping_indices

async function lookupTableIndexes(database, table,creds) {
  const run = runner(creds);
  const [tableInfoRes, skipIdxRes] = await Promise.allSettled([
    run(
      `SELECT sorting_key, primary_key, engine, total_rows, total_bytes
       FROM system.tables
       WHERE database = '${esc(database)}' AND name = '${esc(table)}'
       LIMIT 1`
    ),
    runQuery(
      `SELECT name, type_full, expr, granularity
       FROM system.data_skipping_indices
       WHERE database = '${esc(database)}' AND table = '${esc(table)}'
       ORDER BY name`
    ),
  ]);

  const info = tableInfoRes.status === 'fulfilled' ? tableInfoRes.value?.rows?.[0] : null;
  const skipRows = skipIdxRes.status === 'fulfilled' ? (skipIdxRes.value?.rows || []) : [];

  return {
    database,
    table,
    primaryKey: info?.primary_key || '',
    sortingKey: info?.sorting_key || '',
    engine: info?.engine || '',
    totalRows: parseInt(info?.total_rows || 0, 10),
    totalBytes: parseInt(info?.total_bytes || 0, 10),
    skippingIndexes: skipRows.map(r => ({
      name: r.name,
      type: r.type_full,
      expression: r.expr,
      granularity: r.granularity,
    })),
  };
}

// Memory Lookup
//
// After query execution, fetches peak memory usage from system.query_log
// using the query_id returned by ClickHouse.
//
// This must be called after a brief delay (300ms+) because ClickHouse
// flushes query_log asynchronously. If called too early, the row may
// not exist yet.

export async function lookupMemoryUsage(queryId, creds) {
  if (!queryId) return null;
  const run = runner(creds);
  try {
    const r = await run(
      `SELECT memory_usage
       FROM system.query_log
       WHERE type = 'QueryFinish'
         AND query_id = '${esc(queryId)}'
       ORDER BY event_time DESC
       LIMIT 1`
    );
    if (r.rows?.[0]?.memory_usage != null) {
      return parseInt(r.rows[0].memory_usage, 10);
    }
  } catch {}
  return null;
}