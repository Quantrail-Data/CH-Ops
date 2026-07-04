// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Database backup script utilizing SQLite VACUUM INTO to create self-contained, WAL-safe files during server runtime.



import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'chops.db');
const BACKUP_DIR = path.join(DB_DIR, 'backups');

if (!fs.existsSync(DB_PATH)) {
  console.error(`  Database not found: ${DB_PATH}`);
  console.error('  Run "bun run db:migrate" first.');
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
const backupPath = path.join(BACKUP_DIR, `chops-${timestamp}.db`);

try {
  const db = new Database(DB_PATH, { readonly: true });
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  db.close();

  const size = fs.statSync(backupPath).size;
  const sizeKB = (size / 1024).toFixed(1);
  console.log(`  Backup complete: ${backupPath} (${sizeKB} KB)`);
} catch (err) {
  console.error(`  Backup failed: ${err.message}`);
  process.exit(1);
}
