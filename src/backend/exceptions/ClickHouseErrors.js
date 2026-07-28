// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Defines ClickHouse error classes for handling common errors with consistent codes and responses
import ApplicationError from "./AppError.js";
export class ClickHouseError extends ApplicationError {
  constructor(message, errorCode, statusCode, details = null) {
    super(message, errorCode, statusCode, details);
  }
}

export class ClickHouseQueryError extends ClickHouseError {
  constructor(details = null) {
    super("ClickHouse query failed", "clickhouse_query_error", 500, details);
  }
}

export class ClickHouseAuthenticationError extends ClickHouseError {
  constructor(message = "ClickHouse authentication failed", details = null) {
    super(message, "clickhouse_authentication_error", 401, details);
  }
}

export class ClickHouseInvalidPasswordError extends ClickHouseAuthenticationError {
  constructor(details = null) {
    super("Failed to connect ClickHouse, Invalid password", details);

    this.errorCode = "clickhouse_invalid_password";
  }
}

export class ClickHouseInvalidUsernameError extends ClickHouseAuthenticationError {
  constructor(details = null) {
    super("Failed to connect ClickHouse, Invalid username", details);

    this.errorCode = "clickhouse_invalid_username";
  }
}

export class ClickHouseInvalidDatabaseError extends ClickHouseError {
  constructor(databaseName) {
    super(
      `Database '${databaseName}' does not exist`,
      "clickhouse_invalid_database",
      404,
    );
  }
}

export class ClickHouseInvalidHostError extends ClickHouseError {
  constructor(details = null) {
    super(
      "Failed to connect ClickHouse, Invalid host name",
      "clickhouse_invalid_host",
      400,
      details,
    );
  }
}

export class ClickHouseInvalidPortError extends ClickHouseError {
  constructor(details = null) {
    super(
      "Failed to connect ClickHouse, Invalid port number",
      "clickhouse_invalid_port",
      400,
      details,
    );
  }
}

export class ClickHouseConnectionError extends ClickHouseError {
  constructor(details = null) {
    super(
      "Failed to connect to ClickHouse",
      "clickhouse_connection_error",
      503,
      details,
    );
  }
}

// Also exported as a default object, because the existing tests import this
// module as a default and destructure it.
export default {
  ClickHouseError,
  ClickHouseQueryError,
  ClickHouseAuthenticationError,
  ClickHouseInvalidPasswordError,
  ClickHouseInvalidUsernameError,
  ClickHouseInvalidDatabaseError,
  ClickHouseInvalidHostError,
  ClickHouseInvalidPortError,
  ClickHouseConnectionError,
};
