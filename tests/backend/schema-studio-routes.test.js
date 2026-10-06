// schema-studio-routes.test.js - RBAC gate tests for the Schema Studio router
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Praveen kumar, Kathir Moorthy

import { beforeEach, describe, test, expect, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto } from "../../src/backend/services/crypto.js";
import * as credStore from "../../src/backend/services/chCredStore.js";

const mockGetClusterNodes = mock();
const mockExecuteQuery = mock();
const mockExecuteQueryWithBody = mock();
const mockCompleteDdl = mock();
const mockGetAiStatus = mock();

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
  executeQueryWithBody: mockExecuteQueryWithBody,
}));

mock.module("../../src/backend/services/studioAi.js", () => ({
  completeDdl: mockCompleteDdl,
  getAiStatus: mockGetAiStatus,
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
  return layer.route.stack.at(-1).handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

function connectSession(jti = 'studio-session') {
  credStore.setCredSession({
    jti,
    context: credStore.CRED_CONTEXTS.SCHEMA_STUDIO,
    appUser: 'alice',
    clusterId: 'c1',
    node: 'h1',
    port: 8123,
    chUser: 'clickhouse',
    password: 'secret',
  });
  return { user: { jti, username: 'alice', role: 'editor' } };
}

beforeEach(() => {
  mockGetClusterNodes.mockReset();
  mockExecuteQuery.mockReset();
  mockExecuteQueryWithBody.mockReset();
  mockCompleteDdl.mockReset();
  mockGetAiStatus.mockReset();
});

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

describe('Schema Studio connection routes', () => {
  const connect = getHandler('post', '/connect');
  const status = getHandler('get', '/connect');
  const disconnect = getHandler('delete', '/connect');

  test('validates credentials and configured nodes before connecting', async () => {
    let res = createRes();
    await connect({ user: { jti: 'missing-user' }, body: {} }, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'ClickHouse username is required.' } });

    mockGetClusterNodes.mockReturnValue([]);
    res = createRes();
    await connect({ user: { jti: 'no-nodes' }, body: { user: 'ch' } }, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'No cluster nodes configured.' } });

    mockGetClusterNodes.mockReturnValue([{ host: 'h1' }]);
    res = createRes();
    await connect({ user: { jti: 'bad-node' }, body: { user: 'ch', node: 'h2' } }, res);
    expect(res.body.error).toMatch(/Node not found/);
  });

  test('reports ClickHouse connection errors and exposes status without the password', async () => {
    mockGetClusterNodes.mockReturnValue([{ host: 'h1', port: 9000, secure: true }]);
    mockExecuteQuery.mockRejectedValueOnce(new Error('authentication failed'));
    let res = createRes();
    await connect({ user: { jti: 'failed-connect', username: 'alice' }, body: { user: 'ch' } }, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'authentication failed' } });

    const req = connectSession('status-session');
    res = createRes();
    status(req, res);
    expect(res.body).toMatchObject({ connected: true, chUser: 'clickhouse' });
    expect(res.body).not.toHaveProperty('password');

    res = createRes();
    disconnect(req, res);
    expect(res.body).toEqual({ connected: false });
  });

  test('reports AI provider status and contains status-provider errors', () => {
    const aiStatus = getHandler('get', '/ai-status');
    mockGetAiStatus.mockReturnValueOnce({ configured: true, provider: 'openai' });
    let res = createRes();
    aiStatus({}, res);
    expect(res.body).toEqual({ configured: true, provider: 'openai' });

    mockGetAiStatus.mockImplementationOnce(() => { throw new Error('AI configuration unavailable'); });
    res = createRes();
    aiStatus({}, res);
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'AI configuration unavailable' } });
  });
});

describe('Schema Studio infer, evaluate, and validate routes', () => {
  const infer = getHandler('post', '/infer');
  const evaluate = getHandler('post', '/evaluate');
  const validate = getHandler('post', '/validate');

  test('requires a connection and an upload or object path to infer a schema', async () => {
    let res = createRes();
    await infer({ user: { jti: 'missing' }, body: {}, query: {} }, res);
    expect(res).toMatchObject({ statusCode: 401, body: { error: expect.stringContaining('Not connected') } });

    const req = { ...connectSession('infer-missing'), body: {}, query: {} };
    res = createRes();
    await infer(req, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: expect.stringContaining('file upload') } });
  });

  test('infers uploaded columns, trims text to complete lines, and tolerates stats errors', async () => {
    mockGetClusterNodes.mockReturnValue([{ host: 'h1', port: 8123 }]);
    mockExecuteQueryWithBody
      .mockResolvedValueOnce({ rows: [{ name: 'id', type: 'Nullable(Int64)' }] })
      .mockRejectedValueOnce(new Error('stats unavailable'));
    const req = {
      ...connectSession('infer-upload'),
      body: Buffer.from('id\n1\npartial'),
      query: { format: 'csv' },
    };
    const res = createRes();

    await infer(req, res);

    expect(res.body).toEqual({
      columns: [{ name: 'id', type: 'Nullable(Int64)', nullable: true, overridden: false }],
      stats: {}, sample_rows: 0,
    });
    expect(mockExecuteQueryWithBody.mock.calls[0][0].query).toContain("format(CSVWithNames, 'id\n1')");
  });

  test('passes binary uploads as a raw request body', async () => {
    mockGetClusterNodes.mockReturnValue([{ host: 'h1' }]);
    mockExecuteQueryWithBody
      .mockResolvedValueOnce({ rows: [{ name: 'id', type: 'Int64' }] })
      .mockResolvedValueOnce({ rows: [{ _rows: 1 }] });
    const body = Buffer.from([0x50, 0x41, 0x52, 0x31]);
    const res = createRes();

    await infer({ ...connectSession('infer-parquet'), body, query: { format: 'parquet' } }, res);

    expect(mockExecuteQueryWithBody.mock.calls[0][0]).toMatchObject({
      query: expect.stringContaining('format(Parquet)'), body,
    });
    expect(res.body.columns).toHaveLength(1);
  });

  test('rejects empty inference and evaluates DDL responses', async () => {
    mockGetClusterNodes.mockReturnValue([{ host: 'h1' }]);
    mockExecuteQueryWithBody.mockResolvedValueOnce({ rows: [] });
    let res = createRes();
    await infer({ ...connectSession('infer-empty'), body: { objectStore: { path: 's3://bucket/file.parquet' } }, query: {} }, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'No columns inferred from the source.' } });

    res = createRes();
    await evaluate({ body: {} }, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'Nothing to evaluate.' } });

    mockCompleteDdl.mockResolvedValueOnce('{"assessment":"ok","suggestions":["add a key"]}');
    res = createRes();
    await evaluate({ body: { ddl: 'CREATE TABLE t (id Int64)' } }, res);
    expect(res.body).toEqual({
      assessment: 'ok', suggestions: ['add a key'], warnings: [], suggested_ddl: '',
    });
  });

  test('validates DDL via EXPLAIN and returns parse errors as ok:false', async () => {
    let res = createRes();
    await validate({ ...connectSession('validate-empty'), body: {} }, res);
    expect(res.body).toEqual({ ok: false, error: 'Empty DDL.' });

    mockGetClusterNodes.mockReturnValue([{ host: 'h1' }]);
    mockExecuteQueryWithBody.mockResolvedValueOnce({ rows: [] });
    res = createRes();
    await validate({ ...connectSession('validate-ok'), body: { ddl: 'CREATE TABLE t (id Int64)' } }, res);
    expect(res.body).toEqual({ ok: true });
    expect(mockExecuteQueryWithBody.mock.calls[0][0].query).toContain('EXPLAIN AST CREATE TABLE');

    mockExecuteQueryWithBody.mockRejectedValueOnce(new Error('syntax error'));
    res = createRes();
    await validate({ ...connectSession('validate-bad'), body: { ddl: 'bad ddl' } }, res);
    expect(res.body).toEqual({ ok: false, error: 'syntax error' });
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

describe('POST /schema-studio/create', () => {
  const create = getHandler('post', '/create');

  test('requires statements and rejects entries that are not one CREATE TABLE', async () => {
    let res = createRes();
    await create({ ...connectSession('create-empty'), body: {} }, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'Nothing to create.' } });

    res = createRes();
    await create({ ...connectSession('create-unsafe'), body: { statements: ['DROP TABLE t'] } }, res);
    expect(res).toMatchObject({ statusCode: 400, body: { error: expect.stringContaining('CREATE TABLE') } });
  });

  test('parse-checks every statement before executing and reports created prefixes', async () => {
    mockGetClusterNodes.mockReturnValue([{ host: 'h1', port: 8123 }]);
    mockExecuteQueryWithBody.mockResolvedValue({ rows: [] });
    const statements = [
      'CREATE TABLE local (id Int64) ENGINE = MergeTree ORDER BY id',
      'CREATE TABLE distributed (id Int64) ENGINE = MergeTree ORDER BY id',
    ];
    const res = createRes();

    await create({ ...connectSession('create-ok'), body: { statements } }, res);

    expect(res.body).toEqual({ ok: true, created: statements.map((s) => s.slice(0, 60)) });
    expect(mockExecuteQueryWithBody.mock.calls.slice(0, 2).map(([arg]) => arg.query)).toEqual([
      `EXPLAIN AST ${statements[0]}`,
      `EXPLAIN AST ${statements[1]}`,
    ]);
    expect(mockExecuteQueryWithBody.mock.calls.slice(2).map(([arg]) => arg.query)).toEqual(statements);
  });

  test('does not execute a CREATE when its parse check fails', async () => {
    mockGetClusterNodes.mockReturnValue([{ host: 'h1' }]);
    mockExecuteQueryWithBody.mockRejectedValueOnce(new Error('invalid engine'));
    const res = createRes();

    await create({
      ...connectSession('create-invalid'),
      body: { statements: ['CREATE TABLE t (id Int64) ENGINE = Broken'] },
    }, res);

    expect(res).toMatchObject({ statusCode: 400, body: { error: 'invalid engine' } });
    expect(mockExecuteQueryWithBody).toHaveBeenCalledTimes(1);
  });
});
