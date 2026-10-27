// routeGuards.test.js - verifies every API route has the expected role guard
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { startServer, REPO_ROOT } from "./harness.js";

const ROUTES_DIR = path.join(REPO_ROOT, "src/backend/routes");
const ROLE_GUARDS = ["requireSuperAdminOnly", "requireAdmin", "requireEditor"];

const EXPECTED_GUARDS = {
  "GET aiChats.js /chats": "none",
  "GET aiChats.js /chats/:id": "none",
  "PATCH aiChats.js /chats/:chatId/messages/:messageId": "none",
  "POST aiChats.js /chats": "none",
  "PATCH aiChats.js /chats/:id": "none",
  "DELETE aiChats.js /chats/:id": "none",
  "GET aiConnect.js /connect": "none",
  "POST aiConnect.js /connect": "none",
  "DELETE aiConnect.js /connect": "none",
  "POST aiGenerate.js /generate": "none",
  "POST aiGenerate.js /editor/generate": "none",
  "GET aiSchema.js /status": "none",
  "GET aiSchema.js /databases": "none",
  "GET aiSchema.js /tables": "none",
  "POST aiSchema.js /ddl": "none",
  "POST aiSchema.js /estimate": "none",
  "POST aiSchema.js /ddl-estimate": "none",
  "GET alerts.js /rules": "none",
  "GET alerts.js /rules/active": "none",
  "GET alerts.js /channels": "none",
  "GET alerts.js /templates": "requireAdmin",
  "POST alerts.js /rules/test": "requireAdmin",
  "POST alerts.js /rules": "requireAdmin",
  "PUT alerts.js /rules/:id": "requireAdmin",
  "DELETE alerts.js /rules/:id": "requireAdmin",
  "POST alerts.js /channels": "requireAdmin",
  "PUT alerts.js /channels/:id": "requireAdmin",
  "DELETE alerts.js /channels/:id": "requireAdmin",
  "POST alerts.js /channels/:id/test": "requireAdmin",
  "GET alerts.js /rules/:id/events": "none",
  "GET apiKeys.js /": "none",
  "GET apiKeys.js /:id/value": "requireAdmin",
  "GET apiKeys.js /active": "none",
  "GET apiKeys.js /with-values": "requireAdmin",
  "POST apiKeys.js /": "requireAdmin",
  "PUT apiKeys.js /:id": "requireAdmin",
  "DELETE apiKeys.js /:id": "requireAdmin",
  "POST apiKeys.js /select": "requireAdmin",
  "POST apiKeys.js /check": "requireAdmin",
  "POST apiKeys.js /ollama/models": "requireAdmin",
  "GET appBackup.js /list": "requireAdmin",
  "GET appBackup.js /config": "requireAdmin",
  "POST appBackup.js /create": "requireAdmin",
  "PUT appBackup.js /config": "requireAdmin",
  "GET appConfig.js /": "requireAdmin",
  "PUT appConfig.js /": "requireAdmin",
  "DELETE appConfig.js /:key": "requireAdmin",
  "POST auth.js /": "none",
  "POST auth.js /logout": "none",
  "POST auth.js /change-password": "none",
  "POST auth.js /set-password": "none",
  "GET cluster.js /": "none",
  "POST cluster.js /": "requireAdmin",
  "PUT cluster.js /:id": "requireAdmin",
  "DELETE cluster.js /:id": "requireAdmin",
  "POST cluster.js /test": "none",
  "GET config.js /connection": "none",
  "GET config.js /capabilities/:clusterId": "none",
  "GET dashboards.js /": "none",
  "POST dashboards.js /": "requireEditor",
  "PUT dashboards.js /:id": "requireEditor",
  "DELETE dashboards.js /:id": "requireAdmin",
  "GET dashboards.js /:id/charts": "none",
  "GET dashboards.js /charts": "none",
  "POST dashboards.js /charts": "requireEditor",
  "PUT dashboards.js /charts/:id": "requireEditor",
  "DELETE dashboards.js /charts/:id": "requireAdmin",
  "POST editor.js /connect": "none",
  "GET editor.js /connect": "none",
  "DELETE editor.js /connect": "none",
  "POST export.js /estimate": "none",
  "POST export.js /jobs": "none",
  "GET export.js /jobs/:id": "none",
  "POST export.js /jobs/:id/ticket": "none",
  "DELETE export.js /jobs/:id": "none",
  "GET export.js /:ticket": "none",
  "POST forgetPassword.js /email/verify": "none",
  "POST forgetPassword.js /otp/verify": "none",
  "POST forgetPassword.js /change/password": "none",
  "GET k8s.js /operators": "none",
  "GET k8s.js /connections": "none",
  "POST k8s.js /connections": "requireAdmin",
  "PUT k8s.js /connections/:id": "requireAdmin",
  "DELETE k8s.js /connections/:id": "requireAdmin",
  "POST k8s.js /test": "requireAdmin",
  "GET k8s.js /connections/:id/namespaces": "requireAdmin",
  "GET k8s.js /connections/:id/installations": "requireAdmin",
  "GET k8s.js /connections/:id/installations/:name": "requireAdmin",
  "POST k8s.js /import": "requireAdmin",
  "POST k8s.js /clusters/:id/refresh": "requireAdmin",
  "POST k8s.js /clusters/:id/reresolve": "requireAdmin",
  "POST k8s.js /clusters/verify": "requireAdmin",
  "GET k8s.js /insight/:clusterId/topology": "requireAdmin",
  "GET k8s.js /insight/:clusterId/reconcile": "requireAdmin",
  "GET k8s.js /insight/:clusterId/config": "requireAdmin",
  "GET k8s.js /insight/:clusterId/storage": "requireAdmin",
  "GET k8s.js /insight/:clusterId/network": "requireAdmin",
  "GET k8s.js /insight/:clusterId/events": "requireAdmin",
  "GET k8s.js /insight/:clusterId/logs/:pod": "requireAdmin",
  "GET k8s.js /insight/:clusterId/health": "requireAdmin",
  "GET k8s.js /insight/:clusterId/keeper": "requireAdmin",
  "GET k8s.js /insight/:clusterId/rbac-context": "requireAdmin",
  "POST k8s.js /insight/:clusterId/refresh": "requireAdmin",
  "POST query.js /": "none",
  "POST query.js /test-connection": "none",
  "POST schemaStudio.js /connect": "none",
  "GET schemaStudio.js /connect": "none",
  "DELETE schemaStudio.js /connect": "none",
  "POST schemaStudio.js /infer": "none",
  "POST schemaStudio.js /evaluate": "none",
  "POST schemaStudio.js /validate": "none",
  "POST schemaStudio.js /create": "none",
  "GET schemaStudio.js /ai-status": "none",
  "GET settings.js /": "none",
  "GET settings.js /:key": "none",
  "PUT settings.js /:key": "none",
  "DELETE settings.js /:key": "none",
  "GET storageProfiles.js /testing/:id": "requireAdmin",
  "PUT storageProfiles.js /profiles/update/:id": "requireAdmin",
  "DELETE storageProfiles.js /profiles/delete/:id": "requireAdmin",
  "GET systemSmtp.js /": "requireSuperAdminOnly",
  "PUT systemSmtp.js /": "requireSuperAdminOnly",
  "DELETE systemSmtp.js /": "requireSuperAdminOnly",
  "POST systemSmtp.js /test-connection": "requireSuperAdminOnly",
  "POST systemSmtp.js /test-email": "requireSuperAdminOnly",
  "GET trustedCa.js /": "requireAdmin",
  "POST trustedCa.js /": "requireAdmin",
  "DELETE trustedCa.js /:id": "requireAdmin",
  "GET trustedCa.js /:id/usage": "requireAdmin",
  "GET users.js /": "requireAdmin",
  "POST users.js /": "requireAdmin",
  "PUT users.js /:id": "requireAdmin",
  "DELETE users.js /:id": "requireAdmin",
  "GET users.js /regenerate": "requireAdmin",
};

function findRouteGuards() {
  const found = {};
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((name) => name.endsWith(".js"));
  for (const file of files) {
    const source = fs
      .readFileSync(path.join(ROUTES_DIR, file), "utf8")
      .replace(/\/\/.*$/gm, "")
      .replace(/\s+/g, " ");
    const registrations = source.split(
      /(?=\b\w*[Rr]outer\.(?:get|post|put|patch|delete)\()/,
    );
    for (const text of registrations) {
      const match = text.match(
        /^\w*[Rr]outer\.(get|post|put|patch|delete)\( ?["']([^"']+)["']/,
      );
      if (!match) continue;
      const guard = ROLE_GUARDS.find((name) => text.includes(name)) || "none";
      found[`${match[1].toUpperCase()} ${file} ${match[2]}`] = guard;
    }
  }
  return found;
}

describe("Part 1: the role check on each route", () => {
  const found = findRouteGuards();

  it("finds the routes", () => {
    expect(Object.keys(found).length).toBeGreaterThan(100);
  });

  it("has no route that is missing from the list", () => {
    const missing = Object.keys(found).filter(
      (route) => !(route in EXPECTED_GUARDS),
    );
    expect(missing).toEqual([]);
  });

  it("has no listed route that was removed", () => {
    const removed = Object.keys(EXPECTED_GUARDS).filter(
      (route) => !(route in found),
    );
    expect(removed).toEqual([]);
  });

  it("gives each route the expected role check", () => {
    const changed = Object.keys(EXPECTED_GUARDS)
      .filter(
        (route) => route in found && found[route] !== EXPECTED_GUARDS[route],
      )
      .map(
        (route) =>
          `${route}: expected ${EXPECTED_GUARDS[route]}, found ${found[route]}`,
      );
    expect(changed).toEqual([]);
  });

  it("checks requireSuperAdminOnly before requireAdmin when both appear", () => {
    for (const [route, guard] of Object.entries(EXPECTED_GUARDS)) {
      if (guard === "requireSuperAdminOnly") {
        expect(found[route]).toBe("requireSuperAdminOnly");
      }
    }
  });

  it("never grants a lower guard where a higher one is expected", () => {
    const rank = { none: 0, requireEditor: 1, requireAdmin: 2, requireSuperAdminOnly: 3 };
    const worse = [];
    for (const [route, expected] of Object.entries(EXPECTED_GUARDS)) {
      if (!(route in found)) continue;
      if (rank[found[route]] < rank[expected]) {
        worse.push(`${route}: expected ${expected}, found ${found[route]}`);
      }
    }
    expect(worse).toEqual([]);
  });
});

describe("Part 2: admin-only routes refuse readonly and editor users", () => {
  let app;

  beforeAll(async () => {
    app = await startServer();
    const database = app.openDatabase();
    const profiles = [
      { id: 1001, name: "p1", type: "s3", bucket: "b1", region: "us-east-1" },
    ];
    database
      .query(
        "INSERT INTO app_setting (key, value, category) VALUES ('backup_profiles', ?, 'backups')",
      )
      .run(JSON.stringify(profiles));
    database.close();
  }, 30000);

  afterAll(() => app?.stop());

  const ADMIN_ONLY_CALLS = [
    ["GET", "/api/storage/testing/1001"],
    ["PUT", "/api/storage/profiles/update/1001"],
    ["DELETE", "/api/storage/profiles/delete/1001"],
    ["GET", "/api/k8s/insight/any-cluster/topology"],
    ["GET", "/api/k8s/insight/any-cluster/config"],
    ["GET", "/api/k8s/insight/any-cluster/logs/any-pod"],
    ["GET", "/api/users"],
    ["GET", "/api/users/regenerate?userId=1"],
    ["GET", "/api/app-config"],
    ["GET", "/api/trusted-cas"],
    ["GET", "/api/app-backup/list"],
    ["GET", "/api/qurioz/api-keys/with-values"],
  ];

  for (const role of ["readonly", "editor"]) {
    it(`refuses every admin-only call from ${role}`, async () => {
      const results = [];
      for (const [method, url] of ADMIN_ONLY_CALLS) {
        const result = await app.api(
          role,
          method,
          url,
          method === "GET" ? undefined : { name: "x" },
        );
        results.push(`${method} ${url} ${result.status}`);
      }
      const expected = ADMIN_ONLY_CALLS.map(
        ([method, url]) => `${method} ${url} 403`,
      );
      expect(results).toEqual(expected);
    });
  }

  it("keeps the storage profile after the refused calls", async () => {
    const database = app.openDatabase();
    const row = database
      .query("SELECT value FROM app_setting WHERE key = 'backup_profiles'")
      .get();
    database.close();
    expect(JSON.parse(row.value)).toEqual([
      { id: 1001, name: "p1", type: "s3", bucket: "b1", region: "us-east-1" },
    ]);
  });

  it("lets an admin delete a storage profile", async () => {
    const result = await app.api(
      "admin",
      "DELETE",
      "/api/storage/profiles/delete/1001",
    );
    expect(result.status).toBe(201);
    expect(result.json.removed).toEqual([]);
  });

  it("refuses every admin-only call from a role that is not even admin", async () => {
    for (const role of ["readonly", "editor"]) {
      for (const [method, url] of ADMIN_ONLY_CALLS) {
        const result = await app.api(
          role,
          method,
          url,
          method === "GET" ? undefined : { name: "x" },
        );
        expect(result.status).not.toBe(200);
      }
    }
  });

  it("still lets a superadmin reach every admin-only call", async () => {
    for (const [method, url] of ADMIN_ONLY_CALLS) {
      const result = await app.api(
        "superadmin",
        method,
        url,
        method === "GET" ? undefined : { name: "x" },
      );
      expect(result.status).not.toBe(403);
    }
  });
});