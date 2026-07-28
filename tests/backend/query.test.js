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
  // bun's mock.module replaces this module for the whole test process, not just
  // this file - stub every real export so whichever test file's mock.module
  // call happens to win doesn't break other files that need this one.
  maskClusterPasswords: (cluster) => ({
    ...cluster,
    nodes: (cluster.nodes || []).map(({ password, ...rest }) => ({
      ...rest,
      hasPassword: !!password,
    })),
  }),
  MAX_CLUSTERS: 3, MAX_TOTAL_NODES: 18,
}));

mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery: mockExecuteQuery,
  // bun's mock.module replaces this module for the whole test process, not just
  // this file - stub every real export so whichever test file's mock.module call
  // happens to win doesn't break other files that need executeQueryWithBody.
  executeQueryWithBody: mock(),
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

describe("runQuery request settings", () => {
  const node = { host: "node1", port: 8123, user: "chops", password: "pw" };

  function run(body) {
    mockGetClusterNodes.mockReturnValue([node]);
    mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
    const req = { body: { node: "node1", clusterId: "c1", sql: "SELECT 1", ...body }, user: {} };
    const res = createRes();
    return runQuery(req, res).then(() => mockExecuteQuery.mock.calls[0]?.[0]);
  }

  it("forwards the editor's row limit to ClickHouse", async () => {
    // These were destructured out of the body and then never used, so the
    // configured Max rows had no effect on the server at all.
    const sent = await run({
      settings: { max_result_rows: 5001, result_overflow_mode: "break" },
    });
    expect(sent.settings).toEqual({
      max_result_rows: 5001,
      result_overflow_mode: "break",
    });
  });

  it("forwards EXPLAIN settings", async () => {
    const sent = await run({
      settings: { use_query_condition_cache: 0, use_skip_indexes_on_data_read: 0 },
    });
    expect(sent.settings.use_query_condition_cache).toBe(0);
    expect(sent.settings.use_skip_indexes_on_data_read).toBe(0);
  });

  it("drops settings that are not on the allowlist", async () => {
    // Setting names become URL parameters on the ClickHouse request, so a
    // passthrough would let any authenticated caller raise their own memory
    // ceiling or turn readonly off.
    const sent = await run({
      settings: {
        max_result_rows: 100,
        max_memory_usage: "999999999999",
        readonly: 0,
        allow_ddl: 1,
      },
    });
    expect(sent.settings).toEqual({ max_result_rows: 100 });
  });

  it("sends an empty object when the caller sends nothing", async () => {
    const sent = await run({});
    expect(sent.settings).toEqual({});
  });

  it("tolerates a null settings body", async () => {
    const sent = await run({ settings: null });
    expect(sent.settings).toEqual({});
  });
});

describe("runQuery query parameters", () => {
  const node = { host: "node1", port: 8123, user: "chops", password: "pw" };

  function run(body) {
    mockGetClusterNodes.mockReturnValue([node]);
    mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
    const req = { body: { node: "node1", clusterId: "c1", ...body }, user: {} };
    const res = createRes();
    return runQuery(req, res).then(() => ({ res, sent: mockExecuteQuery.mock.calls[0]?.[0] }));
  }

  test("passes values through as params, never interpolated", async () => {
    const { sent } = await run({
      sql: "SELECT * FROM t WHERE r = {region:String}",
      params: { region: "eu-west" },
    });

    expect(sent.params).toEqual({ region: "eu-west" });
    // The statement still carries the placeholder: executeQuery turns params
    // into param_<name> URL arguments, so the value never touches the SQL.
    expect(sent.sql).toContain("{region:String}");
    expect(sent.sql).not.toContain("eu-west");
  });

  test("keeps an optional block when its value is present", async () => {
    const { sent } = await run({
      sql: "SELECT * FROM t WHERE 1 /*[ AND r = {region:String} ]*/",
      params: { region: "eu-west" },
    });

    expect(sent.sql).toContain("AND r = {region:String}");
    expect(sent.sql).not.toContain("/*[");
    expect(sent.params).toEqual({ region: "eu-west" });
  });

  test("drops an optional block when its value is blank", async () => {
    const { sent } = await run({
      sql: "SELECT * FROM t WHERE 1 /*[ AND r = {region:String} ]*/",
      params: { region: "" },
    });

    expect(sent.sql).not.toContain("region");
    expect(sent.params).toEqual({});
  });

  test("formats a numeric parameter for the wire", async () => {
    const { sent } = await run({
      sql: "SELECT * FROM t WHERE n > {threshold:UInt8}",
      params: { threshold: 5 },
    });

    expect(sent.params).toEqual({ threshold: "5" });
  });

  test("rejects a name declared with two different types", async () => {
    mockGetClusterNodes.mockReturnValue([node]);
    const req = {
      body: {
        node: "node1",
        clusterId: "c1",
        sql: "SELECT {a:String} FROM t WHERE b = {a:UInt8}",
        params: { a: "1" },
      },
      user: {},
    };
    const res = createRes();

    await runQuery(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/two different types/i);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("does not materialize a non row-returning statement", async () => {
    // Parameters are SELECT-only by decision: the gate in the controller skips
    // materialize for writes and DDL, so the block stays as a plain comment.
    const { sent } = await run({
      sql: "INSERT INTO t VALUES (1) /*[ , {x:UInt8} ]*/",
      params: { x: 7 },
    });

    expect(sent.params).toEqual({});
    expect(sent.sql).toContain("/*[");
  });

  test("works when no params are sent at all", async () => {
    const { res, sent } = await run({ sql: "SELECT 1" });

    expect(res.statusCode).toBe(200);
    expect(sent.params).toEqual({});
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

  test("falls back to the stored node credentials", async () => {
    // The browser no longer sends a user or password, so the connection test
    // has to resolve them from the cluster configuration - otherwise it
    // authenticates as 'default' with a blank password and fails against any
    // node that actually has one.
    mockGetClusterNodes.mockReturnValue([
      {
        host: "node1",
        port: 8123,
        user: "chops",
        password: "stored-secret",
        secure: true,
      },
    ]);

    mockExecuteQuery.mockResolvedValue({});

    const req = { body: { node: "node1", clusterId: "cluster1" } };
    const res = createRes();

    await testQueryConnection(req, res);

    expect(mockExecuteQuery).toHaveBeenCalledWith({
      host: "node1",
      port: 8123,
      secure: true,
      user: "chops",
      password: "stored-secret",
      sql: "SELECT 1",
    });
    expect(res.body).toEqual({ ok: true, message: "Connected successfully" });
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

  test("a 'readonly' app role cannot bypass by omitting readOnly in the request body", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "u", password: "p" }]);
    const req = { user: { role: "readonly" }, body: { sql: "DROP TABLE t", node: "h1", clusterId: "c1" } };
    const res = createRes();
    await runQuery(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/read-only/i);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("a 'readonly' app role cannot bypass by explicitly setting readOnly: false", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "u", password: "p" }]);
    const req = { user: { role: "readonly" }, body: { sql: "DROP TABLE t", node: "h1", clusterId: "c1", readOnly: false } };
    const res = createRes();
    await runQuery(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/read-only/i);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test("a 'readonly' app role can still run read queries", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "u", password: "p" }]);
    mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
    const req = { user: { role: "readonly" }, body: { sql: "SELECT 1", node: "h1", clusterId: "c1" } };
    const res = createRes();
    await runQuery(req, res);
    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteQuery.mock.calls[0][0]).toMatchObject({ readOnly: true });
  });

  test("a non-readonly app role (editor) is not forced into readOnly", async () => {
    mockGetClusterNodes.mockReturnValue([{ host: "h1", port: 8123, user: "u", password: "p" }]);
    mockExecuteQuery.mockResolvedValue({ rows: [], columns: [], stats: {} });
    const req = { user: { role: "editor" }, body: { sql: "DROP TABLE t", node: "h1", clusterId: "c1" } };
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