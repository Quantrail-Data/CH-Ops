// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Defines ClickHouse error classes for handling common errors with consistent codes and responses
import ApplicationError from "./AppError";
class ClickHouseError extends ApplicationError {
  constructor(message, errorCode, statusCode, details = null) {
    super(message, errorCode, statusCode, details);
  }
}

class ClickHouseQueryError extends ClickHouseError {
  constructor(details = null) {
    super("ClickHouse query failed", "clickhouse_query_error", 500, details);
  }
}

class ClickHouseAuthenticationError extends ClickHouseError {
  constructor(message = "ClickHouse authentication failed", details = null) {
    super(message, "clickhouse_authentication_error", 401, details);
  }
}

class ClickHouseInvalidPasswordError extends ClickHouseAuthenticationError {
  constructor(details = null) {
    super("Failed to connect ClickHouse, Invalid password", details);

    this.errorCode = "clickhouse_invalid_password";
  }
}

class ClickHouseInvalidUsernameError extends ClickHouseAuthenticationError {
  constructor(details = null) {
    super("Failed to connect ClickHouse, Invalid username", details);

    this.errorCode = "clickhouse_invalid_username";
  }
}

class ClickHouseInvalidDatabaseError extends ClickHouseError {
  constructor(databaseName) {
    super(
      `Database '${databaseName}' does not exist`,
      "clickhouse_invalid_database",
      404,
    );
  }
}

class ClickHouseInvalidHostError extends ClickHouseError {
  constructor(details = null) {
    super(
      "Failed to connect ClickHouse, Invalid host name",
      "clickhouse_invalid_host",
      400,
      details,
    );
  }
}

class ClickHouseInvalidPortError extends ClickHouseError {
  constructor(details = null) {
    super(
      "Failed to connect ClickHouse, Invalid port number",
      "clickhouse_invalid_port",
      400,
      details,
    );
  }
}

class ClickHouseConnectionError extends ClickHouseError {
  constructor(details = null) {
    super(
      "Failed to connect to ClickHouse",
      "clickhouse_connection_error",
      503,
      details,
    );
  }
}

export {
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
