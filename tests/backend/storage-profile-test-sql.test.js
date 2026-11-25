// storage-profile-test-sql.test.js - The query of the storage profile Test button.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { testingSQLQueryCMD } from "../../src/backend/routes/storageProfiles.js";
import { isMissingFileError } from "../../src/shared/backupSql.js";

describe("testingSQLQueryCMD", () => {
  it("puts one / between the endpoint and the bucket", () => {
    const sql = testingSQLQueryCMD({
      type: "s3",
      endpoint: "https://s3.example.com",
      bucket: "backups",
      accessKeyId: "AKIA",
      accessKey: "secret",
    });
    expect(sql).toContain("'https://s3.example.com/backups/test_connection_probe'");
  });

  it("does not double the / when the endpoint ends with one", () => {
    const sql = testingSQLQueryCMD({ type: "s3", endpoint: "https://s3.example.com/", bucket: "b" });
    expect(sql).toContain("'https://s3.example.com/b/test_connection_probe'");
  });

  it("keeps a quote in a key inside the string", () => {
    const sql = testingSQLQueryCMD({ type: "gcs", bucket: "b", accessKeyId: "id", accessKey: "a'b" });
    expect(sql).toContain("'a\\'b'");
  });

  it("reads a file from the Azure container with the account key", () => {
    const sql = testingSQLQueryCMD({
      type: "azure",
      endpoint: "https://myaccount.blob.core.windows.net/",
      bucket: "backups",
      accessKeyId: "myaccount",
      accessKey: "account-key",
    });
    expect(sql).toBe(
      "SELECT 1 FROM azureBlobStorage('https://myaccount.blob.core.windows.net', 'backups', 'test_connection_probe', 'myaccount', 'account-key', 'RawBLOB', 'auto', 'data String') LIMIT 1",
    );
  });

  it("reads a file from the Azure container with a connection string", () => {
    const connectionString = "DefaultEndpointsProtocol=https;AccountName=a;AccountKey=k";
    const sql = testingSQLQueryCMD({ type: "azure", bucket: "backups", accessKey: connectionString });
    expect(sql).toBe(
      `SELECT 1 FROM azureBlobStorage('${connectionString}', 'backups', 'test_connection_probe', 'RawBLOB', 'auto', 'data String') LIMIT 1`,
    );
  });
});

describe("isMissingFileError", () => {
  it("counts a missing test file as reachable", () => {
    expect(isMissingFileError("BlobNotFound: The specified blob does not exist.")).toBe(true);
    expect(isMissingFileError("NoSuchKey")).toBe(true);
  });

  it("counts a missing container, a bad key and a connection error as failed", () => {
    expect(isMissingFileError("HTTP 404 ContainerNotFound: The specified container does not exist.")).toBe(false);
    expect(isMissingFileError("HTTP 404 NoSuchBucket")).toBe(false);
    expect(isMissingFileError("403 AuthenticationFailed")).toBe(false);
    expect(isMissingFileError("Connection refused")).toBe(false);
  });
});
