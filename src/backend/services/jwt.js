// jwt.js - JWT token creation, verification, and revocation
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { signingKey, readingKeys } from './jwtKeys.js';
import { getConfig } from './appConfig.js';


export const create = (payload) => {
  const jti = randomBytes(16).toString('hex');

  const ttlSeconds = Math.floor(
    getConfig('security.sessionTtlMs') / 1000
  );

  return jwt.sign(
    { ...payload, jti },
    signingKey(),
    { expiresIn: ttlSeconds }
  );
};

export const verify = (token) => {
  let lastError = null;

  for (const key of readingKeys()) {
    let payload;
    try {
      payload = jwt.verify(token, key, { algorithms: ['HS256'] });
    } catch (err) {
      lastError = err;
      continue;
    }

    if (blocklist.has(payload.jti)) {
      throw new Error('Token revoked');
    }

    return payload;
  }

  throw lastError || new Error('Token is not valid');
};

const blocklist = new Map();


const revokeHooks = [];
export function onRevoke(fn) {
  if (typeof fn === 'function') {
    revokeHooks.push(fn);
  }
}

export function revokeToken(jti) {
  if (!jti) return;

  const now = Date.now();
  blocklist.set(jti, now);

  const ttlMs = getConfig('security.sessionTtlMs');
  const cutoff = now - ttlMs;

  for (const [k, v] of blocklist) {
    if (v < cutoff) {
      blocklist.delete(k);
    }
  }
  for (const fn of revokeHooks) {
    try {
      fn(jti);
    } catch {}
  }
}
