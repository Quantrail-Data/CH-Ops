// clickhouse.js - ClickHouse HTTP client with JSON parsing
//
// Sends SQL queries to ClickHouse over its HTTP interface using
// X-ClickHouse-User/Key headers for authentication. Appends
// FORMAT JSONEachRow to data-returning queries (SELECT, SHOW, etc.)
// and parses the response. Returns X-ClickHouse-Query-Id and
// X-ClickHouse-Summary headers for profiling and stats. EXPLAIN
// with graph=1 or json=1 is handled as raw text output.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { isDataQuery as sqlIsDataQuery, leadingKeyword } from '../../shared/sqlClassify.js';

function validateClickHouseHost(host) {
  if (typeof host !== 'string') {
    throw new TypeError('ClickHouse host must be a string');
  }

  const normalizedHost = host.trim();
  if (!normalizedHost) {
    throw new Error('ClickHouse host is required');
  }

  if (!/^[A-Za-z0-9.-]+$/.test(normalizedHost)) {
    throw new Error(`Invalid ClickHouse host: ${host}`);
  }

  if (normalizedHost.startsWith('.') || normalizedHost.endsWith('.') || normalizedHost.includes('..')) {
    throw new Error(`Invalid ClickHouse host: ${host}`);
  }

  return normalizedHost;
}

function buildClickHouseUrl({ host, port, secure, readOnly = false }) {
  const normalizedHost = validateClickHouseHost(host);
  const url = new URL(`${secure ? 'https' : 'http'}://127.0.0.1/`);
  url.hostname = normalizedHost;
  url.port = String(port);

  if (readOnly) {
    url.searchParams.set('readonly', '1');
  }

  return url;
}

export async function executeQuery({ host, port = 8123, secure = false, user = 'default', password = '', sql, readOnly = false }) {
  const proto = secure ? 'https' : 'http';
  // Apply ClickHouse's readonly setting as the authoritative guard for read-only
  // requests. Restricting yourself to readonly=1 is always allowed, so this is
  // safe to send even if the user's profile is not already read-only.
  const url = buildClickHouseUrl({ host, port, secure, readOnly });

  // Strip trailing semicolons and classify (comment/quote-safe) to decide whether
  // to append FORMAT JSONEachRow. Uses the same shared classifier as everywhere.
  const trimmed = sql.trimEnd().replace(/;+$/, '');
  const isDataQuery = sqlIsDataQuery(trimmed);

  // EXPLAIN with graph=1 or json=1 produces non-tabular output
  const firstWord = leadingKeyword(trimmed);
  const lowerStripped = trimmed.toLowerCase();
  const isExplainRaw = firstWord === 'EXPLAIN' && (/\bgraph\s*=\s*1/.test(lowerStripped) || /\bjson\s*=\s*1/.test(lowerStripped));

  const fullSql = isDataQuery && !isExplainRaw ? trimmed + '\nFORMAT JSONEachRow' : trimmed;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-ClickHouse-User': user, 'X-ClickHouse-Key': password, 'X-ClickHouse-Summary': '1' },
    body: fullSql,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text.trim());

  // Stats come back in this header: {"read_rows":"100","read_bytes":"1234",...}
  let stats = {};
  try {
    const summaryHeader = res.headers.get('X-ClickHouse-Summary');
    if (summaryHeader) stats = JSON.parse(summaryHeader);
  } catch {}

  // The query ID assigned by ClickHouse for this execution.
  // Frontend uses this to link to profiling tools (flame graph, pipeline, metrics).
  const queryId = res.headers.get('X-ClickHouse-Query-Id') || null;

  if (!isDataQuery) return { rows: [], columns: [], stats, queryId};

  // Raw EXPLAIN output - each line becomes a row with a single "explain" column
  if (isExplainRaw) {
    const lines = text.trim().split('\n').filter(Boolean);
    const rows = lines.map(line => ({ explain: line }));
    return { rows, columns: ['explain'], stats, queryId};
  }

  // Normal data query - parse each line as JSON (JSONEachRow format)
  const rows = text.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns, stats, queryId};

}

// executeQueryWithBody - run a query with the SQL in the URL parameter and an
// optional raw request body, used by Schema Studio.
//
// The standard executeQuery() above sends the SQL as the POST body, which
// cannot also carry a data payload. Schema Studio needs both for binary-format
// inference (Parquet/ORC): the query goes in the ?query= parameter and the file
// bytes are the POST body. The same path serves text queries (body = null).
// Safety limits cap execution time and memory so a bad inference cannot hammer
// the server. Set jsonEachRow false for statements that are not data queries
// (CREATE TABLE, EXPLAIN AST), where parsing is not needed.
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

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'X-ClickHouse-User': user, 'X-ClickHouse-Key': password, 'X-ClickHouse-Summary': '1' },
    body,
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
