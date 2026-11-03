// appConfig.js - settings an administrator can change without a restart.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G 
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { eq } from 'drizzle-orm';
import { db, appSettings } from '../db/index.js';

const CATEGORY = 'appconfig';


export const CONFIG = {
  'export.maxTotalBytes': {
    env: 'EXPORT_MAX_TOTAL_BYTES',
    def: 20 * 1024 * 1024 * 1024,
    min: 1024 * 1024 * 1024,
    max: 10 * 1024 * 1024 * 1024 * 1024,
  },
  'export.maxJobBytes': {
    env: 'EXPORT_MAX_JOB_BYTES',
    def: 5 * 1024 * 1024 * 1024,
    min: 1024 * 1024,
    max: 10 * 1024 * 1024 * 1024 * 1024,
  },
  'export.maxConcurrent': {
    env: 'EXPORT_MAX_CONCURRENT',
    def: 5,
    min: 1,
    max: 100,
  },
  'export.maxPerUser': {
    env: 'EXPORT_MAX_PER_USER',
    def: 2,
    min: 1,
    max: 50,
  },
  'export.warnBytes': {
    env: 'EXPORT_WARN_BYTES',
    def: 1024 * 1024 * 1024,
    min: 1024 * 1024,
    max: 10 * 1024 * 1024 * 1024 * 1024,
  },
  'export.idleTtlMs': {
    env: 'EXPORT_IDLE_TTL_MS',
    def: 15 * 60 * 1000,
    min: 60 * 1000,
    max: 24 * 60 * 60 * 1000,
  },


  'query.maxResultBytes': {
    env: 'MAX_RESULT_BYTES',
    def: 128 * 1024 * 1024,
    min: 1024 * 1024,
    max: 8 * 1024 * 1024 * 1024,
  },
  'query.statsRowLimit': {
    env: null,
    def: 100000,
    min: 1000,
    max: 10000000,
  },


  'security.maxFailures': {
    env: null,
    def: 5,
    min: 3,
    max: 20,
  },
  'security.lockoutMs': {
    env: null,
    def: 15 * 60 * 1000,
    min: 60 * 1000,
    max: 24 * 60 * 60 * 1000,
  },
  'security.sessionTtlMs': {
    env: null,
    def: 2 * 60 * 60 * 1000,
    min: 5 * 60 * 1000,
    max: 24 * 60 * 60 * 1000,
  },

 
  'k8s.syncIntervalMs': {
    env: null,
    def: 15 * 60 * 1000,
    min: 60 * 1000,
    max: 24 * 60 * 60 * 1000,
  },
  'k8s.missesBeforeRemoval': {
    env: null,
    def: 3,
    min: 2,
    max: 20,
  },
  'k8s.timeoutMs': {
    env: null,
    def: 15000,
    min: 1000,
    max: 120000,
  },
  'k8s.probeTimeoutMs': {
    env: null,
    def: 3000,
    min: 500,
    max: 30000,
  },

  // SQL cannot read these two ClickHouse server options, so an admin sets them here
  // when the server configuration differs from the ClickHouse default.
  'rbac.defaultProfileName': {
    env: null,
    type: 'text',
    def: 'default',
    maxLength: 128,
  },
  'rbac.settingsConstraintsReplacePrevious': {
    env: null,
    def: 1,
    min: 0,
    max: 1,
  },
};


let cache = null;

function loadAll() {
  const out = {};

  let rows = [];
  try {
    rows = db.select().from(appSettings).where(eq(appSettings.category, CATEGORY)).all();
  } catch {

    rows = [];
  }

  const stored = new Map(rows.map(r => [r.key, r.value]));

  for (const [key, spec] of Object.entries(CONFIG)) {
    let raw = null;
    let source = 'default';

    if (stored.has(key)) {
      raw = stored.get(key);
      source = 'setting';
    } else if (spec.env && process.env[spec.env]) {
      raw = process.env[spec.env];
      source = 'environment';
    }

    let value = spec.def;
    if (raw !== null && raw !== '') {
      if (spec.type === 'text') {
        value = raw;
      } else {
        const n = parseInt(raw, 10);
        if (Number.isInteger(n) && n >= spec.min && n <= spec.max) value = n;
      }
    }

    out[key] = { value, source };
  }

  return out;
}


export function getConfig(key) {
  if (!cache) cache = loadAll();
  return cache[key]?.value ?? CONFIG[key]?.def;
}


export function getConfigWithSources() {
  if (!cache) cache = loadAll();
  return cache;
}

// Checks a new value and returns it as the text to store.
function valueToStore(spec, value) {
  if (spec.type === 'text') {
    const text = String(value ?? '').trim();
    if (text === '') throw new Error('Value must not be empty.');
    if (text.length > spec.maxLength) throw new Error(`Value must be at most ${spec.maxLength} characters.`);
    return text;
  }

  const n = parseInt(value, 10);
  if (!Number.isInteger(n)) throw new Error('Value must be a whole number.');
  if (n < spec.min || n > spec.max) {
    throw new Error(`Value must be between ${spec.min} and ${spec.max}.`);
  }
  return String(n);
}

export function setConfig(key, value) {
  const spec = CONFIG[key];
  if (!spec) throw new Error(`Unknown setting: ${key}`);
  const storedValue = valueToStore(spec, value);

  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    db.update(appSettings).set({ value: storedValue, category: CATEGORY })
      .where(eq(appSettings.id, existing.id)).run();
  } else {
    db.insert(appSettings).values({ key, value: storedValue, category: CATEGORY }).run();
  }

  cache = null;
}


export function resetConfig(key) {
  if (!CONFIG[key]) throw new Error(`Unknown setting: ${key}`);
  db.delete(appSettings).where(eq(appSettings.key, key)).run();
  cache = null;
}


export function invalidateConfigCache() {
  cache = null;
}
