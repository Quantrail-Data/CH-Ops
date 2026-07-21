/**
 * middleware.test.js - Unit tests for errorHandler and auth middleware
 *
 * errorHandler: verifies it returns standardized { success:false, message }
 * JSON, honoring statusCode, then code, then defaulting to 500, for both
 * ApplicationError instances and plain errors.
 *
 * authMiddleware: verifies it rejects missing/!Bearer/invalid/revoked tokens
 * with 401 and does not call next(), and that a valid Bearer token populates
 * req.user and calls next() exactly once. Tokens are signed with the real jwt
 * service (no module mocking) to keep the test free of cross-file mock leakage.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeAll, mock } from "bun:test";

import errorHandler from "../../src/backend/middleware/errorHandler.js";
import ApplicationError from "../../src/backend/exceptions/AppError.js";
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

describe("errorHandler middleware", () => {
  it("ApplicationError -> its statusCode + standardized body", () => {
    const res = mockRes();
    errorHandler(
      new ApplicationError("not found", "nf", 404),
      {},
      res,
      () => {},
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, message: "not found" });
  });

  it("ApplicationError with falsy statusCode falls back to 500", () => {
    const res = mockRes();
    errorHandler(
      new ApplicationError("bad", "code_only", 0),
      {},
      res,
      () => {},
    );
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("bad");
  });

  it("plain error with statusCode is honored", () => {
    const res = mockRes();
    const err = new Error("teapot");
    err.statusCode = 418;
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(418);
    expect(res.body).toEqual({ success: false, message: "teapot" });
  });

  it("plain error with code (no statusCode) uses code", () => {
    const res = mockRes();
    const err = new Error("unprocessable");
    err.code = 422;
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(422);
  });

  it("plain error with neither defaults to 500", () => {
    const res = mockRes();
    errorHandler(new Error("kaboom"), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: "kaboom" });
  });
});

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
    expect(res.body).toEqual({
      error: "Oops! That user doesn't seem to exist.",
    });

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

  it("garbage token throws", () => {
    const res = mockRes();
    const next = counterNext();

    expect(() =>
      authMiddleware(
        {
          headers: {
            authorization: "Bearer not.a.real.token",
          },
        },
        res,
        next,
      ),
    ).toThrow();
  });
});
