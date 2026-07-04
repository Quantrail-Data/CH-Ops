/**
 * alerts.test.js - Unit tests for alert rules and channels controller
 *
 * Tests CRUD operations for alert rules and channels using an in-memory
 * mock database. Verifies rule creation with channel associations, rule
 * listing, active rule filtering, updates with node and cluster fields,
 * and deletion. Channel tests cover creation, listing, update, deletion,
 * and test notification sending. Edge cases like DB errors are also tested.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

const fakeDB = {
  rules: [],
  channels: [],
  ruleChannels: [],
};

const alertRulesMock = { table: "rules" };
const alertChannelsMock = { table: "channels" };
const alertRuleChannelsMock = { table: "ruleChannels" };

function getTableData(table) {
  if (table === alertRulesMock) return fakeDB.rules;
  if (table === alertChannelsMock) return fakeDB.channels;
  if (table === alertRuleChannelsMock) return fakeDB.ruleChannels;

  return [];
}

function createQuery(table) {
  const data = getTableData(table);

  return {
    where: () => ({
      all: () => data,
      get: () => data[0] || null,
      orderBy: () => ({
        all: () => data,
      }),
    }),

    all: () => data,

    get: () => data[0] || null,

    orderBy: () => ({
      all: () => data,
    }),
  };
}

const dbMock = {
  select: () => ({
    from: (table) => createQuery(table),
  }),

  insert: (table) => ({
    values: (values) => ({
      returning: () => ({
        get: () => {
          const row = {
            id: Date.now(),
            ...values,
          };

          if (table === alertRulesMock) {
            fakeDB.rules.push(row);
          } else if (table === alertChannelsMock) {
            fakeDB.channels.push(row);
          } else if (table === alertRuleChannelsMock) {
            fakeDB.ruleChannels.push(row);
          }

          return row;
        },
      }),

      run: () => {
        const row = {
          id: Date.now(),
          ...values,
        };

        if (table === alertRulesMock) {
          fakeDB.rules.push(row);
        } else if (table === alertChannelsMock) {
          fakeDB.channels.push(row);
        } else if (table === alertRuleChannelsMock) {
          fakeDB.ruleChannels.push(row);
        }

        return row;
      },
    }),
  }),

  update: () => ({
    set: () => ({
      where: () => ({
        run: () => true,
      }),
    }),
  }),

  delete: () => ({
    where: () => ({
      run: () => true,
    }),
  }),
};

mock.module("../../src/backend/db/index.js", () => ({
  db: dbMock,
  alertRules: alertRulesMock,
  alertChannels: alertChannelsMock,
  alertRuleChannels: alertRuleChannelsMock,
  appSettings: {},
  dashboards:{},
  charts:{},
  appUsers:{}
}));

mock.module("../../src/backend/services/notifier.js", () => ({
  testChannel: async () => true,
  sendNotification: async () => {},
}));


const {
  createRule,
  listRules,
  listActiveRules,
  updateRule,
  deleteRule,
  createChannel,
  listChannels,
  testChannel,
  updateChannel,
  deleteChannel,
} = await import("../../src/backend/controllers/alerts.js");

function mockReqRes(body = {}, params = {}) {
  const req = {
    body,
    params,
    user: {
      username: "u1",
      role: "admin",
    },
    ip: "127.0.0.1",
  };

  const res = {
    statusCode: 200,
    jsonData: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this.jsonData = data;
      return this;
    },
  };

  return { req, res };
}

const originalInsert = dbMock.insert;
const originalUpdate = dbMock.update;
const originalDelete = dbMock.delete;

beforeEach(() => {
  fakeDB.rules = [];
  fakeDB.channels = [];
  fakeDB.ruleChannels = [];

  dbMock.insert = originalInsert;
  dbMock.update = originalUpdate;
  dbMock.delete = originalDelete;
});

describe("Alert Rules Controller", () => {
  it("createRule should insert rule", () => {
    const { req, res } = mockReqRes({
      name: "cpu alert",
      sql: "SELECT 1",
      threshold: 90,
      channel_ids: [],
    });

    createRule(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.name).toBe("cpu alert");
    expect(fakeDB.rules.length).toBe(1);
  });

  

  it("if channel id present insert it ", () => {
    const { req, res } = mockReqRes({
      name: "cpu alert",
      sql: "SELECT 1",
      threshold: 90,
      channel_ids: [1, 3],
    });

    createRule(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.name).toBe("cpu alert");
    expect(fakeDB.rules.length).toBe(1);
  });

  it("if error happens throw 500 code ", () => {
    const { req, res } = mockReqRes({
      name: "cpu alert",
      sql: "SELECT 1",
      threshold: 90,
      channel_ids: [1, 3],
    });

    dbMock.insert = mock(() => false);

    createRule(req, res);

    expect(res.statusCode).toBe(500);
  });

  it("listRules should return rules", () => {
    fakeDB.rules.push({
      id: 1,
      name: "test",
      nodes: null,
      clusterId: null,
    });

    const { req, res } = mockReqRes();

    listRules(req, res);

    expect(Array.isArray(res.jsonData)).toBe(true);
    expect(res.jsonData.length).toBe(1);
    expect(res.jsonData[0].name).toBe("test");
  });

  it("list the active rules", () => {
    fakeDB.rules.push({
      id: 1,
      name: "test",
      nodes: null,
      clusterId: null,
      isActive: true,
    });

    const { req, res } = mockReqRes();

    listActiveRules(req, res);
    expect(Array.isArray(res.jsonData)).toBe(true);
    expect(res.jsonData.length).toBe(1);
    expect(res.jsonData[0].name).toBe("test");
  });

  it("updateRule should with respected nodes and channels", () => {
    fakeDB.rules.push({
      id: 1,
      name: "old",
    });

    const { req, res } = mockReqRes(
      {
        name: "new name",
        nodes: "node1",
        cluster_id: "12314352345",
        channel_ids: [1, 2],
      },
      {
        id: "1",
      },
    );

    updateRule(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("updateRule should update without crashing", () => {
    fakeDB.rules.push({
      id: 1,
      name: "old",
    });

    const { req, res } = mockReqRes(
      {
        name: "new name",
      },
      {
        id: "1",
      },
    );

    updateRule(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("updateRule should throw error any error came", () => {
    fakeDB.rules.push({
      id: 1,
      name: "old",
    });

    const { req, res } = mockReqRes(
      {
        name: "new name",
      },
      {
        id: "1",
      },
    );

    dbMock.update = mock(() => false);

    updateRule(req, res);

    expect(res.statusCode).toBe(500);
  });

  it("deleteRule should return success", () => {
    const { req, res } = mockReqRes({}, { id: "1" });

    deleteRule(req, res);

    expect(res.jsonData.deleted).toBe(true);
  });

  it("check deleterule throw error with 500", () => {
    const { req, res } = mockReqRes({}, { id: "1" });

    dbMock.delete = mock(() => false);

    deleteRule(req, res);

    expect(res.statusCode).toBe(500);
  });
});

describe("Alert Channels", () => {
  it("listChannel should return list of channels", () => {
    fakeDB.channels.push({
      name: "slack",
      type: "slack",
      config: {
        url: "https://hooks.slack.com",
      },
    });
    const { req, res } = mockReqRes();

    listChannels(req, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.jsonData)).toBe(true);
    expect(res.jsonData[0].name).toBe("slack");
  });

  it("createChannel should create channel", () => {
    const { req, res } = mockReqRes({
      name: "slack",
      type: "slack",
      config: {
        url: "https://hooks.slack.com",
      },
    });

    createChannel(req, res);

    expect(res.statusCode).toBe(201);
  });

  it("createChannel should return 500 status if error happen", () => {
    const { req, res } = mockReqRes({
      name: "slack",
      type: "slack",
      config: {
        url: "https://hooks.slack.com",
      },
    });

    dbMock.insert = mock(() => false);

    createChannel(req, res);

    expect(res.statusCode).toBe(500);
  });

  it("updateChannel should udpate channel", () => {
    const { req, res } = mockReqRes({
      id: 1,
      name: "slack",
      type: "slack",
      config: {
        url: "https://hooks.slack.com",
      },
    });

    updateChannel(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("updateChannel should 500 if any backend error happen", () => {
    const { req, res } = mockReqRes({
      id: 1,
      name: "slack",
      type: "slack",
      config: {
        url: "https://hooks.slack.com",
      },
    });

    dbMock.update = mock(() => false);

    updateChannel(req, res);

    expect(res.statusCode).toBe(500);
  });

  it("deleteChannel should delete channel", () => {
    const { req, res } = mockReqRes({
      id: 1,
      name: "slack",
      type: "slack",
      config: {
        url: "https://hooks.slack.com",
      },
    });

    deleteChannel(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("deleteChannel should return 500 if any backend error happen ", () => {
    const { req, res } = mockReqRes({
      id: 1,
      name: "slack",
      type: "slack",
      config: {
        url: "https://hooks.slack.com",
      },
    });

    dbMock.delete = mock(() => false);

    deleteChannel(req, res);

    expect(res.statusCode).toBe(500);
  });

  it("testChannel should return ok true", async () => {
    fakeDB.channels.push({
      id: 1,
      type: "slack",
      config: JSON.stringify({
        url: "x",
      }),
    });

    const { req, res } = mockReqRes({}, { id: "1" });

    await testChannel(req, res);

    expect(res.jsonData).toEqual({
      ok: true,
    });
  });

  it("testChannel should return 500 false", async () => {
    fakeDB.channels.push({
      id: 1,
      type: "slack",
      config: JSON.stringify({
        url: "x",
      }),
    });
     dbMock.update = mock(() => false)

    const { req, res } = mockReqRes({}, { id: "1" });

    await testChannel(req, res);

    expect(res.jsonData).toEqual(expect.objectContaining({
      ok: false,
    }));
  });
});
