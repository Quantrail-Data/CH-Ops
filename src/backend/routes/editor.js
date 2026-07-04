// editor.js - SQL Editor credential session routes
//
//   POST   /api/editor/connect     - validate + store per-user CH creds (editor)
//   GET    /api/editor/connect     - connection status (no password)
//   DELETE /api/editor/connect     - clear the stored editor credentials
//
// The editor runs under the caller's own ClickHouse credentials, resolved
// server-side from the encrypted (jti, 'editor') session. The browser sends the
// password once, here, and never again; subsequent /api/query calls set
// useSession + context 'editor' and the password is resolved from this store.
// The target node is validated against the cluster config (SSRF protection).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import express from 'express';
import { getClusterNodes } from '../services/clusterUtils.js';
import { executeQuery } from '../services/clickhouse.js';
import {
  setCredSession, getCredSessionStatus, clearCredSession, CRED_CONTEXTS,
} from '../services/chCredStore.js';

const router = express.Router();

// SSRF protection: only hosts in the configured cluster are reachable.
function resolveTargetNode(clusterId, node) {
  const nodes = getClusterNodes(clusterId);
  if (!nodes.length) {
    const e = new Error('No cluster nodes configured.');
    e.status = 400;
    throw e;
  }
  const target = node ? nodes.find((n) => n.host === node) : nodes[0];
  if (!target) {
    const e = new Error('Node not found in cluster configuration.');
    e.status = 400;
    throw e;
  }
  return target;
}

router.post('/connect', async (req, res) => {
  try {
    const { clusterId, node, port, user, password } = req.body || {};
    if (!user) return res.status(400).json({ error: 'ClickHouse username is required.' });

    const target = resolveTargetNode(clusterId, node);
    // Validate the credentials by running a trivial query as that user.
    await executeQuery({
      host: target.host,
      port: port || target.port || 8123,
      secure: !!target.secure,
      user,
      password: password ?? '',
      sql: 'SELECT 1',
    });

    setCredSession({
      jti: req.user.jti,
      context: CRED_CONTEXTS.EDITOR,
      appUser: req.user.username,
      clusterId,
      node: target.host,
      port: port || target.port || 8123,
      chUser: user,
      password: password ?? '',
    });
    res.json(getCredSessionStatus(req.user.jti, CRED_CONTEXTS.EDITOR));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

router.get('/connect', (req, res) => {
  res.json(getCredSessionStatus(req.user?.jti, CRED_CONTEXTS.EDITOR));
});

router.delete('/connect', (req, res) => {
  clearCredSession(req.user?.jti, CRED_CONTEXTS.EDITOR);
  res.json({ connected: false });
});

export default router;
