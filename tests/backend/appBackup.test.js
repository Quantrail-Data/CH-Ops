// appBackup.test.js - tests the SQL of the app data backup for S3 and Azure Blob storage.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";
import { databaseModuleMock } from "../db/databaseModuleMock.js";

const mockExecuteQuery = mock();
const NODE = { name: "h1", host: "h1", port: 8123, user: "service", password: "pw" };

// A small database file to back up.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-backup-test-"));
const snapshotSource = path.join(workDir, "chops.db");
new Database(snapshotSource).close();
process.env.DB_PATH = snapshotSource;

const sqlite = new Database(":memory:");
sqlite.exec(`CREATE TABLE app_setting (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT,
  category TEXT NOT NULL DEFAULT 'general', created_at TEXT, updated_at TEXT
)`);
const testDb = drizzle(sqlite, { schema });

mock.module("../../src/backend/db/index.js", () => databaseModuleMock(testDb, sqlite));
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterNodes: () => [NODE],
  resolveTargetNode: () => NODE,
  getAllClusters: () => [],
  getClusterById: () => null,
  getNodeByName: () => null,
  getDefaultCluster: () => null,
  saveClusters: () => {},
  migrateClusterData: () => {},
  maskClusterPasswords: (cluster) => cluster,
  MAX_CLUSTERS: 3,
  MAX_TOTAL_NODES: 18,
}));
mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery: mockExecuteQuery,
  executeQueryWithBody: mock(),
}));

initCrypto("test-session-secret-minimum-32-characters-long!");
const { createAppBackup, listAppBackups } = await import("../../src/backend/services/appBackup.js");

const AZURE_KEY = "azureSecretKey123==";
sqlite
  .query("INSERT INTO app_setting (key, value, category) VALUES ('backup_profiles', ?, 'backups')")
  .run(
    JSON.stringify([
      {
        id: 1,
        name: "s3",
        type: "s3",
        bucket: "my-bucket",
        endpoint: encrypt("https://s3.example.com"),
        accessKeyId: encrypt("AKIDEXAMPLE"),
        accessKey: encrypt("s3-secret"),
      },
      {
        id: 2,
        name: "azure",
        type: "azure",
        bucket: "my-container",
        accessKeyId: encrypt("myaccount"),
        accessKey: encrypt(AZURE_KEY),
      },
    ]),
  );

const AZURE_PREFIX =
  "INSERT INTO FUNCTION azureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'chops-app-backups/";
const AZURE_SUFFIX = `', 'myaccount', '${AZURE_KEY}', 'RawBLOB', 'auto', 'data String') VALUES ('`;

function sentSql() {
  return mockExecuteQuery.mock.calls.map((call) => call[0].sql);
}

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  mockExecuteQuery.mockReset();
  mockExecuteQuery.mockResolvedValue({ rows: [], columns: [] });
});

describe("app data backup to Azure Blob storage", () => {
  test("uploads the database, the salt and the manifest with azureBlobStorage", async () => {
    const manifest = await createAppBackup("azure", "manual");
    const ts = manifest.backup_id;
    const [dbSql, saltSql, manifestSql] = sentSql();

    expect(dbSql).toStartWith(`${AZURE_PREFIX}${ts}.db${AZURE_SUFFIX}`);
    expect(saltSql).toStartWith(`${AZURE_PREFIX}${ts}.salt${AZURE_SUFFIX}`);
    expect(manifestSql).toStartWith(`${AZURE_PREFIX}${ts}.json${AZURE_SUFFIX}`);

    // The salt is stored as base64 text. After the decode it has 32 bytes, as the restore steps check.
    const saltText = saltSql.slice(`${AZURE_PREFIX}${ts}.salt${AZURE_SUFFIX}`.length, -2);
    expect(Buffer.from(saltText, "base64").length).toBe(32);

    expect(manifest.s3_path).toBe(`azure://my-container/chops-app-backups/${ts}.db`);
    expect(manifest.crypto_salt_s3_path).toBe(`azure://my-container/chops-app-backups/${ts}.salt`);
    expect(JSON.stringify(manifest)).not.toContain(AZURE_KEY);
  });

  test("masks the key when ClickHouse returns an error", async () => {
    mockExecuteQuery.mockRejectedValue(new Error(`Code: 499. azureBlobStorage(..., '${AZURE_KEY}')`));
    let message = "";
    try {
      await createAppBackup("azure", "manual");
    } catch (err) {
      message = err.message;
    }
    expect(message).toBe("Code: 499. azureBlobStorage(..., '***')");
  });

  test("lists the manifests with azureBlobStorage", async () => {
    mockExecuteQuery.mockResolvedValue({ rows: [{ data: '{"backup_id":"a"}' }] });
    const backups = await listAppBackups("azure");
    expect(backups).toEqual([{ backup_id: "a" }]);
    expect(sentSql()).toEqual([
      `SELECT data FROM azureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'chops-app-backups/*.json', 'myaccount', '${AZURE_KEY}', 'RawBLOB', 'auto', 'data String') ORDER BY _path DESC`,
    ]);
  });
});

describe("app data backup to S3", () => {
  test("keeps the S3 paths", async () => {
    await listAppBackups("s3");
    expect(sentSql()).toEqual([
      "SELECT data FROM s3('https://s3.example.com/my-bucket/chops-app-backups/*.json', 'AKIDEXAMPLE', 's3-secret', 'RawBLOB', 'data String') ORDER BY _path DESC",
    ]);
  });
});
