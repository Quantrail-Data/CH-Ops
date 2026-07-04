// editor-session.test.js - Locks in the SQL Editor credential-session model:
// the editor stores its ClickHouse password server-side under (jti, 'editor'),
// never holds it client-side, resolves it server-side per query, prompts to
// reconnect on expiry (no fallback), and logout revokes server-side before the
// token is dropped. The Query Comparison tool keeps its own per-request model.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const read = (f) => fs.readFileSync(f, 'utf8');

describe('api.js: editor credential session', () => {
  const code = read('src/frontend/utils/api.js');

  it('runEditorQuery uses the server-side session for the editor (no password)', () => {
    expect(code).toContain('useSession: true');
    expect(code).toContain('context: "editor"');
  });

  it('runEditorQuery keeps a strict per-request path for the comparison tool', () => {
    expect(code).toContain('strictAuth: true');
    expect(code).toContain('creds.password !== undefined');
  });

  it('exposes editor connect / status / disconnect helpers', () => {
    expect(code).toContain('export async function editorConnect');
    expect(code).toContain('export async function editorConnectionStatus');
    expect(code).toContain('export async function editorDisconnect');
    expect(code).toContain('/api/editor/connect');
  });

  it('has a best-effort server-side logout', () => {
    expect(code).toContain('export async function logoutRequest');
    expect(code).toContain('/api/auth/logout');
  });

  it('a credential-session expiry does NOT log the app user out', () => {
    // apiFetch must special-case the code and rethrow, not remove the token.
    const idx = code.indexOf('CRED_SESSION_EXPIRED');
    expect(idx).toBeGreaterThan(-1);
    const branch = code.slice(idx - 200, idx + 200);
    expect(branch).toContain('err.code');
  });
});

describe('App.jsx: logout ordering', () => {
  const code = read('src/frontend/App.jsx');
  it('revokes server-side while the token is still present, then clears it', () => {
    const revoke = code.indexOf('await logoutRequest()');
    const remove = code.indexOf('localStorage.removeItem("chops_session")');
    expect(revoke).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(remove);
  });
});

describe('QueryEditor.jsx: session lifecycle', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');

  it('connect stores server-side and keeps only the username client-side', () => {
    expect(code).toContain('await editorConnect(candidate)');
    expect(code).toContain('setEditorCreds({ user: candidate.user })');
    // never stashes the password in component state
    expect(code).not.toContain('setEditorCreds(candidate)');
  });

  it('restores the connection after reload from server status', () => {
    expect(code).toContain('editorConnectionStatus()');
    expect(code).toContain('setEditorCreds({ user: s.chUser })');
  });

  it('disconnect clears the server-side session', () => {
    expect(code).toContain('await editorDisconnect()');
  });

  it('prompts to reconnect on an expired session (strict, no fallback)', () => {
    expect(code).toContain('handleSessionExpiry');
    expect(code).toContain('CRED_SESSION_EXPIRED');
  });
});
