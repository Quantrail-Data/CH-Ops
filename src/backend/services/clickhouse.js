// clickhouse.js - ClickHouse HTTP client with JSON parsing
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { isDataQuery as sqlIsDataQuery, leadingKeyword } from '../../shared/sqlClassify.js';
import { getCaBundle } from './trustedCa.js';
import { getConfig } from './appConfig.js';

// The ceiling on how much a single query may return to the application.


function maxResultBytes() {
  return getConfig('query.maxResultBytes');
}

export async function executeQuery({
  host, port = 8123, secure = false, user = 'default', password = '',
  sql, readOnly = false, params = {}, settings = {},
  noResultLimit = false,
  signal,
  timeoutMs = null,
}) {
  const proto = secure ? 'https' : 'http';
  // Apply ClickHouse's readonly setting as the authoritative guard for read-
  // only requests.
  const url = new URL(`${proto}://${host}:${port}/`);
  if (readOnly) url.searchParams.set('readonly', '1');

  // Parameter and setting names become part of the request URL, so they are
  // validated before use.
  const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const [k, v] of Object.entries(params || {})) {
    if (!SAFE_NAME.test(k)) throw new Error(`Invalid parameter name: ${k}`);
    if (v === undefined || v === null) continue;
    url.searchParams.set(`param_${k}`, String(v));
  }
  // The ceiling goes on FIRST, so an explicit setting from the caller still
  // wins. That matters for the editor, which sends its own row limit alongside.
  if (!noResultLimit) {
    url.searchParams.set('max_result_bytes', String(maxResultBytes()));
    // Stop cleanly at the limit rather than raising TOO_MANY_ROWS_OR_BYTES,
    url.searchParams.set('result_overflow_mode', 'break');
  }

  for (const [k, v] of Object.entries(settings || {})) {
    if (!SAFE_NAME.test(k)) throw new Error(`Invalid setting name: ${k}`);
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }

  // Strip trailing semicolons and classify (comment/quote-safe) to decide whether
  // to append FORMAT JSONEachRow. Uses the same shared classifier as everywhere.
  const trimmed = sql.trimEnd().replace(/;+$/, '');
  const isDataQuery = sqlIsDataQuery(trimmed);

  // EXPLAIN with graph=1 or json=1 produces non-tabular output
  const firstWord = leadingKeyword(trimmed);
  const lowerStripped = trimmed.toLowerCase();
  const isExplainRaw = firstWord === 'EXPLAIN' && (/\bgraph\s*=\s*1/.test(lowerStripped) || /\bjson\s*=\s*1/.test(lowerStripped));

  const fullSql = isDataQuery && !isExplainRaw ? trimmed + '\nFORMAT JSONEachRow' : trimmed;

  const controller = timeoutMs != null ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  // Both, when both exist. AbortSignal.any fires on whichever comes first.
  let abortSignal;
  if (signal && controller) abortSignal = AbortSignal.any([signal, controller.signal]);
  else if (signal) abortSignal = signal;
  else if (controller) abortSignal = controller.signal;

  let res;
  try {
    // Certificates the operator has told us to trust. Supplying them adds to the system list rather than replacing it,
    // so a cluster with a publicly signed certificate is unaffected. 
    const caBundle = getCaBundle();

    res = await fetch(url, {
      method: 'POST',
      headers: { 'X-ClickHouse-User': user, 'X-ClickHouse-Key': password, 'X-ClickHouse-Summary': '1' },
      body: fullSql,
      signal: abortSignal,
      ...(caBundle ? { tls: { ca: caBundle } } : {}),
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    // fetch reports both a timeout and a client disconnect as AbortError, and
    // "The operation was aborted" tells an operator nothing.
    if (err?.name === 'AbortError') {
      throw new Error(
        controller?.signal.aborted
          ? `Query timed out after ${timeoutMs}ms.`
          : 'Query cancelled.',
      );
    }
    throw err;
  }
  if (timer) clearTimeout(timer);

  const text = await res.text();
  if (!res.ok) throw new Error(text.trim());

  // Stats come back in this header: {"read_rows":"100","read_bytes":"1234",...}
  let stats = {};
  try {
    const summaryHeader = res.headers.get('X-ClickHouse-Summary');
    if (summaryHeader) stats = JSON.parse(summaryHeader);
  } catch { }

  // The query ID assigned by ClickHouse for this execution.
  // Frontend uses this to link to profiling tools (flame graph, pipeline, metrics).
  const queryId = res.headers.get('X-ClickHouse-Query-Id') || null;

  if (!isDataQuery) return { rows: [], columns: [], stats, queryId };

  // Raw EXPLAIN output - each line becomes a row with a single "explain" column
  if (isExplainRaw) {
    const lines = text.trim().split('\n').filter(Boolean).map(line => line.trim());
    const rows = lines.map(line => ({ explain: line }));
    return { rows, columns: ['explain'], stats, queryId };
  }

  // Normal data query - parse each line as JSON (JSONEachRow format)
  const rows = text.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns, stats, queryId };

}

// executeQueryWithBody - run a query with the SQL in the URL parameter and an
// optional raw request body, used by Schema Studio.
export async function executeQueryWithBody({
  host,
  port = 8123,
  secure = false,
  user = 'default',
  password = '',
  query,
  body = null,
  jsonEachRow = true,
  maxExecutionTime = 30,
  maxMemoryUsage = 2 * 1024 * 1024 * 1024,
}) {
  const proto = secure ? 'https' : 'http';
  const url = new URL(`${proto}://${host}:${port}/`);

  const trimmed = (query || '').trim();
  const hasFormat = /FORMAT\s+\w+\s*$/i.test(trimmed);
  const fullQuery = jsonEachRow && !hasFormat ? `${trimmed} FORMAT JSONEachRow` : trimmed;

  url.searchParams.set('query', fullQuery);
  url.searchParams.set('max_execution_time', String(maxExecutionTime));
  url.searchParams.set('max_memory_usage', String(maxMemoryUsage));

  const caBundle2 = getCaBundle();
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'X-ClickHouse-User': user, 'X-ClickHouse-Key': password, 'X-ClickHouse-Summary': '1' },
    body,
    ...(caBundle2 ? { tls: { ca: caBundle2 } } : {}),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text.trim() || `ClickHouse HTTP ${res.status}`);

  const queryId = res.headers.get('X-ClickHouse-Query-Id') || null;

  if (!jsonEachRow) return { rows: [], columns: [], queryId };

  const rows = text.trim()
    ? text.trim().split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean)
    : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns, queryId };
}
