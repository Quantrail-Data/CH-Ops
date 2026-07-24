// exportStream.js - Streaming reader for exports.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import { normalizeForExport } from "../../shared/sqlExport.js";


const SAFE_SETTING_NAME = /^[a-z0-9_]+$/i;

function buildUrl({ host, port, secure, settings, queryId }) {
  const proto = secure ? "https" : "http";
  const url = new URL(`${proto}://${host}:${port || 8123}/`);
  url.searchParams.set("readonly", "2");
  if (queryId) url.searchParams.set("query_id", queryId);
  for (const [key, value] of Object.entries(settings || {})) {
    if (!SAFE_SETTING_NAME.test(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function authHeaders(user, password) {
  return {
    "X-ClickHouse-User": user || "default",
    "X-ClickHouse-Key": password || "",
    "X-ClickHouse-Summary": "1",
  };
}

export async function startExportStream({
  host, port, secure, user, password,
  sql, format, settings, queryId, signal,
}) {
  const url = buildUrl({ host, port, secure, settings, queryId });
  const body = `${normalizeForExport(sql)}\nFORMAT ${format}`;

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(user, password),
    body,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `ClickHouse HTTP ${res.status}`);
  }
  return res;
}


export async function measureBytes({
  host, port, secure, user, password, sql, format, settings,
}) {
  const url = buildUrl({ host, port, secure, settings });
  url.searchParams.set("max_execution_time", "30");

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(user, password),
    body: `${sql}\nFORMAT ${format}`,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `ClickHouse HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  
  let rows = 0;
  try {
    const summary = res.headers.get("X-ClickHouse-Summary");
    if (summary) rows = Number(JSON.parse(summary).result_rows || 0);
  } catch {
    rows = 0;
  }

  return { bytes: buffer.length, rows };
}


export async function killExportQuery({ host, port, secure, user, password, queryId }) {
  if (!queryId) return;
  const proto = secure ? "https" : "http";
  const safeId = String(queryId).replace(/'/g, "''");
  try {
    await fetch(`${proto}://${host}:${port || 8123}/`, {
      method: "POST",
      headers: authHeaders(user, password),
      body: `KILL QUERY WHERE query_id = '${safeId}' ASYNC`,
    });
  } catch {
    
  }
}
