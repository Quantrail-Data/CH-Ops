// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";


const CLUSTER_UTILS = "../../src/backend/services/clusterUtils.js";
const CRED_STORE = "../../src/backend/services/chCredStore.js";
const CLICKHOUSE = "../../src/backend/services/clickhouse.js";
const EXPORT_STREAM = "../../src/backend/services/exportStream.js";
const EXPORT_JOBS = "../../src/backend/services/exportJobs.js";

const realClusterUtils = await import(CLUSTER_UTILS);
const realCredStore = await import(CRED_STORE);
const realClickhouse = await import(CLICKHOUSE);
const realStream = await import(EXPORT_STREAM);
const realJobs = await import(EXPORT_JOBS);

const getClusterNodes = mock(() => [{ host: "10.0.0.1", port: 8123, secure: false }]);
mock.module(CLUSTER_UTILS, () => ({ ...realClusterUtils, getClusterNodes }));

const getCredSession = mock(() => ({ chUser: "chops", password: "pw" }));
mock.module(CRED_STORE, () => ({ ...realCredStore, getCredSession }));

const executeQuery = mock(async () => ({ rows: [{ rows: 500 }] }));
mock.module(CLICKHOUSE, () => ({ ...realClickhouse, executeQuery }));

const measureBytes = mock(async () => ({ bytes: 1000, rows: 100 }));
mock.module(EXPORT_STREAM, () => ({ ...realStream, measureBytes }));

const createJob = mock(() => ({ id: "job-1", fileName: "kathir-export.csv.zip" }));
const getJob = mock(() => null);
const cancelJob = mock(() => true);
const issueTicket = mock(() => "ticket-abc");
const redeemTicket = mock(() => null);
mock.module(EXPORT_JOBS, () => ({
  ...realJobs,
  createJob, getJob, cancelJob, issueTicket, redeemTicket,
  describeJob: (j) => ({ id: j.id, state: j.state }),
  touchJob: () => {},
  exportConfig: () => ({ warnBytes: 1024 * 1024 * 1024 }),
}));


afterAll(() => {
  mock.module(CLUSTER_UTILS, () => ({ ...realClusterUtils }));
  mock.module(CRED_STORE, () => ({ ...realCredStore }));
  mock.module(CLICKHOUSE, () => ({ ...realClickhouse }));
  mock.module(EXPORT_STREAM, () => ({ ...realStream }));
  mock.module(EXPORT_JOBS, () => ({ ...realJobs }));
});

const mod = await import("../../src/backend/routes/export.js");
const router = mod.default;

// Pull a handler off the router by method and path.
function handler(method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method],
  );
  if (!layer) throw new Error(`no ${method} ${routePath}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function makeReq(body = {}, params = {}, username = "kathir") {
  return { body, params, user: { username, jti: "jti-1" } };
}
function makeRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    setHeader() {}, destroy() {},
  };
}

beforeEach(() => {
  for (const m of [getClusterNodes, getCredSession, executeQuery, measureBytes, createJob, getJob, cancelJob, issueTicket, redeemTicket]) {
    m.mockClear();
  }
  getClusterNodes.mockReturnValue([{ host: "10.0.0.1", port: 8123, secure: false }]);
  getCredSession.mockReturnValue({ chUser: "chops", password: "pw" });
  executeQuery.mockResolvedValue({ rows: [{ rows: 500 }] });
});

describe("POST /estimate", () => {
  test("refuses a request with no SQL", async () => {
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({}), res);
    expect(res.statusCode).toBe(400);
  });

  test("refuses an unknown format", async () => {
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({ sql: "SELECT 1", format: "NotAFormat" }), res);
    expect(res.statusCode).toBe(400);
  });

  test("reports an expired ClickHouse session with a code the UI can act on", async () => {
    getCredSession.mockReturnValue(null);
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({ sql: "SELECT 1" }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("CRED_SESSION_EXPIRED");
  });

  test("returns rows and a size for a SELECT", async () => {
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({ sql: "SELECT 1", format: "CSVWithNames" }), res);
    expect(res.body.selectLike).toBe(true);
    expect(res.body.rows).toBe(500);
    expect(res.body.bytes).toBe(5000); 
  });

  test("says a non-SELECT cannot be estimated, without erroring", async () => {
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({ sql: "SHOW TABLES" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.selectLike).toBe(false);
    expect(res.body.rows).toBeNull();
  });

  // EXPLAIN ESTIMATE does not work on system tables, table functions or some joins.
  test("falls back to an exact count when the fast estimate fails", async () => {
    executeQuery
      .mockRejectedValueOnce(new Error("cannot estimate"))
      .mockResolvedValueOnce({ rows: [{ c: 77 }] });
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({ sql: "SELECT 1", format: "CSVWithNames" }), res);
    expect(res.body.rows).toBe(77);
    expect(res.body.exact).toBe(true);
  });

  test("returns no row count rather than failing when both attempts fail", async () => {
    executeQuery.mockRejectedValue(new Error("nope"));
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({ sql: "SELECT 1", format: "CSVWithNames" }), res);
    expect(res.body.rows).toBeNull();
  });

  test("a failed sample loses the size, not the row count", async () => {
    measureBytes.mockRejectedValueOnce(new Error("sample failed"));
    const res = makeRes();
    await handler("post", "/estimate")(makeReq({ sql: "SELECT 1", format: "CSVWithNames" }), res);
    expect(res.body.rows).toBe(500);
    expect(res.body.bytes).toBeNull();
  });
});

describe("POST /jobs", () => {
  test("starts a job and returns its id", async () => {
    const res = makeRes();
    await handler("post", "/jobs")(makeReq({ sql: "SELECT 1", format: "CSVWithNames", compression: "zip", filename: "r" }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.jobId).toBe("job-1");
  });

  test("passes the caller as the owner of the job", async () => {
    await handler("post", "/jobs")(makeReq({ sql: "SELECT 1", format: "CSVWithNames" }, {}, "kathir"), makeRes());
    expect(createJob.mock.calls[0][0].username).toBe("kathir");
  });


  test("drops settings that are not in the catalogue", async () => {
    await handler("post", "/jobs")(makeReq({
      sql: "SELECT 1", format: "CSVWithNames",
      settings: { format_csv_delimiter: ";", not_a_real_setting: "x", "evil param": "y" },
    }), makeRes());
    const sent = createJob.mock.calls[0][0].settings;
    expect(sent.format_csv_delimiter).toBe(";");
    expect(sent.not_a_real_setting).toBeUndefined();
    expect(sent["evil param"]).toBeUndefined();
  });

  test("turns a refusal from the job manager into a clear response", async () => {
    const err = new Error("You already have 2 exports running.");
    err.statusCode = 400;
    createJob.mockImplementation(() => { throw err; });
    const res = makeRes();
    await handler("post", "/jobs")(makeReq({ sql: "SELECT 1", format: "CSVWithNames" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/2 exports running/);
    createJob.mockImplementation(() => ({ id: "job-1", fileName: "f.csv.zip" }));
  });

  test("refuses when no cluster node is configured", async () => {
    getClusterNodes.mockReturnValue([]);
    const res = makeRes();
    await handler("post", "/jobs")(makeReq({ sql: "SELECT 1", format: "CSVWithNames" }), res);
    expect(res.statusCode).toBe(400);
  });

 
  test("refuses a node that is not in the cluster", async () => {
    const res = makeRes();
    await handler("post", "/jobs")(makeReq({ sql: "SELECT 1", format: "CSVWithNames", node: "10.9.9.9" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe("GET /jobs/:id and cancel", () => {
  test("another person's job is simply not found", async () => {
    getJob.mockReturnValue(null);
    const res = makeRes();
    await handler("get", "/jobs/:id")(makeReq({}, { id: "job-1" }, "someone-else"), res);
    expect(res.statusCode).toBe(404);
  });

  test("the owner gets its state", async () => {
    getJob.mockReturnValue({ id: "job-1", state: "running" });
    const res = makeRes();
    await handler("get", "/jobs/:id")(makeReq({}, { id: "job-1" }), res);
    expect(res.body.state).toBe("running");
  });

  test("a ticket is only issued for a job that is ready", async () => {
    getJob.mockReturnValue({ id: "job-1", state: "running" });
    const res = makeRes();
    await handler("post", "/jobs/:id/ticket")(makeReq({}, { id: "job-1" }), res);
    expect(res.statusCode).toBe(409);

    getJob.mockReturnValue({ id: "job-1", state: "ready" });
    const res2 = makeRes();
    await handler("post", "/jobs/:id/ticket")(makeReq({}, { id: "job-1" }), res2);
    expect(res2.body.ticket).toBe("ticket-abc");
  });

  test("cancelling passes the caller so ownership is checked", async () => {
    const res = makeRes();
    await handler("delete", "/jobs/:id")(makeReq({}, { id: "job-1" }, "kathir"), res);
    expect(cancelJob).toHaveBeenCalledWith("job-1", "kathir");
  });

  test("cancelling something that is not there is a 404", async () => {
    cancelJob.mockReturnValue(false);
    const res = makeRes();
    await handler("delete", "/jobs/:id")(makeReq({}, { id: "nope" }), res);
    expect(res.statusCode).toBe(404);
    cancelJob.mockReturnValue(true);
  });
});

describe("the download route", () => {
  test("is exported separately, so it can be mounted without the login check", () => {
    expect(mod.downloadRouter).toBeDefined();
  });

  test("an expired or unknown ticket gives nothing away", async () => {
    const layer = mod.downloadRouter.stack.find((l) => l.route);
    const h = layer.route.stack[layer.route.stack.length - 1].handle;
    const res = makeRes();
    redeemTicket.mockReturnValue(null);
    h({ params: { ticket: "made-up" } }, res);
    expect(res.statusCode).toBe(404);
  });
});
