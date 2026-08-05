// processesModel.js - SQL, derived fields, sorting and aggregation for the Current Queries page
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { num, ratio } from "../../utils/format.js";

// Big columns the table never shows. * EXCEPT so new server columns still appear.
const HEAVY_COLUMNS = ["ProfileEvents", "Settings", "thread_ids", "query"];

export const QUERY_PREVIEW_CHARS = 200;

// Real column per search field, so no part of the predicate comes from user input.
const SEARCH_COLUMNS = {
  query_preview: "query",
  user: "user",
  query_id: "query_id",
};

function searchPredicate(field) {
  const col = SEARCH_COLUMNS[field];
  if (col) return `positionCaseInsensitive(${col}, {q:String}) > 0`;
  const any = Object.values(SEARCH_COLUMNS)
    .map((c) => `positionCaseInsensitive(${c}, {q:String}) > 0`)
    .join(" OR ");
  return `(${any})`;
}

// Returns { sql, params }. The term is bound, never interpolated.
export function buildProcessesSql({ search = "", searchField = "" } = {}) {
  const term = String(search || "").trim();
  const where = ["query_id != queryID()"];
  if (term) where.push(searchPredicate(searchField));
  const sql = `SELECT * EXCEPT (${HEAVY_COLUMNS.join(", ")}),
       substring(query, 1, ${QUERY_PREVIEW_CHARS}) AS query_preview,
       (SELECT count() FROM system.processes WHERE query_id != queryID()) AS total_running
FROM system.processes
WHERE ${where.join("\n  AND ")}
ORDER BY elapsed DESC`;
  return term ? { sql, params: { q: term } } : { sql };
}

// Absent when nothing matched, since the count rides on the rows themselves.
export function totalRunning(rows) {
  const v = rows?.[0]?.total_running;
  return v === undefined || v === null ? null : num(v);
}

// Clients can set their own query_id over HTTP, so treat it as untrusted input.
const SAFE_QUERY_ID = /^[A-Za-z0-9._:@/+-]{1,192}$/;

export function isSafeQueryId(id) {
  return typeof id === "string" && SAFE_QUERY_ID.test(id);
}

// Cannot fire while SAFE_QUERY_ID rejects quotes. Here so widening it stays safe.
export function quoteLiteral(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function buildKillSql(queryId, { sync = false } = {}) {
  if (!isSafeQueryId(queryId)) {
    throw new Error("Refusing to kill: query id contains unexpected characters.");
  }
  return `KILL QUERY WHERE query_id = ${quoteLiteral(queryId)} ${sync ? "SYNC" : "ASYNC"}`;
}

export function buildFullQuerySql(queryId) {
  if (!isSafeQueryId(queryId)) throw new Error("Invalid query id.");
  return `SELECT query, ProfileEvents, Settings, thread_ids
FROM system.processes
WHERE query_id = ${quoteLiteral(queryId)}
LIMIT 1`;
}

// A query that finished between poll and click is gone from processes, not the log.
export function buildQueryLogFallbackSql(queryId) {
  if (!isSafeQueryId(queryId)) throw new Error("Invalid query id.");
  return `SELECT query, ProfileEvents, Settings, thread_ids
FROM system.query_log
WHERE query_id = ${quoteLiteral(queryId)}
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing', 'ExceptionBeforeStart')
ORDER BY event_time DESC
LIMIT 1`;
}

// processes alone leaves the dropdowns empty when nothing is running.
export function buildFilterOptionsSql(days = 7) {
  const window = Math.max(1, Math.min(90, Math.floor(days)));
  return `SELECT groupUniqArray(200)(user) AS users,
       groupUniqArray(50)(query_kind) AS kinds
FROM system.query_log
WHERE event_date >= today() - ${window}
  AND user != ''`;
}

// Log covers history, snapshot covers anyone who started since.
export function mergeOptions(fromLog, fromLive) {
  const all = new Set();
  for (const v of Array.isArray(fromLog) ? fromLog : []) if (v) all.add(String(v));
  for (const v of Array.isArray(fromLive) ? fromLive : []) if (v) all.add(String(v));
  return [...all].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

// Both come back as small ints.
const INTERFACE_NAMES = {
  1: "TCP",
  2: "HTTP",
  3: "gRPC",
  4: "MySQL",
  5: "PostgreSQL",
  6: "Local",
  7: "TCP (interserver)",
};

const HTTP_METHOD_NAMES = { 0: "-", 1: "GET", 2: "POST" };

export function interfaceName(v) {
  return INTERFACE_NAMES[num(v, -1)] || "Unknown";
}

export function httpMethodName(v) {
  return HTTP_METHOD_NAMES[num(v, -1)] || "-";
}

// Int64, occasionally slightly negative under concurrent accounting.
export function clampBytes(v) {
  return Math.max(0, num(v));
}

export function deriveRow(raw) {
  const memory = clampBytes(raw.memory_usage);
  const peak = clampBytes(raw.peak_memory_usage);
  return {
    ...raw,
    memory_usage: memory,
    peak_memory_usage: peak,
    elapsed: num(raw.elapsed),
    read_rows: num(raw.read_rows),
    read_bytes: num(raw.read_bytes),
    written_rows: num(raw.written_rows),
    written_bytes: num(raw.written_bytes),
    total_rows_approx: num(raw.total_rows_approx),
    peak_threads_usage: num(raw.peak_threads_usage),
    // null, not 0: no estimate is not the same as no progress.
    progress: ratio(raw.read_rows, raw.total_rows_approx),
    memory_ratio: ratio(memory, peak),
    is_cancelled: num(raw.is_cancelled) === 1,
    is_initial_query: num(raw.is_initial_query, 1) === 1,
    is_internal: num(raw.is_internal) === 1,
  };
}

export function deriveRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(deriveRow);
}

// Empty value means all fields. Query text hits the statement, not the preview.
export const SEARCH_FIELDS = [
  { value: "", label: "All fields" },
  { value: "query_preview", label: "Query text" },
  { value: "user", label: "User" },
  { value: "query_id", label: "Query ID" },
];

// Client side: columns already in hand, under 2 ms at 2k rows. Search is in SQL.
export function applyFilters(rows, { users = [], kinds = [], hideInternal = false, initialOnly = false } = {}) {
  return rows.filter((r) => {
    if (users.length && !users.includes(r.user)) return false;
    if (kinds.length && !kinds.includes(r.query_kind)) return false;
    if (hideInternal && r.is_internal) return false;
    if (initialOnly && !r.is_initial_query) return false;
    return true;
  });
}

export function distinctValues(rows, key) {
  return [...new Set(rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== ""))].sort();
}

// Nulls last in both directions. Unknown progress is not the smallest progress.
export function compareValues(a, b) {
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows(rows, key, dir = "desc") {
  if (!key) return rows;
  const sign = dir === "asc" ? 1 : -1;
  // Copy, the caller's array is state.
  return [...rows].sort((a, b) => {
    const c = compareValues(a[key], b[key]);
    // Do not let sign flip the nulls.
    if (c === 1 && (a[key] === null || a[key] === undefined || a[key] === "")) return 1;
    if (c === -1 && (b[key] === null || b[key] === undefined || b[key] === "")) return -1;
    return c * sign;
  });
}

// One pass for the charts and the metric strip. ~1ms at 2k rows, so no cache.
export function aggregateByUser(rows) {
  const byUser = new Map();
  for (const r of rows) {
    const key = r.user || "(unknown)";
    let e = byUser.get(key);
    if (!e) {
      e = { user: key, count: 0, memory: 0, readBytes: 0, readRows: 0, elapsedMax: 0, kinds: {} };
      byUser.set(key, e);
    }
    e.count += 1;
    e.memory += r.memory_usage;
    e.readBytes += r.read_bytes;
    e.readRows += r.read_rows;
    if (r.elapsed > e.elapsedMax) e.elapsedMax = r.elapsed;
    const kind = r.query_kind || "Other";
    e.kinds[kind] = (e.kinds[kind] || 0) + 1;
  }
  return [...byUser.values()];
}

// Twenty slices is unreadable. The rest fold into one, labelled with the count.
export function topNWithOther(entries, valueKey, n = 6) {
  const sorted = [...entries].sort((a, b) => b[valueKey] - a[valueKey]);
  if (sorted.length <= n) return sorted.map((e) => ({ name: e.user, value: e[valueKey] }));
  const head = sorted.slice(0, n).map((e) => ({ name: e.user, value: e[valueKey] }));
  const tail = sorted.slice(n);
  const rest = tail.reduce((sum, e) => sum + e[valueKey], 0);
  if (rest > 0) head.push({ name: `Other (${tail.length} users)`, value: rest, isOther: true });
  return head;
}

export function summarise(rows) {
  let memory = 0;
  let readBytes = 0;
  let longest = 0;
  const users = new Set();
  for (const r of rows) {
    memory += r.memory_usage;
    readBytes += r.read_bytes;
    if (r.elapsed > longest) longest = r.elapsed;
    if (r.user) users.add(r.user);
  }
  return { running: rows.length, users: users.size, memory, readBytes, longest };
}

export function topByElapsed(rows, n = 10) {
  return [...rows].sort((a, b) => b.elapsed - a.elapsed).slice(0, n);
}

// A few at a time. Never rejects: the caller wants the tally, not the first failure.
export async function runBounded(items, worker, { limit = 8, onProgress } = {}) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;

  async function pump() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      try {
        results[i] = { item: items[i], ok: true, value: await worker(items[i], i) };
      } catch (err) {
        results[i] = { item: items[i], ok: false, error: err?.message || String(err) };
      }
      done += 1;
      if (onProgress) onProgress(done, items.length);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, pump);
  await Promise.all(workers);
  return results;
}

// KILL returns no rows through clickhouse.js, so re-read processes. Gone, not killed.
export function diffKilled(requestedIds, remainingRows) {
  const remaining = new Set(remainingRows.map((r) => r.query_id));
  const gone = [];
  const stillRunning = [];
  for (const id of requestedIds) {
    if (remaining.has(id)) stillRunning.push(id);
    else gone.push(id);
  }
  return { gone, stillRunning };
}

// numeric: right-align and compare as a number.
export const PROCESS_COLUMNS = [
  { key: "query_id", label: "Query ID", sortable: true },
  { key: "user", label: "User", sortable: true },
  { key: "query_kind", label: "Kind", sortable: true },
  { key: "elapsed", label: "Elapsed", sortable: true, numeric: true },
  { key: "progress", label: "Progress", sortable: true, numeric: true },
  { key: "memory_usage", label: "Memory", sortable: true, numeric: true },
  { key: "peak_memory_usage", label: "Peak memory", sortable: true, numeric: true },
  { key: "read_rows", label: "Read rows", sortable: true, numeric: true },
  { key: "read_bytes", label: "Read bytes", sortable: true, numeric: true },
  { key: "written_rows", label: "Written rows", sortable: true, numeric: true },
  { key: "written_bytes", label: "Written bytes", sortable: true, numeric: true },
  { key: "peak_threads_usage", label: "Threads", sortable: true, numeric: true },
  { key: "query_preview", label: "Query", sortable: false },
];

export const DEFAULT_SORT = { key: "elapsed", dir: "desc" };

export const REFRESH_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 2000, label: "2s" },
  { value: 5000, label: "5s" },
  { value: 10000, label: "10s" },
  { value: 30000, label: "30s" },
];

export const DEFAULT_REFRESH_MS = 5000;

// Fastest refresh, not hardcoded, so typing cannot outpace the poll. Off is not a rate.
export const SEARCH_DEBOUNCE_MS = Math.min(
  ...REFRESH_OPTIONS.map((o) => o.value).filter(Boolean),
);

// Above this, typing the count is required before the kill button enables.
export const TYPED_CONFIRM_THRESHOLD = 10;

export const KILL_CONCURRENCY = 8;
