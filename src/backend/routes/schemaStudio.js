// schemaStudio.js - Schema Studio backend routes
//
//   POST   /api/schema-studio/connect    - validate + store per-user CH creds
//   GET    /api/schema-studio/connect    - connection status (no password)
//   DELETE /api/schema-studio/connect    - clear the stored credentials
//   POST   /api/schema-studio/infer      - upload or object-storage ref -> columns + stats
//   POST   /api/schema-studio/generate   - columns + stats + form -> AI -> DDL(s)
//   POST   /api/schema-studio/validate   - EXPLAIN AST a DDL (parse check, no run)
//   POST   /api/schema-studio/create     - run a guarded CREATE TABLE (no data load)
//
// All routes run under the caller's own ClickHouse credentials, resolved
// server-side from the encrypted session store (chCredStore) by the app
// username. The browser never sends the ClickHouse password after connecting.
// The target node is always re-validated against the cluster config so a
// request can only reach a whitelisted host (SSRF protection). Inference and
// stats are read-only; the only write is the final, confirmed CREATE TABLE.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import express from 'express';
import { getClusterNodes } from '../services/clusterUtils.js';
import { executeQuery, executeQueryWithBody } from '../services/clickhouse.js';
import {
  getCredSession, setCredSession, getCredSessionStatus, clearCredSession, CRED_CONTEXTS,
} from '../services/chCredStore.js';
import {
  isCreateTableOnly,
  EVAL_SYSTEM_PROMPT, buildEvalMessage, parseEvalResponse,
} from '../services/ddlPrompt.js';
import {
  formatFromName, buildSourceExpr, buildStatsSql, shapeStats,
} from '../services/studioSource.js';
import { completeDdl, getAiStatus } from '../services/studioAi.js';

const router = express.Router();

// Largest upload accepted (binary formats send the whole file).
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB

// Request helpers

// Resolve the target node from the cluster config (SSRF protection: only hosts
// in the configured cluster are reachable).
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

// Resolve the active credential session, or throw a 401 if not connected.
function requireSession(req) {
  const sess = getCredSession(req.user?.jti, CRED_CONTEXTS.SCHEMA_STUDIO);
  if (!sess) {
    const e = new Error('Not connected. Connect with your ClickHouse credentials first.');
    e.status = 401;
    throw e;
  }
  return sess;
}

// Run a query under the session's credentials and target node, with an optional
// raw body (for binary-format inference).
function sessionQuery(sess, { query, body = null, jsonEachRow = true }) {
  const target = resolveTargetNode(sess.clusterId, sess.node);
  return executeQueryWithBody({
    host: target.host,
    port: sess.port || target.port || 8123,
    secure: !!target.secure,
    user: sess.chUser,
    password: sess.password,
    query,
    body,
    jsonEachRow,
  });
}

// Connection

router.post('/connect', async (req, res) => {
  try {
    const { clusterId, node, port, user, password } = req.body || {};
    if (!user) return res.status(400).json({ error: 'ClickHouse username is required.' });

    const target = resolveTargetNode(clusterId, node);
    // Validate by running a trivial query as that user against the node.
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
      context: CRED_CONTEXTS.SCHEMA_STUDIO,
      appUser: req.user.username,
      clusterId,
      node: target.host,
      port: port || target.port || 8123,
      chUser: user,
      password: password ?? '',
    });
    res.json(getCredSessionStatus(req.user.jti, CRED_CONTEXTS.SCHEMA_STUDIO));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

router.get('/connect', (req, res) => {
  res.json(getCredSessionStatus(req.user?.jti, CRED_CONTEXTS.SCHEMA_STUDIO));
});

router.delete('/connect', (req, res) => {
  clearCredSession(req.user?.jti, CRED_CONTEXTS.SCHEMA_STUDIO);
  res.json({ connected: false });
});

// Which AI provider will run a generation, for the Generate step to display.
// Reuses the stored active api_key; never returns the key itself.
router.get('/ai-status', (req, res) => {
  try {
    res.json(getAiStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Infer (and stats, in one pass)
// Octet-stream body  -> uploaded file (format in ?format=...).
// JSON body          -> object storage { objectStore: { provider, ... } }.
router.post(
  '/infer',
  express.raw({ type: 'application/octet-stream', limit: MAX_UPLOAD }),
  async (req, res) => {
    try {
      const sess = requireSession(req);

      let expr;
      let body = null;
      if (Buffer.isBuffer(req.body) && req.body.length) {
        // Uploaded file. Format comes from the query string.
        const { format, binary } = formatFromName(req.query.format || req.query.f || '');
        if (binary) {
          expr = buildSourceExpr({ kind: 'upload', format, binary: true });
          body = req.body;
        } else {
          // Text: embed the sample, trimmed to the last complete line.
          let sample = req.body.toString('utf8');
          const lastNl = sample.lastIndexOf('\n');
          if (lastNl > 0) sample = sample.slice(0, lastNl);
          expr = buildSourceExpr({ kind: 'upload', format, binary: false, sampleText: sample });
        }
      } else {
        // Object storage.
        const objectStore = req.body?.objectStore;
        if (!objectStore || !objectStore.path) {
          return res.status(400).json({ error: 'Provide a file upload or an object-storage path.' });
        }
        expr = buildSourceExpr({ kind: 'object', objectStore });
      }

      // 1) Columns and types (reads the footer for binary; cheap).
      const desc = await sessionQuery(sess, { query: `DESC (SELECT * FROM ${expr})`, body });
      const columns = desc.rows.map((r) => ({
        name: r.name,
        type: r.type,
        nullable: /Nullable/.test(r.type),
        overridden: false,
      }));
      if (!columns.length) {
        return res.status(400).json({ error: 'No columns inferred from the source.' });
      }

      // 2) Per-column statistics over a bounded sample (same in-memory body).
      let stats = {};
      let sampleRows = 0;
      try {
        const statsRes = await sessionQuery(sess, { query: buildStatsSql(expr, columns), body });
        const row = statsRes.rows[0] || {};
        const shaped = shapeStats(row, columns);
        stats = shaped.stats;
        sampleRows = shaped.sample_rows;
      } catch {
        // Statistics are advisory; if they fail (e.g. an exotic type), still
        // return the columns so the user can proceed.
        stats = {};
        sampleRows = 0;
      }

      res.json({ columns, stats, sample_rows: sampleRows });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  },
);

// Evaluate (AI review of the composed DDL)
router.post('/evaluate', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.ddl || !String(payload.ddl).trim()) {
      return res.status(400).json({ error: 'Nothing to evaluate.' });
    }
    const prompt = `${EVAL_SYSTEM_PROMPT}\n\n${buildEvalMessage(payload)}`;
    const raw = await completeDdl(prompt);
    res.json(parseEvalResponse(raw));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// Validate
router.post('/validate', async (req, res) => {
  try {
    const sess = requireSession(req);
    const { ddl } = req.body || {};
    if (!ddl || !ddl.trim()) return res.status(400).json({ ok: false, error: 'Empty DDL.' });
    // EXPLAIN AST parses the statement and fails on syntax errors, no execution.
    await sessionQuery(sess, { query: `EXPLAIN AST ${ddl}`, jsonEachRow: false });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Create
router.post('/create', async (req, res) => {
  try {
    const sess = requireSession(req);
    const statements = (req.body?.statements || []).filter(Boolean);
    if (!statements.length) return res.status(400).json({ error: 'Nothing to create.' });

    for (const s of statements) {
      if (!isCreateTableOnly(s)) {
        return res.status(400).json({ error: 'Only a single CREATE TABLE statement is allowed per entry.' });
      }
    }
    // Parse-check all first, then run all in order (local table first).
    for (const s of statements) {
      await sessionQuery(sess, { query: `EXPLAIN AST ${s}`, jsonEachRow: false });
    }
    const created = [];
    for (const s of statements) {
      await sessionQuery(sess, { query: s, jsonEachRow: false });
      created.push(s.slice(0, 60));
    }
    res.json({ ok: true, created });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

export default router;
