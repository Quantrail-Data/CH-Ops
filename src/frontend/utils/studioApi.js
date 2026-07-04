// studioApi.js - Schema Studio frontend API client
//
// Wraps the /api/schema-studio endpoints. JSON calls go through the shared
// apiFetch (JWT injection, audit, error handling). The file-upload inference
// call cannot use apiFetch, because that wrapper always re-serializes the body
// as JSON; a binary upload is sent with a raw fetch that carries the same JWT.
// After connecting, the browser never sends the ClickHouse password again; the
// server resolves it from the encrypted session store.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { apiFetch } from './api.js';

const BASE = '/api/schema-studio';

// Read the JWT the same way the shared wrapper does, for the raw upload path.
function authToken() {
  try {
    return JSON.parse(localStorage.getItem('chops_session') || '{}').token;
  } catch {
    return null;
  }
}

// Mirror apiFetch's response handling for the raw upload path.
async function handleRaw(res) {
  if (res.status === 401) {
    localStorage.removeItem('chops_session');
    window.location.reload();
    throw new Error('Session expired.');
  }
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Connection

export function connect({ clusterId, node, port, user, password }) {
  return apiFetch(`${BASE}/connect`, {
    method: 'POST',
    body: { clusterId, node, port, user, password },
  });
}

export function connectionStatus() {
  return apiFetch(`${BASE}/connect`, { method: 'GET' });
}

export function disconnect() {
  return apiFetch(`${BASE}/connect`, { method: 'DELETE' });
}

// Which AI provider will run a generation (provider/model/executable, no key).
export function aiStatus() {
  return apiFetch(`${BASE}/ai-status`, { method: 'GET' });
}

// Inference

// Infer columns and statistics from an uploaded file. `format` is the file name
// (the server derives the format and whether it is binary) or a bare format
// token. `payload` is the File/Blob/ArrayBuffer to send: the whole file for
// binary formats, a leading text slice for text formats.
export async function inferFromFile(payload, format) {
  const token = authToken();
  const res = await fetch(`${BASE}/infer?format=${encodeURIComponent(format)}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/octet-stream',
    },
    body: payload,
  });
  return handleRaw(res);
}

// Infer columns and statistics from an object-storage reference.
export function inferFromObject(objectStore) {
  return apiFetch(`${BASE}/infer`, { method: 'POST', body: { objectStore } });
}

// Evaluate / validate / create

// Ask the AI to review the composed DDL given the columns, stats, and intent.
export function evaluate(payload) {
  return apiFetch(`${BASE}/evaluate`, { method: 'POST', body: payload });
}

export function validateDdl(ddl) {
  return apiFetch(`${BASE}/validate`, { method: 'POST', body: { ddl } });
}

export function createTables(statements) {
  return apiFetch(`${BASE}/create`, { method: 'POST', body: { statements } });
}
