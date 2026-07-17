// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Proxies frontend queries to ClickHouse with multi-cluster routing and SSRF protection via node whitelist validation.


import { getClusterNodes } from '../services/clusterUtils.js';
import { executeQuery } from '../services/clickhouse.js';
import { isReadOnlySql } from '../../shared/sqlClassify.js';
import { getCredSession, CRED_CONTEXTS } from '../services/chCredStore.js';

export async function runQuery(req, res) {
  const { sql, node, user, password, port, clusterId, strictAuth, useSession, context } = req.body;
  let { readOnly } = req.body;
  if (!sql) return res.status(400).json({ error: 'Missing SQL' });

  // Server-side role enforcement: the client-supplied readOnly flag is only a
  // UX hint. A CHOps user whose app role is 'readonly' must never be able to
  // escalate to a write query by omitting/flipping this flag in the request body.
  if (req.user?.role === 'readonly') {
    readOnly = true;
  }

  // Defense in depth: when the caller asks for a read-only request, reject any
  // non-read statement here before it reaches ClickHouse. The readonly setting
  // passed to executeQuery below is the authoritative enforcement.
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

  // try {
  //   const result = await executeQuery({
  //     host: targetNode.host,
  //     port: port || targetNode.port || 8123,
  //     secure: !!targetNode.secure,
  //     user: user || targetNode.user || 'default',
  //     password: password ?? targetNode.password ?? '',
  //     sql,
  //   });


  // Resolve credentials.
  //  - useSession: the SQL Editor path. Credentials come only from the encrypted
  //    (jti, context) session; if it is gone the client must reconnect. Never
  //    falls back to the node or 'default' user.
  //  - strictAuth: legacy per-request editor auth. Must carry its own username.
  //  - otherwise: the shared navbar connection, allowed to fall back to the node.
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
    const result = await executeQuery({
      host: targetNode.host,
      port: port || targetNode.port || 8123,
      secure: !!targetNode.secure,
      user: resolvedUser,
      password: resolvedPassword,
      sql,
      readOnly: !!readOnly,
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

  try {
    await executeQuery({
      host: targetNode.host,
      port: port || targetNode.port || 8123,
      secure: !!targetNode.secure,
      user: user || 'default', password: password || '',
      sql: 'SELECT 1',
    });
    res.json({ ok: true, message: 'Connected successfully' });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
}