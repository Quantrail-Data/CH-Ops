// storage-profile-test-sql.test.js - The query of the storage profile Test button.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { testingSQLQueryCMD } from "../../src/backend/routes/storageProfiles.js";

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
});
