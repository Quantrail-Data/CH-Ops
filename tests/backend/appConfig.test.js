// appConfig.test.js - unit coverage for runtime configuration settings
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as schema from "../../src/backend/db/schema.js";

let rows = [];
let existing = null;
let failReads = false;
const insertValues = mock(() => ({ run: mock(() => {}) }));
const updateSet = mock(() => ({ where: mock(() => ({ run: mock(() => {}) })) }));
const deleteRun = mock(() => {});

mock.module("../../src/backend/db/index.js", () => ({
  appSettings: schema.appSettings,
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          all: () => {
            if (failReads) throw new Error("database unavailable");
            return rows;
          },
          get: () => existing,
        }),
      }),
    }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: () => ({ run: deleteRun }) }),
  },
}));

const {
  CONFIG,
  getConfig,
  getConfigWithSources,
  invalidateConfigCache,
  resetConfig,
  setConfig,
} = await import("../../src/backend/services/appConfig.js");

const originalMaxPerUser = process.env.EXPORT_MAX_PER_USER;

beforeEach(() => {
  rows = [];
  existing = null;
  failReads = false;
  insertValues.mockClear();
  updateSet.mockClear();
  deleteRun.mockClear();
  delete process.env.EXPORT_MAX_PER_USER;
  invalidateConfigCache();
});

afterEach(() => {
  if (originalMaxPerUser === undefined) delete process.env.EXPORT_MAX_PER_USER;
  else process.env.EXPORT_MAX_PER_USER = originalMaxPerUser;
});

describe("reading configuration", () => {
  it("uses defaults and caches the loaded settings", () => {
    expect(getConfig("export.maxPerUser")).toBe(CONFIG["export.maxPerUser"].def);
    expect(getConfigWithSources()["export.maxPerUser"]).toEqual({ value: 2, source: "default" });
    expect(getConfig("missing.setting")).toBeUndefined();
  });

  it("uses environment values until a stored setting takes precedence", () => {
    process.env.EXPORT_MAX_PER_USER = "7";
    expect(getConfigWithSources()["export.maxPerUser"]).toEqual({ value: 7, source: "environment" });

    rows = [{ key: "export.maxPerUser", value: "9" }];
    invalidateConfigCache();
    expect(getConfigWithSources()["export.maxPerUser"]).toEqual({ value: 9, source: "setting" });
  });

  it("falls back to defaults for blank, invalid, or out-of-range settings", () => {
    rows = [
      { key: "export.maxPerUser", value: "" },
      { key: "export.maxConcurrent", value: "not-a-number" },
      { key: "export.warnBytes", value: "1" },
    ];
    const settings = getConfigWithSources();

    expect(settings["export.maxPerUser"]).toEqual({ value: 2, source: "setting" });
    expect(settings["export.maxConcurrent"]).toEqual({ value: 5, source: "setting" });
    expect(settings["export.warnBytes"].value).toBe(CONFIG["export.warnBytes"].def);
  });

  it("continues with defaults if settings cannot be read", () => {
    failReads = true;
    expect(getConfigWithSources()["k8s.probeTimeoutMs"]).toEqual({ value: 3000, source: "default" });
  });
});

describe("writing configuration", () => {
  it("rejects unknown, non-integer, and out-of-range values", () => {
    expect(() => setConfig("missing.setting", 1)).toThrow(/Unknown setting/);
    expect(() => setConfig("export.maxPerUser", "not-a-number")).toThrow(/whole number/);
    expect(() => setConfig("export.maxPerUser", 51)).toThrow(/between 1 and 50/);
  });

  it("inserts a valid setting and invalidates a cached value", () => {
    expect(getConfig("export.maxPerUser")).toBe(2);
    setConfig("export.maxPerUser", "8");

    expect(insertValues).toHaveBeenCalledWith({ key: "export.maxPerUser", value: "8", category: "appconfig" });
    rows = [{ key: "export.maxPerUser", value: "8" }];
    expect(getConfig("export.maxPerUser")).toBe(8);
  });

  it("updates an existing setting", () => {
    existing = { id: 12 };
    setConfig("export.maxPerUser", 6);

    expect(updateSet).toHaveBeenCalledWith({ value: "6", category: "appconfig" });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("rejects an unknown reset and deletes a known setting", () => {
    expect(() => resetConfig("missing.setting")).toThrow(/Unknown setting/);
    resetConfig("export.maxPerUser");
    expect(deleteRun).toHaveBeenCalledTimes(1);
  });
});
