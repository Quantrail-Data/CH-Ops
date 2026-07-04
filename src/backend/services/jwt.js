// jwt.js - JWT token creation, verification, and revocation
//
// Signs session tokens with a 2-hour expiry using HS256. Each token
// gets a unique jti (JWT ID) for individual revocation. The blocklist
// is in-memory and auto-clears expired entries. Tokens are stateless
// so revoking all tokens for a user isn't supported - the 2-hour
// expiry is the primary defense against stolen tokens.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

let secret = null;

export const setSecret = (s) => { secret = s; };

export const create = (payload) => {
  if (!secret) throw new Error('JWT secret not set. Call setSecret() first.');
  const jti = randomBytes(16).toString('hex');
  return jwt.sign({ ...payload, jti }, secret, { expiresIn: '2h' });
};

export const verify = (token) => {
  if (!secret) throw new Error('JWT secret not set. Call setSecret() first.');
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (blocklist.has(payload.jti)) throw new Error('Token revoked');
  return payload;
};

// In-memory set of revoked token IDs. Auto-cleaned every time a new
// token is revoked (removes entries older than 2h since they would
// have expired naturally).
const blocklist = new Map();

// Side-effects to run when a token is revoked (e.g. clearing that login's
// encrypted ClickHouse credential sessions). Registered at server startup so
// jwt.js stays decoupled from the database and remains unit-testable in
// isolation, while revocation and credential lifetime stay tied together.
const revokeHooks = [];
export function onRevoke(fn) {
  if (typeof fn === 'function') revokeHooks.push(fn);
}

export function revokeToken(jti) {
  if (!jti) return;
  blocklist.set(jti, Date.now());
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [k, v] of blocklist) {
    if (v < cutoff) blocklist.delete(k);
  }
  for (const fn of revokeHooks) {
    try { fn(jti); } catch { /* a hook failure must not block revocation */ }
  }
}

// Placeholder for future per-user revocation. With stateless JWTs we
// can't enumerate tokens by user, so the 2h expiry is the main defense.
// revokeAllForUser: not implemented yet. JWT tokens are short-lived (2h)
// so deleting a user effectively revokes access within 2 hours.
