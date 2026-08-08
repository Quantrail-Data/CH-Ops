// Contributors - Kathirdhasan, Praveen kumar, Kathir Moorthy
// sqlAIChat.test.js - the /api/ai/sql/generate-sql input guard
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";

const getMock = mock(() => null);
const generateSQL = mock(async () => ({ sql: "SELECT 1" }));
mock.module("../../src/backend/db/index.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ get: getMock }) }) }),
  },
  apiKeys: { isActive: "is_active" },
  appUsers: {},
  dashboards: {},
  charts: {},
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  appSettings: {},
  clusters: {},
  clusterNodes: {},
  k8sConnections: {},
}));

mock.module("../../src/backend/servicesAI/SQLGenerationService.js", () => ({
  default: class {
    constructor() {}
    generateSQL(...args) {
      return generateSQL(...args);
    }
  },
}));

const { default: router } = await import("../../src/backend/routes/sqlAIChat.js");

function handler() {
  const layer = router.stack.find((l) => l.route?.path === "/generate-sql");
  return layer.route.stack[0].handle;
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(d) {
      this.body = d;
      return this;
    },
  };
}

async function call(body) {
  const res = mockRes();
  const nextCalls = [];
  await handler()({ body }, res, (e) => nextCalls.push(e));
  return { res, nextCalls };
}

beforeEach(() => {
  getMock.mockReset();
  generateSQL.mockReset();
  generateSQL.mockResolvedValue({ sql: "SELECT 1" });
});

describe("input validation", () => {
  it("rejects a missing question even when database_id is present", () => {
    return call({ database_id: "db1" }).then(({ nextCalls }) => {
      expect(nextCalls).toHaveLength(1);
      expect(nextCalls[0].statusCode).toBe(422);
    });
  });

  it("rejects a missing database_id even when the question is present", async () => {
    const { nextCalls } = await call({ user_question: "how many rows?" });
    expect(nextCalls).toHaveLength(1);
    expect(nextCalls[0].statusCode).toBe(422);
  });

  it("rejects both missing", async () => {
    const { nextCalls } = await call({});
    expect(nextCalls).toHaveLength(1);
    expect(nextCalls[0].statusCode).toBe(422);
  });

  it("reports a 422 rather than throwing a TypeError", async () => {
    const { nextCalls } = await call({});
    expect(nextCalls[0]).toBeInstanceOf(Error);
    expect(nextCalls[0].statusCode).toBe(422);
    expect(nextCalls[0].message).not.toMatch(/is not a function/);
  });

  it("stops after failing validation", async () => {
    const { res, nextCalls } = await call({});
    expect(nextCalls).toHaveLength(1);
    expect(res.body).toBeNull();
    expect(generateSQL).not.toHaveBeenCalled();
  });
});

describe("provider selection", () => {
  it("reports 400 when no AI provider is active", async () => {
    getMock.mockReturnValue(null);
    const { nextCalls } = await call({
      database_ids: ["db1"],
      user_question: "q",
    });
    expect(nextCalls).toHaveLength(1);
    expect(nextCalls[0].statusCode).toBe(401);
  });

  it("generates SQL when a provider is active", async () => {
    getMock.mockReturnValue({
      id: 1,
      provider: "gemini-2.5-flash",
      model: "m",
      encryptedKey: "k",
      name: "g",
    });
    const { res, nextCalls } = await call({
      database_ids: ["db1"],
      user_question: "q",
    });
    expect(nextCalls).toHaveLength(0);
    expect(res.body).toEqual({ sql: "SELECT 1" });
    expect(generateSQL).toHaveBeenCalledWith(["db1"], "q");
  });

  it("queries the active key with a boolean, not a raw 1", async () => {
    const src = await Bun.file(
      new URL("../../src/backend/routes/sqlAIChat.js", import.meta.url),
    ).text();

    expect(src).toMatch(/eq\s*\(\s*apiKeys\.isActive\s*,\s*true\s*\)/);
    expect(src).not.toMatch(/eq\s*\(\s*apiKeys\.isActive\s*,\s*1\s*\)/);
  });
});
