// middleware.test.js - unit tests for auth middleware
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy, Praveen kumar, Kathirdhasan

import { describe, it, expect, beforeAll, mock } from "bun:test";
import jwt from "jsonwebtoken";

import { authMiddleware } from "../../src/backend/middleware/auth.js";
import {
  setSecret,
  create,
  verify,
  revokeToken,
} from "../../src/backend/services/jwt.js";

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

function counterNext() {
  const fn = (...args) => {
    fn.calls.push(args);
  };
  fn.calls = [];
  return fn;
}

const getMock = mock(() => ({ id: 1, username: "alice" }));

mock.module("../../src/backend/db/index.js", () => ({
  db: {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                get: getMock,
              };
            },
          };
        },
      };
    },
  },
  appUsers: {
    id: "id",
  },
}));

describe("authMiddleware", () => {
  beforeAll(() => setSecret("middleware-test-secret-32chars-minimum!"));

  it("missing Authorization header -> 401, next not called", () => {
    const res = mockRes();
    const next = counterNext();
    authMiddleware({ headers: {} }, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing authorization" });
    expect(next.calls.length).toBe(0);
  });

  it("user not found -> 401", () => {
    getMock.mockReturnValueOnce(undefined);

    const token = create({
      userId: 999,
      username: "ghost",
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    const res = mockRes();
    const next = counterNext();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    // Deliberately the same message as an invalid token: naming the missing
    // account confirms the token itself was valid.
    expect(res.body).toEqual({ error: "Invalid or expired token" });

    expect(next.calls.length).toBe(0);
  });

  it("valid Bearer token -> req.user populated and next called once", () => {
    getMock.mockReturnValueOnce({
      id: 1,
      username: "alice",
    });

    const token = create({
      userId: 1,
      username: "alice",
      role: "admin",
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    const res = mockRes();
    const next = counterNext();

    authMiddleware(req, res, next);

    expect(next.calls.length).toBe(1);
    expect(req.user.username).toBe("alice");
    expect(req.user.role).toBe("admin");
  });

  it("mustChangePassword user -> 403, next not called", () => {
    getMock.mockReturnValueOnce({
      id: 1,
      username: "alice",
      mustChangePassword: true,
    });

    const token = create({ userId: 1, username: "alice", role: "admin" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = counterNext();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "Password change required.",
      code: "MUST_CHANGE_PASSWORD",
    });
    expect(next.calls.length).toBe(0);
  });

  it("non-Bearer scheme -> 401, next not called", () => {
    const res = mockRes();
    const next = counterNext();
    authMiddleware({ headers: { authorization: "Basic abc123" } }, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing authorization" });
    expect(next.calls.length).toBe(0);
  });

  it("valid Bearer token -> req.user populated and next called once", () => {
    const token = create({ username: "alice", role: "admin" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = counterNext();
    authMiddleware(req, res, next);
    expect(next.calls.length).toBe(1);
    expect(res.statusCode).toBe(200); // untouched
    expect(req.user.username).toBe("alice");
    expect(req.user.role).toBe("admin");
  });

  it("garbage token -> 401, next not called", () => {
    // Previously this threw: verify() sat outside the try, so Express handed
    // the error to the global handler and the client got a 500. The frontend
    // only clears its session on a 401, so an expired token stranded the user.
    const res = mockRes();
    const next = counterNext();

    authMiddleware(
      { headers: { authorization: "Bearer not.a.real.token" } },
      res,
      next,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired token" });
    expect(next.calls.length).toBe(0);
  });

  it("expired token -> 401, next not called", async () => {
    const expired = jwt.sign(
      { userId: 1, username: "alice", role: "admin", jti: "expired-jti" },
      "middleware-test-secret-32chars-minimum!",
      { expiresIn: -10 },
    );

    const res = mockRes();
    const next = counterNext();

    authMiddleware({ headers: { authorization: `Bearer ${expired}` } }, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired token" });
    expect(next.calls.length).toBe(0);
  });

  it("revoked token -> 401, next not called", () => {
    const token = create({ userId: 1, username: "alice", role: "admin" });
    revokeToken(verify(token).jti);

    const res = mockRes();
    const next = counterNext();

    authMiddleware({ headers: { authorization: `Bearer ${token}` } }, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired token" });
    expect(next.calls.length).toBe(0);
  });
});
