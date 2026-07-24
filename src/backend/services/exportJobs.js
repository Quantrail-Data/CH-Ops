// exportJobs.js - Tracks running exports and cleans up after them.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { loadEnv } from "../utils/env.js";
import { log } from "./logger.js";
import { startExportStream, killExportQuery } from "./exportStream.js";
import { writeExportFile } from "./exportCompress.js";
import { findFormat, findCompression } from "../../shared/exportFormats.js";

const cfg = loadEnv().exportCfg;
const jobs = new Map();



export function initExportStorage() {
  fs.mkdirSync(cfg.dir, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(cfg.dir)) {
    fs.rmSync(path.join(cfg.dir, entry), { recursive: true, force: true });
  }
  log.info("Export storage ready", { dir: cfg.dir });
}

function totalBytesOnDisk() {
  let total = 0;
  for (const job of jobs.values()) total += job.bytesWritten || 0;
  return total;
}

function removeFiles(job) {
  try {
    fs.rmSync(job.dir, { recursive: true, force: true });
  } catch {
  
  }
}

function finish(job, state, error) {
  job.state = state;
  job.error = error || null;
  job.creds = null; 
  job.lastActivityAt = Date.now();
  if (state !== "ready") removeFiles(job);
}


export function safeFileName(input, fallback) {
  const base = String(input || "")
    .replace(/[\\/]/g, "-")
    .replace(/\.\./g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 100)
    .trim();
  return base || fallback || "export";
}



export function createJob({
  username, sql, format, compression, settings, filename, bom,
  node, estimatedBytes, creds,
}) {
  const fmt = findFormat(format);
  if (!fmt) throw badRequest("Unknown export format.");
  const comp = findCompression(compression);
  if (!comp) throw badRequest("Unknown compression option.");

  let running = 0;
  let mine = 0;
  for (const job of jobs.values()) {
    if (job.state === "running") {
      running += 1;
      if (job.userId === username) mine += 1;
    }
  }
  if (mine >= cfg.maxPerUser) {
    throw badRequest(`You already have ${cfg.maxPerUser} exports running. Wait for one to finish.`);
  }
  if (running >= cfg.maxConcurrent) {
    throw badRequest("The server is busy with other exports. Please try again shortly.");
  }

  const remaining = cfg.maxTotalBytes - totalBytesOnDisk();
  if (estimatedBytes && estimatedBytes > remaining) {
    throw badRequest("Not enough export space left on the server for a file this size.");
  }

  const id = crypto.randomUUID();
  const dir = path.join(cfg.dir, id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const leaf = safeFileName(filename, "export");
  const fullName = `${leaf}.${fmt.ext}${comp.ext}`;

  const job = {
    id,
    userId: username,
    state: "running",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    sql,
    format,
    compression,
    settings: settings || {},
    bom: !!bom,
    node,
    creds,
    dir,
    fileName: fullName,
    filePath: path.join(dir, fullName),
    innerName: `${leaf}.${fmt.ext}`,
    queryId: crypto.randomUUID(),
    bytesRead: 0,
    bytesWritten: 0,
    estimatedBytes: estimatedBytes || 0,
    error: null,
    abort: new AbortController(),
  };

  jobs.set(id, job);
  runJob(job); 
  return job;
}

async function runJob(job) {
  try {
    const res = await startExportStream({
      host: job.node.host,
      port: job.node.port,
      secure: job.node.secure,
      user: job.creds.user,
      password: job.creds.password,
      sql: job.sql,
      format: job.format,
      settings: job.settings,
      queryId: job.queryId,
      signal: job.abort.signal,
    });

    const written = await writeExportFile({
      webStream: res.body,
      destPath: job.filePath,
      compression: job.compression,
      innerName: job.innerName,
      bom: job.bom,
      limitBytes: cfg.maxJobBytes,
      onBytes: (total) => {
        job.bytesRead = total;
        const spaceUsed = totalBytesOnDisk() + total;
        if (spaceUsed > cfg.maxTotalBytes) {
          job.abort.abort();
        }
      },
    });

    job.bytesWritten = written;
    job.readyAt = Date.now();
    finish(job, "ready", null);
    log.info("Export ready", { id: job.id, user: job.userId, bytes: written });
  } catch (err) {
    const creds = job.creds;
    if (creds) {
      killExportQuery({
        host: job.node.host,
        port: job.node.port,
        secure: job.node.secure,
        user: creds.user,
        password: creds.password,
        queryId: job.queryId,
      });
    }

    if (job.state === "cancelled") {
      removeFiles(job);
      return;
    }
    const message =
      err.code === "EXPORT_TOO_LARGE"
        ? "The export grew past the size limit and was stopped."
        : err.name === "AbortError"
          ? "The export was stopped."
          : err.message || "Export failed.";
    finish(job, "failed", message);
    log.error("Export failed", { id: job.id, error: message });
  }
}



export function getJob(id, username) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.userId !== username) return null; 
  return job;
}

export function touchJob(job) {
  job.lastActivityAt = Date.now();
}

export function describeJob(job) {
  const percent = job.estimatedBytes
    ? Math.min(99, Math.floor((job.bytesRead / job.estimatedBytes) * 100))
    : null;
  return {
    id: job.id,
    state: job.state,
    fileName: job.fileName,
    bytesRead: job.bytesRead,
    bytesWritten: job.bytesWritten,
    percent: job.state === "ready" ? 100 : percent,
    error: job.error,
  };
}

export function cancelJob(id, username) {
  const job = getJob(id, username);
  if (!job) return false;
  if (job.state === "running") {
    job.state = "cancelled";
    job.abort.abort();
    if (job.creds) {
      killExportQuery({
        host: job.node.host,
        port: job.node.port,
        secure: job.node.secure,
        user: job.creds.user,
        password: job.creds.password,
        queryId: job.queryId,
      });
    }
  }
  job.creds = null;
  removeFiles(job);
  jobs.delete(id);
  return true;
}

export function cancelJobsForUser(username) {
  for (const job of [...jobs.values()]) {
    if (job.userId === username) cancelJob(job.id, username);
  }
}



const tickets = new Map();

export function issueTicket(job) {
  const ticket = crypto.randomBytes(24).toString("hex");
  tickets.set(ticket, { jobId: job.id, expiresAt: Date.now() + 60 * 1000 });
  return ticket;
}

export function redeemTicket(ticket) {
  const found = tickets.get(ticket);
  if (!found) return null;
  if (found.expiresAt < Date.now()) {
    tickets.delete(ticket);
    return null;
  }
  const job = jobs.get(found.jobId);
  if (!job || job.state !== "ready") return null;
  return job;
}


export function startExportSweeper() {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const job of [...jobs.values()]) {
      if (job.state === "running") continue;
      if (now - job.lastActivityAt > cfg.idleTtlMs) {
        removeFiles(job);
        jobs.delete(job.id);
      }
    }
    for (const [ticket, info] of tickets) {
      if (info.expiresAt < now) tickets.delete(ticket);
    }
  }, 60 * 1000);
  timer.unref?.();
}

export function exportConfig() {
  return cfg;
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}
