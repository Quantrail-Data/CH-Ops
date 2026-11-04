// storageProfileTest.test.js - The storage Test button of an Azure profile, through the real API.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, NODE_NAME } from "./harness.js";

const ACCOUNT_KEY = "c2VjcmV0LWF6dXJlLWFjY291bnQta2V5";
const ENDPOINT = "https://myaccount.blob.core.windows.net";
const AZURE_PROFILE = {
  id: 2001,
  name: "azure-test",
  type: "azure",
  bucket: "backups",
  endpoint: ENDPOINT,
  accessKeyId: "myaccount",
  accessKey: ACCOUNT_KEY,
};

let app;

beforeAll(async () => {
  // ClickHouse refuses the Azure read and shows the key in its error.
  app = await startServer({
    answerQuery: (query) =>
      query.sql.includes("azureBlobStorage")
        ? { status: 500, body: `Code: 499. AuthenticationFailed for key '${ACCOUNT_KEY}'` }
        : null,
  });
  const saved = await app.api("superadmin", "PUT", "/api/settings/backup_profiles", {
    value: JSON.stringify([AZURE_PROFILE]),
    category: "backups",
    dataId: AZURE_PROFILE.id,
  });
  if (saved.status !== 200) throw new Error(`Profile save failed: ${saved.text}`);
}, 30000);

afterAll(() => app?.stop());

describe("Azure storage profile", () => {
  it("stores the endpoint encrypted", () => {
    const database = app.openDatabase();
    const row = database.query("SELECT value FROM app_setting WHERE key = 'backup_profiles'").get();
    database.close();
    const [stored] = JSON.parse(row.value);
    expect(stored.endpoint.startsWith("v1:")).toBe(true);
    expect(row.value).not.toContain("myaccount.blob.core.windows.net");
  });

  it("reads the container with the decrypted endpoint, and hides the key in the error", async () => {
    const testing = await app.api("admin", "GET", `/api/storage/testing/${AZURE_PROFILE.id}`);
    expect(testing.status).toBe(201);
    app.clickHouse.requests.length = 0;

    const result = await app.api("admin", "POST", "/api/query", {
      sql: testing.json._encrypt,
      sp: true,
      clusterId: app.clusterId,
      node: NODE_NAME,
    });

    const sent = app.clickHouse.requests.filter((request) => request.sql.includes("azureBlobStorage"));
    expect(sent.length).toBe(1);
    expect(sent[0].sql).toContain(`'${ENDPOINT}', 'backups', 'test_connection_probe'`);
    expect(result.status).toBe(400);
    expect(result.json.error).toContain("AuthenticationFailed");
    expect(result.json.error).not.toContain(ACCOUNT_KEY);
    expect(result.json.error).toContain("***");
  });

  it("still reads an endpoint that an older version stored in plain text", async () => {
    const plainEndpoint = "https://127.0.0.1:10000/devstoreaccount1";
    const database = app.openDatabase();
    const row = database.query("SELECT value FROM app_setting WHERE key = 'backup_profiles'").get();
    const profiles = JSON.parse(row.value);
    profiles.push({ ...profiles[0], id: 2002, endpoint: plainEndpoint });
    database
      .query("UPDATE app_setting SET value = ? WHERE key = 'backup_profiles'")
      .run(JSON.stringify(profiles));
    database.close();

    const testing = await app.api("admin", "GET", "/api/storage/testing/2002");
    app.clickHouse.requests.length = 0;
    await app.api("admin", "POST", "/api/query", {
      sql: testing.json._encrypt,
      sp: true,
      clusterId: app.clusterId,
      node: NODE_NAME,
    });
    const sent = app.clickHouse.requests.filter((request) => request.sql.includes("azureBlobStorage"));
    expect(sent[0].sql).toContain(`'${plainEndpoint}', 'backups'`);
  });
});
