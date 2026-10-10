// appUserMigration.test.js - The app_user table survives repeated starts.
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const MIGRATE_SCRIPT = path.join(
  import.meta.dir,
  "../../src/backend/db/migrate.js",
);
// The app_user table as older versions created it, before password_hash became optional.
const OLD_APP_USER_TABLE = `CREATE TABLE app_user (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT NOT NULL UNIQUE,
password_hash TEXT NOT NULL,
role TEXT NOT NULL DEFAULT 'readonly',
email TEXT UNIQUE,
must_change_password INTEGER NOT NULL DEFAULT 1,
last_login_at TEXT,
created_at TEXT DEFAULT (datetime('now')),
updated_at TEXT DEFAULT (datetime('now'))
)`;
// The table name an interrupted rebuild in an older version leaves behind.
const LEFTOVER_TABLE = `CREATE TABLE app_user_new (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT NOT NULL UNIQUE,
password_hash TEXT,
role TEXT NOT NULL DEFAULT 'readonly',
email TEXT UNIQUE,
must_change_password INTEGER NOT NULL DEFAULT 1,
last_login_at TEXT,
created_at TEXT DEFAULT (datetime('now')),
updated_at TEXT DEFAULT (datetime('now')),
init_user INTEGER NOT NULL DEFAULT 0,
password_setup_token_hash TEXT DEFAULT NULL,
password_setup_token_expires_at TEXT DEFAULT NULL
)`;
let tempDir;
let dbPath;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-migrate-"));
  dbPath = path.join(tempDir, "chops.db");
});
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
// Runs the real migration script, the same way server.js does on every start.
function runMigration() {
  const result = Bun.spawnSync([process.execPath, MIGRATE_SCRIPT], {
    cwd: tempDir,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      SUPER_ADMIN_1: "test-admin",
      SUPER_ADMIN_1_PASSWORD: "test-password-123",
      SUPER_ADMIN_1_EMAIL: "admin@example.com",
      ENCRYPTION_SECRET: "test-encryption-secret-at-least-32-characters",
    },
  });
  if (result.exitCode !== 0) {
    throw new Error(`migrate.js failed: ${result.stderr.toString()}`);
  }
}
function withDatabase(work) {
  const database = new Database(dbPath);
  try {
    return work(database);
  } finally {
    database.close();
  }
}
function seedOldDatabase() {
  withDatabase((database) => {
    database.exec(OLD_APP_USER_TABLE);
    database.exec(`INSERT INTO app_user (username, password_hash, role,
email, must_change_password, created_at)
VALUES ('alice', 'hash-a', 'admin', 'alice@example.com', 0, '2026-01-01 10:00:00'),
('bob', 'hash-b', 'editor', 'bob@example.com', 1, '2026-02-01 10:00:00')`);
  });
}
function appUserColumns(database) {
  return database.query("PRAGMA table_info(app_user)").all();
}
function tableExists(database, tableName) {
  return !!database
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name =?")
    .get(tableName);
}
describe("app_user migration", () => {
  it("rebuilds an old table once and keeps every user and field", () => {
    seedOldDatabase();
    runMigration();
    withDatabase((database) => {
      const columns = appUserColumns(database);
      const passwordColumn = columns.find((c) => c.name === "password_hash");
      expect(passwordColumn.notnull).toBe(0);
      expect(columns.map((c) => c.name)).toContain("password_setup_token_hash");
      expect(columns.map((c) => c.name)).toContain(
        "password_setup_token_expires_at",
      );
      const users = database
        .query(
          "SELECT username, password_hash, role, email,must_change_password, created_at FROM app_user ORDER BY id",
        )
        .all();
      expect(users).toEqual([
        {
          username: "alice",
          password_hash: "hash-a",
          role: "admin",
          email: "alice@example.com",
          must_change_password: 0,
          created_at: "2026-01-01 10:00:00",
        },
        {
          username: "bob",
          password_hash: "hash-b",
          role: "editor",
          email: "bob@example.com",
          must_change_password: 1,
          created_at: "2026-02-01 10:00:00",
        },
      ]);
    });
  });
  it("keeps a pending password setup link across a restart", () => {
    seedOldDatabase();
    runMigration();
    withDatabase((database) => {
      database.exec(`INSERT INTO app_user (username, password_hash, role,
email, password_setup_token_hash, password_setup_token_expires_at)
VALUES ('carol', NULL, 'readonly', 'carol@example.com', 'token-hash-c', '2026-10-10 12:30:00')`);
    });
    runMigration();
    withDatabase((database) => {
      const carol = database
        .query(
          "SELECT password_setup_token_hash,password_setup_token_expires_at FROM app_user WHERE username = 'carol'",
        )
        .get();
      expect(carol.password_setup_token_hash).toBe("token-hash-c");
      expect(carol.password_setup_token_expires_at).toBe("2026-10-10 12:30:00");
    });
  });
  it("does not give a deleted user's id to the next new user", () => {
    runMigration();
    withDatabase((database) => {
      database.exec(`INSERT INTO app_user (username, role, email)
VALUES ('dave', 'readonly', 'dave@example.com'), ('erin',
'readonly', 'erin@example.com')`);
      database.exec("DELETE FROM app_user WHERE username = 'erin'");
    });
    runMigration();
    withDatabase((database) => {
      database.exec(
        "INSERT INTO app_user (username, role, email) VALUES ('frank','readonly', 'frank@example.com')",
      );
      const highestId = database
        .query("SELECT max(id) AS id FROM app_user WHERE username !='frank'")
        .get().id;
      const frankId = database
        .query("SELECT id FROM app_user WHERE username = 'frank'")
        .get().id;
      // erin had highestId + 1, so frank must get a higher id than that.
      expect(frankId).toBe(highestId + 2);
    });
  });
  it("creates the final table shape on a fresh database", () => {
    runMigration();
    withDatabase((database) => {
      const columns = appUserColumns(database);
      expect(columns.find((c) => c.name === "password_hash").notnull).toBe(0);
      expect(columns.map((c) => c.name)).toContain("init_user");
      expect(columns.map((c) => c.name)).toContain("password_setup_token_hash");
      expect(tableExists(database, "app_user_new")).toBe(false);
    });
  });
  it("puts users back when an older version stopped between drop and rename", () => {
    withDatabase((database) => {
      database.exec(LEFTOVER_TABLE);
      database.exec(`INSERT INTO app_user_new (username, password_hash,
role, email)
VALUES ('alice', 'hash-a', 'admin', 'alice@example.com')`);
    });
    runMigration();
    withDatabase((database) => {
      expect(tableExists(database, "app_user_new")).toBe(false);
      const usernames = database
        .query("SELECT username FROM app_user ORDER BY id")
        .all()
        .map((row) => row.username);
      expect(usernames).toContain("alice");
    });
  });
  it("keeps the real table when an older version left a partial copy", () => {
    seedOldDatabase();
    withDatabase((database) => {
      database.exec(LEFTOVER_TABLE);
      database.exec(`INSERT INTO app_user_new (id, username, password_hash,
role, email)
VALUES (1, 'alice', 'hash-a', 'admin', 'alice@example.com')`);
    });
    runMigration();
    withDatabase((database) => {
      expect(tableExists(database, "app_user_new")).toBe(false);
      const usernames = database
        .query("SELECT username FROM app_user ORDER BY id")
        .all()
        .map((row) => row.username);
      expect(usernames).toEqual(["alice", "bob"]);
    });
  });
});
