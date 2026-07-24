// exportApi.js - Browser side calls for the export wizard.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import { apiFetch, getGlobalConnection } from "./api.js";

function connectionFields() {
  const conn = getGlobalConnection();
  return { clusterId: conn.clusterId, node: conn.node };
}

export async function estimateExport({ sql, format, settings }) {
  return apiFetch("/api/export/estimate", {
    method: "POST",
    body: JSON.stringify({ sql, format, settings, ...connectionFields() }),
  });
}

export async function startExport({ sql, format, compression, filename, bom, settings, estimatedBytes }) {
  return apiFetch("/api/export/jobs", {
    method: "POST",
    body: JSON.stringify({
      sql, format, compression, filename, bom, settings, estimatedBytes,
      ...connectionFields(),
    }),
  });
}

export async function exportProgress(jobId) {
  return apiFetch(`/api/export/jobs/${encodeURIComponent(jobId)}`);
}

export async function cancelExport(jobId) {
  return apiFetch(`/api/export/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
}

// Ask for a one-time link, then let the browser download it normally.
export async function downloadExport(jobId) {
  const res = await apiFetch(`/api/export/jobs/${encodeURIComponent(jobId)}/ticket`, {
    method: "POST",
  });
  window.location.href = `/api/export/download/${res.ticket}`;
}

export function formatBytes(n) {
  const value = Number(n) || 0;
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let out = value;
  while (out >= 1024 && index < units.length - 1) {
    out /= 1024;
    index += 1;
  }
  return `${out.toFixed(out < 10 ? 1 : 0)} ${units[index]}`;
}

export function formatRows(n) {
  const value = Number(n) || 0;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}