// Contributors - Kathirdhasan, Praveen kumar, Kathir Moorthy
// sqlAIChat.test.js - the /api/ai/sql/generate-sql input guard
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";

const getMock = mock(() => null);
const generateSQL = mock(async () => ({ sql: "SELECT 1" }));

// Every real export is stubbed, not just the ones this file uses. Bun's
// mock.module replaces the module for the whole test process, so whichever
// file's call happens to win must not leave another suite short an export.
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
  // clusterUtils imports these, so a suite loading the real module after this
  // one needs them present.
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

const { default: router } = await import(
  "../../src/backend/routes/sqlAIChat.js"
);

// The router registers one POST handler; pull it out and drive it directly.
function handler() {
  const layer = router.stack.find((l) => l.route?.path === "/generate-sql");
  return layer.route.stack[0].handle;
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
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
    // The && bug meant this case passed validation entirely.
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
    // error.statusCode(422) used to throw before the error could be reported.
    const { nextCalls } = await call({});
    expect(nextCalls[0]).toBeInstanceOf(Error);
    expect(nextCalls[0].statusCode).toBe(422);
    expect(nextCalls[0].message).not.toMatch(/is not a function/);
  });

  it("stops after failing validation", async () => {
    // No return after next() meant the handler ran on regardless.
    const { res, nextCalls } = await call({});
    expect(nextCalls).toHaveLength(1);
    expect(res.body).toBeNull();
    expect(generateSQL).not.toHaveBeenCalled();
  });
});

describe("provider selection", () => {
  it("reports 400 when no AI provider is active", async () => {
    getMock.mockReturnValue(null);
    const { nextCalls } = await call({ database_id: "db1", user_question: "q" });
    expect(nextCalls).toHaveLength(1);
    expect(nextCalls[0].statusCode).toBe(400);
  });

  it("generates SQL when a provider is active", async () => {
    getMock.mockReturnValue({ id: 1, provider: "CLAUDE", model: "m", encryptedKey: "k" });
    const { res, nextCalls } = await call({ database_id: "db1", user_question: "q" });
    expect(nextCalls).toHaveLength(0);
    expect(res.body).toEqual({ sql: "SELECT 1" });
    expect(generateSQL).toHaveBeenCalledWith("db1", "q");
  });

  it("queries the active key with a boolean, not a raw 1", async () => {
    // isActive is declared { mode: "boolean" }; a raw 1 bypasses Drizzle's
    // mapping. It happens to work on SQLite and would not on Postgres.
    const src = await Bun.file(
      new URL("../../src/backend/routes/sqlAIChat.js", import.meta.url),
    ).text();
    expect(src).toContain("isActive, true");
    expect(src).not.toContain("isActive, 1");
  });
});
