/**
 * query.test.js - Unit tests for query execution controller
 *
 * Tests the runQuery and testQueryConnection endpoints. Verifies that
 * SQL is executed against the correct cluster nodes, connection settings
 * can be overridden, missing SQL or nodes returns 400, query errors are
 * returned as 400 with the error message, and ClickHouse stats are mapped
 * correctly. Also tests connection testing with node lookup and error
 * handling.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto } from "../../src/backend/services/crypto.js";
import * as credStore from "../../src/backend/services/chCredStore.js";

const mockGetClusterNodes = mock();
const mockExecuteQuery = mock();

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterNodes: mockGetClusterNodes,
  getAllClusters: () => [], getClusterById: () => null, getNodeByName: () => null,
  getDefaultCluster: () => null, saveClusters: () => {}, migrateClusterData: () => {},
  MAX_CLUSTERS: 3, MAX_TOTAL_NODES: 18,
}));

mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery: mockExecuteQuery,
}));

const {
  runQuery,
  testQueryConnection,
} = await import("../../src/backend/controllers/query.js");

// Editor credential session store: isolated in-memory DB so useSession queries
// resolve real (jti, context) credentials without touching production data.
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
credStore.setCredSession({
  jti: "ed-jti", context: "editor", appUser: "u",
  clusterId: "c1", node: "h1", port: 8123, chUser: "ed_user", password: "ed_pw",
});

function createRes() {
  return {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  mockGetClusterNodes.mockReset();
  mockExecuteQuery.mockReset();
});

describe("runQuery", () => {
  test("returns 400 when sql is missing", async () => {
    const req = { body: {} };
    const res = createRes();

    await runQuery(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Missing SQL",
    });
  });

  test("returns 400 when cluster has no nodes", async () => {
    mockGetClusterNodes.mockReturnValue([]);

    const req = {
      body: {
        sql: "SELECT 1",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await runQuery(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "No cluster nodes configured.",
    });
  });

  test("returns 400 when node is not found in cluster", async () => {
    mockGetClusterNodes.mockReturnValue([
      { host: "node1" },
    ]);

    const req = {
      body: {
        sql: "SELECT 1",
        node: "evil-host",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await runQuery(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Node not found in cluster configuration.",
    });
  });

  test("uses first cluster node when node is not provided", async () => {
    mockGetClusterNodes.mockReturnValue([
      {
        host: "node1",
        port: 8123,
        secure: true,
        user: "admin",
        password: "secret",
      },
    ]);

    mockExecuteQuery.mockResolvedValue({
      data: [{ value: 1 }],
    });

    const req = {
      body: {
        sql: "SELECT 1",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await runQuery(req, res);

    expect(mockExecuteQuery).toHaveBeenCalledWith({
      host: "node1",
      port: 8123,
      secure: true,
      user: "admin",
      password: "secret",
      sql: "SELECT 1",
      readOnly: false,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: [{ value: 1 }],
    });
  });

  test("allows overriding connection settings from request", async () => {
    mockGetClusterNodes.mockReturnValue([
      {
        host: "node1",
        port: 8123,
        user: "default",
        password: "",
      },
    ]);

    mockExecuteQuery.mockResolvedValue({});

    const req = {
      body: {
        sql: "SELECT 1",
        node: "node1",
        port: 9000,
        user: "admin",
        password: "secret",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await runQuery(req, res);

    expect(mockExecuteQuery).toHaveBeenCalledWith({
      host: "node1",
      port: 9000,
      secure: false,
      user: "admin",
      password: "secret",
      sql: "SELECT 1",
      readOnly: false,
    });
  });

  test("returns query errors as 400", async () => {
    mockGetClusterNodes.mockReturnValue([
      { host: "node1" },
    ]);

    mockExecuteQuery.mockRejectedValue(
      new Error("Syntax error")
    );

    const req = {
      body: {
        sql: "BAD SQL",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await runQuery(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Syntax error",
    });
  });

  test("maps ClickHouse stats fields", async () => {
    mockGetClusterNodes.mockReturnValue([
      { host: "node1" },
    ]);

    mockExecuteQuery.mockResolvedValue({
      stats: {
        written_rows: "10",
        read_rows: "20",
        read_bytes: "1000",
        elapsed_ns: "123456",
      },
    });

    const req = {
      body: {
        sql: "SELECT 1",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await runQuery(req, res);

    expect(res.body).toEqual({
      stats: {
        written_rows: "10",
        read_rows: "20",
        read_bytes: "1000",
        elapsed_ns: "123456",
      },
      written_rows: 10,
      read_rows: 20,
      read_bytes: 1000,
      elapsed_ns: "123456",
    });
  });
});

describe("testQueryConnection", () => {
  test("returns 400 when node is missing", async () => {
    const req = { body: {} };
    const res = createRes();

    await testQueryConnection(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      message: "Node host required.",
    });
  });

  test("returns error when node is not in cluster", async () => {
    mockGetClusterNodes.mockReturnValue([
      { host: "node1" },
    ]);

    const req = {
      body: {
        node: "node2",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await testQueryConnection(req, res);

    expect(res.body).toEqual({
      ok: false,
      message: "Node not found in cluster configuration.",
    });
  });

  test("returns success when connection works", async () => {
    mockGetClusterNodes.mockReturnValue([
      {
        host: "node1",
        port: 8123,
      },
    ]);

    mockExecuteQuery.mockResolvedValue({});

    const req = {
      body: {
        node: "node1",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await testQueryConnection(req, res);

    expect(mockExecuteQuery).toHaveBeenCalledWith({
      host: "node1",
      port: 8123,
      secure: false,
      user: "default",
      password: "",
      sql: "SELECT 1",
    });

    expect(res.body).toEqual({
      ok: true,
      message: "Connected successfully",
    });
  });

  test("returns failure when connection throws", async () => {
    mockGetClusterNodes.mockReturnValue([
      { host: "node1" },
    ]);

    mockExecuteQuery.mockRejectedValue(
      new Error("Connection refused")
    );

    const req = {
      body: {
        node: "node1",
        clusterId: "cluster1",
      },
    };

    const res = createRes();

    await testQueryConnection(req, res);

    expect(res.body).toEqual({
      ok: false,
      message: "Connection refused",
    });
  });
});
describe("runQuery readonly enforcement", () => {
  test("rejects a non-read statement when readOnly is set, without hitting ClickHouse", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "u", password: "p" }]);
    const req = { body: { sql: "DROP TABLE t", node: "h1", clusterId: "c1", readOnly: true } };
    const res = createRes();
    await runQuery(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/read-only/i);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("passes readOnly through to executeQuery for a read query", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "u", password: "p" }]);
    mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
    const req = { body: { sql: "SELECT 1", node: "h1", clusterId: "c1", readOnly: true } };
    const res = createRes();
    await runQuery(req, res);
    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteQuery.mock.calls[0][0]).toMatchObject({ readOnly: true, sql: "SELECT 1" });
  });

  test("does not block writes when readOnly is not requested (e.g. SQL editor)", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "u", password: "p" }]);
    mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
    const req = { body: { sql: "DROP TABLE t", node: "h1", clusterId: "c1" } };
    const res = createRes();
    await runQuery(req, res);
    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteQuery.mock.calls[0][0]).toMatchObject({ readOnly: false });
  });
});

describe("runQuery editor session (useSession)", () => {
  test("resolves credentials from the (jti, editor) session, no password in body", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "node_user", password: "node_pw" }]);
    mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
    const req = { body: { sql: "SELECT 1", node: "h1", clusterId: "c1", useSession: true, context: "editor" }, user: { jti: "ed-jti", username: "u" } };
    const res = createRes();
    await runQuery(req, res);
    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteQuery.mock.calls[0][0]).toMatchObject({ user: "ed_user", password: "ed_pw" });
  });

  test("returns 401 CRED_SESSION_EXPIRED when the session is gone (no fallback to default)", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "node_user", password: "node_pw" }]);
    const req = { body: { sql: "SELECT 1", node: "h1", clusterId: "c1", useSession: true, context: "editor" }, user: { jti: "missing-jti", username: "u" } };
    const res = createRes();
    await runQuery(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("CRED_SESSION_EXPIRED");
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });
});