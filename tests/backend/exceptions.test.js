/**
 * exceptions.test.js - Unit tests for the error hierarchy
 *
 * Covers ApplicationError (the base custom error) and the ClickHouse error
 * classes built on top of it. Verifies messages, error codes, HTTP status
 * codes, the details passthrough, the instanceof chain, and that each class
 * reports its own constructor name. Behavior is asserted exactly as defined
 * in src/backend/exceptions/AppError.js and ClickHouseErrors.js.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect } from "bun:test";

import ApplicationError from "../../src/backend/exceptions/AppError.js";
import ClickHouseErrors from "../../src/backend/exceptions/ClickHouseErrors.js";

const {
  ClickHouseError,
  ClickHouseQueryError,
  ClickHouseAuthenticationError,
  ClickHouseInvalidPasswordError,
  ClickHouseInvalidUsernameError,
  ClickHouseInvalidDatabaseError,
  ClickHouseInvalidHostError,
  ClickHouseInvalidPortError,
  ClickHouseConnectionError,
} = ClickHouseErrors;

describe("ApplicationError (base)", () => {
  it("stores message, errorCode, statusCode, and details", () => {
    const details = { reason: "boom" };
    const err = new ApplicationError("oops", "some_code", 418, details);
    expect(err.message).toBe("oops");
    expect(err.errorCode).toBe("some_code");
    expect(err.statusCode).toBe(418);
    expect(err.details).toBe(details);
  });

  it("defaults details to null when omitted", () => {
    const err = new ApplicationError("oops", "some_code", 500);
    expect(err.details).toBeNull();
  });

  it("is a real Error with a stack and the constructor name", () => {
    const err = new ApplicationError("oops", "c", 500);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApplicationError");
    expect(typeof err.stack).toBe("string");
    expect(err.stack.length).toBeGreaterThan(0);
  });
});

describe("ClickHouse error hierarchy", () => {
  it("every ClickHouse error extends ClickHouseError, ApplicationError, and Error", () => {
    const samples = [
      new ClickHouseQueryError(),
      new ClickHouseAuthenticationError(),
      new ClickHouseInvalidPasswordError(),
      new ClickHouseInvalidUsernameError(),
      new ClickHouseInvalidDatabaseError("db"),
      new ClickHouseInvalidHostError(),
      new ClickHouseInvalidPortError(),
      new ClickHouseConnectionError(),
    ];
    for (const e of samples) {
      expect(e).toBeInstanceOf(ClickHouseError);
      expect(e).toBeInstanceOf(ApplicationError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  it("each error reports its own constructor name", () => {
    expect(new ClickHouseQueryError().name).toBe("ClickHouseQueryError");
    expect(new ClickHouseConnectionError().name).toBe("ClickHouseConnectionError");
    expect(new ClickHouseInvalidPasswordError().name).toBe(
      "ClickHouseInvalidPasswordError",
    );
  });

  it("ClickHouseQueryError: message, code, 500, details passthrough", () => {
    const details = { sql: "SELECT 1" };
    const e = new ClickHouseQueryError(details);
    expect(e.message).toBe("ClickHouse query failed");
    expect(e.errorCode).toBe("clickhouse_query_error");
    expect(e.statusCode).toBe(500);
    expect(e.details).toBe(details);
  });

  it("ClickHouseAuthenticationError: default message + custom message, 401", () => {
    const def = new ClickHouseAuthenticationError();
    expect(def.message).toBe("ClickHouse authentication failed");
    expect(def.errorCode).toBe("clickhouse_authentication_error");
    expect(def.statusCode).toBe(401);

    const custom = new ClickHouseAuthenticationError("nope");
    expect(custom.message).toBe("nope");
    expect(custom.statusCode).toBe(401);
  });

  it("ClickHouseInvalidPasswordError: overrides code, keeps 401 auth status", () => {
    const e = new ClickHouseInvalidPasswordError();
    expect(e.message).toBe("Failed to connect ClickHouse, Invalid password");
    expect(e.errorCode).toBe("clickhouse_invalid_password");
    expect(e.statusCode).toBe(401);
    expect(e).toBeInstanceOf(ClickHouseAuthenticationError);
  });

  it("ClickHouseInvalidUsernameError: overrides code, keeps 401 auth status", () => {
    const e = new ClickHouseInvalidUsernameError();
    expect(e.message).toBe("Failed to connect ClickHouse, Invalid username");
    expect(e.errorCode).toBe("clickhouse_invalid_username");
    expect(e.statusCode).toBe(401);
    expect(e).toBeInstanceOf(ClickHouseAuthenticationError);
  });

  it("ClickHouseInvalidDatabaseError: interpolates name, 404", () => {
    const e = new ClickHouseInvalidDatabaseError("analytics");
    expect(e.message).toBe("Database 'analytics' does not exist");
    expect(e.errorCode).toBe("clickhouse_invalid_database");
    expect(e.statusCode).toBe(404);
  });

  it("ClickHouseInvalidHostError: 400", () => {
    const e = new ClickHouseInvalidHostError();
    expect(e.message).toBe("Failed to connect ClickHouse, Invalid host name");
    expect(e.errorCode).toBe("clickhouse_invalid_host");
    expect(e.statusCode).toBe(400);
  });

  it("ClickHouseInvalidPortError: 400", () => {
    const e = new ClickHouseInvalidPortError();
    expect(e.message).toBe("Failed to connect ClickHouse, Invalid port number");
    expect(e.errorCode).toBe("clickhouse_invalid_port");
    expect(e.statusCode).toBe(400);
  });

  it("ClickHouseConnectionError: 503", () => {
    const e = new ClickHouseConnectionError();
    expect(e.message).toBe("Failed to connect to ClickHouse");
    expect(e.errorCode).toBe("clickhouse_connection_error");
    expect(e.statusCode).toBe(503);
  });

  it("carries details when provided to the connection error", () => {
    const details = { host: "db1", port: 9000 };
    expect(new ClickHouseConnectionError(details).details).toBe(details);
    expect(new ClickHouseInvalidHostError(details).details).toBe(details);
  });
});
