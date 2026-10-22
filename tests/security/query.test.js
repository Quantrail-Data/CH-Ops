// query.test.js - integration tests for query authorization, read-only enforcement, and service-account usage
// Contributors - Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, NODE_NAME } from "./harness.js";

const WRITES = [
  "DROP TABLE db1.t1",
  "CREATE USER attacker IDENTIFIED BY 'x'",
  "GRANT ALL ON *.* TO attacker",
  "INSERT INTO db1.t1 VALUES (1)",
  "ALTER TABLE db1.t1 DELETE WHERE 1",
  "SYSTEM SHUTDOWN",
];

let app;

function queryBody(sql, extra = {}) {
  return { sql, clusterId: app.clusterId, node: NODE_NAME, ...extra };
}

function sentToClickHouse(text) {
  return app.clickHouse.requests.filter((request) =>
    request.sql.includes(text),
  );
}

beforeAll(async () => {
  app = await startServer();
}, 30000);

afterAll(() => app?.stop());

describe("service account: readonly and editor users", () => {
  for (const role of ["readonly", "editor"]) {
    it(`refuses every write from ${role} before it reaches ClickHouse`, async () => {
      for (const sql of WRITES) {
        app.clickHouse.requests.length = 0;
        const result = await app.api(
          role,
          "POST",
          "/api/query",
          queryBody(sql),
        );
        expect(result.status).toBe(400);
        expect(result.json.error).toContain("read-only");
        expect(sentToClickHouse(sql)).toEqual([]);
      }
    });

    it(`refuses a write from ${role} that asks for readOnly false`, async () => {
      const result = await app.api(
        role,
        "POST",
        "/api/query",
        queryBody("DROP TABLE db1.t1", { readOnly: false }),
      );
      expect(result.status).toBe(400);
    });

    it(`runs a SELECT from ${role} with readonly=1`, async () => {
      app.clickHouse.requests.length = 0;
      const result = await app.api(
        role,
        "POST",
        "/api/query",
        queryBody("SELECT 42"),
      );
      expect(result.status).toBe(200);
      const sent = sentToClickHouse("SELECT 42");
      expect(sent.length).toBe(1);
      expect(sent[0].readonly).toBe("1");
      expect(sent[0].user).toBe("service");
    });

    it(`refuses storage profile SQL from ${role}`, async () => {
      const backup = await app.api(
        role,
        "POST",
        "/api/query",
        queryBody("1-//-SELECT 1", { backup_sp: true }),
      );
      expect(backup.status).toBe(403);
      const encrypted = await app.api(
        role,
        "POST",
        "/api/query",
        queryBody("v1:00:00:00", { sp: true }),
      );
      expect(encrypted.status).toBe(403);
    });

    it(`refuses a write from ${role} sent with a lower-case keyword`, async () => {
      app.clickHouse.requests.length = 0;
      const result = await app.api(
        role,
        "POST",
        "/api/query",
        queryBody("drop table db1.lowercase"),
      );
      expect(result.status).toBe(400);
      expect(sentToClickHouse("drop table db1.lowercase")).toEqual([]);
    });

    it(`runs an ordinary SELECT from ${role} even when the SQL contains the word 'readonly' inside a string`, async () => {
      app.clickHouse.requests.length = 0;
      const result = await app.api(
        role,
        "POST",
        "/api/query",
        queryBody("SELECT 'readonly' AS note"),
      );
      expect(result.status).toBe(200);
      const sent = sentToClickHouse("SELECT 'readonly' AS note");
      expect(sent.length).toBe(1);
      expect(sent[0].readonly).toBe("1");
    });
  }
});

describe("own ClickHouse login: editors", () => {
  it("runs an editor's write with the editor's own login, not the service account", async () => {
    app.clickHouse.requests.length = 0;
    const result = await app.api(
      "editor",
      "POST",
      "/api/query",
      queryBody("DROP TABLE db1.own_login", {
        strictAuth: true,
        user: "editor_ch",
        password: "pw",
      }),
    );
    expect(result.status).toBe(200);
    const sent = sentToClickHouse("DROP TABLE db1.own_login");
    expect(sent.length).toBe(1);
    expect(sent[0].user).toBe("editor_ch");
    expect(sent[0].readonly).toBe(null);
  });
});

describe("service account: admins", () => {
  for (const role of ["admin", "superadmin"]) {
    it(`runs a write from ${role}`, async () => {
      app.clickHouse.requests.length = 0;
      const result = await app.api(
        role,
        "POST",
        "/api/query",
        queryBody(`DROP TABLE db1.by_${role}`),
      );
      expect(result.status).toBe(200);
      const sent = sentToClickHouse(`DROP TABLE db1.by_${role}`);
      expect(sent.length).toBe(1);
      expect(sent[0].readonly).toBe(null);
    });
  }

  it("does not add readonly=1 to an admin's SELECT either", async () => {
    app.clickHouse.requests.length = 0;
    const result = await app.api(
      "admin",
      "POST",
      "/api/query",
      queryBody("SELECT 44"),
    );
    expect(result.status).toBe(200);
    const sent = sentToClickHouse("SELECT 44");
    expect(sent.length).toBe(1);
    expect(sent[0].readonly).toBe(null);
  });
});

describe("settings passed with a query", () => {
  it("does not forward a setting that is not on the allow list", async () => {
    app.clickHouse.requests.length = 0;
    await app.api(
      "editor",
      "POST",
      "/api/query",
      queryBody("SELECT 43", { settings: { readonly: 0 } }),
    );
    const sent = sentToClickHouse("SELECT 43");
    expect(sent[0].readonly).toBe("1");
  });
});