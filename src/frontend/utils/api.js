// api.js - Core API client with connection state management
//
// Maintains a module-level singleton for ClickHouse connection credentials
// (node, user, password, port, clusterId) that is shared across all API calls.
// Provides runQuery() for executing SQL against ClickHouse and apiFetch() for
// generic backend endpoints with automatic JWT token injection and audit
// context.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
let _connection = {
  node: "",
  user: "",
  password: "",
  port: 8123,
  clusterId: "",
  apiKey: null,
  apiKeyName: null,
};

export function setGlobalConnection(conn) {
  _connection = { ..._connection, ...conn };
}

export function getGlobalConnection() {
  return { ..._connection };
}

export async function getActiveApiKey() {
  try {
    const response = await apiFetch('/api/qurioz/api-keys/active');
    if (response && response.apiKey) {
      // The backend no longer sends the decrypted key value to the client
      // (it's only needed server-side); this just tracks which key is active.
      setGlobalConnection({
        apiKeyName: response.apiKey.name
      });
      return response.apiKey;
    }
    return null;
  } catch (err) {
    console.log('No active API key found');
    return null;
  }
}

// Auth

function getToken() {
  try {
    return JSON.parse(localStorage.getItem("chops_session") || "{}").token;
  } catch {
    return null;
  }
}

// Fetch wrapper

export async function apiFetch(path, options = {}, type = false) {
  const token = getToken();

  const conn = getGlobalConnection();

  const headers = { ...options.headers };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body = options.body;

  if (body) {
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

    body = JSON.stringify({
      ...parsedBody,
      audit: {
        clusterId: conn.clusterId,
        nodeName: conn.nodeName,
      },
    });

    headers["Content-Type"] = "application/json";
  }

  let res;

  try {
    res = await fetch(path, {
      ...options,
      headers,
      body,
    });
  } catch {
    throw new Error("Network error. Check your connection.");
  }

  if (res.status === 401) {
    // A ClickHouse credential-session expiry (editor/schema-studio) is NOT an app
    // auth failure: surface it so the feature can prompt to reconnect, without
    // logging the user out of the app.
    const d = await res.json().catch(() => ({}));
    if (d.code === "CRED_SESSION_EXPIRED") {
      const err = new Error(d.error || "Your session expired. Please reconnect.");
      err.code = "CRED_SESSION_EXPIRED";
      throw err;
    }
    localStorage.removeItem("chops_session");
    window.location.reload();
    throw new Error("Session expired.");
  }

  if (res.status === 429) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Rate limited. Wait and retry.");
  }
  let data = null;
  type
    ? (data = await res.blob().catch(() => ({ error: `HTTP ${res.status}` })))
    : (data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

// ClickHouse® query - always sends current connection credentials

export async function runQuery(sql, overrides = {}) {
  if (!sql || typeof sql !== "string") throw new Error("SQL is required.");
  const conn = getGlobalConnection();
  return apiFetch("/api/query", {
    method: "POST",
    body: JSON.stringify({
      sql,
      node: overrides.node || conn.node,
      user: overrides.user || conn.user,
      password: overrides.password ?? conn.password,
      port: overrides.port || conn.port,
      clusterId: overrides.clusterId || conn.clusterId,
      readOnly: !!overrides.readOnly,
    }),
  });
}


// ClickHouse® query for the SQL Editor only.
// Sends the user-entered credentials exactly as given (no fallback to the
// configured connection) and marks the request strict so the backend will
// refuse rather than fall back. Host/port/cluster still come from the navbar.
// SQL Editor / Query Comparison query.
//
// Two modes, chosen by whether the caller supplies a password:
//  - Session mode (SQL Editor): creds carry no password (e.g. { user }). The
//    password was sent once to editorConnect() and is resolved server-side from
//    the (jti, 'editor') credential session. Nothing sensitive is sent here.
//  - Strict mode (Query Comparison): creds carry an explicit password, sent
//    per-request under strictAuth. That feature keeps its own per-request model.
export async function runEditorQuery(sql, creds, options = {}) {
  if (!sql || typeof sql !== "string") throw new Error("SQL is required.");
  const conn = getGlobalConnection();
  const base = {
    sql,
    node: conn.node, // from navbar
    port: conn.port, // from navbar
    clusterId: conn.clusterId, // from navbar
    readOnly: !!options.readOnly,
  };

  if (creds && creds.password !== undefined) {
    return apiFetch("/api/query", {
      method: "POST",
      body: JSON.stringify({
        ...base,
        user: creds.user, // entered by the user, no fallback
        password: creds.password ?? "",
        strictAuth: true,
      }),
    });
  }

  return apiFetch("/api/query", {
    method: "POST",
    body: JSON.stringify({ ...base, useSession: true, context: "editor" }),
  });
}

// Editor credential session: connect (validate + store server-side), status
// (restore connected state after reload), and disconnect (clear).
export async function editorConnect({ user, password }) {
  if (!user) throw new Error("Username is required.");
  const conn = getGlobalConnection();
  return apiFetch("/api/editor/connect", {
    method: "POST",
    body: JSON.stringify({
      user,
      password: password ?? "",
      node: conn.node,
      port: conn.port,
      clusterId: conn.clusterId,
    }),
  });
}

export async function editorConnectionStatus() {
  return apiFetch("/api/editor/connect", { method: "GET" });
}

export async function editorDisconnect() {
  return apiFetch("/api/editor/connect", { method: "DELETE" });
}

// Server-side logout: revokes the current token (which clears this login's
// credential sessions). Best-effort; the client logs out regardless.
export async function logoutRequest() {
  try {
    return await apiFetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {
    return { ok: false };
  }
}
