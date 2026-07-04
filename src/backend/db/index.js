// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Initializes Drizzle ORM over SQLite, enabling WAL mode for concurrent operations and enforcing foreign keys.

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import fs from 'fs';
import path from 'path';
import * as schema from './schema.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'chops.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

// Add columns from newer versions. Safe to run every time - SQLite throws
// (and we catch) if the column already exists.
try { sqlite.exec("ALTER TABLE alert_rule ADD COLUMN nodes TEXT"); } catch {}
try { sqlite.exec("ALTER TABLE alert_rule ADD COLUMN cluster_id TEXT"); } catch {}

export const db = drizzle(sqlite, { schema });

// Re-export schema tables for convenience.
// Explicit individual exports are used (instead of `export { } from './schema.js'`)
// because Bun's static ESM checker cannot always resolve the re-export chain when
// the same module is also imported as a namespace above.
export const appSettings = schema.appSettings;
export const alertRules = schema.alertRules;
export const alertChannels = schema.alertChannels;
export const alertRuleChannels = schema.alertRuleChannels;
export const dashboards = schema.dashboards;
export const charts = schema.charts;
export const appUsers = schema.appUsers;