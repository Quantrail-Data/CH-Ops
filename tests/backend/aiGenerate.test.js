// aiGenerate.test.js - route tests for routes/aiGenerate.js (POST /generate)
//
// generateSql is mocked away wholesale via mock.module, so no real DdlService,
// AI provider, or ChatStore call ever happens - this test is only about the
// route's own request handling (validation, defaulting, and response
// plumbing), not SQLGenerationService's logic (covered in
// SQLGenerationService.test.js). mock.module patches the whole test process,
// but SQLGenerationService.js is only imported directly by aiGenerate.js and
// by SQLGenerationService.test.js (which imports it un-mocked to test the real
// thing) - so as long as this file is the only one mocking it, there's no
// cross-file leak to guard against here.
//
// Rate limiting: aiGenerate.js attaches its own rateLimiter(60, 60, ...)
// middleware directly inside its router.post(...) call - it is not applied at
// the server.js mount point. That's a server.js wiring fact, not something
// this file (which calls the route handler directly, bypassing the mount)
// can prove either way.

import { describe, it, expect, mock } from "bun:test";

let generateSqlImpl = mock(async () => ({ ok: true }));
mock.module("../../src/backend/servicesAI/SQLGenerationService.js", () => ({
  generateSql: (...args) => generateSqlImpl(...args),
}));

const { default: aiGenerateRouter } = await import("../../src/backend/routes/aiGenerate.js");

function getHandler() {
  const layer = aiGenerateRouter.stack.find(
    (l) => l.route?.path === "/generate" && l.route.methods.post,
  );
  if (!layer) throw new Error("No POST /generate handler found");
  // The route stack for this path is [rateLimiter, handler] - the actual
  // request handler is the last middleware in the chain.
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const generate = getHandler();

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

function reqWith(body, user = { username: "alice", jti: "j-1" }) {
  return { body, user, query: {} };
}

describe("POST /generate - validation", () => {
  it("rejects a missing instruction with 422, never calling generateSql", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(reqWith({ tables: ["a.b"] }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "An instruction is required." });
    expect(generateSqlImpl).not.toHaveBeenCalled();
  });

  it("rejects an empty/whitespace-only instruction with 422, never calling generateSql", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(reqWith({ instruction: "   ", tables: ["a.b"] }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "An instruction is required." });
    expect(generateSqlImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing tables array with 422, never calling generateSql", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(reqWith({ instruction: "show me events" }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "A tables array is required." });
    expect(generateSqlImpl).not.toHaveBeenCalled();
  });

  it("rejects tables that normalise to empty with 422, never calling generateSql", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(reqWith({ instruction: "show me events", tables: ["noDotHere"] }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "A tables array is required." });
    expect(generateSqlImpl).not.toHaveBeenCalled();
  });
});

describe("POST /generate - defaults and passthrough to generateSql", () => {
  it("passes jti/appUser/context and default-null/false fields for a minimal request", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(
      reqWith(
        { instruction: "show me events", tables: ["analytics.events"] },
        { username: "alice", jti: "jti-1" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(generateSqlImpl).toHaveBeenCalledTimes(1);
    const call = generateSqlImpl.mock.calls[0][0];
    expect(call.jti).toBe("jti-1");
    expect(call.appUser).toBe("alice");
    expect(call.context).toBe("qurioz");
    expect(call.chatId).toBeNull();
    expect(call.clusterId).toBeNull();
    expect(call.node).toBeNull();
    expect(call.previousInstruction).toBeNull();
    expect(call.previousSql).toBeNull();
    expect(call.forceRefreshDdl).toBe(false);
    expect(call.instruction).toBe("show me events");
  });

  it("resolves an explicit context from the body", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(
      reqWith({
        instruction: "x",
        tables: ["a.b"],
        context: "editor",
      }),
      res,
    );
    expect(generateSqlImpl.mock.calls[0][0].context).toBe("editor");
  });

  it("normalises string tables before calling generateSql", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(reqWith({ instruction: "x", tables: ["db.table"] }), res);
    expect(generateSqlImpl.mock.calls[0][0].tables).toEqual([{ database: "db", table: "table" }]);
  });

  it("boolean-coerces a truthy non-boolean forceRefreshDdl", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(
      reqWith({ instruction: "x", tables: ["a.b"], forceRefreshDdl: "yes" }),
      res,
    );
    expect(generateSqlImpl.mock.calls[0][0].forceRefreshDdl).toBe(true);
  });

  it("coerces an explicit forceRefreshDdl: true through as boolean true", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(reqWith({ instruction: "x", tables: ["a.b"], forceRefreshDdl: true }), res);
    expect(generateSqlImpl.mock.calls[0][0].forceRefreshDdl).toBe(true);
  });

  it("passes chatId through unchanged when provided", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(reqWith({ instruction: "x", tables: ["a.b"], chatId: 42 }), res);
    expect(generateSqlImpl.mock.calls[0][0].chatId).toBe(42);
  });

  it("passes previousInstruction/previousSql through unchanged with chatId: null - the wizard refine path", async () => {
    generateSqlImpl = mock(async () => ({ ok: true }));
    const res = createRes();
    await generate(
      reqWith({
        instruction: "refine that",
        tables: ["a.b"],
        chatId: null,
        previousInstruction: "what were last week's signups",
        previousSql: "SELECT count() FROM analytics.signups",
      }),
      res,
    );
    const call = generateSqlImpl.mock.calls[0][0];
    expect(call.chatId).toBeNull();
    expect(call.previousInstruction).toBe("what were last week's signups");
    expect(call.previousSql).toBe("SELECT count() FROM analytics.signups");
  });
});

describe("POST /generate - response plumbing", () => {
  it("returns generateSql's resolved value verbatim as the response JSON", async () => {
    const payload = { chatId: null, sql: "SELECT 1", responseText: null, tokensEstimated: 12 };
    generateSqlImpl = mock(async () => payload);
    const res = createRes();
    await generate(reqWith({ instruction: "x", tables: ["a.b"] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(payload);
  });

  it("routes a generateSql rejection through fail(res, e) with its status", async () => {
    generateSqlImpl = mock(async () => {
      const e = new Error("No AI provider configured. Set one in Settings.");
      e.statusCode = 400;
      throw e;
    });
    const res = createRes();
    await generate(reqWith({ instruction: "x", tables: ["a.b"] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("No AI provider configured. Set one in Settings.");
  });
});
