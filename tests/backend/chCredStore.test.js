// chCredStore.test.js - Integration tests for the encrypted CH credential store
//
// Runs against an in-memory SQLite database injected via __setDb, so it never
// touches real data and does not depend on file execution order. Verifies the
// encrypt-at-rest round trip, that the status view never leaks the password,
// the (jti, context) composite key (context isolation + one row per key),
// replacement on reconnect, expiry handling, clearing one context, clearing an
// entire login by jti, and pruning expired rows.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, it, expect,afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../../src/backend/db/schema.js';
import { initCrypto } from '../../src/backend/services/crypto.js';
import * as store from '../../src/backend/services/chCredStore.js';

initCrypto('test-session-secret-minimum-32-characters-long!');

const EDITOR = store.CRED_CONTEXTS.EDITOR;
const STUDIO = store.CRED_CONTEXTS.SCHEMA_STUDIO;

const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE ch_cred_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_user TEXT NOT NULL,
    jti TEXT NOT NULL,
    context TEXT NOT NULL,
    cluster_id TEXT,
    node TEXT,
    port INTEGER,
    ch_user TEXT NOT NULL,
    encrypted_password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    UNIQUE (jti, context)
  )
`);
const db = drizzle(sqlite, { schema });
store.__setDb(db);

describe('chCredStore', () => {
  it('stores and resolves a credential session (password round-trips)', () => {
    store.setCredSession({
      jti: 'j-alice', context: EDITOR, appUser: 'alice',
      clusterId: 'c1', node: 'n1.example', port: 9000, chUser: 'analyst', password: 's3cret',
    });
    const s = store.getCredSession('j-alice', EDITOR);
    expect(s).not.toBeNull();
    expect(s.chUser).toBe('analyst');
    expect(s.node).toBe('n1.example');
    expect(s.port).toBe(9000);
    expect(s.clusterId).toBe('c1');
    expect(s.password).toBe('s3cret');
  });

  it('encrypts the password at rest (ciphertext is not the plaintext)', () => {
    store.setCredSession({ jti: 'j-bob', context: EDITOR, appUser: 'bob', node: 'n', chUser: 'u', password: 'plaintextpw' });
    const row = sqlite.query("SELECT encrypted_password FROM ch_cred_session WHERE jti = 'j-bob'").get();
    expect(row.encrypted_password).not.toBe('plaintextpw');
    expect(row.encrypted_password.split(':').length).toBe(3); // iv:tag:ciphertext
  });

  it('status view never includes the password', () => {
    store.setCredSession({ jti: 'j-carol', context: EDITOR, appUser: 'carol', node: 'n', chUser: 'u', password: 'pw' });
    const status = store.getCredSessionStatus('j-carol', EDITOR);
    expect(status.connected).toBe(true);
    expect(status.chUser).toBe('u');
    expect(status.password).toBeUndefined();
  });

  it('keeps editor and schema-studio credentials separate under one login (jti)', () => {
    store.setCredSession({ jti: 'j-multi', context: EDITOR, appUser: 'u', node: 'n', chUser: 'ed_user', password: 'ed_pw' });
    store.setCredSession({ jti: 'j-multi', context: STUDIO, appUser: 'u', node: 'n', chUser: 'ss_user', password: 'ss_pw' });
    expect(store.getCredSession('j-multi', EDITOR).chUser).toBe('ed_user');
    expect(store.getCredSession('j-multi', STUDIO).chUser).toBe('ss_user');
    const count = sqlite.query("SELECT count(*) AS c FROM ch_cred_session WHERE jti = 'j-multi'").get();
    expect(count.c).toBe(2);
  });

  it('replaces the session on reconnect (one row per (jti, context))', () => {
    store.setCredSession({ jti: 'j-dave', context: EDITOR, appUser: 'dave', node: 'n1', chUser: 'u1', password: 'p1' });
    store.setCredSession({ jti: 'j-dave', context: EDITOR, appUser: 'dave', node: 'n2', chUser: 'u2', password: 'p2' });
    const s = store.getCredSession('j-dave', EDITOR);
    expect(s.node).toBe('n2');
    expect(s.chUser).toBe('u2');
    expect(s.password).toBe('p2');
    const count = sqlite.query("SELECT count(*) AS c FROM ch_cred_session WHERE jti = 'j-dave' AND context = 'editor'").get();
    expect(count.c).toBe(1);
  });

  it('rejects an invalid context', () => {
    expect(() => store.setCredSession({ jti: 'j-x', context: 'bogus', chUser: 'u', password: 'p' })).toThrow();
    expect(store.getCredSession('j-x', 'bogus')).toBeNull();
  });

  it('treats an expired session as disconnected and clears it', () => {
    store.setCredSession({ jti: 'j-erin', context: EDITOR, appUser: 'erin', node: 'n', chUser: 'u', password: 'pw' });
    sqlite.exec("UPDATE ch_cred_session SET expires_at = '2000-01-01T00:00:00.000Z' WHERE jti = 'j-erin'");
    expect(store.getCredSession('j-erin', EDITOR)).toBeNull();
    expect(store.getCredSessionStatus('j-erin', EDITOR).connected).toBe(false);
    const row = sqlite.query("SELECT * FROM ch_cred_session WHERE jti = 'j-erin'").get();
    expect(row).toBeNull();
  });

  it('clears a single context on disconnect, leaving the other', () => {
    store.setCredSession({ jti: 'j-frank', context: EDITOR, appUser: 'frank', node: 'n', chUser: 'u', password: 'pw' });
    store.setCredSession({ jti: 'j-frank', context: STUDIO, appUser: 'frank', node: 'n', chUser: 'u', password: 'pw' });
    store.clearCredSession('j-frank', EDITOR);
    expect(store.getCredSession('j-frank', EDITOR)).toBeNull();
    expect(store.getCredSession('j-frank', STUDIO)).not.toBeNull();
  });

  it('clearCredSessionByJti removes every context for a login (logout/revoke)', () => {
    store.setCredSession({ jti: 'j-gina', context: EDITOR, appUser: 'gina', node: 'n', chUser: 'u', password: 'pw' });
    store.setCredSession({ jti: 'j-gina', context: STUDIO, appUser: 'gina', node: 'n', chUser: 'u', password: 'pw' });
    store.clearCredSessionByJti('j-gina');
    expect(store.getCredSession('j-gina', EDITOR)).toBeNull();
    expect(store.getCredSession('j-gina', STUDIO)).toBeNull();
  });

  it('pruneExpired deletes only expired rows (no orphans linger)', () => {
    store.setCredSession({ jti: 'j-live', context: EDITOR, appUser: 'x', node: 'n', chUser: 'u', password: 'pw' });
    store.setCredSession({ jti: 'j-dead', context: EDITOR, appUser: 'x', node: 'n', chUser: 'u', password: 'pw' });
    sqlite.exec("UPDATE ch_cred_session SET expires_at = '2000-01-01T00:00:00.000Z' WHERE jti = 'j-dead'");
    store.pruneExpired();
    expect(sqlite.query("SELECT * FROM ch_cred_session WHERE jti = 'j-dead'").get()).toBeNull();
    expect(store.getCredSession('j-live', EDITOR)).not.toBeNull();
  });

  it('returns disconnected for unknown / missing keys', () => {
    expect(store.getCredSession(undefined, EDITOR)).toBeNull();
    expect(store.getCredSessionStatus('nobody-here', EDITOR).connected).toBe(false);
  });
});
