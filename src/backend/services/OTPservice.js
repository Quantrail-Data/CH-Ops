// OTPservice.js - one time codes and reset tokens for password recovery
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { randomInt, randomBytes, timingSafeEqual, createHash } from "crypto";

// Keyed by user id, not email. email is nullable and not unique in the schema,
// so it cannot safely identify one account.
const OTP_STORE = new Map();
// token -> { userId, expiresAt }. A separate map so redeeming is a lookup.
const RESET_TOKENS = new Map();

const OTP_TTL_MS = 10 * 60 * 1000; // code is valid for 10 minutes
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000; // token is valid for 5 minutes
const MAX_ATTEMPTS = 5; // wrong guesses before lockout

const sha256 = (v) => createHash("sha256").update(String(v)).digest("hex");

// randomInt comes from the crypto module and is safe for security use.
// Math.random is not: its output can be predicted from earlier values.
function generateOTP() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Returns the plaintext code once, so the caller can email it. Only the hash is
// kept, so the live codes are never sitting in memory in readable form.
export function issueOTP(userId) {
  const otp = generateOTP();
  OTP_STORE.set(userId, {
    otpHash: sha256(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  return otp;
}

export function verifyOTP(userId, submitted) {
  const rec = OTP_STORE.get(userId);
  if (!rec || !rec.otpHash) return { ok: false };

  // The expiry check the old code meant to do but never ran.
  if (Date.now() > rec.expiresAt) {
    OTP_STORE.delete(userId);
    return { ok: false };
  }

  // Stops guessing. Five wrong tries and the code is dead.
  if (rec.attempts >= MAX_ATTEMPTS) {
    OTP_STORE.delete(userId);
    return { ok: false };
  }
  rec.attempts += 1;

  // timingSafeEqual always takes the same time regardless of where two values
  // differ. A normal === can leak information through how long it takes.
  const a = Buffer.from(sha256(submitted));
  const b = Buffer.from(rec.otpHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };

  // Correct code. Consume it, then hand back proof this step happened.
  rec.otpHash = null;
  const token = randomBytes(32).toString("hex");
  RESET_TOKENS.set(token, {
    userId,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
  });
  return { ok: true, resetToken: token };
}

// Single use. Returns the user id, or null.
export function redeemResetToken(token) {
  const rec = RESET_TOKENS.get(token);
  if (!rec) return null;
  RESET_TOKENS.delete(token);
  if (Date.now() > rec.expiresAt) return null;
  OTP_STORE.delete(rec.userId);
  return rec.userId;
}

export function clearOTP(userId) {
  OTP_STORE.delete(userId);
}

// Nothing removed old records before, so they lived until the process
// restarted. This clears them out once a minute.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of OTP_STORE) if (now > v.expiresAt) OTP_STORE.delete(k);
  for (const [k, v] of RESET_TOKENS)
    if (now > v.expiresAt) RESET_TOKENS.delete(k);
}, 60 * 1000);
sweeper.unref?.();
