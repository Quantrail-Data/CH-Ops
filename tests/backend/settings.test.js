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

const appSettings = {
  key: { key: "key" },
  value: { key: "value" },
  category: { key: "category" },
  id: { key: "id" },
};

const eq = (field, value) => {
  return {
    field: field.key,
    value: value,
  };
};

function extractCondition(cond) {
  if (!cond) return null;

  if (cond.field && cond.value !== undefined) {
    return { field: cond.field, value: cond.value };
  }

  if (Array.isArray(cond.queryChunks)) {
    let fieldName = null;
    let value = undefined;

    for (const chunk of cond.queryChunks) {
      if (chunk && typeof chunk === "object" && chunk.key) {
        fieldName = chunk.key;
      } else if (chunk !== undefined && chunk !== null && typeof chunk !== "object") {
        value = chunk;
      } else if (chunk && chunk.value !== undefined && !fieldName) {
        value = chunk.value;
      }
    }

    if (fieldName && value !== undefined) {
      return { field: fieldName, value };
    }
  }

  return null;
}

function createQuery() {
  const data = fakeDB.settings;

  return {
    where: (cond) => {
      const parsed = extractCondition(cond);
      let filtered = data;

      if (parsed) {
        filtered = data.filter((s) => s[parsed.field] === parsed.value);
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
          const parsed = extractCondition(cond);
          if (parsed) {
            for (let i = 0; i < fakeDB.settings.length; i++) {
              if (fakeDB.settings[i][parsed.field] === parsed.value) {
                fakeDB.settings[i] = {
                  ...fakeDB.settings[i],
                  ...v,
                };
                break;
              }
            }
          }
        },
      }),
    }),
  }),

  delete: () => ({
    where: (cond) => ({
      run: () => {
        const before = fakeDB.settings.length;
        const parsed = extractCondition(cond);

        if (parsed) {
          fakeDB.settings = fakeDB.settings.filter((s) => s[parsed.field] !== parsed.value);
        }

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
  // clusterUtils imports these, so a suite loading the real module after this
  // one needs them present.
  clusters: {},
  clusterNodes: {},
  k8sConnections: {},
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

    getSetting({ params: { key: "missing" }, user: { role: "editor" } }, res);

    expect(statusMock).toHaveBeenCalledWith(404);
  });

  it("getSetting returns value", () => {
    fakeDB.settings.push({
      key: "theme",
      value: "dark",
      category: "ui",
    });

    const res = { json: jsonMock };

    getSetting({ params: { key: "theme" }, user: { role: "editor" } }, res);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "theme",
      }),
    );
  });

  it("upsertSetting creates setting", () => {
    const req = {
      params: { key: "query_bookmarks" },
      body: {
        value: "dark",
        category: "ui",
        audit: {},
      },
      user: { role: "user" },
      ip: "127.0.0.1",
    };

    const res = { json: jsonMock, status: statusMock };

    upsertSetting(req, res);

    expect(fakeDB.settings.length).toBe(1);
    expect(jsonMock).toHaveBeenCalled();
  });

  it("upsertSetting updates existing setting", () => {
    const existingId = 12345;
    fakeDB.settings.push({
      id: existingId,
      key: "query_bookmarks",
      value: "light",
      category: "ui",
    });

    const req = {
      params: { key: "query_bookmarks" },
      body: {
        value: "dark",
        category: "ui",
        audit: {},
      },
      user: { role: "user" },
      ip: "127.0.0.1",
    };

    const res = { json: jsonMock, status: statusMock };

    upsertSetting(req, res);

    const updated = fakeDB.settings.find(s => s.id === existingId);
    expect(updated.value).toBe("dark");
    expect(jsonMock).toHaveBeenCalled();
  });

  it("protected key blocks non-admin", () => {
    const req = {
      params: { key: "cluster.nodes" },
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
      id: 99999,
      key: "query_bookmarks",
      value: "dark",
    });

    const beforeLength = fakeDB.settings.length;

    const req = {
      params: { key: "query_bookmarks" },
      body: { audit: {} },
      user: { role: "user" },
      ip: "127.0.0.1",
    };

    const res = { json: jsonMock, status: statusMock };

    deleteSetting(req, res);

    const afterLength = fakeDB.settings.length;
    expect(afterLength).toBe(beforeLength - 1);
    expect(jsonMock).toHaveBeenCalledWith({
      deleted: true,
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
      params: { key: "query_bookmarks" },
      body: { value: "dark", audit: {} },
      user: { role: "user" },
      ip: "127.0.0.1",
    };

    const res = { status: statusMock, json: jsonMock };

    upsertSetting(req, res);

    expect(statusMock).toHaveBeenCalledWith(500);
  });

  it("deleteSetting handles DB error", () => {
    const badDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            get: () => null,
          }),
        }),
      }),
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
      params: { key: "query_bookmarks" },
      body: { audit: {} },
      user: { role: "user" },
      ip: "127.0.0.1",
    };

    const res = { status: statusMock, json: jsonMock };

    deleteSetting(req, res);

    expect(statusMock).toHaveBeenCalledWith(500);
  });
});
