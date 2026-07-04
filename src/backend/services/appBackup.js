// appBackup.js - WAL-safe application data backup to S3
//
// Creates a consistent SQLite snapshot using VACUUM INTO (WAL-safe),
// then uploads it to S3-compatible storage via ClickHouse's s3()
// table function. Also uploads a JSON manifest with metadata. Supports
// manual backups and scheduled automatic backups with configurable
// frequency (hourly/daily/weekly) and retention policies.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { log } from './logger.js';

import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db, appSettings, alertRules, alertChannels, dashboards, charts, appUsers } from '../db/index.js';
import { executeQuery } from './clickhouse.js';
import { getClusterNodes } from './clusterUtils.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'chops.db');
const TEMP_DIR = path.join(DB_DIR, 'tmp');

function pad(n) { return String(n).padStart(2, '0'); }

function escSql(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '').replace(/`/g, '\\`');
}

// Cluster nodes loaded from clusterUtils.getClusterNodes()

function getStorageProfiles() {
  try {
    const row = db.select().from(appSettings).where(eq(appSettings.key, 'backup_profiles')).get();
    if (row?.value) return JSON.parse(row.value);
  } catch {}
  return [];
}

function getS3Base(profile) {
  if (profile.type === 'gcs') return { endpoint: `https://storage.googleapis.com/${profile.bucket}`, accessKeyId: profile.accessKeyId, accessKey: profile.accessKey };
  return { endpoint: `${profile.endpoint || 'https://s3.amazonaws.com'}${profile.bucket}`, accessKeyId: profile.accessKeyId, accessKey: profile.accessKey };
}

function buildTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Count rows in each table for the manifest
function getTableCounts() {
  try {
    return {
      app_settings: db.select().from(appSettings).all().length,
      alert_rules: db.select().from(alertRules).all().length,
      alert_channels: db.select().from(alertChannels).all().length,
      dashboards: db.select().from(dashboards).all().length,
      charts: db.select().from(charts).all().length,
      app_users: db.select().from(appUsers).all().length,
    };
  } catch { return {}; }
}

// Get app version from version.json
function getAppVersion() {
  try {
    const versionPath = path.join(process.cwd(), 'version.json');
    return JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  } catch { return { display: 'unknown' }; }
}

// Create a WAL-safe snapshot and return the temp file path + size
function createSnapshot() {
  if (!fs.existsSync(DB_PATH)) throw new Error('Database file not found');
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const tempPath = path.join(TEMP_DIR, `snapshot-${Date.now()}.db`);
  const source = new Database(DB_PATH, { readonly: true });
  try {
    source.exec(`VACUUM INTO '${tempPath.replace(/'/g, "''")}'`);
  } finally {
    source.close();
  }

  const size = fs.statSync(tempPath).size;
  return { path: tempPath, size };
}

// Upload a file to S3 using ClickHouse®'s s3() function.
// We read the file as base64, then use INSERT INTO FUNCTION s3() to write it.
async function uploadToS3(filePath, s3Key, s3, node) {
  const fileData = fs.readFileSync(filePath);
  const base64 = fileData.toString('base64');

  // Upload via ClickHouse®'s s3 table function using base64 encoding
  const sql = `INSERT INTO FUNCTION s3('${s3.endpoint}/${escSql(s3Key)}', '${escSql(s3.accessKeyId)}', '${escSql(s3.accessKey)}', 'RawBLOB', 'data String') VALUES ('${escSql(base64)}')`;
  await executeQuery({
    host: node.host, port: node.port, secure: !!node.secure,
    user: node.user, password: node.password, sql,
  });
}

// Write a JSON manifest alongside the backup
async function writeManifest(manifest, s3Key, s3, node) {
  const json = JSON.stringify(manifest, null, 2);
  const sql = `INSERT INTO FUNCTION s3('${s3.endpoint}/${escSql(s3Key)}', '${escSql(s3.accessKeyId)}', '${escSql(s3.accessKey)}', 'RawBLOB', 'data String') VALUES ('${escSql(json)}')`;
  await executeQuery({
    host: node.host, port: node.port, secure: !!node.secure,
    user: node.user, password: node.password, sql,
  });
}

// Create and upload a backup to the selected storage profile
export async function createAppBackup(profileName,backupType) {
  const profiles = getStorageProfiles();
  const profile = profiles.find(p => p.name === profileName);
  if (!profile) throw new Error(`Storage profile "${profileName}" not found`);

  const nodes = getClusterNodes();
  if (!nodes.length) throw new Error('No cluster nodes configured. Need at least one node to upload via ClickHouse® S3 function.');
  const node = nodes[0];

  const s3 = getS3Base(profile);
  const now = new Date();
  const ts = buildTimestamp(now);
  const backupKey = `chops-app-backups/${ts}.db`;
  const manifestKey = `chops-app-backups/${ts}.json`;

  // Step 1: create WAL-safe snapshot
  const snapshot = createSnapshot();

  try {
    // Step 2: upload the snapshot
    await uploadToS3(snapshot.path, backupKey, s3, node);

    // Step 3: write manifest
    const manifest = {
      backup_id: ts,
      created_at: now.toISOString(),
      app_version: getAppVersion().display || getAppVersion().version || 'unknown',
      file_size_bytes: snapshot.size,
      file_size_display: snapshot.size < 1024 * 1024
        ? `${(snapshot.size / 1024).toFixed(1)} KB`
        : `${(snapshot.size / (1024 * 1024)).toFixed(2)} MB`,
      profile_name: profileName,
      s3_path: `${s3.endpoint}/${backupKey}`,
      table_counts: getTableCounts(),
      backup_type:backupType
    };
    await writeManifest(manifest, manifestKey, s3, node);

    return manifest;
  } finally {
    // Always clean up the temp file
    try { fs.unlinkSync(snapshot.path); } catch {}
  }
}

// List existing app backups from S3 by reading manifests
export async function listAppBackups(profileName) {
  const profiles = getStorageProfiles();
  const profile = profiles.find(p => p.name === profileName);
  if (!profile) throw new Error(`Storage profile "${profileName}" not found`);

  const nodes = getClusterNodes();
  if (!nodes.length) throw new Error('No cluster nodes configured');
  const node = nodes[0];

  const s3 = getS3Base(profile);

  try {
    const sql = `SELECT data FROM s3('${s3.endpoint}/chops-app-backups/*.json', '${escSql(s3.accessKeyId)}', '${escSql(s3.accessKey)}', 'RawBLOB', 'data String') ORDER BY _path DESC`;
    const r = await executeQuery({
      host: node.host, port: node.port, secure: !!node.secure,
      user: node.user, password: node.password, sql,
    });

    if (!r.rows?.length) return [];

    return r.rows.map(row => {
      try { return JSON.parse(row.data); } catch { return null; }
    }).filter(Boolean);
  } catch (err) {
    // No backups yet or path not found
    if (err.message?.includes('not found') || err.message?.includes('NoSuchKey') || err.message?.includes('no objects')) return [];
    throw err;
  }
}

// Scheduled app backup - called from the backup scheduler
let schedulerInterval = null;

export function startAppBackupScheduler() {
  if (schedulerInterval) return;

  async function tick() {
    const now = new Date();
    if (now.getMinutes() !== 0) return; // only run at top of hour

    try {
      const configRow = db.select().from(appSettings).where(eq(appSettings.key, 'app_backup_config')).get();
      if (!configRow?.value) return;

      const config = JSON.parse(configRow.value);
      if (!config.enabled || !config.profileName) return;

      const hour = now.getHours();
      const day = now.getDay();

      // Check if it's time to run
      if (hour !== (config.backupHour || 2)) return;
      if (config.frequency === 'weekly' && day !== (config.weekday || 0)) return;

      // Check if already ran this hour
      if (config.lastRunAt) {
        const last = new Date(config.lastRunAt);
        if (last.getHours() === hour && last.getDate() === now.getDate() && last.getMonth() === now.getMonth()) return;
      }

      log.info('Starting scheduled app backup', { profile: config.profileName });
      const manifest = await createAppBackup(config.profileName,"scheduled");

      // Update last run info
      const updated = { ...config, lastRunAt: now.toISOString(), lastRunStatus: 'ok', lastRunError: null, lastBackupId: manifest.backup_id };
      db.update(appSettings).set({ value: JSON.stringify(updated) }).where(eq(appSettings.key, 'app_backup_config')).run();

      log.info('App backup completed', { backupId: manifest.backup_id, size: manifest.file_size_display });
    } catch (err) {
      log.error('App backup failed', { error: err.message });
      try {
        const configRow = db.select().from(appSettings).where(eq(appSettings.key, 'app_backup_config')).get();
        if (configRow?.value) {
          const config = JSON.parse(configRow.value);
          const updated = { ...config, lastRunAt: now.toISOString(), lastRunStatus: 'error', lastRunError: err.message?.substring(0, 500) };
          db.update(appSettings).set({ value: JSON.stringify(updated) }).where(eq(appSettings.key, 'app_backup_config')).run();
        }
      } catch {}
    }
  }

  tick();
  schedulerInterval = setInterval(tick, 60000);
  log.info('App backup scheduler started (60s interval)');
}
