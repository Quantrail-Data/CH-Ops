/**
 * users.test.js - Unit tests for user management controller
 *
 * Tests user CRUD operations with RBAC enforcement. Covers listing users,
 * creating users (admin/superadmin only, duplicate username rejection,
 * superadmin creation restricted), updating users (reset password, email,
 * role changes with hierarchy checks), deleting users (self-deletion
 * blocked, higher role deletion blocked). Middleware tests for requireAdmin,
 * requireEditor, and requireSuperAdmin. Edge cases like invalid roles,
 * DB errors, and 404 responses are covered.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeEach, beforeAll, mock } from "bun:test";

const fakeDB = {
  users: [],
};

const eq = (field, value) => ({ field, value });

function createQuery() {
  const data = fakeDB.users;

  return {
    where: (cond) => {
      let filtered = data;

      if (cond?.field === "id") {
        filtered = data.filter((u) => u.id === cond.value);
      }

      if (cond?.field === "username") {
        filtered = data.filter((u) => u.username === cond.value);
      }

      return {
        get: () => filtered[0] || null,
        all: () => filtered,
      };
    },

    orderBy: () => ({
      all: () => data,
    }),

    all: () => data,
    get: () => data[0] || null,
  };
}

const db = {
  select: () => ({
    from: () => createQuery(),
  }),

  insert: () => ({
    values: (v) => ({
      returning: () => ({
        get: () => {
          const row = { id: Date.now(), ...v };
          fakeDB.users.push(row);
          return row;
        },
      }),
    }),
  }),

  update: () => ({
    set: (u) => ({
      where: (cond) => ({
        run: () => {
          const idx = fakeDB.users.findIndex((x) => x.id === cond.value);
          if (idx !== -1) {
            fakeDB.users[idx] = {
              ...fakeDB.users[idx],
              ...u,
            };
          }
        },
      }),
    }),
  }),

  delete: () => ({
    where: (cond) => ({
      run: () => {
        fakeDB.users = fakeDB.users.filter((u) => u.id !== cond.value);
        return { changes: 1 };
      },
    }),
  }),
};

const jsonMock = mock(() => {});
const statusMock = mock(() => ({ json: jsonMock }));
const nextMock = mock();

const sendNotification = mock();
const logAudit = mock();

// Controller functions - populated in beforeAll after mocks are registered.
// Keeping these at module scope so all it() blocks can reference them.
let listUsers;
let createUser;
let updateUser;
let deleteUser;
let requireAdmin;
let requireEditor;
let requireSuperAdmin;

// Register mocks and load the controller inside beforeAll so that
// mock.module() is guaranteed to run before the dynamic import is
// attempted.  (Top-level await in the test module can race with Bun's
// static-export checker; beforeAll avoids that entirely.)
beforeAll(async () => {
  mock.module("../../src/backend/db/index.js", () => ({
    db,
    appUsers: {},
    alertRules: {},
    alertChannels: {},
    alertRuleChannels: {},
    appSettings: {},
    dashboards: {},
    charts: {},
  }));

  mock.module("../../src/backend/services/notifier.js", () => ({
    sendNotification,
    testChannel: () => {},
  }));

  const mod = await import("../../src/backend/controllers/users.js");
  listUsers = mod.listUsers;
  createUser = mod.createUser;
  updateUser = mod.updateUser;
  deleteUser = mod.deleteUser;
  requireAdmin = mod.requireAdmin;
  requireEditor = mod.requireEditor;
  requireSuperAdmin = mod.requireSuperAdmin;
});

describe("Users Controller", () => {
  let originalDb;
  originalDb = {
    insert: db.insert,
    update: db.update,
    delete: db.delete,
    select: db.select,
  };

  beforeEach(() => {
    fakeDB.users = [];

    jsonMock.mockClear();
    statusMock.mockClear();
    nextMock.mockClear();

    db.insert = originalDb.insert;
    db.update = originalDb.update;
    db.delete = originalDb.delete;
    db.select = originalDb.select;
  });

  it("listUsers works", () => {
    fakeDB.users.push({ id: 1, username: "a", role: "admin" });

    listUsers({}, { json: jsonMock });

    expect(jsonMock).toHaveBeenCalled();
  });

  it("requireAdmin blocks readonly", () => {
    requireAdmin(
      { user: { role: "readonly" } },
      { status: statusMock },
      nextMock,
    );
    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("createUser rejects empty username", async () => {
    await createUser(
      {
        user: { role: "admin" },
        body: {
          username: "   ",
          audit: {},
        },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(400);
  });

  it("createUser rejects duplicate username", async () => {
    fakeDB.users.push({ id: 1, username: "john" });

    await createUser(
      {
        user: { role: "admin" },
        body: {
          username: "john",
          audit: {},
        },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(409);
  });

  it("createUser blocks superadmin creation by admin", async () => {
    await createUser(
      {
        user: { role: "admin" },
        body: {
          username: "root",
          role: "superadmin",
          audit: {},
        },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("updateUser blocks non-admin non-self", async () => {
    await updateUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "readonly" },
        body: { audit: {} },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("requireAdmin allows admin", () => {
    requireAdmin({ user: { role: "admin" } }, {}, nextMock);
    expect(nextMock).toHaveBeenCalled();
  });

  it("createUser blocks readonly", async () => {
    await createUser(
      {
        user: { role: "readonly" },
        body: { username: "x", audit: {} },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("updateUser reset password flow", async () => {
    fakeDB.users.push({ id: 1, username: "john", role: "readonly" });

    await updateUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: {
          resetPassword: true,
          audit: {},
        },
      },
      { json: jsonMock, status: statusMock },
    );

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
    );
  });

  it("deleteUser blocks higher role", () => {
    fakeDB.users.push({ id: 1, role: "superadmin" });

    deleteUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: { audit: {} },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("createUser success path", async () => {
    await createUser(
      {
        user: { role: "admin" },
        body: {
          username: "john",
          email: "a@test.com",
          role: "readonly",
          audit: {},
        },
      },
      { status: statusMock, json: jsonMock },
    );

    expect(fakeDB.users.length).toBe(1);
  });

  it("check user admin counts ", async () => {
    await createUser(
      {
        user: { role: "superadmin" },
        body: {
          username: "john",
          email: "a@test.com",
          role: "superadmin",
          audit: {},
        },
      },
      { status: statusMock, json: jsonMock },
    );

    expect(fakeDB.users.length).toBe(1);
  });

  it("updateUser 404", async () => {
    await updateUser(
      {
        params: { id: "999" },
        user: { userId: 1, role: "admin" },
        body: { audit: {} },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(404);
  });

  it("updateUser success", async () => {
    fakeDB.users.push({ id: 1, username: "john", role: "readonly" });

    await updateUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: {
          email: "new@test.com",
          audit: {},
        },
      },
      { json: jsonMock, status: statusMock },
    );

    expect(jsonMock).toHaveBeenCalledWith({ ok: true });
  });

  it("updateUser catch block", async () => {
    db.select = () => {
      throw new Error("DB crash");
    };

    await updateUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: {
          email: "new@test.com",
          audit: {},
        },
      },
      { json: jsonMock, status: statusMock },
    );
    expect(statusMock).toHaveBeenCalledWith(500);

    expect(jsonMock).toHaveBeenCalledWith("DB crash");
  });

  it("Check the valid role", async () => {
    fakeDB.users.push({ id: 1, username: "john", role: "readonly" });

    await updateUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: {
          email: "new@test.com",
          audit: {},
          role: "tester",
        },
      },
      { json: jsonMock, status: statusMock },
    );

    expect(jsonMock).toHaveBeenCalledWith({
      error: "Invalid role. Must be one of: superadmin, admin, editor, readonly",
    });
  });

  it("check the role hierarchy for change the users", async () => {
    fakeDB.users.push({ id: 1, username: "john", role: "readonly" });

    await updateUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: {
          email: "new@test.com",
          audit: {},
          role: "superadmin",
        },
      },
      { json: jsonMock, status: statusMock },
    );

    expect(jsonMock).toHaveBeenCalledWith({
      error: "You do not have permission to change this user's role.",
    });
  });

  it("deleteUser self blocked", () => {
    deleteUser(
      {
        params: { id: "1" },
        user: { userId: 1, role: "admin" },
        body: { audit: {} },
      },
      { status: statusMock },
    );

    expect(statusMock).toHaveBeenCalledWith(400);
  });

  it("deleteUser success", () => {
    fakeDB.users.push({ id: 1, role: "readonly" });

    deleteUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: { audit: {} },
      },
      { json: jsonMock, status: statusMock },
    );

    expect(jsonMock).toHaveBeenCalledWith({ deleted: true });
  });

  it("deleteUser catch block test", () => {
    fakeDB.users.push({ id: 1, role: "readonly" });
    db.select = () => {
      throw new Error("DB crash");
    };

    deleteUser(
      {
        params: { id: "1" },
        user: { userId: 2, role: "admin" },
        body: { audit: {} },
      },
      { json: jsonMock, status: statusMock },
    );
    expect(statusMock).toHaveBeenCalledWith(500);

    expect(jsonMock).toHaveBeenCalledWith("DB crash");
  });

  it("requireEditor blocks readonly", () => {
    requireEditor(
      { user: { role: "readonly" } },
      { status: statusMock },
      nextMock,
    );
    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it("requireEditor allows editor", () => {
    requireEditor({ user: { role: "editor" } }, {}, nextMock);
    expect(nextMock).toHaveBeenCalled();
  });

  it("requireSuperAdmin allows admin", () => {
    requireSuperAdmin({ user: { role: "admin" } }, {}, nextMock);
    expect(nextMock).toHaveBeenCalled();
  });

  it("createUser catch block", async () => {
    db.select = () => {
      throw new Error("DB crash");
    };

    await createUser(
      {
        user: { role: "admin" },
        body: {
          username: "john",
          audit: {},
        },
        ip: "127.0.0.1",
      },
      { status: statusMock, json: jsonMock },
    );

    expect(statusMock).toHaveBeenCalledWith(500);
  });
});
