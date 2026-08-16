// systemSmtp.js - SMTP used for account emails and password resets.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { eq } from 'drizzle-orm';
import { db, appSettings } from '../db/index.js';
import { encrypt, decrypt } from './crypto.js';
import { loadEnv } from '../utils/env.js';

const CATEGORY = 'smtp';

// One row per field in app_setting, rather than a new table: this is a single
// configuration, not a collection.
const KEYS = {
  host: 'smtp.host',
  port: 'smtp.port',
  secure: 'smtp.secure',
  user: 'smtp.user',
  passwordEnc: 'smtp.passwordEnc',
  from: 'smtp.from',
};

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

// What is stored, with the password still encrypted. For the API layer.
export function readStoredSmtp() {
  const host = readRow(KEYS.host);
  if (!host) return null;
  return {
    host,
    port: readRow(KEYS.port) || '587',
    secure: readRow(KEYS.secure) === 'true',
    user: readRow(KEYS.user) || '',
    passwordEnc: readRow(KEYS.passwordEnc) || '',
    from: readRow(KEYS.from) || '',
  };
}

export function saveSystemSmtp({ host, port, secure, user, password, from }) {
  writeRow(KEYS.host, String(host || '').trim());
  writeRow(KEYS.port, String(port || '587'));
  writeRow(KEYS.secure, secure ? 'true' : 'false');
  writeRow(KEYS.user, String(user || ''));
  writeRow(KEYS.from, String(from || ''));

  // Blank means unchanged.
  if (password) writeRow(KEYS.passwordEnc, encrypt(password));
}

export function deleteSystemSmtp() {
  for (const key of Object.values(KEYS)) {
    db.delete(appSettings).where(eq(appSettings.key, key)).run();
  }
}


// Returns the unprefixed shape that sendOTPEmail expects, plus `source` so the
// interface and the logs can say where the settings came from. 

export function resolveSystemSmtp() {
  const stored = readStoredSmtp();
  if (stored) {
    return {
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      user: stored.user,
      pass: stored.passwordEnc ? decrypt(stored.passwordEnc) : '',
      from: stored.from,
      source: 'database',
    };
  }

  const env = loadEnv();
  if (env.disableEnvSmtp) return null;
  if (!env.smtp?.host) return null;

  return {
    host: env.smtp.host,
    port: env.smtp.port,
    secure: false,
    user: env.smtp.user,
    pass: env.smtp.pass,
    from: env.smtp.from,
    source: 'environment',
  };
}