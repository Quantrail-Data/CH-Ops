// backupSql.test.js - tests the SQL that the backup pages build for S3, GCS and Azure Blob storage.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, test, expect } from "bun:test";
import {
  storageFromProfile,
  previewStorage,
  checkBackupRequest,
  buildBackupSql,
  makeBackupId,
  makeManifest,
  manifestInsertSql,
  manifestScanSql,
  rawBlobFunction,
  insertFileSql,
  checkScanPattern,
  hideSecrets,
  parseSettings,
} from "../../src/shared/backupSql.js";

const S3_PROFILE = {
  type: "s3",
  bucket: "my-bucket",
  endpoint: "https://s3.example.com/",
  accessKeyId: "AKIDEXAMPLE",
  accessKey: "s3-secret",
};
const AZURE_KEY_PROFILE = {
  type: "azure",
  bucket: "my-container",
  accessKeyId: "myaccount",
  accessKey: "azureKey123==",
};
const AZURE_CONNECTION_PROFILE = {
  type: "azure",
  bucket: "my-container",
  accessKeyId: "",
  accessKey: "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=azureKey123==;EndpointSuffix=core.windows.net",
};

function backupOf(fields) {
  return checkBackupRequest({ action: "backup", scope: "all", ...fields });
}

describe("storage destinations", () => {
  test("S3 joins the endpoint and the bucket with one slash", () => {
    const storage = storageFromProfile(S3_PROFILE);
    const sql = buildBackupSql(backupOf({}), storage, "manual/ALL/MANUAL_ALL__1");
    expect(sql).toBe(
      "BACKUP ALL TO S3('https://s3.example.com/my-bucket/backups/manual/ALL/MANUAL_ALL__1/', 'AKIDEXAMPLE', 's3-secret')",
    );
  });

  test("GCS uses the Google endpoint", () => {
    const storage = storageFromProfile({ ...S3_PROFILE, type: "gcs" });
    expect(rawBlobFunction(storage, "a.json")).toBe(
      "s3('https://storage.googleapis.com/my-bucket/a.json', 'AKIDEXAMPLE', 's3-secret', 'RawBLOB', 'data String')",
    );
  });

  test("Azure with an account key uses the URL form with five arguments", () => {
    const storage = storageFromProfile(AZURE_KEY_PROFILE);
    const sql = buildBackupSql(backupOf({}), storage, "manual/ALL/MANUAL_ALL__1");
    expect(sql).toBe(
      "BACKUP ALL TO AzureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'backups/manual/ALL/MANUAL_ALL__1/', 'myaccount', 'azureKey123==')",
    );
  });

  test("Azure uses the endpoint of the profile when it has one", () => {
    const storage = storageFromProfile({ ...AZURE_KEY_PROFILE, endpoint: "http://127.0.0.1:10000/devstoreaccount1/" });
    expect(storage.url).toBe("http://127.0.0.1:10000/devstoreaccount1");
  });

  test("Azure with a connection string uses three arguments", () => {
    const storage = storageFromProfile(AZURE_CONNECTION_PROFILE);
    const sql = buildBackupSql(
      checkBackupRequest({ action: "restore", scope: "database", database: "sales", backupId: "manual/DATABASE/sales/MANUAL_sales__1" }),
      storage,
      "manual/DATABASE/sales/MANUAL_sales__1",
    );
    expect(sql).toBe(
      `RESTORE DATABASE sales FROM AzureBlobStorage('${AZURE_CONNECTION_PROFILE.accessKey}', 'my-container', 'backups/manual/DATABASE/sales/MANUAL_sales__1/')`,
    );
  });

  test("the azureBlobStorage table function follows the documented argument order", () => {
    expect(rawBlobFunction(storageFromProfile(AZURE_KEY_PROFILE), "chops-app-backups/*.json")).toBe(
      "azureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'chops-app-backups/*.json', 'myaccount', 'azureKey123==', 'RawBLOB', 'auto', 'data String')",
    );
    expect(rawBlobFunction(storageFromProfile(AZURE_CONNECTION_PROFILE), "x.json")).toBe(
      `azureBlobStorage('${AZURE_CONNECTION_PROFILE.accessKey}', 'my-container', 'x.json', 'RawBLOB', 'auto', 'data String')`,
    );
  });

  test("Azure manifests are written and scanned with azureBlobStorage", () => {
    const storage = storageFromProfile(AZURE_KEY_PROFILE);
    const clean = backupOf({});
    const manifest = makeManifest(clean, "manual/ALL/MANUAL_ALL__1", storage, new Date("2026-01-01T00:00:00Z"));
    expect(manifest.s3_path).toBe("azure://my-container/backups/manual/ALL/MANUAL_ALL__1/");
    expect(JSON.stringify(manifest)).not.toContain("azureKey123");
    expect(manifestInsertSql(storage, manifest)).toStartWith(
      "INSERT INTO FUNCTION azureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'backups/manual/ALL/MANUAL_ALL__1/manifest.json', 'myaccount', 'azureKey123==', 'RawBLOB', 'auto', 'data String') VALUES ('{",
    );
    expect(manifestScanSql(storage, "manual/ALL/*/manifest.json")).toBe(
      "SELECT _path, data FROM azureBlobStorage('https://myaccount.blob.core.windows.net', 'my-container', 'backups/manual/ALL/*/manifest.json', 'myaccount', 'azureKey123==', 'RawBLOB', 'auto', 'data String') LIMIT 500",
    );
  });

  test("a quote in a key cannot end the string", () => {
    const storage = storageFromProfile({ ...S3_PROFILE, accessKey: "a'b\\c" });
    expect(insertFileSql(storage, "f", "x")).toContain("'a\\'b\\\\c'");
  });
});

describe("the preview", () => {
  test("masks the keys for every storage type", () => {
    for (const profile of [S3_PROFILE, { ...S3_PROFILE, type: "gcs" }, AZURE_KEY_PROFILE]) {
      const sql = buildBackupSql(backupOf({}), previewStorage(profile), "manual/ALL/MANUAL_ALL__1");
      expect(sql).not.toContain("s3-secret");
      expect(sql).not.toContain("azureKey123");
      expect(sql).toContain("'***'");
    }
  });

  test("shows the Azure destination with placeholders", () => {
    const sql = buildBackupSql(backupOf({}), previewStorage(AZURE_KEY_PROFILE), "manual/ALL/MANUAL_ALL__1");
    expect(sql).toBe(
      "BACKUP ALL TO AzureBlobStorage('<connection string or URL>', 'my-container', 'backups/manual/ALL/MANUAL_ALL__1/', '<account name>', '***')",
    );
  });
});

describe("hideSecrets", () => {
  test("masks the Azure key and the connection string in an error message", () => {
    const storage = storageFromProfile(AZURE_CONNECTION_PROFILE);
    const message = `Code: 36. Bad arguments azureBlobStorage('${AZURE_CONNECTION_PROFILE.accessKey}')`;
    const hidden = hideSecrets(message, storage);
    expect(hidden).not.toContain("azureKey123");
    expect(hidden).toContain("***");
  });

  test("masks an AccountKey part that differs from the stored text", () => {
    const hidden = hideSecrets("failed: AccountKey=otherKey==;EndpointSuffix=x", storageFromProfile(AZURE_KEY_PROFILE));
    expect(hidden).toBe("failed: AccountKey=***;EndpointSuffix=x");
  });

  test("masks the account key of the URL form and the S3 keys", () => {
    expect(hideSecrets("key azureKey123== here", storageFromProfile(AZURE_KEY_PROFILE))).toBe("key *** here");
    expect(hideSecrets("s3-secret AKIDEXAMPLE", storageFromProfile(S3_PROFILE))).toBe("*** ***");
  });
});

describe("the full statement", () => {
  test("puts every clause in the documented order", () => {
    const clean = checkBackupRequest({
      action: "backup",
      scope: "all",
      exceptTables: ["db1.t1", "t2"],
      exceptDatabases: "system, logs",
      onCluster: "main-cluster",
      async: true,
      baseBackup: "manual/ALL/MANUAL_ALL__0",
      settings: "compression_method = 'lz4', compression_level = 3",
    });
    const sql = buildBackupSql(clean, previewStorage(S3_PROFILE), "manual/ALL/MANUAL_ALL__1");
    expect(sql).toBe(
      "BACKUP ALL EXCEPT TABLES db1.t1, t2 EXCEPT DATABASES system, logs ON CLUSTER 'main-cluster' TO " +
        "S3('<endpoint>/my-bucket/backups/manual/ALL/MANUAL_ALL__1/', '<accessKeyId>', '***') " +
        "SETTINGS compression_method = 'lz4', compression_level = 3, " +
        "base_backup = S3('<endpoint>/my-bucket/backups/manual/ALL/MANUAL_ALL__0/', '<accessKeyId>', '***') ASYNC",
    );
  });

  test("builds the table scope and its backup ID", () => {
    const clean = backupOf({ scope: "table", database: "db1", table: "events" });
    const backupId = makeBackupId(clean.scope, clean.database, clean.table, "2026_01_01_00_00_00");
    expect(backupId).toBe("manual/TABLE/db1.events/MANUAL_db1.events__2026_01_01_00_00_00");
    expect(buildBackupSql(clean, previewStorage(S3_PROFILE), backupId)).toStartWith("BACKUP TABLE db1.events TO S3(");
  });
});

describe("checkBackupRequest refuses unsafe fields", () => {
  const bad = [
    ["an unknown action", { action: "drop" }],
    ["an unknown scope", { scope: "everything" }],
    ["SQL in the database name", { scope: "database", database: "x; DROP TABLE y" }],
    ["a quote in the table name", { scope: "table", database: "db", table: "t'" }],
    ["a quote in the cluster name", { onCluster: "c' SETTINGS x" }],
    ["SQL in an EXCEPT TABLES entry", { exceptTables: ["t) TO S3('http://evil/'"] }],
    ["EXCEPT TABLES for a table backup", { scope: "table", database: "db", table: "t", exceptTables: ["t2"] }],
    ["EXCEPT DATABASES for a database backup", { scope: "database", database: "db", exceptDatabases: ["d2"] }],
    ["a parent folder in the base backup", { baseBackup: "../other" }],
    ["a quote in the base backup", { baseBackup: "a'b" }],
    ["base_backup in SETTINGS", { settings: "base_backup = S3('http://evil/', 'a', 'b')" }],
    ["a function in a setting value", { settings: "compression_level = (SELECT 1)" }],
    ["a setting without a value", { settings: "compression_level" }],
    ["a bad setting name", { settings: "a-b = 1" }],
    ["a quote inside a quoted value", { settings: "compression_method = 'a', b = 'c'd'" }],
  ];
  for (const [label, fields] of bad) {
    test(label, () => {
      expect(() => backupOf(fields)).toThrow();
    });
  }

  test("a restore needs a safe backup ID", () => {
    expect(() => checkBackupRequest({ action: "restore", scope: "all" })).toThrow();
    expect(() => checkBackupRequest({ action: "restore", scope: "all", backupId: "/etc/x" })).toThrow();
    expect(checkBackupRequest({ action: "restore", scope: "all", backupId: "manual/ALL/MANUAL_ALL__1" }).backupId).toBe(
      "manual/ALL/MANUAL_ALL__1",
    );
  });

  test("parseSettings keeps simple pairs", () => {
    expect(parseSettings("a = 1, b = true, c = 'x-y.z', d = -2.5")).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "true" },
      { name: "c", value: "'x-y.z'" },
      { name: "d", value: "-2.5" },
    ]);
  });
});

describe("checkScanPattern", () => {
  test("accepts a manifest glob", () => {
    expect(checkScanPattern("manual/TABLE/db1.*/*/manifest.json")).toBe("manual/TABLE/db1.*/*/manifest.json");
  });

  test("refuses other files, parent folders and quotes", () => {
    for (const pattern of ["manual/x.db", "../manifest.json", "a'/manifest.json", "a/**/../manifest.json", ""]) {
      expect(() => checkScanPattern(pattern)).toThrow();
    }
  });
});
