// settings.test.js - integration tests for settings read and write access across all roles
// Contributors - Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, ROLES } from "./harness.js";

let app;

beforeAll(async () => {
  app = await startServer();
}, 30000);

afterAll(() => app?.stop());

describe("settings reads", () => {
  it("never returns the JWT signing key, to any role", async () => {
    for (const role of ROLES) {
      for (const key of [
        "jwt.currentSecret",
        "jwt.previousSecret",
        "jwt.rotatedAt",
      ]) {
        const result = await app.api(role, "GET", `/api/settings/${key}`);
        expect(result.status).toBe(403);
      }
    }
  });

  it("never lists the JWT keys, to any role", async () => {
    for (const role of ROLES) {
      const byCategory = await app.api(
        role,
        "GET",
        "/api/settings?category=jwt",
      );
      expect(byCategory.json).toEqual([]);
      const all = await app.api(role, "GET", "/api/settings");
      const keys = all.json.map((row) => row.key);
      expect(keys.some((key) => key.startsWith("jwt."))).toBe(false);
      expect(keys.some((key) => key.startsWith("smtp."))).toBe(false);
    }
  });

  it("refuses general keys to readonly and editor users", async () => {
    for (const role of ["readonly", "editor"]) {
      const result = await app.api(
        role,
        "GET",
        "/api/settings/backup_profiles",
      );
      expect(result.status).toBe(403);
    }
  });

  it("lets every role read query bookmarks", async () => {
    for (const role of ROLES) {
      const result = await app.api(
        role,
        "GET",
        "/api/settings/query_bookmarks",
      );
      expect([200, 404]).toContain(result.status);
    }
  });

  it("returns 403 rather than 404 for a JWT key that does not exist", async () => {
    const result = await app.api(
      "readonly",
      "GET",
      "/api/settings/jwt.doesNotExist",
    );
    expect(result.status).toBe(403);
  });

  it("refuses every smtp.* key to readonly and editor users", async () => {
    for (const role of ["readonly", "editor"]) {
      for (const key of ["smtp.host", "smtp.user", "smtp.pass"]) {
        const result = await app.api(role, "GET", `/api/settings/${key}`);
        expect(result.status).toBe(403);
      }
    }
  });

  it("gives admins a 200 or 404 but never a 403 for a general key", async () => {
    for (const role of ["admin", "superadmin"]) {
      const result = await app.api(role, "GET", "/api/settings/theme");
      expect([200, 404]).toContain(result.status);
    }
  });
});

describe("settings writes", () => {
  const PROTECTED_KEYS = [
    "backup_profiles",
    "clusters",
    "cluster.nodes",
    "app_backup_config",
    "k8s.enabled",
  ];

  it("refuses protected keys to readonly and editor users", async () => {
    for (const role of ["readonly", "editor"]) {
      for (const key of PROTECTED_KEYS) {
        const write = await app.api(role, "PUT", `/api/settings/${key}`, {
          value: "[]",
          category: "general",
        });
        expect(write.status).toBe(403);
        const remove = await app.api(role, "DELETE", `/api/settings/${key}`);
        expect(remove.status).toBe(403);
      }
    }
  });

  it("refuses the JWT keys to every role", async () => {
    for (const role of ROLES) {
      const write = await app.api(
        role,
        "PUT",
        "/api/settings/jwt.currentSecret",
        { value: "attacker-key" },
      );
      expect(write.status).toBe(403);
      const remove = await app.api(
        role,
        "DELETE",
        "/api/settings/jwt.currentSecret",
      );
      expect(remove.status).toBe(403);
    }
  });

  it("refuses keys that are not on the write list", async () => {
    for (const role of ROLES) {
      const write = await app.api(
        role,
        "PUT",
        "/api/settings/some.unknown.key",
        { value: "x" },
      );
      expect(write.status).toBe(403);
    }
  });

  it("refuses every smtp.* write to every role, including superadmin", async () => {
    for (const role of ROLES) {
      const write = await app.api(role, "PUT", "/api/settings/smtp.pass", {
        value: "attack",
      });
      expect(write.status).toBe(403);
    }
  });

  it("lets a readonly user save query bookmarks", async () => {
    const write = await app.api(
      "readonly",
      "PUT",
      "/api/settings/query_bookmarks",
      { value: "[]", category: "general" },
    );
    expect(write.status).toBe(200);
  });
});