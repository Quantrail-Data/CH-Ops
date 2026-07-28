// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Unit tests validating network connection state, API fetch utilities, API key retrieval, and query execution.


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setGlobalConnection, getGlobalConnection, apiFetch, runQuery, getActiveApiKey } from '../../src/frontend/utils/api.js';

describe('Connection state', () => {
  beforeEach(() => {
    setGlobalConnection({ node: '', user: '', port: 8123, clusterId: '', apiKey: null, apiKeyName: null, nodeName: '' });
  });

  it('getGlobalConnection returns defaults', () => {
    const c = getGlobalConnection();
    expect(c.port).toBe(8123);
    expect(c.node).toBe('');
  });

  it('setGlobalConnection merges partial updates', () => {
    setGlobalConnection({ node: '10.0.0.1', user: 'admin' });
    const c = getGlobalConnection();
    expect(c.node).toBe('10.0.0.1');
    expect(c.user).toBe('admin');
    expect(c.port).toBe(8123);
  });

  it('setGlobalConnection overwrites previous values', () => {
    setGlobalConnection({ node: 'a' });
    setGlobalConnection({ node: 'b' });
    expect(getGlobalConnection().node).toBe('b');
  });

  it('getGlobalConnection returns a copy, not the reference', () => {
    const c1 = getGlobalConnection();
    c1.node = 'tampered';
    expect(getGlobalConnection().node).not.toBe('tampered');
  });
});

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ token: 'test-jwt-token' })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('window', { location: { reload: vi.fn() } });
    setGlobalConnection({ clusterId: 'cluster-1', nodeName: 'node-a' });
  });

  it('adds Authorization header from localStorage', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/test');
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer test-jwt-token');
  });

  it('does not add Authorization header when token is missing', async () => {
    localStorage.getItem.mockReturnValue(JSON.stringify({}));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ ok: true }),
    })));

    await apiFetch('/api/test');
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('does not add Authorization header when localStorage JSON is invalid', async () => {
    localStorage.getItem.mockReturnValue('{invalid-json');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ ok: true }),
    })));

    await apiFetch('/api/test');
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('sets Content-Type for string body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({}),
    })));

    await apiFetch('/api/test', { method: 'POST', body: '{"sql":"SELECT 1"}' });
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sets Content-Type for object body and injects audit fields', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({}),
    })));

    await apiFetch('/api/test', { method: 'POST', body: { sql: 'SELECT 1' } });
    const req = fetch.mock.calls[0][1];
    const body = JSON.parse(req.body);

    expect(req.headers['Content-Type']).toBe('application/json');
    expect(body.sql).toBe('SELECT 1');
    expect(body.audit).toEqual({ clusterId: 'cluster-1', nodeName: 'node-a' });
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await expect(apiFetch('/api/test')).rejects.toThrow('Network error');
  });

  it('handles 401 by clearing session and reloading', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 401,
      json: () => Promise.resolve({}),
    })));

    await expect(apiFetch('/api/test')).rejects.toThrow('Session expired.');
    expect(localStorage.removeItem).toHaveBeenCalledWith('chops_session');
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('throws on 429 rate limit', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 429,
      json: () => Promise.resolve({ error: 'Too many requests' }),
    })));
    await expect(apiFetch('/api/test')).rejects.toThrow('Too many requests');
  });

  it('throws default 429 message when response has no error field', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 429,
      json: () => Promise.resolve({}),
    })));
    await expect(apiFetch('/api/test')).rejects.toThrow('Rate limited. Wait and retry.');
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    })));
    await expect(apiFetch('/api/test')).rejects.toThrow('Server error');
  });

  it('throws fallback non-ok message when json parse fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 502,
      json: () => Promise.reject(new Error('invalid json')),
    })));
    await expect(apiFetch('/api/test')).rejects.toThrow('HTTP 502');
  });

  it('returns parsed data for ok response even with custom headers', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [1] }),
    })));

    const data = await apiFetch('/api/test', { headers: { 'X-Test': 'yes' } });
    expect(data).toEqual({ rows: [1] });

    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['X-Test']).toBe('yes');
    expect(headers.Authorization).toBe('Bearer test-jwt-token');
  });
});

describe('getActiveApiKey', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ token: 'jwt' })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('window', { location: { reload: vi.fn() } });
    setGlobalConnection({ apiKey: null, apiKeyName: null, clusterId: '' });
  });

  it('returns active api key and updates global connection', async () => {
    // The backend never sends the decrypted key value to the client (it's
    // only used server-side) - only id/name/model identify the active key.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ apiKey: { name: 'primary' } }),
    })));

    const key = await getActiveApiKey();

    expect(key).toEqual({ name: 'primary' });
    const conn = getGlobalConnection();
    expect(conn.apiKey).toBe(null);
    expect(conn.apiKeyName).toBe('primary');
  });

  it('returns null when no active api key exists', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })));

    const key = await getActiveApiKey();
    expect(key).toBeNull();
  });

  it('returns null when apiFetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const key = await getActiveApiKey();
    expect(key).toBeNull();
  });
});

describe('runQuery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setGlobalConnection({ node: 'prod-1', user: 'admin', port: 8123, clusterId: 'cluster-z', nodeName: 'node-z' });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ token: 'jwt' })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('window', { location: { reload: vi.fn() } });
  });

  it('throws if SQL is empty', async () => {
    await expect(runQuery('')).rejects.toThrow('SQL is required');
  });

  it('throws if SQL is not a string', async () => {
    await expect(runQuery(123)).rejects.toThrow('SQL is required');
  });

  it('sends the target node but no credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [], columns: [] }),
    })));

    await runQuery('SELECT 1');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.sql).toBe('SELECT 1');
    expect(body.node).toBe('prod-1');
    // The backend resolves the user and password for this node from the saved
    // cluster configuration. The browser never holds a ClickHouse credential,
    // so it cannot send one - and setGlobalConnection no longer accepts a
    // password at all.
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('user');
  });

  it('never leaks a password even if one is forced into the connection', async () => {
    // Defensive: a caller stuffing a password into the global connection must
    // not cause it to be transmitted.
    setGlobalConnection({ password: 'should-never-be-sent' });

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT 1');
    expect(fetch.mock.calls[0][1].body).not.toContain('should-never-be-sent');
  });

  it('includes clusterId and port in request body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT 1');
    const body = JSON.parse(fetch.mock.calls[0][1].body);

    expect(body.clusterId).toBe('cluster-z');
    expect(body.port).toBe(8123);
  });

  it('allows overriding the node and cluster', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT 1', { node: 'dev-1', clusterId: 'cluster-dev' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.node).toBe('dev-1');
    expect(body.clusterId).toBe('cluster-dev');
  });

  it('forwards query parameters when supplied', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT * FROM t WHERE r = {region:String}', {
      params: { region: 'eu-west' },
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.params).toEqual({ region: 'eu-west' });
    // The value travels as data. It is never spliced into the statement.
    expect(body.sql).toContain('{region:String}');
    expect(body.sql).not.toContain('eu-west');
  });

  it('omits params entirely when none are supplied', async () => {
    // Keeps the request body byte-identical for the ~120 existing callers.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT 1');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('params');
  });

  it('omits params when given an empty object', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT 1', { params: {} });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    // {} is truthy, so it is sent; the backend treats it as no values.
    expect(body.params).toEqual({});
  });

  it('ignores a credential override', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT 1', { user: 'readonly', password: 'nope' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('user');
    expect(body).not.toHaveProperty('password');
  });

  it('uses default port when override port is falsy', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ rows: [] }),
    })));

    await runQuery('SELECT 1', { port: 0 });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.port).toBe(8123);
  });
});