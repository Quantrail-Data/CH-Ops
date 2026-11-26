// Copyright (C) 2026 Quantrail™ Data Private Limited
// Runs the numbered database migrations (db/migrations.js) safely.
//
// How it works:
// - The database keeps the number of the last migration that ran, in
//   PRAGMA user_version. A new database has 0.
// - At start, only the migrations with a higher number run, in order.
// - Before the first migration of an upgrade, the database is copied to
//   <database folder>/backups/pre-upgrade-schema-<old>-to-<new>-<time>-<process id>.db,
//   with the encryption salt. The last 5 of these copies are kept.
// - Each migration runs in its own transaction, and its number is saved in
//   the same transaction. If the migration fails, nothing of it stays.
// - The transaction takes the write lock first (BEGIN IMMEDIATE). A second
//   copy of the app waits, then sees that the migration already ran.
// - If the database number is higher than this version knows (an older app on
//   a newer database), the app does not start.
//
// How to add a migration: docs/development/database-migrations.md

import fs from "fs";
import path from "path";

export const PRE_UPGRADE_BACKUPS_TO_KEEP = 5;
const PRE_UPGRADE_PREFIX = "pre-upgrade-schema-";
// How long a second copy of the app waits for the write lock.
const LOCK_WAIT_MS = 30000;

// An error that stops the start. The message says what to do.
export class MigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationError";
  }
}

export function readSchemaVersion(sqlite) {
  return sqlite.query("PRAGMA user_version").get().user_version;
}

function writeSchemaVersion(sqlite, version) {
  // PRAGMA does not take parameters. version is a number from MIGRATIONS.
  sqlite.exec(`PRAGMA user_version = ${Number(version)}`);
}

// Checks the list: numbers 1, 2, 3 ... with no gap, each with a description
// and an up function. A mistake here is a mistake in the code, so it stops.
export function checkMigrationList(migrations) {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationError(`Migration number ${migration.version} is at place ${index + 1}. The numbers must be 1, 2, 3 ... with no gap.`);
    }
    if (!migration.description || typeof migration.up !== "function") {
      throw new MigrationError(`Migration ${migration.version} needs a description and an up function.`);
    }
  });
}

function hasTables(sqlite) {
  const row = sqlite.query("SELECT count(*) AS total FROM sqlite_master WHERE type = 'table'").get();
  return row.total > 0;
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-").replace("Z", "");
}

// Copies the database (and the encryption salt, if there is one) before an
// upgrade. Returns the path of the copy.
export function backUpBeforeUpgrade({ sqlite, backupFolder, saltPath, fromVersion, toVersion }) {
  fs.mkdirSync(backupFolder, { recursive: true });
  // The process id keeps the name unique. Two copies of the app that start at
  // the same time can both make a copy in the same millisecond, and two
  // VACUUM INTO to one file fail with "table ... already exists".
  const baseName = `${PRE_UPGRADE_PREFIX}${fromVersion}-to-${toVersion}-${timestampForFileName()}-${process.pid}`;
  const databaseCopy = path.join(backupFolder, `${baseName}.db`);
  // VACUUM INTO makes a complete, consistent copy, also in WAL mode.
  sqlite.exec(`VACUUM INTO '${databaseCopy.replace(/'/g, "''")}'`);
  if (saltPath && fs.existsSync(saltPath)) {
    fs.copyFileSync(saltPath, path.join(backupFolder, `${baseName}.salt`));
  }
  removeOldPreUpgradeBackups(backupFolder);
  return databaseCopy;
}

// Keeps the newest PRE_UPGRADE_BACKUPS_TO_KEEP pre-upgrade copies. Other
// backups (for example from "bun run db:backup") are never removed.
export function removeOldPreUpgradeBackups(backupFolder, keep = PRE_UPGRADE_BACKUPS_TO_KEEP) {
  const copies = fs
    .readdirSync(backupFolder)
    .filter((name) => name.startsWith(PRE_UPGRADE_PREFIX) && name.endsWith(".db"))
    // The time is in the name, so the names sort from old to new.
    .sort();
  const copiesToRemove = copies.slice(0, Math.max(0, copies.length - keep));
  for (const name of copiesToRemove) {
    fs.rmSync(path.join(backupFolder, name), { force: true });
    fs.rmSync(path.join(backupFolder, name.replace(/\.db$/, ".salt")), { force: true });
  }
}

// Runs the migrations that the database does not have yet.
// Returns { fromVersion, toVersion, applied: [numbers], backupPath }.
export function runMigrations(sqlite, migrations, { backupFolder, saltPath, log = console.log } = {}) {
  checkMigrationList(migrations);
  const latestVersion = migrations.length;
  sqlite.exec(`PRAGMA busy_timeout = ${LOCK_WAIT_MS}`);

  const fromVersion = readSchemaVersion(sqlite);
  if (fromVersion > latestVersion) {
    throw new MigrationError(
      `This database has schema version ${fromVersion}, made by a newer CHOps version. ` +
        `This version knows schema version ${latestVersion} and cannot use it. ` +
        "Install the newer CHOps version, or restore a pre-upgrade backup from the backups folder.",
    );
  }
  if (fromVersion === latestVersion) {
    return { fromVersion, toVersion: latestVersion, applied: [], backupPath: null };
  }

  // A new, empty database has nothing to keep. An existing one is copied first.
  let backupPath = null;
  if (hasTables(sqlite) && backupFolder) {
    backupPath = backUpBeforeUpgrade({ sqlite, backupFolder, saltPath, fromVersion, toVersion: latestVersion });
    log(`  Database backup before the upgrade: ${backupPath}`);
  }

  const applied = [];
  for (const migration of migrations.slice(fromVersion)) {
    const runOne = sqlite.transaction(() => {
      // Another copy of the app may have run it while this one waited for the lock.
      if (readSchemaVersion(sqlite) >= migration.version) return false;
      migration.up(sqlite);
      writeSchemaVersion(sqlite, migration.version);
      return true;
    });
    let didRun;
    try {
      didRun = runOne.immediate();
    } catch (error) {
      const restoreHint = backupPath
        ? ` The database is as it was before this migration. A copy from before the upgrade is at ${backupPath}.`
        : " The database is as it was before this migration.";
      throw new MigrationError(`Migration ${migration.version} ("${migration.description}") failed: ${error.message}.${restoreHint}`);
    }
    if (didRun) {
      applied.push(migration.version);
      log(`  Database migration ${migration.version}: ${migration.description}`);
    }
  }
  return { fromVersion, toVersion: latestVersion, applied, backupPath };
}
