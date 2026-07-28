// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// clickhouse-request.test.js - the request CHOps sends to ClickHouse

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { executeQuery } from "../../src/backend/services/clickhouse.js";

const NODE = { host: "10.0.0.1", port: 8123, secure: false, user: "chops", password: "pw" };

let calls = [];

function okResponse(body = "") {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => body,
  };
}

beforeEach(() => {
  calls = [];
  global.fetch = mock(async (url, opts) => {
    // executeQuery passes a URL object; new URL() accepts both so the stub does
    // not care whether that ever changes back to a string.
    calls.push({ url: new URL(url), opts });
    return okResponse();
  });
});

/** The URL of the last request, for readability in the assertions below. */
const lastUrl = () => calls[calls.length - 1].url;

describe("executeQuery: the base URL", () => {
  test("posts to the node with no extra arguments by default", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1" });
    const url = lastUrl();
    expect(url.origin).toBe("http://10.0.0.1:8123");
    expect(url.pathname).toBe("/");
    // Not empty: executeQuery applies a result ceiling to every call that has
    // not opted out (see the max_result_bytes suite). "No extra arguments"
    // means nothing beyond that ceiling.
    expect([...url.searchParams.keys()]).toEqual([
      "max_result_bytes",
      "result_overflow_mode",
    ]);
  });

  test("uses https when the node is marked secure", async () => {
    await executeQuery({ ...NODE, secure: true, sql: "SELECT 1" });
    expect(lastUrl().protocol).toBe("https:");
  });

  test("sets readonly=1 when asked", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1", readOnly: true });
    expect(lastUrl().searchParams.get("readonly")).toBe("1");
  });

  test("omits readonly entirely when not asked, rather than sending 0", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1" });
    expect(lastUrl().searchParams.has("readonly")).toBe(false);
  });
});

describe("executeQuery: query parameters", () => {
  test("sends a parameter as its own param_ argument", async () => {
    await executeQuery({ ...NODE, sql: "SELECT {t:String}", params: { t: "acme" } });
    expect(lastUrl().searchParams.get("param_t")).toBe("acme");
  });

  test("sends several parameters", async () => {
    await executeQuery({
      ...NODE,
      sql: "SELECT {a:String}, {b:UInt8}",
      params: { a: "x", b: "42" },
    });
    const p = lastUrl().searchParams;
    expect(p.get("param_a")).toBe("x");
    expect(p.get("param_b")).toBe("42");
  });

  test("leaves the SQL body untouched, placeholders and all", async () => {
    // The whole point of the feature: ClickHouse does the substitution, so the
    // value must not appear in the statement we send.
    await executeQuery({ ...NODE, sql: "SELECT {t:String}", params: { t: "acme" } });
    expect(calls[0].opts.body).toContain("{t:String}");
    expect(calls[0].opts.body).not.toContain("acme");
  });

  test("escapes a value containing & and = instead of letting it add arguments", async () => {
    // This is the injection test. Written naively into a string URL, "a&b=c"
    // would arrive as a second argument named b.
    await executeQuery({ ...NODE, sql: "SELECT {t:String}", params: { t: "a&b=c" } });
    const p = lastUrl().searchParams;
    expect(p.get("param_t")).toBe("a&b=c");
    expect(p.has("b")).toBe(false);
    // The value did not smuggle in a second argument: param_t is the only key
    // beyond the standing result ceiling.
    expect([...p.keys()]).toEqual([
      "param_t",
      "max_result_bytes",
      "result_overflow_mode",
    ]);
  });

  test("escapes a value that looks like SQL rather than acting on it", async () => {
    const nasty = "acme' OR 1=1 --";
    await executeQuery({ ...NODE, sql: "SELECT {t:String}", params: { t: nasty } });
    expect(lastUrl().searchParams.get("param_t")).toBe(nasty);
    expect(calls[0].opts.body).not.toContain("OR 1=1");
  });

  test("rejects a parameter name that is not a bare identifier", async () => {
    // Names become part of the URL, so they are validated. Values are not, and
    // do not need to be, because URLSearchParams encodes them.
    await expect(
      executeQuery({ ...NODE, sql: "SELECT 1", params: { "bad-name": "x" } }),
    ).rejects.toThrow(/Invalid parameter name/);
  });

  test("does not reach the network when a name is rejected", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1" }).catch(() => {});
    const before = calls.length;
    await executeQuery({ ...NODE, sql: "SELECT 1", params: { "a b": "x" } }).catch(() => {});
    expect(calls.length).toBe(before);
  });

  test("skips a null or undefined value rather than sending the string 'null'", async () => {
    await executeQuery({
      ...NODE,
      sql: "SELECT 1",
      params: { a: "keep", b: null, c: undefined },
    });
    const p = lastUrl().searchParams;
    expect(p.get("param_a")).toBe("keep");
    expect(p.has("param_b")).toBe(false);
    expect(p.has("param_c")).toBe(false);
  });

  test("sends an empty string, which is a real value", async () => {
    // Distinct from the case above. An empty string is what a cleared optional
    // filter looks like, and dropping it would change the query's meaning.
    await executeQuery({ ...NODE, sql: "SELECT {t:String}", params: { t: "" } });
    expect(lastUrl().searchParams.get("param_t")).toBe("");
  });
});

describe("executeQuery: request settings", () => {
  test("sends a setting as a plain argument, without the param_ prefix", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1", settings: { max_result_rows: 10001 } });
    const p = lastUrl().searchParams;
    expect(p.get("max_result_rows")).toBe("10001");
    expect(p.has("param_max_result_rows")).toBe(false);
  });

  test("sends the pair EXPLAIN indexes needs", async () => {
    await executeQuery({
      ...NODE,
      sql: "EXPLAIN indexes = 1 SELECT 1",
      settings: { use_query_condition_cache: 0, use_skip_indexes_on_data_read: 0 },
    });
    const p = lastUrl().searchParams;
    expect(p.get("use_query_condition_cache")).toBe("0");
    expect(p.get("use_skip_indexes_on_data_read")).toBe("0");
  });

  test("keeps settings out of the SQL, so no SETTINGS clause is appended", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1", settings: { max_result_rows: 10 } });
    expect(calls[0].opts.body).not.toContain("SETTINGS");
  });

  test("rejects a setting name that is not a bare identifier", async () => {
    await expect(
      executeQuery({ ...NODE, sql: "SELECT 1", settings: { "max-result-rows": 1 } }),
    ).rejects.toThrow(/Invalid setting name/);
  });

  test("skips an empty setting value", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1", settings: { a: "", b: null, c: 0 } });
    const p = lastUrl().searchParams;
    expect(p.has("a")).toBe(false);
    expect(p.has("b")).toBe(false);
    // Zero is a legitimate setting value and must survive.
    expect(p.get("c")).toBe("0");
  });

  test("carries parameters and settings together", async () => {
    await executeQuery({
      ...NODE,
      sql: "SELECT {t:String}",
      readOnly: true,
      params: { t: "acme" },
      settings: { max_result_rows: 10001 },
    });
    const p = lastUrl().searchParams;
    expect(p.get("readonly")).toBe("1");
    expect(p.get("param_t")).toBe("acme");
    expect(p.get("max_result_rows")).toBe("10001");
  });
});

describe("executeQuery: nothing changes for existing callers", () => {
  // eleven callers pass neither params nor settings, and their requests have to
  // stay byte for byte what they were before this feature existed.
  test("a plain call produces the same URL as one passing empty objects", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1" });
    const plain = lastUrl().toString();

    await executeQuery({ ...NODE, sql: "SELECT 1", params: {}, settings: {} });
    expect(lastUrl().toString()).toBe(plain);
  });

  test("a readonly call is unchanged", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1", readOnly: true });
    expect(lastUrl().toString()).toBe(
      "http://10.0.0.1:8123/?readonly=1&max_result_bytes=134217728" +
        "&result_overflow_mode=break",
    );
  });

  test("still appends FORMAT JSONEachRow to a data query", async () => {
    await executeQuery({ ...NODE, sql: "SELECT 1", params: { a: "b" } });
    expect(calls[0].opts.body).toContain("FORMAT JSONEachRow");
  });

  test("still leaves DDL without a FORMAT clause", async () => {
    await executeQuery({ ...NODE, sql: "CREATE TABLE t (x Int32) ENGINE=Memory" });
    expect(calls[0].opts.body).not.toContain("FORMAT");
  });
});
