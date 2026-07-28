// Lives in tests/no-mocks: it exercises the REAL services/clickhouse.js.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

const NODE = { host: "h", port: 8123, secure: false, user: "u", password: "p" };
let calls = [];

beforeEach(() => {
  calls = [];
  global.fetch = mock(async (url) => {
    calls.push(new URL(url));
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
  });
});
afterEach(() => { delete process.env.MAX_RESULT_BYTES; });

const last = () => calls[calls.length - 1];

describe("max_result_bytes", () => {
  it("defaults to 128 MB", async () => {
    const { executeQuery } = await import("../../src/backend/services/clickhouse.js");
    await executeQuery({ ...NODE, sql: "SELECT 1" });
    expect(last().searchParams.get("max_result_bytes")).toBe(String(128 * 1024 * 1024));
  });

  it("stops cleanly rather than raising", async () => {
    const { executeQuery } = await import("../../src/backend/services/clickhouse.js");
    await executeQuery({ ...NODE, sql: "SELECT 1" });
    expect(last().searchParams.get("result_overflow_mode")).toBe("break");
  });

  it("is raised by the environment, for a larger host", async () => {
    process.env.MAX_RESULT_BYTES = String(512 * 1024 * 1024);
    const { executeQuery } = await import("../../src/backend/services/clickhouse.js");
    await executeQuery({ ...NODE, sql: "SELECT 1" });
    expect(last().searchParams.get("max_result_bytes")).toBe(String(512 * 1024 * 1024));
  });

  it("ignores a nonsense value rather than sending it", async () => {
    process.env.MAX_RESULT_BYTES = "not a number";
    const { executeQuery } = await import("../../src/backend/services/clickhouse.js");
    await executeQuery({ ...NODE, sql: "SELECT 1" });
    expect(last().searchParams.get("max_result_bytes")).toBe(String(128 * 1024 * 1024));
  });

  it("is NOT applied when the caller opts out, which the export path does", async () => {
    // Export streams to a file and must never be truncated.
    const { executeQuery } = await import("../../src/backend/services/clickhouse.js");
    await executeQuery({ ...NODE, sql: "SELECT 1", noResultLimit: true });
    expect(last().searchParams.has("max_result_bytes")).toBe(false);
    expect(last().searchParams.has("result_overflow_mode")).toBe(false);
  });

  it("lets an explicit setting from the caller win", async () => {
    // The editor sends its own row limit alongside; neither should clobber the
    // other, and a caller that names a value means it.
    const { executeQuery } = await import("../../src/backend/services/clickhouse.js");
    await executeQuery({ ...NODE, sql: "SELECT 1", settings: { max_result_bytes: 999 } });
    expect(last().searchParams.get("max_result_bytes")).toBe("999");
  });
});
