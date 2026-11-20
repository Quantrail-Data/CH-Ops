// migrations.test.js - Numbered database migrations: each runs one time, in a
// transaction, after a backup; an older app does not start on a newer database.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MIGRATIONS, LATEST_SCHEMA_VERSION } from "../../src/backend/db/migrations.js";
import {
  runMigrations,
  readSchemaVersion,
  checkMigrationList,
  removeOldPreUpgradeBackups,
  MigrationError,
  PRE_UPGRADE_BACKUPS_TO_KEEP,
} from "../../src/backend/db/migrationRunner.js";

const MIGRATE_SCRIPT = path.join(import.meta.dir, "../../src/backend/db/migrate.js");
// A database made by CHOps 1.4.1 (its own migrate.js), with a few rows.
const SAMPLE_1_4_1 = path.join(import.meta.dir, "fixtures/chops-1.4.1.db");

let tempDir;
let backupFolder;
let saltPath;
const quietLog = () => {};

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-migrations-"));
  backupFolder = path.join(tempDir, "backups");
  saltPath = path.join(tempDir, "crypto.salt");
  fs.writeFileSync(saltPath, Buffer.alloc(32, 7));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function openCopyOfSample() {
  const databasePath = path.join(tempDir, "chops.db");
  fs.copyFileSync(SAMPLE_1_4_1, databasePath);
  return new Database(databasePath);
}

function tableShape(sqlite) {
  const tables = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  return Object.fromEntries(
    tables.map((table) => [
      table,
      sqlite
        .query(`PRAGMA table_info(${table})`)
        .all()
        .map((column) => `${column.name} ${column.type} notnull=${column.notnull} default=${column.dflt_value}`)
        .sort(),
    ]),
  );
}

function backupFiles() {
  return fs.existsSync(backupFolder) ? fs.readdirSync(backupFolder).sort() : [];
}

describe("the migration list", () => {
  it("is numbered 1, 2, 3 ... with a description and an up function each", () => {
    expect(() => checkMigrationList(MIGRATIONS)).not.toThrow();
    expect(LATEST_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it("refuses a list with a gap in the numbers", () => {
    const list = [
      { version: 1, description: "one", up: () => {} },
      { version: 3, description: "three", up: () => {} },
    ];
    expect(() => checkMigrationList(list)).toThrow(MigrationError);
  });
});

describe("a new database", () => {
  it("gets all migrations and no backup", () => {
    const sqlite = new Database(path.join(tempDir, "chops.db"));
    const result = runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog });
    expect(result.fromVersion).toBe(0);
    expect(readSchemaVersion(sqlite)).toBe(LATEST_SCHEMA_VERSION);
    expect(result.backupPath).toBeNull();
    expect(backupFiles()).toEqual([]);
    sqlite.close();
  });
});

describe("an upgrade from CHOps 1.4.1", () => {
  it("keeps the data, adds the new columns and saves the number", () => {
    const sqlite = openCopyOfSample();
    runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog });
    expect(readSchemaVersion(sqlite)).toBe(LATEST_SCHEMA_VERSION);
    expect(sqlite.query("SELECT name FROM alert_rule").get().name).toBe("Too many parts");
    expect(sqlite.query("SELECT count(*) AS total FROM chart").get().total).toBe(1);
    const chatColumns = sqlite.query("PRAGMA table_info(ai_chat_message)").all().map((column) => column.name);
    expect(chatColumns).toContain("chart_name");
    // The old shared bookmarks list is removed (one time).
    expect(sqlite.query("SELECT count(*) AS total FROM app_setting WHERE key = 'query_bookmarks'").get().total).toBe(0);
    sqlite.close();
  });

  it("makes a backup of the database and the salt before the first migration", () => {
    const sqlite = openCopyOfSample();
    const result = runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog });
    expect(result.backupPath).toContain(`pre-upgrade-schema-0-to-${LATEST_SCHEMA_VERSION}-`);
    const files = backupFiles();
    expect(files.filter((name) => name.endsWith(".db"))).toHaveLength(1);
    expect(files.filter((name) => name.endsWith(".salt"))).toHaveLength(1);
    // The backup is the database as it was: number 0, data present.
    const backup = new Database(result.backupPath, { readonly: true });
    expect(readSchemaVersion(backup)).toBe(0);
    expect(backup.query("SELECT count(*) AS total FROM app_setting WHERE key = 'query_bookmarks'").get().total).toBe(1);
    backup.close();
    sqlite.close();
  });

  it("gives the same tables and columns as a new install", () => {
    const upgraded = openCopyOfSample();
    runMigrations(upgraded, MIGRATIONS, { backupFolder, saltPath, log: quietLog });
    // migrate.js makes the cluster tables after the numbered migrations, so
    // run the real script for both.
    upgraded.close();
    const freshPath = path.join(tempDir, "fresh.db");
    runMigrateScript(freshPath);
    runMigrateScript(path.join(tempDir, "chops.db"));
    const fresh = new Database(freshPath, { readonly: true });
    const again = new Database(path.join(tempDir, "chops.db"), { readonly: true });
    expect(tableShape(again)).toEqual(tableShape(fresh));
    fresh.close();
    again.close();
  });
});

describe("a second start", () => {
  it("runs nothing and makes no new backup", () => {
    const sqlite = openCopyOfSample();
    runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog });
    const filesAfterUpgrade = backupFiles();
    const second = runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog });
    expect(second.applied).toEqual([]);
    expect(backupFiles()).toEqual(filesAfterUpgrade);
    sqlite.close();
  });
});

describe("a failed migration", () => {
  it("leaves the database as it was, keeps the number and stops with a clear message", () => {
    const sqlite = openCopyOfSample();
    runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog });
    const brokenList = [
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        description: "Add a column, then fail",
        up: (database) => {
          database.exec("ALTER TABLE alert_rule ADD COLUMN half_done TEXT");
          database.exec("SELECT * FROM a_table_that_does_not_exist");
        },
      },
    ];
    let error;
    try {
      runMigrations(sqlite, brokenList, { backupFolder, saltPath, log: quietLog });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MigrationError);
    expect(error.message).toContain(`Migration ${MIGRATIONS.length + 1} ("Add a column, then fail") failed`);
    expect(error.message).toContain("pre-upgrade-schema-");
    expect(readSchemaVersion(sqlite)).toBe(LATEST_SCHEMA_VERSION);
    const columns = sqlite.query("PRAGMA table_info(alert_rule)").all().map((column) => column.name);
    expect(columns).not.toContain("half_done");
    sqlite.close();
  });

  it("does not hide a real error in migration 1", () => {
    // alert_rule is a view here, so ADD COLUMN fails with a real error.
    const sqlite = new Database(path.join(tempDir, "chops.db"));
    sqlite.exec("CREATE TABLE app_setting (id INTEGER PRIMARY KEY, key TEXT UNIQUE, value TEXT)");
    sqlite.exec("CREATE VIEW alert_rule AS SELECT 1 AS id");
    expect(() => runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog })).toThrow(MigrationError);
    expect(readSchemaVersion(sqlite)).toBe(0);
    sqlite.close();
  });
});

describe("an older app on a newer database", () => {
  it("does not start and does not change the database", () => {
    const sqlite = openCopyOfSample();
    sqlite.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    expect(() => runMigrations(sqlite, MIGRATIONS, { backupFolder, saltPath, log: quietLog })).toThrow(
      /made by a newer CHOps version/,
    );
    expect(readSchemaVersion(sqlite)).toBe(LATEST_SCHEMA_VERSION + 1);
    expect(backupFiles()).toEqual([]);
    sqlite.close();
  });
});

describe("old pre-upgrade backups", () => {
  it(`keeps the newest ${PRE_UPGRADE_BACKUPS_TO_KEEP} and never removes other backups`, () => {
    fs.mkdirSync(backupFolder, { recursive: true });
    for (let day = 1; day <= 7; day++) {
      const name = `pre-upgrade-schema-0-to-1-2026-11-0${day}T10-00-00-000`;
      fs.writeFileSync(path.join(backupFolder, `${name}.db`), "x");
      fs.writeFileSync(path.join(backupFolder, `${name}.salt`), "x");
    }
    fs.writeFileSync(path.join(backupFolder, "chops-2026-11-01T10-00-00-000.db"), "manual");
    removeOldPreUpgradeBackups(backupFolder);
    const files = backupFiles();
    expect(files.filter((name) => name.startsWith("pre-upgrade-") && name.endsWith(".db"))).toHaveLength(PRE_UPGRADE_BACKUPS_TO_KEEP);
    expect(files).not.toContain("pre-upgrade-schema-0-to-1-2026-11-01T10-00-00-000.db");
    expect(files).not.toContain("pre-upgrade-schema-0-to-1-2026-11-01T10-00-00-000.salt");
    expect(files).toContain("pre-upgrade-schema-0-to-1-2026-11-07T10-00-00-000.db");
    expect(files).toContain("chops-2026-11-01T10-00-00-000.db");
  });
});

describe("two starts at the same time", () => {
  it("run each migration only one time", async () => {
    const databasePath = path.join(tempDir, "chops.db");
    fs.copyFileSync(SAMPLE_1_4_1, databasePath);
    const startOne = () =>
      Bun.spawn([process.execPath, MIGRATE_SCRIPT], { cwd: tempDir, env: migrateEnvironment(databasePath), stdout: "pipe", stderr: "pipe" });
    const first = startOne();
    const second = startOne();
    const [firstOutput, secondOutput] = await Promise.all([new Response(first.stdout).text(), new Response(second.stdout).text()]);
    await Promise.all([first.exited, second.exited]);
    const errors = (await new Response(first.stderr).text()) + (await new Response(second.stderr).text());
    expect(errors).toBe("");
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    const runs = (firstOutput + secondOutput).match(/Database migration 1:/g) || [];
    expect(runs).toHaveLength(1);
    const sqlite = new Database(databasePath, { readonly: true });
    expect(readSchemaVersion(sqlite)).toBe(LATEST_SCHEMA_VERSION);
    sqlite.close();
  });
});

function migrateEnvironment(databasePath) {
  return {
    ...process.env,
    DB_PATH: databasePath,
    SUPER_ADMIN_1: "test-admin",
    SUPER_ADMIN_1_PASSWORD: "test-password-123",
    SUPER_ADMIN_1_EMAIL: "admin@example.com",
    ENCRYPTION_SECRET: "test-encryption-secret-at-least-32-characters",
  };
}

function runMigrateScript(databasePath) {
  const result = Bun.spawnSync([process.execPath, MIGRATE_SCRIPT], { cwd: tempDir, env: migrateEnvironment(databasePath) });
  if (result.exitCode !== 0) throw new Error(`migrate.js failed: ${result.stderr.toString()}`);
}
