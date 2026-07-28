// auth-env-fallback.test.js - Unit tests for the .env super-admin login path.

//Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
import { describe, it, expect, beforeAll, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "../../src/backend/db/schema.js";

const sqlite = new Database(":memory:");
sqlite.exec(`CREATE TABLE app_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'readonly',
  email TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT,
  updated_at TEXT
);`);
const testDb = drizzle(sqlite, { schema });

mock.module("../../src/backend/db/index.js", () => ({
  db: testDb,
  appUsers: schema.appUsers,
}));

const { login } = await import("../../src/backend/controllers/auth.js");
const { setSecret, verify } = await import("../../src/backend/services/jwt.js");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

beforeAll(() => {
  setSecret("env-fallback-test-secret-32-chars-minimum!");
  process.env.SUPER_ADMIN_1 = "recovery";
  process.env.SUPER_ADMIN_1_PASSWORD = "recovery-password";
  process.env.SUPER_ADMIN_1_EMAIL = "recovery@example.com";
  process.env.SESSION_SECRET = "env-fallback-test-secret-32-chars-minimum!";
  delete process.env.DISABLE_ENV_LOGIN;
});

beforeEach(() => {
  sqlite.exec("DELETE FROM app_user");
});

describe(".env super admin fallback", () => {
  it("issues a token carrying a userId", async () => {
    const res = mockRes();
    await login(
      { body: { username: "recovery", password: "recovery-password" } },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();

    const payload = verify(res.body.token);
    // The whole point: without this, every authenticated request 401s.
    expect(payload.userId).toBeGreaterThan(0);
    expect(payload.role).toBe("superadmin");
    expect(payload.username).toBe("recovery");
  });

  it("recreates the missing account", async () => {
    const before = testDb.select().from(schema.appUsers).all();
    expect(before).toHaveLength(0);

    const res = mockRes();
    await login(
      { body: { username: "recovery", password: "recovery-password" } },
      res,
    );

    const row = testDb
      .select()
      .from(schema.appUsers)
      .where(eq(schema.appUsers.username, "recovery"))
      .get();

    expect(row).toBeTruthy();
    expect(row.role).toBe("superadmin");
    expect(row.email).toBe("recovery@example.com");
    // A recovery login must not immediately demand a password change.
    expect(row.mustChangePassword).toBe(false);
    // The seeded hash is argon2id, never the plaintext.
    expect(row.passwordHash).not.toBe("recovery-password");
    expect(row.passwordHash.startsWith("$")).toBe(true);
  });

  it("does not duplicate the account on a second fallback login", async () => {
    const res1 = mockRes();
    await login(
      { body: { username: "recovery", password: "recovery-password" } },
      res1,
    );
    const res2 = mockRes();
    await login(
      { body: { username: "recovery", password: "recovery-password" } },
      res2,
    );

    const rows = testDb.select().from(schema.appUsers).all();
    expect(rows).toHaveLength(1);
    expect(verify(res2.body.token).userId).toBe(rows[0].id);
  });

  it("rejects a wrong password", async () => {
    const res = mockRes();
    await login({ body: { username: "recovery", password: "nope" } }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials." });
    expect(testDb.select().from(schema.appUsers).all()).toHaveLength(0);
  });

  it("is disabled by DISABLE_ENV_LOGIN", async () => {
    process.env.DISABLE_ENV_LOGIN = "true";

    const res = mockRes();
    await login(
      { body: { username: "recovery", password: "recovery-password" } },
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(testDb.select().from(schema.appUsers).all()).toHaveLength(0);

    delete process.env.DISABLE_ENV_LOGIN;
  });
});
