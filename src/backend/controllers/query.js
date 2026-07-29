// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Proxies frontend queries to ClickHouse with multi-cluster routing and SSRF protection via node whitelist validation.


import { getClusterNodes } from '../services/clusterUtils.js';
import { executeQuery } from '../services/clickhouse.js';
import { isReadOnlySql } from '../../shared/sqlClassify.js';
import { materialize } from '../../shared/sqlParams.js';
import { leadingKeyword } from '../../shared/sqlClassify.js';
import { getCredSession, CRED_CONTEXTS } from '../services/chCredStore.js';

// Settings the client may set on a query.
//
// This is an allowlist, not a passthrough: setting names become URL parameters
// on the ClickHouse® request, so forwarding whatever arrives would let any
// authenticated caller change execution limits, memory ceilings or access
// behaviour for their own query.
//
// It exists because the request settings were previously destructured out of
// the body and then never used. The SQL Editor sends max_result_rows with every
// run - and the backend dropped it, so the configured Max rows had no effect on
// the server at all. Worse, executeQuery still forced result_overflow_mode to
// 'break'. If the ClickHouse user's own profile carried a max_result_rows (the
// Access Control pages in this app set exactly that), the profile's limit
// applied instead and 'break' truncated the result silently rather than
// raising TOO_MANY_ROWS_OR_BYTES - which reads as "the row limit is ignored and
// large queries come back short or empty".
const ALLOWED_QUERY_SETTINGS = new Set([
  // Result shaping, sent by the editor on every run.
  'max_result_rows',
  'max_result_bytes',
  'result_overflow_mode',
  // EXPLAIN options (see explainOptions.js REQUIRED_SETTINGS).
  'use_query_condition_cache',
  'use_skip_indexes_on_data_read',
]);

function onlyKnownSettings(input) {
  const clean = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (ALLOWED_QUERY_SETTINGS.has(key)) clean[key] = value;
  }
  return clean;
}

export async function runQuery(req, res) {
  const { sql, node, user, password, port, clusterId, strictAuth, useSession, context, params, settings } = req.body;
  let { readOnly } = req.body;
  if (!sql) return res.status(400).json({ error: 'Missing SQL' });

  // Server-side role enforcement: the client-supplied readOnly flag is only a
  // UX hint.
  if (req.user?.role === 'readonly') {
    readOnly = true;
  }

  // Defense in depth: when the caller asks for a read-only request, reject any
  // non-read statement here before it reaches ClickHouse.
  if (readOnly && !isReadOnlySql(sql)) {
    return res.status(400).json({
      error: 'This request only allows read-only queries (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, EXISTS).',
    });
  }

  const clusterNodes = getClusterNodes(clusterId);
  if (clusterNodes.length === 0) return res.status(400).json({ error: 'No cluster nodes configured.' });

  // Only connect to hosts that are in the cluster config (SSRF prevention)
  const targetNode = node
    ? clusterNodes.find(n => n.host === node)
    : clusterNodes[0];

  if (!targetNode) {
    return res.status(400).json({ error: 'Node not found in cluster configuration.' });
  }

  // try { const result = await executeQuery({ host:


  // Resolve credentials.
  let resolvedUser, resolvedPassword;
  if (useSession) {
    const sess = getCredSession(req.user?.jti, context || CRED_CONTEXTS.EDITOR);
    if (!sess) {
      return res.status(401).json({
        error: 'Your session expired. Please reconnect with your ClickHouse credentials.',
        code: 'CRED_SESSION_EXPIRED',
      });
    }
    resolvedUser = sess.chUser;
    resolvedPassword = sess.password;
  } else if (strictAuth) {
    if (!user) {
      return res.status(400).json({ error: 'Credentials required for this request.' });
    }
    resolvedUser = user;
    resolvedPassword = password ?? '';
  } else {
    resolvedUser = user || targetNode.user || 'default';
    resolvedPassword = password ?? targetNode.password ?? '';
  }

  try {
    // Parameters are deliberately SELECT-only. A parameterized INSERT or DDL
    // statement is not materialized here: its placeholders reach ClickHouse
    // verbatim and are rejected, and any /*[ ]*/ block is treated as an
    // ordinary comment and dropped. Note this differs from routes/export.js,
    // which materializes unconditionally. If parameterized writes are ever
    // wanted, this gate is the thing to widen, and the two paths should be
    // brought back into agreement at the same time.
    const kw = leadingKeyword(sql);
    const rowReturning = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'EXISTS'].includes(kw);

    let finalSql = sql;
    let finalParams = {};
    if (rowReturning) {
      try {
        const m = materialize(sql, params || {});
        finalSql = m.sql;
        finalParams = m.params;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const result = await executeQuery({
      host: targetNode.host,
      port: port || targetNode.port || 8123,
      secure: !!targetNode.secure,
      user: resolvedUser,
      password: resolvedPassword,
      sql: finalSql,
      params: finalParams,
      readOnly: !!readOnly,
      settings: onlyKnownSettings(settings),
    });

    if (result && result.stats) {
      const s = result.stats;
      if (s.written_rows) result.written_rows = Number(s.written_rows);
      else if (s.written_rows_count) result.written_rows = Number(s.written_rows_count);
      else if (s.written) result.written_rows = Number(s.written);
      if (s.read_rows) result.read_rows = Number(s.read_rows);
      if (s.read_bytes) result.read_bytes = Number(s.read_bytes);
      if (s.elapsed_ns) result.elapsed_ns = s.elapsed_ns;
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function testQueryConnection(req, res) {
  const { node, user, password, port, clusterId } = req.body;
  if (!node) return res.status(400).json({ ok: false, message: 'Node host required.' });

  const clusterNodes = getClusterNodes(clusterId);
  const targetNode = clusterNodes.find(n => n.host === node);
  if (!targetNode) {
    return res.json({ ok: false, message: 'Node not found in cluster configuration.' });
  }

  // Fall back to the stored node credentials, exactly as runQuery does. The
  // browser no longer holds decrypted passwords, so without this fallback a
  // connection test authenticates as 'default' with a blank password and fails
  // against any node that actually has one.
  try {
    await executeQuery({
      host: targetNode.host,
      port: port || targetNode.port || 8123,
      secure: !!targetNode.secure,
      user: user || targetNode.user || 'default',
      password: password ?? targetNode.password ?? '',
      sql: 'SELECT 1',
    });
    res.json({ ok: true, message: 'Connected successfully' });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
}
