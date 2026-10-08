// Copyright (C) 2026 Quantrail™ Data Private Limited
// Authors: Kathir Moorthy, Kathir Dhasan, Praveen Kumar
//
// Authenticates users using Argon2id password hashing with legacy SHA-256
// upgrades, brute-force lockouts, and .env-based superadmin recovery.

import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, appUsers } from "../db/index.js";
import { create, verify, revokeToken } from "../services/jwt.js";
import { loadEnv } from "../utils/env.js";
import { getConfig } from "../services/appConfig.js";

async function hashPassword(pw) {
  return Bun.password.hash(pw, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });
}

async function verifyPassword(pw, hash) {
  // Old installations stored SHA-256 hashes (64 hex characters, no $ prefix).
  // Detect them so legacy accounts can continue to authenticate.
  if (hash && hash.length === 64 && !hash.startsWith("$")) {
    const { createHash } = await import("crypto");
    const sha = createHash("sha256").update(pw).digest("hex");

    try {
      return timingSafeEqual(Buffer.from(sha), Buffer.from(hash));
    } catch {
      return false;
    }
  }

  return Bun.password.verify(pw, hash);
}

// Timing-safe string comparison for .env fallback credentials.
function safeCompare(a, b) {
  try {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));

    // timingSafeEqual requires buffers of equal length.
    if (left.length !== right.length) return false;

    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

const loginAttempts = new Map();

function checkLockout(username) {
  const key = username.toLowerCase().trim();
  const entry = loginAttempts.get(key);

  if (!entry) return false;

  const cutoff = Date.now() - getConfig("security.lockoutMs");
  entry.times = entry.times.filter((t) => t > cutoff);

  if (entry.times.length === 0) {
    loginAttempts.delete(key);
    return false;
  }

  return entry.times.length >= getConfig("security.maxFailures");
}

function recordFailure(username) {
  const key = username.toLowerCase().trim();

  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, { times: [] });
  }

  loginAttempts.get(key).times.push(Date.now());
}

function clearFailures(username) {
  loginAttempts.delete(username.toLowerCase().trim());
}

export async function login(req, res) {
  const { username, password } = req.body || {};

  if (
    !username ||
    !password ||
    typeof username !== "string" ||
    typeof password !== "string"
  ) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  if (username.length > 128 || password.length > 256) {
    return res.status(400).json({ error: "Invalid credentials." });
  }

  if (checkLockout(username)) {
    return res
      .status(429)
      .json({ error: "Too many failed attempts. Please try again later." });
  }

  // Try the database user first.
  const user = db
    .select()
    .from(appUsers)
    .where(eq(appUsers.username, username.trim()))
    .get();

  // There is currently no authMethod column in the schema or migration,
  // and the SSO login button is disabled. Restore SSO-specific logic only
  // after adding the schema field and its migration.

  if (user && (await verifyPassword(password, user.passwordHash))) {
    // Upgrade legacy SHA-256 hashes to Argon2id after successful login.
    if (user.passwordHash.length === 64 && !user.passwordHash.startsWith("$")) {
      const newHash = await hashPassword(password);

      db.update(appUsers)
        .set({ passwordHash: newHash })
        .where(eq(appUsers.id, user.id))
        .run();
    }

    clearFailures(username);

    db.update(appUsers)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(appUsers.id, user.id))
      .run();

    return res.json({
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      token: create({
        username: user.username,
        role: user.role,
        userId: user.id,
      }),
    });
  }

  // .env fallback (disabled when DISABLE_ENV_LOGIN=true).
  try {
    const env = loadEnv();

    if (!env.disableEnvLogin) {
      for (const sa of env.superAdmins) {
        if (
          safeCompare(username.trim(), sa.username) &&
          safeCompare(password, sa.password)
        ) {
          // Recreate the account if missing, then issue a token containing
          // userId because auth middleware uses it to identify the user.
          let row = db
            .select()
            .from(appUsers)
            .where(eq(appUsers.username, sa.username))
            .get();

          if (!row) {
            const hash = await hashPassword(sa.password);

            db.insert(appUsers)
              .values({
                username: sa.username,
                passwordHash: hash,
                role: "superadmin",
                email: sa.email,
                mustChangePassword: false,
              })
              .run();

            row = db
              .select()
              .from(appUsers)
              .where(eq(appUsers.username, sa.username))
              .get();
          }

          if (!row) {
            throw new Error("Unable to load the recovery account.");
          }

          clearFailures(username);

          db.update(appUsers)
            .set({ lastLoginAt: new Date().toISOString() })
            .where(eq(appUsers.id, row.id))
            .run();

          return res.json({
            username: row.username,
            role: row.role,
            mustChangePassword: row.mustChangePassword,
            token: create({
              username: row.username,
              role: row.role,
              userId: row.id,
            }),
          });
        }
      }
    }
  } catch {
    // Preserve the generic authentication failure response.
  }

  recordFailure(username);

  return res.status(401).json({ error: "Invalid credentials." });
}

export async function logout(req, res) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verify(authHeader.slice(7));

      if (payload?.jti) {
        revokeToken(payload.jti);
      }
    } catch {
      // Invalid or expired token: nothing to revoke.
    }
  }

  return res.json({ ok: true });
}

export async function changePassword(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = verify(authHeader.slice(7));
    const { currentPassword, newPassword } = req.body || {};

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({ error: "Both passwords are required." });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
    }

    const user = db
      .select()
      .from(appUsers)
      .where(eq(appUsers.username, payload.username))
      .get();

    // Use a generic response for a missing user or an incorrect password.
    if (!user) {
      return res.status(401).json({ error: "Invalid current password." });
    }

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid current password." });
    }

    const newHash = await hashPassword(newPassword);

    db.update(appUsers)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appUsers.id, user.id))
      .run();

    // Read back to confirm the update persisted.
    const updated = db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, user.id))
      .get();

    if (!updated || updated.passwordHash !== newHash) {
      return res
        .status(500)
        .json({ error: "Password update failed to persist." });
    }

    return res.json({ ok: true });
  } catch {
    return res.status(401).json({ error: "Invalid current password." });
  }
}
