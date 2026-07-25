/**
 * exportStream.test.js - The request CHOps sends to ClickHouse for an export.
Copyright (C) 2026 Quantrail™ Data Private Limited
author -> Sanjeev Kumar G
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  startExportStream, measureBytes, killExportQuery,
} from "../../src/backend/services/exportStream.js";

const NODE = { host: "10.0.0.1", port: 8123, secure: false, user: "chops", password: "pw" };
let calls = [];

function okResponse(body = "data", headers = {}) {
  return {
    ok: true, status: 200, body: "stream-placeholder",
    headers: { get: (k) => headers[k] ?? null },
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

beforeEach(() => {
  calls = [];
  global.fetch = mock(async (url, opts) => { calls.push({ url: new URL(url), opts }); return okResponse(); });
});

describe("startExportStream", () => {
  test("uses readonly level 2, not level 1", async () => {
    await startExportStream({ ...NODE, sql: "SELECT 1", format: "CSVWithNames", queryId: "q1" });
    expect(calls[0].url.searchParams.get("readonly")).toBe("2");
  });

  test("passes the query id so the job can be cancelled later", async () => {
    await startExportStream({ ...NODE, sql: "SELECT 1", format: "CSVWithNames", queryId: "abc-123" });
    expect(calls[0].url.searchParams.get("query_id")).toBe("abc-123");
  });

  test("appends the chosen format to the normalized SQL", async () => {
    await startExportStream({ ...NODE, sql: "SELECT 1;", format: "Parquet", queryId: "q" });
    expect(calls[0].opts.body).toBe("SELECT 1\nFORMAT Parquet");
  });

  test("sends the credentials as headers", async () => {
    await startExportStream({ ...NODE, sql: "SELECT 1", format: "CSVWithNames", queryId: "q" });
    expect(calls[0].opts.headers["X-ClickHouse-User"]).toBe("chops");
    expect(calls[0].opts.headers["X-ClickHouse-Key"]).toBe("pw");
  });

  test("uses https when the node is secure", async () => {
    await startExportStream({ ...NODE, secure: true, sql: "SELECT 1", format: "CSVWithNames", queryId: "q" });
    expect(calls[0].url.protocol).toBe("https:");
  });

  test("forwards settings as request parameters", async () => {
    await startExportStream({
      ...NODE, sql: "SELECT 1", format: "CSVWithNames", queryId: "q",
      settings: { format_csv_delimiter: ";", output_format_csv_crlf_end_of_line: 1 },
    });
    expect(calls[0].url.searchParams.get("format_csv_delimiter")).toBe(";");
    expect(calls[0].url.searchParams.get("output_format_csv_crlf_end_of_line")).toBe("1");
  });

  test("drops empty settings rather than sending blanks", async () => {
    await startExportStream({
      ...NODE, sql: "SELECT 1", format: "CSVWithNames", queryId: "q",
      settings: { a_setting: "", b_setting: null, c_setting: undefined },
    });
    for (const k of ["a_setting", "b_setting", "c_setting"]) {
      expect(calls[0].url.searchParams.has(k)).toBe(false);
    }
  });


  test("ignores setting names that are not plain identifiers", async () => {
    await startExportStream({
      ...NODE, sql: "SELECT 1", format: "CSVWithNames", queryId: "q",
      settings: { "bad name": "x", "evil&param": "y", "ok_setting": "z" },
    });
    expect(calls[0].url.searchParams.has("bad name")).toBe(false);
    expect(calls[0].url.searchParams.has("evil&param")).toBe(false);
    expect(calls[0].url.searchParams.get("ok_setting")).toBe("z");
  });

  test("raises the ClickHouse error text when the request fails", async () => {
    global.fetch = mock(async () => ({
      ok: false, status: 400, headers: { get: () => null }, text: async () => "Code: 62. Syntax error",
    }));
    await expect(startExportStream({ ...NODE, sql: "SELECT bad", format: "CSVWithNames", queryId: "q" }))
      .rejects.toThrow(/Syntax error/);
  });
});

describe("measureBytes", () => {
  test("reports the byte size of the sample and the rows it covered", async () => {
    global.fetch = mock(async () => okResponse("abcdefghij", {
      "X-ClickHouse-Summary": JSON.stringify({ result_rows: "5" }),
    }));
    const out = await measureBytes({ ...NODE, sql: "SELECT 1", format: "CSVWithNames" });
    expect(out.bytes).toBe(10);
    expect(out.rows).toBe(5);
  });

  test("returns zero rows rather than failing when the summary is missing", async () => {
    global.fetch = mock(async () => okResponse("abc"));
    const out = await measureBytes({ ...NODE, sql: "SELECT 1", format: "CSVWithNames" });
    expect(out.rows).toBe(0);
  });

  test("caps how long the sample may run", async () => {
    await measureBytes({ ...NODE, sql: "SELECT 1", format: "CSVWithNames" });
    expect(calls[0].url.searchParams.get("max_execution_time")).toBe("30");
  });
});

describe("killExportQuery", () => {
  test("issues a KILL for the given query id", async () => {
    await killExportQuery({ ...NODE, queryId: "run-7" });
    expect(calls[0].opts.body).toContain("KILL QUERY");
    expect(calls[0].opts.body).toContain("run-7");
  });

  test("does nothing without a query id", async () => {
    await killExportQuery({ ...NODE, queryId: null });
    expect(calls.length).toBe(0);
  });


  test("swallows its own failure", async () => {
    global.fetch = mock(async () => { throw new Error("network down"); });
    await expect(killExportQuery({ ...NODE, queryId: "q" })).resolves.toBeUndefined();
  });
});
