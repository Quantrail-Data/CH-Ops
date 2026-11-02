// userAccounts.test.js - Password resets, setup links and bookmarks, through the real API.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "./harness.js";

let app;

beforeAll(async () => {
  app = await startServer();
}, 30000);

afterAll(async () => {
  await app?.stop();
});

async function createUser(callerRole, username, role) {
  const created = await app.api(callerRole, "POST", "/api/users", {
    username,
    email: `${username}@example.com`,
    role,
  });
  if (created.status !== 201) throw new Error(`User create failed: ${created.text}`);
  return created.json.id;
}

function userIdOf(username) {
  const database = app.openDatabase();
  const user = database.query("SELECT id FROM app_user WHERE username = ?").get(username);
  database.close();
  return user.id;
}

describe("password reset", () => {
  it("refuses an admin who resets the password of a superadmin", async () => {
    // Not the default superadmin: the default user has its own guard.
    const superadminId = await createUser("superadmin", "second-superadmin", "superadmin");
    const result = await app.api("admin", "PUT", `/api/users/${superadminId}`, {
      resetPassword: true,
    });
    expect(result.status).toBe(403);
  });

  it("gives a setup link and no password, and removes the old password", async () => {
    const userId = await createUser("admin", "reset-me", "editor");
    const database = app.openDatabase();
    database.query("UPDATE app_user SET password_hash = 'old-hash' WHERE id = ?").run(userId);

    const result = await app.api("admin", "PUT", `/api/users/${userId}`, {
      resetPassword: true,
    });

    expect(result.status).toBe(200);
    expect(result.json.generatedPassword).toBeUndefined();
    // FRONTEND_LINK is not set in the tests, so the link uses the address of the request.
    expect(result.json.setPasswordUrl).toMatch(/^https?:\/\/[^\/]+(?::\d+)?\/#\/set-password\?token=/);
    const user = database
      .query("SELECT password_hash, password_setup_token_hash FROM app_user WHERE id = ?")
      .get(userId);
    database.close();
    expect(user.password_hash).toBe(null);
    expect(user.password_setup_token_hash).toBeTruthy();
  });
});

describe("new setup link", () => {
  it("refuses an admin for a superadmin, and allows a superadmin", async () => {
    const newSuperadminId = await createUser("superadmin", "new-superadmin", "superadmin");
    const byAdmin = await app.api("admin", "GET", `/api/users/regenerate?userId=${newSuperadminId}`);
    expect(byAdmin.status).toBe(403);
    const bySuperadmin = await app.api(
      "superadmin",
      "GET",
      `/api/users/regenerate?userId=${newSuperadminId}`,
    );
    expect(bySuperadmin.status).toBe(201);
    expect(bySuperadmin.json.setPasswordUrl).toContain("token=");
  });
});

describe("bookmarks", () => {
  const BOOKMARKS = JSON.stringify([{ name: "mine", sql: "SELECT 1" }]);

  it("keeps the bookmarks of each user apart", async () => {
    const saved = await app.api("editor", "PUT", "/api/settings/query_bookmarks", {
      value: BOOKMARKS,
      category: "editor",
    });
    expect(saved.status).toBe(200);

    const ownBookmarks = await app.api("editor", "GET", "/api/settings/query_bookmarks");
    expect(ownBookmarks.json.value).toBe(BOOKMARKS);

    const otherUser = await app.api("readonly", "GET", "/api/settings/query_bookmarks");
    expect(otherUser.status).toBe(404);
  });

  it("does not let anyone read or change the stored key of another user", async () => {
    const editorId = userIdOf("test-editor");
    const read = await app.api("admin", "GET", `/api/settings/query_bookmarks:${editorId}`);
    expect(read.status).toBe(403);
    const write = await app.api("readonly", "PUT", `/api/settings/query_bookmarks:${editorId}`, {
      value: "[]",
    });
    expect(write.status).toBe(403);
    const listed = await app.api("admin", "GET", "/api/settings");
    const keys = listed.json.map((row) => row.key);
    expect(keys.some((key) => key.startsWith("query_bookmarks:"))).toBe(false);
  });
});
