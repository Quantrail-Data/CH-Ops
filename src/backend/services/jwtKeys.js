// jwtKeys.js - the keys that sign login tokens.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, appSettings } from "../db/index.js";
import { encrypt, decrypt } from "./crypto.js";
import { log } from "./logger.js";

const CATEGORY = "jwt";

const KEY_CURRENT = "jwt.currentSecret";
const KEY_PREVIOUS = "jwt.previousSecret";
const KEY_ROTATED_AT = "jwt.rotatedAt";

const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;

let cache = null;

function readRow(key) {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row?.value ?? null;
}

function writeRow(key, value) {
  const existing = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  if (existing) {
    db.update(appSettings)
      .set({ value, category: CATEGORY })
      .where(eq(appSettings.id, existing.id))
      .run();
  } else {
    db.insert(appSettings).values({ key, value, category: CATEGORY }).run();
  }
}

// The database keeps the keys encrypted with ENCRYPTION_SECRET. Older versions stored plain text.
// decrypt() returns a plain value as it is, and load() then encrypts it in place.
function isStoredPlain(storedValue) {
  return Boolean(storedValue) && !storedValue.startsWith("v1:");
}

function load() {
  if (cache) return cache;

  let current = null;
  let previous = null;
  let rotatedAt = 0;
  let storedPlain = false;

  try {
    const storedCurrent = readRow(KEY_CURRENT);
    const storedPrevious = readRow(KEY_PREVIOUS);
    storedPlain = isStoredPlain(storedCurrent) || isStoredPlain(storedPrevious);
    current = storedCurrent ? decrypt(storedCurrent) : null;
    previous = storedPrevious ? decrypt(storedPrevious) : null;
    rotatedAt = Number(readRow(KEY_ROTATED_AT)) || 0;
  } catch (error) {
    log.error("JWT signing keys could not be read", { error: error.message });
  }

  cache = { current, previous, rotatedAt };
  if (storedPlain) save(cache);
  return cache;
}

function save(keys) {
  cache = keys;
  try {
    writeRow(KEY_CURRENT, encrypt(keys.current));
    writeRow(KEY_PREVIOUS, keys.previous ? encrypt(keys.previous) : "");
    writeRow(KEY_ROTATED_AT, String(keys.rotatedAt));
  } catch (error) {
    // Without a stored key, each restart signs out all users. The log must show this problem.
    log.error("JWT signing keys could not be saved", { error: error.message });
  }
}

function keys() {
  const k = load();

  if (!k.current) {
    const fresh = {
      current: randomBytes(32).toString("hex"),
      previous: null,
      rotatedAt: Date.now(),
    };
    save(fresh);
    return fresh;
  }

  if (Date.now() - k.rotatedAt >= ROTATE_AFTER_MS) {
    const rotated = {
      current: randomBytes(32).toString("hex"),
      previous: k.current,
      rotatedAt: Date.now(),
    };
    save(rotated);
    return rotated;
  }

  return k;
}

export function signingKey() {
  return keys().current;
}

export function readingKeys() {
  const k = keys();
  return [k.current, k.previous].filter(Boolean);
}

export function signEverybodyOut() {
  save({
    current: randomBytes(32).toString("hex"),
    previous: null,
    rotatedAt: Date.now(),
  });
}

export function invalidateKeyCache() {
  cache = null;
}

// The server calls this at start. It encrypts the plain text keys of an older version at once.
export function encryptStoredSigningKeys() {
  cache = null;
  load();
}
