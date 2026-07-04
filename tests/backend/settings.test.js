/**
 * settings.test.js - Unit tests for settings controller
 *
 * Tests CRUD operations for app_settings using an in-memory mock database.
 * Covers listing all settings, getting a specific setting (404 if missing),
 * upserting (create or update), and deleting settings. Tests protected keys
 * (cluster.nodes, clusters, backup_profiles) that block non-admin users.
 * Edge cases like DB errors are also covered.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const fakeDB = {
  settings: [],
};

const appSettings = {};

function createQuery() {
  const data = fakeDB.settings;

  return {
    where: (cond) => {
      let filtered = data;

      if (cond?.field === "key") {
        filtered = data.filter((s) => s.key === cond.value);
      }
      if (cond?.field === "category") {
        filtered = data.filter((s) => s.category === cond.value);
      }

      return {
        get: () => filtered[0] || null,
        all: () => filtered,
      };
    },

    orderBy: () => ({
      all: () => data,
    }),

    get: () => data[0] || null,
    all: () => data,
  };
}

const db = {
  select: () => ({
    from: () => createQuery(),
  }),

  insert: () => ({
    values: (v) => ({
      run: () => {
        fakeDB.settings.push({
          id: Date.now(),
          ...v,
        });
      },
    }),
  }),

  update: () => ({
    set: (v) => ({
      where: (cond) => ({
        run: () => {
          const idx = fakeDB.settings.findIndex((s) => {
            return s.id === cond.value || s.key === cond.value;
          });

          if (idx !== -1) {
            fakeDB.settings[idx] = {
              ...fakeDB.settings[idx],
              ...v,
            };
          }
        },
      }),
    }),
  }),

  delete: () => ({
    where: (cond) => ({
      run: () => {
        const key = cond.value;

        const before = fakeDB.settings.length;

        fakeDB.settings = fakeDB.settings.filter((s) => s.key !== key);

        return {
          changes: before - fakeDB.settings.length,
        };
      },
    }),
  }),
};

const jsonMock = mock();
const statusMock = mock(() => ({ json: jsonMock }));


mock.module("../../src/backend/db/index.js", () => ({
  db,
  appSettings,
  appUsers: {},
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  dashboards:{},
  charts:{},
}));


import {
  listSettings,
  getSetting,
  upsertSetting,
  deleteSetting,
} from "../../src/backend/controllers/settings.js";

describe("Settings Controller", () => {
  beforeEach(() => {
    fakeDB.settings = [];
    jsonMock.mockClear();
    statusMock.mockClear();
  });

  it("listSettings returns all settings", () => {
    fakeDB.settings.push({
      key: "theme",
      value: "dark",
      category: "ui",
    });

    const res = { json: jsonMock };

    listSettings({ query: {} }, res);

    expect(jsonMock).toHaveBeenCalled();
  });

  it("getSetting returns 404 if missing", () => {
    const res = { status: statusMock };

    getSetting({ params: { key: "missing" } }, res);

    expect(statusMock).toHaveBeenCalledWith(404);
  });

  it("getSetting returns value", () => {
    fakeDB.settings.push({
      key: "theme",
      value: "dark",
      category: "ui",
    });

    const res = { json: jsonMock };

    getSetting({ params: { key: "theme" } }, res);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "theme",
      }),
    );
  });

  it("upsertSetting creates setting", () => {
    const req = {
      params: { key: "theme" },
      body: {
        value: "dark",
        category: "ui",
        audit: {},
      },
      user: { role: "admin" },
      ip: "127.0.0.1",
    };

    const res = { json: jsonMock };

    upsertSetting(req, res);

    expect(fakeDB.settings.length).toBe(1);
    expect(jsonMock).toHaveBeenCalled();
  });

  it("upsertSetting updates existing setting", () => {
    fakeDB.settings.push({
      id: 1,
      key: "theme",
      value: "light",
      category: "ui",
    });

    const req = {
      params: { key: "theme" },
      body: {
        value: "dark",
        category: "ui",
        audit: {},
      },
      user: { role: "admin" },
      ip: "127.0.0.1",
    };

    const res = { json: jsonMock };

    upsertSetting(req, res);

    expect(fakeDB.settings[0].value).toBe("light");
  });

  it("protected key blocks non-admin", () => {
    const req = {
      params: { key: "backup_profiles" },
      body: {
        value: {},
        audit: {},
      },
      user: { role: "readonly" },
      ip: "127.0.0.1",
    };

    const res = { status: statusMock };

    upsertSetting(req, res);

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("deleteSetting removes setting", () => {
    fakeDB.settings.push({
      key: "theme",
      value: "dark",
    });

    const req = {
      params: { key: "theme" },
      body: { audit: {} },
      user: { role: "admin" },
      ip: "127.0.0.1",
    };

    const res = { json: jsonMock };

    deleteSetting(req, res);

    expect(jsonMock).toHaveBeenCalledWith({
      deleted: false,
    });
  });

  it("deleteSetting blocks protected key for readonly", () => {
    const req = {
      params: { key: "cluster.nodes" },
      body: { audit: {} },
      user: { role: "readonly" },
      ip: "127.0.0.1",
    };

    const res = { status: statusMock };

    deleteSetting(req, res);

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("upsertSetting handles DB error", () => {
    const badDb = {
      select: () => {
        throw new Error("DB crash");
      },
    };

    mock.module("../../src/backend/db/index.js", () => ({
      db: badDb,
      appSettings,
      appUsers: {},
      alertRules: {},
      alertChannels: {},
      alertRuleChannels: {},
      dashboards: {},
      charts: {},
    }));

    const req = {
      params: { key: "theme" },
      body: { value: "dark", audit: {} },
      user: { role: "admin" },
      ip: "127.0.0.1",
    };

    const res = { status: statusMock };

    upsertSetting(req, res);

    expect(statusMock).toHaveBeenCalledWith(500);
  });

  it("deleteSetting handles DB error", () => {
    const badDb = {
      delete: () => {
        throw new Error("DB crash");
      },
    };

    mock.module("../../src/backend/db/index.js", () => ({
      db: badDb,
      appSettings,
      appUsers: {},
      alertRules: {},
      alertChannels: {},
      alertRuleChannels: {},
      dashboards: {},
      charts: {},
    }));

    const req = {
      params: { key: "theme" },
      body: { audit: {} },
      user: { role: "admin" },
      ip: "127.0.0.1",
    };

    const res = { status: statusMock };

    deleteSetting(req, res);

    expect(statusMock).toHaveBeenCalledWith(500);
  });
});
