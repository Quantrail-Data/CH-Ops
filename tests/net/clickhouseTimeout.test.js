// clickhouseTimeout.test.js - timeout and cancellation on executeQuery
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, afterAll } from "bun:test";
import { executeQuery } from "../../src/backend/services/clickhouse.js";


const slow = Bun.serve({
  port: 0,
  async fetch() {
    await Bun.sleep(30000);
    return new Response("too late");
  },
});


const fast = Bun.serve({
  port: 0,
  fetch() {
    return new Response('{"n":1}\n', {
      headers: { "X-ClickHouse-Summary": '{"read_rows":"1"}' },
    });
  },
});

afterAll(() => {
  slow.stop();
  fast.stop();
});

describe("executeQuery timeout", () => {
  it("gives up when timeoutMs is set", async () => {
    const started = Date.now();
    await expect(
      executeQuery({
        host: "localhost",
        port: slow.port,
        sql: "SELECT 1",
        timeoutMs: 400,
      }),
    ).rejects.toThrow(/timed out/i);

    console.log(Date.now() - started)
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("names the timeout in the error", async () => {
    
    try {
      await executeQuery({
        host: "localhost",
        port: slow.port,
        sql: "SELECT 1",
        timeoutMs: 300,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.message).toContain("300");
    }
  });

  it("does not time out when timeoutMs is left alone", async () => {

    const started = Date.now();
    const race = await Promise.race([
      executeQuery({
        host: "localhost",
        port: slow.port,
        sql: "SELECT 1",
      }).then(() => "completed"),
      Bun.sleep(2500).then(() => "still waiting"),
    ]);


    expect(race).toBe("still waiting");
    expect(Date.now() - started).toBeGreaterThan(2000);
  });
});

describe("executeQuery cancellation", () => {
  it("stops when the caller's signal fires", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);

    await expect(
      executeQuery({
        host: "localhost",
        port: slow.port,
        sql: "SELECT 1",
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/i);
  });

  it("honours whichever fires first when both are set", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);

    const started = Date.now();
    await expect(
      executeQuery({
        host: "localhost",
        port: slow.port,
        sql: "SELECT 1",
        signal: controller.signal,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow();

 
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("completes normally when neither fires", async () => {
    const controller = new AbortController();
    const result = await executeQuery({
      host: "localhost",
      port: fast.port,
      sql: "SELECT 1",
      signal: controller.signal,
      timeoutMs: 5000,
    });
    expect(result).toBeDefined();
  });
});
