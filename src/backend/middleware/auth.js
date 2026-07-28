// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Middleware validating the Authorization JWT token, handling failures with 401 and attaching valid payloads to req.user.

import { eq } from 'drizzle-orm';
import { appUsers, db } from '../db/index.js';
import { verify } from '../services/jwt.js';

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization' });

  // verify() throws on an expired, malformed or revoked token. It has to sit
  // inside the try: previously it ran outside, so Express forwarded the throw
  // to the global error handler and the client got a 500 with "jwt expired".
  // The frontend only clears its session on a 401, so an expired token left
  // the user staring at 500s from every endpoint with no way back to login.
  let payload;
  try {
    payload = verify(auth.slice(7));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const found = db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, payload.userId))
    .get();

  // Same message as an invalid token. Saying the account no longer exists
  // confirms that the token itself was valid, which is more than an
  // unauthenticated caller needs to know.
  if (!found) return res.status(401).json({ error: 'Invalid or expired token' });

  // Server-side enforcement of the forced password-change gate: the frontend
  // blocks navigation on this flag, but a still-valid JWT issued before the
  // change (e.g. a shared temporary password) must not reach any other API.
  // /api/auth/* (login, logout, change-password) doesn't use this middleware,
  // so the user can still call change-password while blocked everywhere else.
  if (found.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required.', code: 'MUST_CHANGE_PASSWORD' });
  }

  req.user = payload;
  next();
}
