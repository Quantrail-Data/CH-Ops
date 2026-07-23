// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Authenticates users, handling argon2id hashing with legacy SHA-256 upgrades, brute-force lockouts, and secure .env backdoors.


import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, appUsers } from "../db/index.js";
import { create, verify, revokeToken } from "../services/jwt.js";
import { loadEnv } from "../utils/env.js";

export async function hashPassword(pw) {
  return Bun.password.hash(pw, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });
}

export async function verifyPassword(pw, hash) {
  // Old installs stored SHA-256 (64 hex chars, no $ prefix). Detect and handle.
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

// Timing-safe string comparison for .env fallback (constant-time, no early exit)
export function safeCompare(a, b) {
  try {
    return timingSafeEqual(Buffer.from(String(a)), Buffer.from(String(b)));
  } catch {
    return false;
  }
}

// Brute-force lockout
// Tracks failed login timestamps per username (lowercase).
// 5 failures in 15 minutes = locked out.
const loginAttempts = new Map();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function checkLockout(username) {
  const key = username.toLowerCase().trim();
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  const cutoff = Date.now() - LOCKOUT_MS;
  entry.times = entry.times.filter((t) => t > cutoff);
  if (entry.times.length === 0) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.times.length >= MAX_FAILURES;
}

function recordFailure(username) {
  const key = username.toLowerCase().trim();
  if (!loginAttempts.has(key)) loginAttempts.set(key, { times: [] });
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

  // Try database user first
  const user = db
    .select()
    .from(appUsers)
    .where(eq(appUsers.username, username.trim()))
    .get();

  // Block local login for SSO users  - they must use the SSO button
  if (user && user.authMethod === "sso") {
    return res
      .status(403)
      .json({
        error: "This account uses SSO. Please sign in with the SSO button.",
      });
  }

  if (user && (await verifyPassword(password, user.passwordHash))) {
    // Upgrade legacy SHA-256 hash to argon2id so future logins are faster and safer
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

  // .env fallback (disabled when DISABLE_ENV_LOGIN=true)
  try {
    const env = loadEnv();
    if (!env.disableEnvLogin) {
      for (const sa of env.superAdmins) {
        if (
          safeCompare(username.trim(), sa.username) &&
          safeCompare(password, sa.password)
        ) {
          clearFailures(username);
          return res.json({
            username: username.trim(),
            role: "superadmin",
            token: create({ username: username.trim(), role: "superadmin" }),
          });
        }
      }
    }
  } catch { }

  recordFailure(username);
  res.status(401).json({ error: "Invalid credentials." });
}

// Logout: revoke the current token so it cannot be reused, which (via the
// registered revoke hook) also clears this login's encrypted ClickHouse
// credential sessions. Always succeeds from the client's perspective: even an
// invalid or already-expired token means "you are logged out".
export async function logout(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verify(authHeader.slice(7));
      if (payload?.jti) revokeToken(payload.jti);
    } catch {
      /* invalid/expired token: nothing to revoke, still a successful logout */
    }
  }
  res.json({ ok: true });
}

export async function changePassword(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = verify(authHeader.slice(7));
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "Both passwords required." });
    if (newPassword.length < 8)
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
    const user = db
      .select()
      .from(appUsers)
      .where(eq(appUsers.username, payload.username))
      .get();
    // Generic message for both "user not found" and "wrong password" (prevents enumeration)
    if (!user) return res.status(401).json({ error: "Invalid credentials." });
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      return res.status(401).json({ error: "Invalid credentials." });
    const newHash = await hashPassword(newPassword);
    db.update(appUsers)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appUsers.id, user.id))
      .run();
    // Read back to confirm it actually persisted (SQLite WAL can be tricky)
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
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "Invalid token." });
  }
}

