// jwtKeys.js - the keys that sign login tokens.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, appSettings } from '../db/index.js';

const CATEGORY = 'jwt';

const KEY_CURRENT = 'jwt.currentSecret';
const KEY_PREVIOUS = 'jwt.previousSecret';
const KEY_ROTATED_AT = 'jwt.rotatedAt';


const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;


let cache = null;

function readRow(key) {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

function writeRow(key, value) {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    db.update(appSettings).set({ value, category: CATEGORY })
      .where(eq(appSettings.id, existing.id)).run();
  } else {
    db.insert(appSettings).values({ key, value, category: CATEGORY }).run();
  }
}

function load() {
  if (cache) return cache;

  let current = null;
  let previous = null;
  let rotatedAt = 0;

  try {
    current = readRow(KEY_CURRENT);
    previous = readRow(KEY_PREVIOUS) || null;
    rotatedAt = Number(readRow(KEY_ROTATED_AT)) || 0;
  } catch {
  }

  cache = { current, previous, rotatedAt };
  return cache;
}

function save(keys) {
  cache = keys;
  try {
    writeRow(KEY_CURRENT, keys.current);
    writeRow(KEY_PREVIOUS, keys.previous || '');
    writeRow(KEY_ROTATED_AT, String(keys.rotatedAt));
  } catch {
  }
}

function keys() {
  const k = load();

  if (!k.current) {
    const fresh = {
      current: randomBytes(32).toString('hex'),
      previous: null,
      rotatedAt: Date.now(),
    };
    save(fresh);
    return fresh;
  }

  if (Date.now() - k.rotatedAt >= ROTATE_AFTER_MS) {
    const rotated = {
      current: randomBytes(32).toString('hex'),
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
    current: randomBytes(32).toString('hex'),
    previous: null,
    rotatedAt: Date.now(),
  });
}


export function invalidateKeyCache() {
  cache = null;
}
