// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Middleware validating the Authorization JWT token, handling failures with 401 and attaching valid payloads to req.user.

import { eq } from 'drizzle-orm';
import { appUsers, db } from '../db/index.js';
import { verify } from '../services/jwt.js';

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization' });
  const user = verify(auth.slice(7));
  const findUser = db
          .select()
          .from(appUsers)
          .where(eq(appUsers.id, user.userId))
          .get();

  if(!findUser) return res.status(401).json({error:"Oops! That user doesn't seem to exist."})

  // Server-side enforcement of the forced password-change gate: the frontend
  // blocks navigation on this flag, but a still-valid JWT issued before the
  // change (e.g. a shared temporary password) must not reach any other API.
  // /api/auth/* (login, logout, change-password) doesn't use this middleware,
  // so the user can still call change-password while blocked everywhere else.
  if (findUser.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required.', code: 'MUST_CHANGE_PASSWORD' });
  }

  try {
    req.user = user
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
