// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Database backup using SQLite VACUUM INTO, including the encryption salt.

import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'chops.db');
const BACKUP_DIR = path.join(DB_DIR, 'backups');
const CRYPTO_SALT_PATH = path.join(DB_DIR, 'crypto.salt');

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  console.error('Run "bun run db:migrate" first.');
  process.exit(1);
}

if (!fs.existsSync(CRYPTO_SALT_PATH)) {
  console.error(`Encryption salt not found: ${CRYPTO_SALT_PATH}`);
  console.error('Cannot create a restorable backup without the salt.');
  process.exit(1);
}

const salt = fs.readFileSync(CRYPTO_SALT_PATH);

if (salt.length !== 32) {
  console.error(
    `Invalid encryption salt size: expected 32 bytes, got ${salt.length}`,
  );
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('Z', '');

const backupPath = path.join(BACKUP_DIR, `chops-${timestamp}.db`);
const saltBackupPath = path.join(
  BACKUP_DIR,
  `chops-${timestamp}.salt`,
);

let db;

try {
  // Capture the salt used by this backup.
  // The salt must not be rotated while the snapshot is created.
  fs.copyFileSync(CRYPTO_SALT_PATH, saltBackupPath, fs.constants.COPYFILE_EXCL);

  // Create a self-contained, WAL-safe SQLite snapshot.
  db = new Database(DB_PATH, { readonly: true });

  try {
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } finally {
    db.close();
    db = undefined;
  }

  const dbSize = fs.statSync(backupPath).size;
  const saltSize = fs.statSync(saltBackupPath).size;

  console.log('Backup complete:');
  console.log(`  Database: ${backupPath} (${(dbSize / 1024).toFixed(1)} KB)`);
  console.log(`  Salt:     ${saltBackupPath} (${saltSize} bytes)`);
  console.log('  Restore both files together with the original ENCRYPTION_SECRET.');
} catch (err) {
  try {
    db?.close();
  } catch {}

  // Avoid leaving a partial backup that could be mistaken for a complete one.
  for (const file of [backupPath, saltBackupPath]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }

  console.error(`Backup failed: ${err.message}`);
  process.exit(1);
}
