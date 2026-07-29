// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> kathir Moorthy, Praveen kumar
// api.js - core API client with connection state management

let _connection = {
  node: "",
  nodeName: "",
  user: "",
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
    if (path === '/api/auth/change-password') {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "Invalid current password.");
    }
    
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
  if (res?.status === 400) {
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

// apiFetchText - authenticated GET for endpoints that return plain text.
export async function apiFetchText(path) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(path, { headers });
  } catch {
    throw new Error("Network error. Check your connection.");
  }

  if (res.status === 401) {
    localStorage.removeItem("chops_session");
    window.location.reload();
    throw new Error("Session expired.");
  }

  const body = await res.text().catch(() => "");

  if (!res.ok) {
    // Success is text, but an error from these routes is still JSON.
    let message = `Request failed (${res.status})`;
    try {
      message = JSON.parse(body).error || message;
    } catch { /* not JSON, keep the status message */ }
    throw new Error(message);
  }

  return body;
}

// The editor's row limit, applied to every SQL surface.
const MAX_ROWS_KEY = "chops_max_rows";
const MAX_ROWS_FALLBACK = 5000;

function rowLimitSettings(options) {
  // A caller that genuinely needs every row says so.
  if (options?.noRowLimit) return undefined;
  let n = Number(localStorage.getItem(MAX_ROWS_KEY));
  if (!Number.isFinite(n) || n < 1) n = MAX_ROWS_FALLBACK;
  return {
    // One more than the limit, so the caller can tell a full result from a
    // truncated one without asking a second time.
    max_result_rows: Math.floor(n) + 1,
    result_overflow_mode: "break",
  };
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
      port: overrides.port || conn.port,
      clusterId: overrides.clusterId || conn.clusterId,
      readOnly: !!overrides.readOnly,
      // Typed query parameters ({name:Type} placeholders). Omitted entirely
      // when absent, so the existing callers send a request body identical to
      // before this was added. The backend materializes optional /*[ ]*/
      // blocks and sends the survivors as param_<name> arguments; values are
      // never interpolated into the SQL.
      params: overrides.params || undefined,
      settings: { ...rowLimitSettings(overrides), ...(overrides.settings || {}) },
    }),
  });
}


// ClickHouse® query for the SQL Editor only.
export async function runEditorQuery(sql, creds, options = {}) {
  if (!sql || typeof sql !== "string") throw new Error("SQL is required.");
  const conn = getGlobalConnection();
  const base = {
    sql,
    node: conn.node, // from navbar
    port: conn.port, // from navbar
    clusterId: conn.clusterId, // from navbar
    readOnly: !!options.readOnly,
    // Omitted entirely when absent, so the eleven existing callers send a
    // request body byte-identical to before this change.
    params: options.params || undefined,
    // The caller's settings win, so the editor's own Max rows value overrides
    // the default read from storage.
    settings: { ...rowLimitSettings(options), ...(options.settings || {}) },
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
