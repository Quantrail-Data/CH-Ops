// ddlCache.test.js - The AI DDL cache never shows a table to a user who cannot read it (S8).
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, NODE_NAME } from "./harness.js";

const SECRET_DDL =
  "CREATE TABLE db1.secret (card_number String) ENGINE = MergeTree ORDER BY card_number";

function answerQuery({ sql, user }) {
  if (sql.includes("system.columns")) {
    if (user === "alice") return { body: '{"database":"db1","table":"secret"}\n' };
    return { body: "" };
  }
  if (sql.includes("SHOW CREATE")) {
    if (user === "alice")
      return { body: JSON.stringify({ statement: SECRET_DDL }) + "\n" };
    return {
      status: 500,
      body: `Code: 497. DB::Exception: ${user}: Not enough privileges. (ACCESS_DENIED)`,
    };
  }
  return { body: '{"1":1}\n' };
}

let app;

async function connectAs(role, clickHouseUser) {
  const result = await app.api(role, "POST", "/api/ai/connect", {
    clusterId: app.clusterId,
    node: NODE_NAME,
    user: clickHouseUser,
    password: "pw",
  });
  expect(result.status).toBe(200);
}

function fetchDdl(role, extra = {}) {
  return app.api(role, "POST", "/api/ai/ddl", {
    tables: ["db1.secret"],
    clusterId: app.clusterId,
    node: NODE_NAME,
    ...extra,
  });
}

function requestsFor(text) {
  return app.clickHouse.requests.filter((r) => r.sql.includes(text));
}

beforeAll(async () => {
  app = await startServer({ answerQuery });
  await connectAs("admin", "alice");
  await connectAs("editor", "bob");
}, 30000);

afterAll(() => app?.stop());

describe("AI DDL cache", () => {
  it("gives alice the DDL, then serves it from the cache", async () => {
    const first = await fetchDdl("admin");
    expect(first.json.results[0].ddl).toBe(SECRET_DDL);

    const second = await fetchDdl("admin");
    expect(second.json.results[0].ddl).toBe(SECRET_DDL);
    expect(second.json.results[0].cached).toBe(true);
  });

  it("does not give bob the cached DDL", async () => {
    const result = await fetchDdl("editor");
    expect(result.json.results).toEqual([]);
    expect(result.json.failures.length).toBe(1);
    expect(result.text).not.toContain("card_number");
  });

  it("runs the cache-hit access check as the caller, not as the cache owner", async () => {
    app.clickHouse.requests.length = 0;
    await fetchDdl("editor");
    const accessChecks = requestsFor("system.columns");
    expect(accessChecks.length).toBeGreaterThan(0);
    for (const r of accessChecks) expect(r.user).toBe("bob");
  });

  it("runs any SHOW CREATE TABLE that bob causes as bob, and the result stays empty", async () => {
    app.clickHouse.requests.length = 0;
    const result = await fetchDdl("editor");
    expect(result.json.results).toEqual([]);
    const showCreate = requestsFor("SHOW CREATE");
    for (const r of showCreate) expect(r.user).toBe("bob");
  });

  it("forceRefresh asks ClickHouse again and does not report a cache hit", async () => {
    app.clickHouse.requests.length = 0;
    const refreshed = await fetchDdl("admin", { forceRefresh: true });
    expect(refreshed.json.results[0].cached).toBe(false);
    expect(refreshed.json.results[0].ddl).toBe(SECRET_DDL);
    expect(requestsFor("SHOW CREATE").length).toBeGreaterThan(0);
  });

  it("does not send a second SHOW CREATE TABLE when the cache is warm", async () => {
    await fetchDdl("admin");

    app.clickHouse.requests.length = 0;
    const cached = await fetchDdl("admin");
    expect(cached.json.results[0].cached).toBe(true);
    expect(requestsFor("SHOW CREATE").length).toBe(0);
  });

  it("never includes the secret DDL in a failure response body", async () => {
    const result = await fetchDdl("editor");
    expect(result.json.results).toEqual([]);
    expect(result.text).not.toContain("card_number");
    expect(result.text).not.toContain(SECRET_DDL);
  });

  it("keeps the cache row intact after a denied caller fetches the same table", async () => {
    const before = await fetchDdl("admin");
    expect(before.json.results[0].ddl).toBe(SECRET_DDL);

    const denied = await fetchDdl("editor");
    expect(denied.json.results).toEqual([]);

    const after = await fetchDdl("admin");
    expect(after.json.results[0].ddl).toBe(SECRET_DDL);
    expect(after.json.results[0].cached).toBe(true);
  });
});