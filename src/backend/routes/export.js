// export.js - The export wizard API.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import fs from "node:fs";
import { Router } from "express";

import { getClusterNodes } from "../services/clusterUtils.js";
import { getCredSession, CRED_CONTEXTS } from "../services/chCredStore.js";
import { executeQuery } from "../services/clickhouse.js";
import { measureBytes } from "../services/exportStream.js";
import {
  createJob, getJob, describeJob, cancelJob, touchJob,
  issueTicket, redeemTicket, exportConfig,
} from "../services/exportJobs.js";
import {
  normalizeForExport, isSelectLike, wrapForCount, wrapForSample,
} from "../../shared/sqlExport.js";
import { findFormat, OPTIONS } from "../../shared/exportFormats.js";

const router = Router();
const downloadRouter = Router();

const ALLOWED_SETTINGS = new Set(OPTIONS.map((o) => o.key));

// Find the node to talk to, and only ever one from the cluster configuration.
function resolveNode(req) {
  const nodes = getClusterNodes(req.body?.clusterId);
  if (nodes.length === 0) return { error: "No cluster nodes configured." };
  const wanted = req.body?.node;
  const node = wanted ? nodes.find((n) => n.host === wanted) : nodes[0];
  if (!node) return { error: "Node not found in cluster configuration." };
  return { node };
}

// The SQL Editor keeps its ClickHouse® login in an encrypted session.
function resolveCreds(req) {
  const session = getCredSession(req.user?.jti, CRED_CONTEXTS.EDITOR);
  if (!session) return null;
  return { user: session.chUser, password: session.password };
}

function onlyKnownSettings(input) {
  const clean = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (ALLOWED_SETTINGS.has(key)) clean[key] = value;
  }
  return clean;
}


router.post("/estimate", async (req, res) => {
  const { sql, format } = req.body || {};
  if (!sql) return res.status(400).json({ error: "Missing SQL." });

  const fmt = findFormat(format || "CSVWithNames");
  if (!fmt) return res.status(400).json({ error: "Unknown export format." });

  const picked = resolveNode(req);
  if (picked.error) return res.status(400).json({ error: picked.error });

  const creds = resolveCreds(req);
  if (!creds) {
    return res.status(401).json({
      error: "Your ClickHouse session expired. Please reconnect in the editor.",
      code: "CRED_SESSION_EXPIRED",
    });
  }

  const target = {
    host: picked.node.host,
    port: picked.node.port,
    secure: !!picked.node.secure,
    user: creds.user,
    password: creds.password,
  };

  const selectLike = isSelectLike(sql);
  const answer = { selectLike, rows: null, bytes: null, exact: false, warnBytes: exportConfig().warnBytes };

  if (!selectLike) return res.json(answer);

 
  try {
    const est = await executeQuery({
      ...target,
      sql: `EXPLAIN ESTIMATE ${normalizeForExport(sql)}`,
      readOnly: true,
    });
    answer.rows = (est.rows || []).reduce((sum, r) => sum + Number(r.rows || 0), 0);
  } catch {
    try {
      const counted = await executeQuery({
        ...target,
        sql: `${wrapForCount(sql)} SETTINGS max_execution_time = 20`,
        readOnly: true,
      });
      answer.rows = Number(counted.rows?.[0]?.c || 0);
      answer.exact = true;
    } catch {
      answer.rows = null;
    }
  }


  if (answer.rows) {
    try {
      const sample = await measureBytes({
        ...target,
        sql: wrapForSample(sql, 10000),
        format: fmt.id,
        settings: onlyKnownSettings(req.body?.settings),
      });
      if (sample.rows > 0) {
        answer.bytes = Math.round((sample.bytes / sample.rows) * answer.rows);
      }
    } catch {
      answer.bytes = null;
    }
  }

  res.json(answer);
});


router.post("/jobs", (req, res) => {
  const { sql, format, compression, filename, bom, settings, estimatedBytes } = req.body || {};
  if (!sql) return res.status(400).json({ error: "Missing SQL." });

  const picked = resolveNode(req);
  if (picked.error) return res.status(400).json({ error: picked.error });

  const creds = resolveCreds(req);
  if (!creds) {
    return res.status(401).json({
      error: "Your ClickHouse session expired. Please reconnect in the editor.",
      code: "CRED_SESSION_EXPIRED",
    });
  }

  try {
    const job = createJob({
      username: req.user?.username,
      sql,
      format,
      compression: compression || "none",
      settings: onlyKnownSettings(settings),
      filename,
      bom: !!bom,
      node: picked.node,
      estimatedBytes: Number(estimatedBytes) || 0,
      creds,
    });
    res.status(201).json({ jobId: job.id, fileName: job.fileName });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id, req.user?.username);
  if (!job) return res.status(404).json({ error: "Export not found." });
  touchJob(job);
  res.json(describeJob(job));
});


router.post("/jobs/:id/ticket", (req, res) => {
  const job = getJob(req.params.id, req.user?.username);
  if (!job) return res.status(404).json({ error: "Export not found." });
  if (job.state !== "ready") return res.status(409).json({ error: "Export is not ready yet." });
  touchJob(job);
  res.json({ ticket: issueTicket(job) });
});


router.delete("/jobs/:id", (req, res) => {
  const ok = cancelJob(req.params.id, req.user?.username);
  if (!ok) return res.status(404).json({ error: "Export not found." });
  res.json({ ok: true });
});


downloadRouter.get("/:ticket", (req, res) => {
  const job = redeemTicket(req.params.ticket);
  if (!job) return res.status(404).json({ error: "This download link has expired." });

  touchJob(job);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${job.fileName}"`);
  res.setHeader("Content-Length", String(job.bytesWritten));

  const stream = fs.createReadStream(job.filePath);
  stream.on("data", () => touchJob(job));
  stream.on("error", () => res.destroy());
  stream.pipe(res);
});

export { downloadRouter };
export default router;