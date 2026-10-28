// legacySecrets.test.js - Secrets stored in plain text by older versions are encrypted at start.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto, encrypt, decrypt } from "../../src/backend/services/crypto.js";

initCrypto("legacy-secrets-test-secret-at-least-32-characters");

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE app_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE alert_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_test_at TEXT, last_test_ok INTEGER, last_test_error TEXT,
    last_send_at TEXT, last_send_ok INTEGER, last_send_error TEXT,
    created_at TEXT, updated_at TEXT
  );
`);
const db = drizzle(sqlite, { schema });

mock.module("../../src/backend/db/index.js", () => ({
  db,
  appSettings: schema.appSettings,
  alertChannels: schema.alertChannels,
}));

const { encryptLegacySecrets } = await import("../../src/backend/services/legacySecrets.js");

function channelConfig(name) {
  return JSON.parse(sqlite.query("SELECT config FROM alert_channel WHERE name = ?").get(name).config);
}

function backupProfiles() {
  return JSON.parse(
    sqlite.query("SELECT value FROM app_setting WHERE key = 'backup_profiles'").get().value,
  );
}

beforeEach(() => {
  sqlite.exec("DELETE FROM alert_channel; DELETE FROM app_setting;");
});

describe("encryptLegacySecrets", () => {
  it("encrypts plain channel secrets and keeps the other fields", () => {
    sqlite
      .query("INSERT INTO alert_channel (name, type, config) VALUES (?, ?, ?)")
      .run("teams", "teams", JSON.stringify({ webhook_url: "https://hooks.example.com/1" }));
    sqlite
      .query("INSERT INTO alert_channel (name, type, config) VALUES (?, ?, ?)")
      .run("slack", "slack", JSON.stringify({ bot_token: "xoxb-plain", channel_id: "C1" }));

    encryptLegacySecrets();

    const teams = channelConfig("teams");
    expect(teams.webhook_url.startsWith("v1:")).toBe(true);
    expect(decrypt(teams.webhook_url)).toBe("https://hooks.example.com/1");
    const slack = channelConfig("slack");
    expect(decrypt(slack.bot_token)).toBe("xoxb-plain");
    expect(slack.channel_id).toBe("C1");
  });

  it("does not change a secret that is already encrypted", () => {
    const encrypted = encrypt("routing-key");
    sqlite
      .query("INSERT INTO alert_channel (name, type, config) VALUES (?, ?, ?)")
      .run("pagerduty", "pagerduty", JSON.stringify({ routing_key: encrypted }));

    encryptLegacySecrets();
    encryptLegacySecrets();

    expect(channelConfig("pagerduty").routing_key).toBe(encrypted);
  });

  it("encrypts the keys of backup profiles, and the endpoint of an S3 profile", () => {
    const profiles = [
      { id: "1", type: "s3", endpoint: "https://s3.example.com", accessKeyId: "AKIA1", accessKey: "secret1", bucket: "b" },
      { id: "2", type: "gcs", endpoint: "https://storage.googleapis.com", accessKeyId: "GOOG1", accessKey: "secret2" },
    ];
    sqlite
      .query("INSERT INTO app_setting (key, value, category) VALUES ('backup_profiles', ?, 'backup')")
      .run(JSON.stringify(profiles));

    encryptLegacySecrets();

    const [s3Profile, gcsProfile] = backupProfiles();
    expect(decrypt(s3Profile.endpoint)).toBe("https://s3.example.com");
    expect(s3Profile.accessKey.startsWith("v1:")).toBe(true);
    expect(decrypt(s3Profile.accessKeyId)).toBe("AKIA1");
    expect(gcsProfile.endpoint).toBe("https://storage.googleapis.com");
    expect(decrypt(gcsProfile.accessKey)).toBe("secret2");
    expect(s3Profile.bucket).toBe("b");
  });

  it("does not stop on a channel whose settings cannot be read", () => {
    sqlite
      .query("INSERT INTO alert_channel (name, type, config) VALUES (?, ?, ?)")
      .run("broken", "teams", "not json");
    sqlite
      .query("INSERT INTO alert_channel (name, type, config) VALUES (?, ?, ?)")
      .run("teams", "teams", JSON.stringify({ webhook_url: "https://hooks.example.com/2" }));

    expect(() => encryptLegacySecrets()).not.toThrow();
    expect(channelConfig("teams").webhook_url.startsWith("v1:")).toBe(true);
  });
});
