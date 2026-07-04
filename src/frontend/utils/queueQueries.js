// queueQueries.js
// All SQL for the Queues feature. Read-only. No writes, ever.
//
// Two families:
//   Ingestion  -> system.s3queue_log / system.azure_queue_log (history)
//   Live       -> system.replication_queue / system.distribution_queue (snapshot)
//
// Every loader first checks the table exists (tableExists) so a server that
// does not use that engine shows an empty state instead of an error.

import { runQuery } from "./api.js";

// existence check
// Returns true if system.<name> exists on this server.
export async function tableExists(name) {
  try {
    const r = await runQuery(
      `SELECT count() AS c FROM system.tables
       WHERE database = 'system' AND name = '${name}'`
    );
    return Number(r.rows?.[0]?.c || 0) > 0;
  } catch {
    return false;
  }
}

// Pick a sensible bucket width (seconds) for a time-range, aiming for ~60 points.
export function bucketSeconds(fromSec, toSec) {
  const span = Math.max(1, toSec - fromSec);
  const target = Math.ceil(span / 60);
  // snap to a friendly step
  const steps = [10, 30, 60, 300, 600, 1800, 3600, 10800, 21600, 86400];
  return steps.find((s) => s >= target) || 86400;
}

// Build the time WHERE clause. from/to are unix seconds.
function timeWhere(from, to) {
  return `event_time >= toDateTime(${from}) AND event_time <= toDateTime(${to})`;
}

// Escape a single-quoted SQL string literal.
function esc(s) {
  return String(s).replace(/'/g, "''");
}

// Map the UI source choice to the underlying tables.
// source: 'all' | 's3' | 'azure'
function ingestionTables(source) {
  if (source === "s3") return ["system.s3queue_log"];
  if (source === "azure") return ["system.azure_queue_log"];
  return ["system.s3queue_log", "system.azure_queue_log"];
}

// Run a query against one or more ingestion tables and merge the rows.
// Skips tables that do not exist. Returns { rows, present } where present
// lists which tables actually existed (so the UI can show an empty state).
async function runOnIngestion(source, buildSql) {
  const tables = ingestionTables(source);
  const present = [];
  let allRows = [];
  for (const t of tables) {
    const shortName = t.replace("system.", "");
    if (!(await tableExists(shortName))) continue;
    present.push(t);
    const r = await runQuery(buildSql(t));
    allRows = allRows.concat(r.rows || []);
  }
  return { rows: allRows, present };
}

// INGESTION: health cards
export async function loadIngestionHealth(source, from, to) {
  const sql = (t) => `
    SELECT
      count() AS total_files,
      countIf(status = 'Processed') AS processed,
      countIf(status = 'Failed') AS failed,
      sum(rows_processed) AS rows_ingested,
      max(event_time) AS last_activity,
      if(count() = 0, 0,
         round(countIf(status = 'Processed') / count() * 100, 2)) AS success_rate
    FROM ${t}
    WHERE ${timeWhere(from, to)}`;
  const { rows, present } = await runOnIngestion(source, sql);

  // Merge partial results across s3 + azure into one summary.
  const acc = {
    total_files: 0, processed: 0, failed: 0, rows_ingested: 0,
    last_activity: null,
  };
  for (const r of rows) {
    acc.total_files += Number(r.total_files || 0);
    acc.processed += Number(r.processed || 0);
    acc.failed += Number(r.failed || 0);
    acc.rows_ingested += Number(r.rows_ingested || 0);
    const la = r.last_activity && r.last_activity !== "1970-01-01 00:00:00"
      ? r.last_activity : null;
    if (la && (!acc.last_activity || la > acc.last_activity)) acc.last_activity = la;
  }
  acc.success_rate = acc.total_files === 0
    ? null
    : Math.round((acc.processed / acc.total_files) * 10000) / 100;
  return { ...acc, present };
}

// INGESTION: throughput over time
export async function loadThroughput(source, from, to) {
  const step = bucketSeconds(from, to);
  const sql = (t) => `
    SELECT
      toStartOfInterval(event_time, INTERVAL ${step} SECOND) AS bucket,
      countIf(status = 'Processed') AS processed,
      countIf(status = 'Failed') AS failed,
      sum(rows_processed) AS rows_ingested
    FROM ${t}
    WHERE ${timeWhere(from, to)}
    GROUP BY bucket
    ORDER BY bucket`;
  const { rows, present } = await runOnIngestion(source, sql);

  // Merge buckets from multiple tables by timestamp.
  const byBucket = new Map();
  for (const r of rows) {
    const key = r.bucket;
    const cur = byBucket.get(key) || { bucket: key, processed: 0, failed: 0, rows_ingested: 0 };
    cur.processed += Number(r.processed || 0);
    cur.failed += Number(r.failed || 0);
    cur.rows_ingested += Number(r.rows_ingested || 0);
    byBucket.set(key, cur);
  }
  const merged = [...byBucket.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
  return { points: merged, present, step };
}

// INGESTION: latency split (p50/p95 per component)
// Components that cannot be computed (null/absent timing) come back as null,
// and the chart labels them "unavailable".
export async function loadLatencySplit(source, from, to) {
  const sql = (t) => `
    SELECT
      quantile(0.5)(get_object_time_ms)  AS fetch_p50,
      quantile(0.95)(get_object_time_ms) AS fetch_p95,
      quantile(0.5)(processing_ms)  AS process_p50,
      quantile(0.95)(processing_ms) AS process_p95,
      quantile(0.5)(commit_ms)  AS commit_p50,
      quantile(0.95)(commit_ms) AS commit_p95
    FROM (
      SELECT
        get_object_time_ms,
        if(processing_start_time IS NULL OR processing_end_time IS NULL, NULL,
           (toUnixTimestamp(processing_end_time) - toUnixTimestamp(processing_start_time)) * 1000)
           AS processing_ms,
        if(processing_end_time IS NULL, NULL,
           (toUnixTimestamp(commit_time) - toUnixTimestamp(processing_end_time)) * 1000)
           AS commit_ms
      FROM ${t}
      WHERE ${timeWhere(from, to)}
    )`;
  const { rows, present } = await runOnIngestion(source, sql);

  // Average the per-table results (usually only one table). NaN -> null.
  const clean = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const avg = (key) => {
    const vals = rows.map((r) => clean(r[key])).filter((v) => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  return {
    present,
    fetch:   { p50: avg("fetch_p50"),   p95: avg("fetch_p95") },
    process: { p50: avg("process_p50"), p95: avg("process_p95") },
    commit:  { p50: avg("commit_p50"),  p95: avg("commit_p95") },
  };
}

// INGESTION: failure summary grouped by error code
export async function loadFailureSummary(source, from, to) {
  const sql = (t) => `
    SELECT
      toInt32OrNull(extract(exception, 'Code:\\s*(\\d+)')) AS error_code,
      count() AS failures,
      min(event_time) AS first_seen,
      max(event_time) AS last_seen,
      groupUniqArray(concat(database, '.', table)) AS affected_tables,
      any(exception) AS sample_exception
    FROM ${t}
    WHERE status = 'Failed' AND ${timeWhere(from, to)}
    GROUP BY error_code
    ORDER BY failures DESC`;
  const { rows, present } = await runOnIngestion(source, sql);

  // Merge groups with the same error_code across tables.
  const byCode = new Map();
  for (const r of rows) {
    const key = String(r.error_code ?? "unknown");
    const cur = byCode.get(key) || {
      error_code: r.error_code ?? null, failures: 0,
      first_seen: r.first_seen, last_seen: r.last_seen,
      affected_tables: new Set(), sample_exception: r.sample_exception,
    };
    cur.failures += Number(r.failures || 0);
    if (r.first_seen < cur.first_seen) cur.first_seen = r.first_seen;
    if (r.last_seen > cur.last_seen) cur.last_seen = r.last_seen;
    (r.affected_tables || []).forEach((x) => cur.affected_tables.add(x));
    byCode.set(key, cur);
  }
  const merged = [...byCode.values()]
    .map((g) => ({ ...g, affected_tables: [...g.affected_tables] }))
    .sort((a, b) => b.failures - a.failures);
  return { groups: merged, present };
}

// INGESTION: raw failures / general search
// filters: { table, fileText, exceptionText, host, statusFailed }
export async function loadFiles(source, from, to, filters = {}, limit = 500) {
  const parts = [];
  if (filters.statusFailed) parts.push(`status = 'Failed'`);
  if (filters.table) parts.push(`concat(database,'.',table) = '${esc(filters.table)}'`);
  if (filters.fileText) parts.push(`file_name ILIKE '%${esc(filters.fileText)}%'`);
  if (filters.exceptionText) parts.push(`exception ILIKE '%${esc(filters.exceptionText)}%'`);
  if (filters.host) parts.push(`hostname = '${esc(filters.host)}'`);
  const extra = parts.length ? " AND " + parts.join(" AND ") : "";

  const sql = (t) => `
    SELECT
      event_time, database, table, file_name, rows_processed, status,
      exception, get_object_time_ms, hostname
    FROM ${t}
    WHERE ${timeWhere(from, to)}${extra}
    ORDER BY event_time DESC
    LIMIT ${limit}`;
  const { rows, present } = await runOnIngestion(source, sql);
  rows.sort((a, b) => (a.event_time < b.event_time ? 1 : -1));
  return { rows: rows.slice(0, limit), present };
}

// INGESTION: per-table health
export async function loadPerTableHealth(source, from, to) {
  const sql = (t) => `
    SELECT
      concat(database, '.', table) AS queue_table,
      count() AS total_files,
      countIf(status = 'Failed') AS failed,
      if(count()=0,0,round(countIf(status='Processed')/count()*100,2)) AS success_rate,
      sum(rows_processed) AS rows_ingested,
      max(event_time) AS last_activity
    FROM ${t}
    WHERE ${timeWhere(from, to)}
    GROUP BY queue_table
    ORDER BY failed DESC, last_activity ASC`;
  const { rows, present } = await runOnIngestion(source, sql);
  return { rows, present };
}

// LIVE TAB: replication + distribution (snapshots)

export async function loadReplication() {
  if (!(await tableExists("replication_queue"))) {
    return { present: false, cards: null, tasks: [], typeMix: [], depth: [] };
  }
  // Run each query independently. A single failure (for example a column that
  // is absent on this server version) degrades that one section to empty rather
  // than rejecting the whole loader and taking down the page.
  const [snap, cards, mix, depth] = await Promise.allSettled([
    runQuery(`
      SELECT database, table, replica_name, type, create_time,
        dateDiff('second', create_time, now()) AS age_seconds,
        is_currently_executing, num_tries, num_postponed,
        postpone_reason, last_exception, last_exception_time, new_part_name
      FROM system.replication_queue
      ORDER BY num_tries DESC, age_seconds DESC`),
    runQuery(`
      SELECT count() AS total_pending,
        countIf(is_currently_executing = 1) AS executing,
        max(dateDiff('second', create_time, now())) AS oldest_age_seconds
      FROM system.replication_queue`),
    runQuery(`
      SELECT type, count() AS cnt FROM system.replication_queue
      GROUP BY type ORDER BY cnt DESC`),
    runQuery(`
      SELECT concat(database,'.',table) AS tbl, replica_name, count() AS depth,
        max(dateDiff('second', create_time, now())) AS oldest_age_seconds
      FROM system.replication_queue
      GROUP BY tbl, replica_name ORDER BY depth DESC`),
  ]);
  const rowsOf = (s) => (s.status === "fulfilled" ? (s.value.rows || []) : []);
  return {
    present: true,
    cards: cards.status === "fulfilled" ? (cards.value.rows?.[0] || null) : null,
    tasks: rowsOf(snap),
    typeMix: rowsOf(mix),
    depth: rowsOf(depth),
  };
}

export async function loadDistribution() {
  if (!(await tableExists("distribution_queue"))) {
    return { present: false, cards: null, rows: [] };
  }
  const [snap, cards] = await Promise.allSettled([
    runQuery(`
      SELECT database, table, is_blocked, error_count, data_files,
        data_compressed_bytes, broken_data_files, broken_data_compressed_bytes,
        last_exception, last_exception_time
      FROM system.distribution_queue
      ORDER BY broken_data_files DESC, data_files DESC`),
    runQuery(`
      SELECT count() AS dist_tables,
        countIf(is_blocked = 1) AS blocked,
        sum(data_files) AS files_waiting,
        sum(data_compressed_bytes) AS bytes_waiting,
        sum(broken_data_files) AS broken_files
      FROM system.distribution_queue`),
  ]);
  return {
    present: true,
    cards: cards.status === "fulfilled" ? (cards.value.rows?.[0] || null) : null,
    rows: snap.status === "fulfilled" ? (snap.value.rows || []) : [],
  };
}