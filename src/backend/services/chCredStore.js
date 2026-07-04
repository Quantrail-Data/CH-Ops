// chCredStore.js - Server-side encrypted ClickHouse credential session
//
// Both Schema Studio and the SQL Editor run under the user's own ClickHouse
// credentials, but the browser never holds the password after connecting. On
// connect the password is encrypted with crypto.js (AES-256-GCM) and stored in
// the ch_cred_session table.
//
// Keying: a row is identified by (jti, context), where jti is the login's JWT id
// and context is the feature ('editor' or 'schema-studio'). Binding to the jti
// ties a credential's lifetime to the login session: a new login (new jti) never
// reuses an old credential, and revoking the token clears it. The context lets
// the two features hold distinct credentials under one login.
//
// Sessions carry a 2-hour expiry (matching the JWT lifetime) and are cleared on
// disconnect, on logout/revocation, and when expired. pruneExpired() removes any
// orphaned or expired rows so nothing lingers past its window.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { eq, and, lt } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { chCredSession } from '../db/schema.js';
import { encrypt, decrypt } from './crypto.js';

// The application always uses the default database. Tests may inject an
// isolated in-memory database through __setDb so they never touch real data;
// production code never calls it.
let activeDb = defaultDb;
export function __setDb(d) {
  activeDb = d || defaultDb;
}

// Valid credential contexts. A row must belong to exactly one feature.
export const CRED_CONTEXTS = Object.freeze({ EDITOR: 'editor', SCHEMA_STUDIO: 'schema-studio' });
const VALID_CONTEXTS = new Set(Object.values(CRED_CONTEXTS));

// Credential session lifetime. Matches the 2-hour JWT expiry so an encrypted
// password never outlives the login it belongs to.
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function nowIso() {
  return new Date().toISOString();
}

function assertKey(jti, context) {
  if (!jti) throw new Error('Missing session id.');
  if (!VALID_CONTEXTS.has(context)) throw new Error(`Invalid credential context: ${context}`);
}

// Delete every expired row. Called opportunistically on reads/writes and by a
// periodic sweep, so orphaned sessions (e.g. from a login that was never
// explicitly logged out) cannot sit at rest past their TTL.
export function pruneExpired() {
  try {
    activeDb.delete(chCredSession).where(lt(chCredSession.expiresAt, nowIso())).run();
  } catch { /* best effort */ }
}

// Store (or replace) the credential session for (jti, context). The password is
// encrypted before it touches the database.
export function setCredSession({ jti, context, appUser, clusterId, node, port, chUser, password }) {
  assertKey(jti, context);
  if (!chUser) throw new Error('Missing ClickHouse user.');

  pruneExpired();

  const encryptedPassword = encrypt(password ?? '');
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const where = and(eq(chCredSession.jti, jti), eq(chCredSession.context, context));

  const existing = activeDb.select().from(chCredSession).where(where).get();

  if (existing) {
    activeDb.update(chCredSession)
      .set({
        appUser: appUser ?? existing.appUser,
        clusterId: clusterId ?? null,
        node: node ?? null,
        port: port ?? null,
        chUser,
        encryptedPassword,
        updatedAt: nowIso(),
        expiresAt,
      })
      .where(where)
      .run();
  } else {
    activeDb.insert(chCredSession)
      .values({
        appUser: appUser ?? '',
        jti,
        context,
        clusterId: clusterId ?? null,
        node: node ?? null,
        port: port ?? null,
        chUser,
        encryptedPassword,
        expiresAt,
      })
      .run();
  }
}

// Resolve the full credential session (including the decrypted password) for
// (jti, context), or null if none exists or it has expired. Expired rows are
// cleared.
export function getCredSession(jti, context) {
  if (!jti || !VALID_CONTEXTS.has(context)) return null;
  const where = and(eq(chCredSession.jti, jti), eq(chCredSession.context, context));
  const row = activeDb.select().from(chCredSession).where(where).get();
  if (!row) return null;

  if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) {
    clearCredSession(jti, context);
    return null;
  }

  return {
    clusterId: row.clusterId,
    node: row.node,
    port: row.port,
    chUser: row.chUser,
    password: decrypt(row.encryptedPassword),
  };
}

// Non-secret status for the client (never includes the password), used to
// restore the connected state after a page reload.
export function getCredSessionStatus(jti, context) {
  const s = getCredSession(jti, context);
  if (!s) return { connected: false };
  return {
    connected: true,
    chUser: s.chUser,
    node: s.node,
    port: s.port,
    clusterId: s.clusterId,
  };
}

// Remove one credential session (feature disconnect).
export function clearCredSession(jti, context) {
  if (!jti || !VALID_CONTEXTS.has(context)) return;
  activeDb.delete(chCredSession)
    .where(and(eq(chCredSession.jti, jti), eq(chCredSession.context, context)))
    .run();
}

// Remove every credential session for a login (logout / token revocation),
// across all contexts. This is what ties credential lifetime to the session.
export function clearCredSessionByJti(jti) {
  if (!jti) return;
  activeDb.delete(chCredSession).where(eq(chCredSession.jti, jti)).run();
}
