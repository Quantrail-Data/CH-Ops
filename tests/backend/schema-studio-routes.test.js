/**
 * schema-studio-routes.test.js - RBAC gate tests for the Schema Studio router
 *
 * Schema Studio's /connect lets the caller authenticate as any ClickHouse
 * user of their choosing (independent of the CHOps app role), and /create
 * is its only write action (a guarded CREATE TABLE). Both must reject the
 * app's 'readonly' role server-side, mirroring the same enforcement already
 * covered for query.js. This does not re-test the full feature (inference,
 * AI generation, etc.) - see schema-studio.test.js for the pure-logic helpers.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, test, expect, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto } from "../../src/backend/services/crypto.js";
import * as credStore from "../../src/backend/services/chCredStore.js";

const mockGetClusterNodes = mock();
const mockExecuteQuery = mock();
const mockExecuteQueryWithBody = mock();

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterNodes: mockGetClusterNodes,
  getAllClusters: () => [], getClusterById: () => null, getNodeByName: () => null,
  getDefaultCluster: () => null, saveClusters: () => {}, migrateClusterData: () => {},
  MAX_CLUSTERS: 3, MAX_TOTAL_NODES: 18,
}));

mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery: mockExecuteQuery,
  executeQueryWithBody: mockExecuteQueryWithBody,
}));

const { default: schemaStudioRouter } = await import("../../src/backend/routes/schemaStudio.js");

initCrypto("test-session-secret-minimum-32-characters-long!");
const _credSqlite = new Database(":memory:");
_credSqlite.exec(`
  CREATE TABLE ch_cred_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_user TEXT NOT NULL, jti TEXT NOT NULL, context TEXT NOT NULL,
    cluster_id TEXT, node TEXT, port INTEGER, ch_user TEXT NOT NULL,
    encrypted_password TEXT NOT NULL, created_at TEXT, updated_at TEXT, expires_at TEXT,
    UNIQUE (jti, context)
  )
`);
credStore.__setDb(drizzle(_credSqlite, { schema }));

function getHandler(method, path) {
  const layer = schemaStudioRouter.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  return layer.route.stack[0].handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

describe("POST /schema-studio/connect - role gate", () => {
  const handler = getHandler("post", "/connect");

  test("rejects readonly role with 403, never touches ClickHouse", async () => {
    const req = { user: { role: "readonly", jti: "j1" }, body: { user: "default", password: "" } };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/read-only/i);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("allows editor role through to connect", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, secure: false }]);
    mockExecuteQuery.mockResolvedValue({ rows: [{ 1: 1 }] });
    const req = {
      user: { role: "editor", jti: "j2", username: "alice" },
      body: { clusterId: "c1", user: "ch_user", password: "ch_pw" },
    };
    const res = createRes();
    await handler(req, res);
    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /schema-studio/create - role gate", () => {
  const handler = getHandler("post", "/create");

  test("rejects readonly role with 403, even with no session at all", async () => {
    const req = { user: { role: "readonly", jti: "no-session" }, body: { statements: ["CREATE TABLE t (a Int32) ENGINE = MergeTree ORDER BY a"] } };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/read-only/i);
    expect(mockExecuteQueryWithBody).not.toHaveBeenCalled();
  });

  test("non-readonly role without a session still gets the pre-existing 401 (gate doesn't mask real errors)", async () => {
    const req = { user: { role: "editor", jti: "still-no-session" }, body: { statements: ["CREATE TABLE t (a Int32) ENGINE = MergeTree ORDER BY a"] } };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/not connected/i);
  });
});
