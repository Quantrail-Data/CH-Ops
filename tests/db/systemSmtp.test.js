// systemSmtp.test.js - the settings survive a save and a load
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto } from "../../src/backend/services/crypto.js";

initCrypto("system-smtp-test-secret-at-least-32-characters");

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE app_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT, updated_at TEXT
  );
`);

const db = drizzle(sqlite, { schema });

mock.module("../../src/backend/db/index.js", () => ({
  db,
  appSettings: schema.appSettings,
  alertRules: schema.alertRules,
  alertChannels: schema.alertChannels,
  alertRuleChannels: schema.alertRuleChannels,
  dashboards: schema.dashboards,
  charts: schema.charts,
  appUsers: schema.appUsers,
  clusters: schema.clusters,
  clusterNodes: schema.clusterNodes,
  k8sConnections: schema.k8sConnections,
  trustedCas: schema.trustedCas,
  rawSqlite: sqlite,
  assertDatabaseReadable: () => {},
}));

const { readStoredSmtp, saveSystemSmtp, deleteSystemSmtp } = await import(
  "../../src/backend/services/systemSmtp.js"
);

beforeEach(() => { sqlite.exec("DELETE FROM app_setting"); });

const settings = {
  host: "smtp.example.com",
  port: "587",
  secure: true,
  user: "chops@example.com",
  password: "s3cret",
  from: "CHOps <noreply@example.com>",
};

describe("system smtp storage", () => {
  it("saves and reads back every field", () => {
    saveSystemSmtp(settings);
    const r = readStoredSmtp();
    expect(r.host).toBe(settings.host);
    expect(r.port).toBe(settings.port);
    expect(r.secure).toBe(true);
    expect(r.user).toBe(settings.user);
    expect(r.from).toBe(settings.from);
  });

  it("encrypts the password at rest", () => {
    saveSystemSmtp(settings);
    const raw = sqlite.query("SELECT value FROM app_setting WHERE key = 'smtp.passwordEnc'").get();
    // The whole point. If this ever equals the plaintext, the encryption was
    // dropped somewhere.
    expect(raw.value).not.toBe("s3cret");
    expect(raw.value.length).toBeGreaterThan(10);
  });

  it("treats a blank password as unchanged", () => {
    saveSystemSmtp(settings);
    const before = sqlite.query("SELECT value FROM app_setting WHERE key = 'smtp.passwordEnc'").get();

    saveSystemSmtp({ ...settings, password: "" });
    const after = sqlite.query("SELECT value FROM app_setting WHERE key = 'smtp.passwordEnc'").get();

    // The browser cannot send the password back, so an untouched form arrives
    // empty. Clearing the stored one would lock the user out of email.
    expect(after.value).toBe(before.value);
  });

  it("returns null when nothing is configured", () => {
    expect(readStoredSmtp()).toBeNull();
  });

  it("delete removes every row", () => {
    saveSystemSmtp(settings);
    deleteSystemSmtp();
    expect(readStoredSmtp()).toBeNull();
    const left = sqlite.query("SELECT count(*) AS n FROM app_setting WHERE key LIKE 'smtp.%'").get();
    expect(left.n).toBe(0);
  });
});
