// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Database migration script that creates schemas, seeds defaults, and runs via 'bun src/backend/db/migrate.js'.


import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import * as schema from './schema.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'chops.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

// Migrate ch_cred_session to the (jti, context) key. These rows are transient,
// TTL-bound, encrypted credential sessions, so recreating the table (dropping any
// active session) is acceptable; users simply reconnect. Runs once: after the
// rebuild the jti column exists, so the drop is skipped thereafter.
try {
  const cols = sqlite.query("PRAGMA table_info(ch_cred_session)").all();
  if (cols.length && !cols.some((c) => c.name === 'jti')) {
    sqlite.exec('DROP TABLE ch_cred_session');
  }
} catch { /* table does not exist yet */ }

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alert_rule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    sql TEXT NOT NULL,
    threshold REAL NOT NULL DEFAULT 0,
    operator TEXT NOT NULL DEFAULT 'gt',
    severity TEXT NOT NULL DEFAULT 'warning',
    schedule TEXT NOT NULL DEFAULT '*/5 * * * *',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_value REAL,
    last_status TEXT,
    last_error TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    nodes TEXT,
    cluster_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alert_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_test_at TEXT,
    last_test_ok INTEGER,
    last_test_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alert_rule_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL REFERENCES alert_rule(id) ON DELETE CASCADE,
    alert_channel_id INTEGER NOT NULL REFERENCES alert_channel(id) ON DELETE CASCADE,
    UNIQUE(alert_rule_id, alert_channel_id)
  );
  CREATE TABLE IF NOT EXISTS dashboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    columns INTEGER NOT NULL DEFAULT 2,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dashboard_id INTEGER REFERENCES dashboard(id) ON DELETE SET NULL,
    grid_row INTEGER NOT NULL DEFAULT 0,
    grid_col INTEGER NOT NULL DEFAULT 0,
    sql_query TEXT NOT NULL,
    chart_type TEXT NOT NULL,
    chart_subtype TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS app_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'readonly',
    email TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS api_key (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_database_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credentials TEXT NOT NULL,
    database_id TEXT NOT NULL,
    database_type TEXT NOT NULL,
    client TEXT NOT NULL,
    is_valid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ch_cred_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_user TEXT NOT NULL,
    jti TEXT NOT NULL,
    context TEXT NOT NULL,
    cluster_id TEXT,
    node TEXT,
    port INTEGER,
    ch_user TEXT NOT NULL,
    encrypted_password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    UNIQUE (jti, context)
  );
`);

// Add columns that may be missing from earlier versions.
// SQLite throws if the column already exists, so we catch and ignore.

const migrations = [
  "ALTER TABLE alert_rule ADD COLUMN nodes TEXT",
  "ALTER TABLE alert_rule ADD COLUMN cluster_id TEXT",
];

for (const sql of migrations) {
  try { sqlite.exec(sql); } catch {}
}

// Seed defaults
const db = drizzle(sqlite, { schema });
const existing = db.select().from(schema.appSettings).all();
if (existing.length === 0) {
  db.insert(schema.appSettings).values({ key: 'app.name', value: 'CHOps', category: 'general' }).run();
  db.insert(schema.appSettings).values({ key: 'app.version', value: '6.0.0', category: 'general' }).run();
  console.log('  Seeded default settings.');
}

// Seed super admin users from .env (argon2id)
const existingUsers = db.select().from(schema.appUsers).all();
if (existingUsers.length === 0) {
  let seeded = 0;
  for (let i = 1; i <= 3; i++) {
    const u = process.env[`SUPER_ADMIN_${i}`];
    const p = process.env[`SUPER_ADMIN_${i}_PASSWORD`];
    const em = process.env[`SUPER_ADMIN_${i}_EMAIL`];
    if (u && p && em) {
      const hash = await Bun.password.hash(p, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 2 });
      db.insert(schema.appUsers).values({ username: u, passwordHash: hash, role: 'superadmin', mustChangePassword: false,email:em }).run();
      console.log(`  Seeded super admin: ${u}`);
      seeded++;
    }
  }
  // Legacy fallback
  if (seeded === 0 && process.env.SUPER_ADMIN && process.env.SUPER_ADMIN_PASSWORD && process.env.SUPER_ADMIN_EMAIL) {
    const hash = await Bun.password.hash(process.env.SUPER_ADMIN_PASSWORD, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 2 });
    db.insert(schema.appUsers).values({ username: process.env.SUPER_ADMIN, passwordHash: hash, role: 'superadmin', mustChangePassword: false,email:process.env.SUPER_ADMIN_EMAIL }).run();
    console.log(`  Seeded super admin: ${process.env.SUPER_ADMIN}`);
  }
}

console.log('  Database migration complete.');
sqlite.close();
