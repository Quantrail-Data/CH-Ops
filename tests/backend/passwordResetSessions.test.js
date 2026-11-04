// passwordResetSessions.test.js - A password reset ends the old sessions of the user.
// It also checks the email settings and the input checks of the reset routes.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import express from "express";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-reset-"));
const dbPath = path.join(tempDir, "chops.db");
process.env.DB_PATH = dbPath;
process.env.SUPER_ADMIN_1 = "reset-test-admin";
process.env.SUPER_ADMIN_1_PASSWORD = "reset-test-password";
process.env.SUPER_ADMIN_1_EMAIL = "reset-admin@example.com";

const sentEmails = [];
const sentCodes = [];
mock.module("../../src/backend/services/notifier.js", () => ({
  sendNotification: async (config, alert) => sentEmails.push({ config, alert }),
  sendOTPEmail: async (email, otp) => sentCodes.push({ email, otp }),
  testChannel: async () => {},
}));
mock.module("../../src/backend/services/systemSmtp.js", () => ({
  resolveSystemSmtp: () => ({
    host: "smtp.example.com",
    port: 465,
    secure: true,
    user: "mailer",
    pass: "mail-pass",
    from: "chops@example.com",
  }),
}));

const USER_PASSWORD = "first-password-123";
let app;
let server;
let baseUrl;
let rawDatabase;

beforeAll(async () => {
  const { initCrypto } = await import("../../src/backend/services/crypto.js");
  initCrypto("reset-sessions-test-secret-at-least-32-characters");
  await import("../../src/backend/db/migrate.js");

  const { authMiddleware } = await import("../../src/backend/middleware/auth.js");
  const authRoute = (await import("../../src/backend/routes/auth.js")).default;
  const usersRoute = (await import("../../src/backend/routes/users.js")).default;
  const forgetRoute = (await import("../../src/backend/routes/forgetPassword.js")).default;

  app = express();
  app.use(express.json());
  app.use("/api/auth", authRoute);
  app.use("/api/forget-password", forgetRoute);
  app.use("/api/users", authMiddleware, usersRoute);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  rawDatabase = new Database(dbPath);
}, 30000);

afterAll(() => {
  server?.close();
  rawDatabase?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function call(method, url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(baseUrl + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {}
  return { status: response.status, json };
}

async function login(username, password) {
  const result = await call("POST", "/api/auth", { username, password });
  if (!result.json?.token) throw new Error(`Login failed for ${username}`);
  return result.json.token;
}

// Makes a user with a known password and returns its id.
async function addUser(username, role) {
  const passwordHash = await Bun.password.hash(USER_PASSWORD, { algorithm: "argon2id" });
  rawDatabase
    .query(
      "INSERT INTO app_user (username, password_hash, role, email, must_change_password) VALUES (?, ?, ?, ?, 0)",
    )
    .run(username, passwordHash, role, `${username}@example.com`);
  return rawDatabase.query("SELECT id FROM app_user WHERE username = ?").get(username).id;
}

function tokenStillWorks(token) {
  return call("GET", "/api/users", undefined, token).then((r) => r.status === 200);
}

describe("sessions after a password reset", () => {
  it("ends the sessions of a user after an admin reset and after the setup link", async () => {
    const adminToken = await login("reset-test-admin", "reset-test-password");
    const userId = await addUser("reset-target", "admin");
    const oldToken = await login("reset-target", USER_PASSWORD);
    expect(await tokenStillWorks(oldToken)).toBe(true);

    const reset = await call("PUT", `/api/users/${userId}`, { resetPassword: true }, adminToken);
    expect(reset.status).toBe(200);
    expect(await tokenStillWorks(oldToken)).toBe(false);

    const setupToken = new URL(reset.json.setPasswordUrl.replace("#/", "")).searchParams.get("token");
    const setup = await call("POST", "/api/auth/set-password", {
      token: setupToken,
      password: "second-password-123",
      newPassword: "second-password-123",
    });
    expect(setup.status).toBe(200);
    // The old token must stay dead after the new password is set.
    expect(await tokenStillWorks(oldToken)).toBe(false);
    expect(await tokenStillWorks(setup.json.user.token)).toBe(true);
  });

  it("ends the old sessions when the user sets a password with the setup link", async () => {
    const userId = await addUser("setup-target", "admin");
    const oldToken = await login("setup-target", USER_PASSWORD);
    const setupToken = "setup-token-for-test";
    const setupTokenHash = new Bun.CryptoHasher("sha256").update(setupToken).digest("hex");
    rawDatabase
      .query(
        "UPDATE app_user SET password_setup_token_hash = ?, password_setup_token_expires_at = ? WHERE id = ?",
      )
      .run(setupTokenHash, new Date(Date.now() + 60000).toISOString(), userId);

    const setup = await call("POST", "/api/auth/set-password", {
      token: setupToken,
      password: "second-password-123",
      newPassword: "second-password-123",
    });
    expect(setup.status).toBe(200);
    expect(await tokenStillWorks(oldToken)).toBe(false);
    expect(await tokenStillWorks(setup.json.user.token)).toBe(true);
  });

  it("ends the sessions of a user after a forgot-password reset", async () => {
    await addUser("forgot-target", "admin");
    const oldToken = await login("forgot-target", USER_PASSWORD);

    await call("POST", "/api/forget-password/email/verify", { email: "forgot-target@example.com" });
    await Bun.sleep(20);
    const code = sentCodes.find((sent) => sent.email === "forgot-target@example.com").otp;
    const verified = await call("POST", "/api/forget-password/otp/verify", {
      email: "forgot-target@example.com",
      otp: code,
    });
    expect(verified.status).toBe(200);
    const changed = await call("POST", "/api/forget-password/change/password", {
      resetToken: verified.json.resetToken,
      password: "second-password-123",
    });
    expect(changed.status).toBe(200);
    expect(await tokenStillWorks(oldToken)).toBe(false);
    expect(await tokenStillWorks(await login("forgot-target", "second-password-123"))).toBe(true);
  });

  it("ends all sessions of a user after a change of password", async () => {
    await addUser("change-target", "admin");
    const firstToken = await login("change-target", USER_PASSWORD);
    const secondToken = await login("change-target", USER_PASSWORD);

    const changed = await call(
      "POST",
      "/api/auth/change-password",
      { currentPassword: USER_PASSWORD, newPassword: "second-password-123" },
      firstToken,
    );
    expect(changed.status).toBe(200);
    expect(await tokenStillWorks(firstToken)).toBe(false);
    expect(await tokenStillWorks(secondToken)).toBe(false);
    expect(await tokenStillWorks(await login("change-target", "second-password-123"))).toBe(true);
  });
});

describe("password reset emails", () => {
  it("passes smtp_secure in the welcome email and in the reset email", async () => {
    const adminToken = await login("reset-test-admin", "reset-test-password");
    sentEmails.length = 0;
    const created = await call(
      "POST",
      "/api/users",
      { username: "email-target", email: "email-target@example.com", role: "editor" },
      adminToken,
    );
    expect(created.status).toBe(201);
    await call("PUT", `/api/users/${created.json.id}`, { resetPassword: true }, adminToken);
    await Bun.sleep(20);

    expect(sentEmails.length).toBe(2);
    for (const email of sentEmails) expect(email.config.smtp_secure).toBe(true);
  });

  it("puts the real user name and role in the welcome email and in the reset email", async () => {
    const adminToken = await login("reset-test-admin", "reset-test-password");
    sentEmails.length = 0;
    const created = await call(
      "POST",
      "/api/users",
      { username: "account-target", email: "account-target@example.com", role: "editor" },
      adminToken,
    );
    await call("PUT", `/api/users/${created.json.id}`, { resetPassword: true }, adminToken);
    await Bun.sleep(20);

    expect(sentEmails.length).toBe(2);
    for (const email of sentEmails) {
      expect(email.alert.account).toEqual({ username: "account-target", role: "editor" });
      expect(email.alert.description).not.toContain("Username:");
    }
  });

  it("does not show tokenVersion or hashes in the user answers", async () => {
    const adminToken = await login("reset-test-admin", "reset-test-password");
    const created = await call(
      "POST",
      "/api/users",
      { username: "public-target", email: "public-target@example.com", role: "editor" },
      adminToken,
    );
    const listed = await call("GET", "/api/users", undefined, adminToken);
    const loggedIn = await call("POST", "/api/auth", {
      username: "reset-test-admin",
      password: "reset-test-password",
    });

    expect(created.status).toBe(201);
    expect(created.json.username).toBe("public-target");
    const answers = [created.json, loggedIn.json, ...listed.json];
    for (const answer of answers) {
      expect(answer.tokenVersion).toBeUndefined();
      expect(answer.passwordHash).toBeUndefined();
      expect(answer.passwordSetupTokenHash).toBeUndefined();
    }
  });
});

describe("forgot-password input checks", () => {
  it("refuses a password that is not a string with 400", async () => {
    await addUser("type-target", "editor");
    await call("POST", "/api/forget-password/email/verify", { email: "type-target@example.com" });
    await Bun.sleep(20);
    const code = sentCodes.find((sent) => sent.email === "type-target@example.com").otp;
    const verified = await call("POST", "/api/forget-password/otp/verify", {
      email: "type-target@example.com",
      otp: code,
    });
    const result = await call("POST", "/api/forget-password/change/password", {
      resetToken: verified.json.resetToken,
      password: ["a", "b", "c", "d", "e", "f", "g", "h"],
    });
    expect(result.status).toBe(400);
  });
});
