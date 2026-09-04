// aiRouteHelpers.test.js - unit tests for the shared helpers used by routes/ai*.js

import { describe, it, expect, mock } from "bun:test";
import {
  resolveContext,
  normaliseTables,
  fail,
  notFound,
} from "../../src/backend/routes/aiRouteHelpers.js";
import { CRED_CONTEXTS } from "../../src/backend/services/chCredStore.js";

describe("resolveContext", () => {
  it("reads context from the body", () => {
    expect(resolveContext({ body: { context: "editor" }, query: {} })).toBe("editor");
  });

  it("reads context from the query when body has none", () => {
    expect(resolveContext({ body: {}, query: { context: "editor" } })).toBe("editor");
  });

  it("prefers the body over the query when both are present", () => {
    expect(
      resolveContext({ body: { context: "editor" }, query: { context: "schema-studio" } }),
    ).toBe("editor");
  });

  it("falls back to QURIOZ for an invalid context, without throwing", () => {
    expect(() =>
      resolveContext({ body: { context: "bogus" }, query: {} }),
    ).not.toThrow();
    expect(resolveContext({ body: { context: "bogus" }, query: {} })).toBe(
      CRED_CONTEXTS.QURIOZ,
    );
  });

  it("falls back to QURIOZ when neither body nor query has a context", () => {
    expect(resolveContext({ body: {}, query: {} })).toBe(CRED_CONTEXTS.QURIOZ);
  });
});

describe("normaliseTables", () => {
  it("returns [] for a non-array input", () => {
    expect(normaliseTables("not an array")).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(normaliseTables(undefined)).toEqual([]);
  });

  it("splits a db.table string", () => {
    expect(normaliseTables(["analytics.events"])).toEqual([
      { database: "analytics", table: "events" },
    ]);
  });

  it("passes through an already-shaped object", () => {
    expect(normaliseTables([{ database: "a", table: "b" }])).toEqual([
      { database: "a", table: "b" },
    ]);
  });

  it("drops a string with no dot", () => {
    expect(normaliseTables(["noDotHere"])).toEqual([]);
  });

  it("drops an object missing the table field", () => {
    expect(normaliseTables([{ database: "a" }])).toEqual([]);
  });

  it("filters invalid entries while keeping valid ones, preserving order", () => {
    expect(normaliseTables(["a.b", "badentry", { database: "c", table: "d" }])).toEqual([
      { database: "a", table: "b" },
      { database: "c", table: "d" },
    ]);
  });

  it("splits on the first dot only, so a second dot stays in the table name", () => {
    expect(normaliseTables(["a.b.c"])).toEqual([{ database: "a", table: "b.c" }]);
  });
});

function fakeRes() {
  const res = {
    status: mock(() => res),
    json: mock(),
  };
  return res;
}

describe("fail", () => {
  it("uses e.statusCode when present", () => {
    const res = fakeRes();
    fail(res, { statusCode: 402 });
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it("falls back to e.status when statusCode is absent", () => {
    const res = fakeRes();
    fail(res, { status: 403 });
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("prefers statusCode over status when both are present", () => {
    const res = fakeRes();
    fail(res, { statusCode: 402, status: 403 });
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it("defaults to 400 when neither is set", () => {
    const res = fakeRes();
    fail(res, {});
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("includes code from e.errorCode", () => {
    const res = fakeRes();
    fail(res, { errorCode: "AI_X" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_X" }));
  });

  it("falls back to e.code when errorCode is absent", () => {
    const res = fakeRes();
    fail(res, { code: "AI_Y" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_Y" }));
  });

  it("prefers errorCode over code when both are present", () => {
    const res = fakeRes();
    fail(res, { errorCode: "AI_X", code: "AI_Y" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_X" }));
  });

  it("omits the code key entirely when neither errorCode nor code is set", () => {
    const res = fakeRes();
    fail(res, {});
    const body = res.json.mock.calls[0][0];
    expect("code" in body).toBe(false);
  });

  it("defaults the error message to 'Request failed.' when e.message is absent", () => {
    const res = fakeRes();
    fail(res, {});
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Request failed." }));
  });

  it("does not throw and uses the same defaults when e is undefined", () => {
    const res = fakeRes();
    expect(() => fail(res, undefined)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Request failed." });
  });

  it("does not throw and uses the same defaults when e is null", () => {
    const res = fakeRes();
    expect(() => fail(res, null)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Request failed." });
  });
});

describe("notFound", () => {
  it("responds 404 with the chat-not-found body", () => {
    const res = fakeRes();
    notFound(res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Chat not found." });
  });
});
