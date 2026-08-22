// jwtKeys.test.js - the keys that sign login tokens
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import jwt from "jsonwebtoken";
import * as schema from "../../src/backend/db/schema.js";

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
  clusters: schema.clusters,
  clusterNodes: schema.clusterNodes,
  trustedCas: schema.trustedCas,
  rawSqlite: sqlite,
}));

const {
  signingKey,
  readingKeys,
  signEverybodyOut,
  invalidateKeyCache,
} = await import("../../src/backend/services/jwtKeys.js");

const { create, verify } = await import("../../src/backend/services/jwt.js");


function makeKeysOld(hours) {
  const when = Date.now() - hours * 60 * 60 * 1000;
  sqlite.query("UPDATE app_setting SET value = ? WHERE key = 'jwt.rotatedAt'")
    .run(String(when));
  invalidateKeyCache();
}

beforeEach(() => {
  sqlite.exec("DELETE FROM app_setting");
  invalidateKeyCache();
});

describe("making the keys", () => {
  it("makes one the first time it is needed", () => {
    const key = signingKey();
    expect(typeof key).toBe("string");
    expect(key.length).toBe(64);
  });

  it("keeps the key it made", () => {

    const first = signingKey();
    invalidateKeyCache();
    expect(signingKey()).toBe(first);
  });

  it("writes the key to the database", () => {
    signingKey();
    const row = sqlite
      .query("SELECT value FROM app_setting WHERE key = 'jwt.currentSecret'")
      .get();
    expect(row.value.length).toBe(64);
  });

  it("has one key to read with at the start", () => {
    signingKey();
    expect(readingKeys().length).toBe(1);
  });
});

describe("changing the keys", () => {
  it("does not change them before a day has passed", () => {
    const first = signingKey();
    makeKeysOld(23);
    expect(signingKey()).toBe(first);
  });

  it("changes them after a day", () => {
    const first = signingKey();
    makeKeysOld(25);

    const second = signingKey();
    expect(second).not.toBe(first);
  });

  it("keeps the old key to read with", () => {
    const first = signingKey();
    makeKeysOld(25);
    signingKey();


    expect(readingKeys()).toContain(first);
    expect(readingKeys().length).toBe(2);
  });
});

describe("tokens when the keys change", () => {
  it("a token made before the change is still read", () => {
    const token = create({ sub: "alice" });
    makeKeysOld(25);
    signingKey();

    expect(verify(token).sub).toBe("alice");
  });

  it("a token made after the change is read", () => {
    makeKeysOld(25);
    const token = create({ sub: "bob" });
    expect(verify(token).sub).toBe("bob");
  });

  it("a token is refused after two changes", () => {

    const token = create({ sub: "alice" });
    makeKeysOld(25);
    signingKey();
    makeKeysOld(25);
    signingKey();

    expect(() => verify(token)).toThrow();
  });

  it("a token signed with a key of its own is refused", () => {

    const token = jwt.sign({ sub: "mallory" }, "a key that is not ours", {
      expiresIn: "2h",
    });
    expect(() => verify(token)).toThrow();
  });
});

describe("signing everybody out", () => {
  it("refuses every token that was made before", () => {
    const token = create({ sub: "alice" });

    signEverybodyOut();

    expect(() => verify(token)).toThrow();
  });

  it("keeps no old key, unlike the daily change", () => {
    signingKey();
    signEverybodyOut();
    expect(readingKeys().length).toBe(1);
  });

  it("lets a new token be made at once", () => {
    signEverybodyOut();
    const token = create({ sub: "alice" });
    expect(verify(token).sub).toBe("alice");
  });
});

describe("a database that cannot be read", () => {
  it("still makes a key, and does not throw", () => {
    sqlite.exec("DROP TABLE app_setting");
    invalidateKeyCache();

    expect(() => signingKey()).not.toThrow();
    expect(typeof signingKey()).toBe("string");

    sqlite.exec(`
      CREATE TABLE app_setting (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        created_at TEXT, updated_at TEXT
      );
    `);
  });
});