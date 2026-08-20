// appConfig.test.js - which value wins, and what is refused
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
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
  getConfig,
  getConfigWithSources,
  setConfig,
  resetConfig,
  invalidateConfigCache,
} = await import("../../src/backend/services/appConfig.js");

beforeEach(() => {
  sqlite.exec("DELETE FROM app_setting");
  invalidateConfigCache();
  delete process.env.EXPORT_MAX_PER_USER;
});

describe("which value wins", () => {
  it("the built-in default when nothing is set", () => {
    expect(getConfig("export.maxPerUser")).toBe(2);
    expect(getConfigWithSources()["export.maxPerUser"].source).toBe("default");
  });

  it("the environment variable when there is one", () => {
    process.env.EXPORT_MAX_PER_USER = "7";
    invalidateConfigCache();
    expect(getConfig("export.maxPerUser")).toBe(7);
    expect(getConfigWithSources()["export.maxPerUser"].source).toBe("environment");
  });

  it("a stored setting beats the environment", () => {
    process.env.EXPORT_MAX_PER_USER = "7";
    setConfig("export.maxPerUser", 9);
    expect(getConfig("export.maxPerUser")).toBe(9);
    expect(getConfigWithSources()["export.maxPerUser"].source).toBe("setting");
  });

  it("an out of range environment value is ignored", () => {

    process.env.EXPORT_MAX_PER_USER = "99999";
    invalidateConfigCache();
    expect(getConfig("export.maxPerUser")).toBe(2);
  });
});

describe("changing a setting", () => {
  it("applies immediately, with no restart", () => {

    expect(getConfig("export.maxPerUser")).toBe(2);
    setConfig("export.maxPerUser", 4);
    expect(getConfig("export.maxPerUser")).toBe(4);
  });

  it("reset removes the row rather than storing the default", () => {

    setConfig("export.maxPerUser", 9);
    resetConfig("export.maxPerUser");

    expect(getConfig("export.maxPerUser")).toBe(2);
    expect(sqlite.query("SELECT count(*) AS n FROM app_setting").get().n).toBe(0);
  });
});

describe("what is refused", () => {
  it("below the minimum", () => {
    expect(() => setConfig("export.maxPerUser", 0)).toThrow(/between/);
  });

  it("above the maximum", () => {
    expect(() => setConfig("export.maxPerUser", 999)).toThrow(/between/);
  });

  it("anything that is not a whole number", () => {
    expect(() => setConfig("export.maxPerUser", "abc")).toThrow(/whole number/);
  });

  it("a setting name that does not exist", () => {
    expect(() => setConfig("export.nonsense", 1)).toThrow(/Unknown/);
  });
});

describe("the export code reads the setting each time", () => {
  it("does not capture the value when the file loads", async () => {
    const src = await Bun.file("src/backend/services/exportJobs.js").text();

    expect(src).not.toContain("loadEnv().exportCfg;");
    expect(src).toContain("getConfig('export.maxPerUser')");
  });
});

describe("safety", () => {
  it("returns the default rather than throwing when the table is unreadable", () => {

    sqlite.exec("DROP TABLE app_setting");
    invalidateConfigCache();

    expect(getConfig("export.maxPerUser")).toBe(2);

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