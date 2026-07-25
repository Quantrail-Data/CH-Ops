// tests/backend/ai_backend/clickHouseClientFactory.test.js

import { describe, it, expect, beforeEach, mock } from "bun:test";

const mockCreateClient = mock(() => ({ data: "mocked" }));

mock.module("@clickhouse/client", () => ({
  createClient: mockCreateClient,
}));

let ClickHouseClientFactory;

beforeEach(async () => {
  mockCreateClient.mockClear();

  // Load fresh module
  ClickHouseClientFactory = (
    await import("../../../src/backend/dbConfigAI/ClickHouseClientFactory.js")
  ).default;
});

describe("ClickHouseClientFactory", () => {
  it("should use HTTPS when port is 8443", () => {
    const credentials = {
      host: "localhost",
      port: 8443,
      username: "user",
      password: "pass",
      database: "testdb",
    };

    ClickHouseClientFactory.createClient(credentials);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith({
      url: "https://localhost:8443",
      username: "user",
      password: "pass",
      database: "testdb",
    });
  });

  it("should use HTTPS when host contains clickhouse.cloud", () => {
    const credentials = {
      host: "abc.clickhouse.cloud",
      port: 8123,
      username: "user",
      password: "pass",
      database: "testdb",
    };

    ClickHouseClientFactory.createClient(credentials);

    expect(mockCreateClient).toHaveBeenCalledTimes(1);

    expect(mockCreateClient).toHaveBeenCalledWith({
      url: "https://abc.clickhouse.cloud:8123",
      username: "user",
      password: "pass",
      database: "testdb",
    });
  });

  it("should use HTTP for local ClickHouse setup", () => {
    const credentials = {
      host: "localhost",
      port: 8123,
      username: "user",
      password: "pass",
      database: "testdb",
    };

    ClickHouseClientFactory.createClient(credentials);

    expect(mockCreateClient).toHaveBeenCalledTimes(1);

    expect(mockCreateClient).toHaveBeenCalledWith({
      url: "http://localhost:8123",
      username: "user",
      password: "pass",
      database: "testdb",
    });
  });

  it("should return the client returned by createClient", () => {
    const mockClient = {
      query: () => "query-result",
    };

    mockCreateClient.mockReturnValue(mockClient);

    const credentials = {
      host: "localhost",
      port: 8123,
      username: "user",
      password: "pass",
      database: "testdb",
    };

    const result = ClickHouseClientFactory.createClient(credentials);

    expect(result).toBe(mockClient);
  });

  it("should throw error when createClient throws error", () => {
    mockCreateClient.mockImplementation(() => {
      throw new Error("connection failed");
    });

    const credentials = {
      host: "localhost",
      port: 8123,
      username: "user",
      password: "pass",
      database: "testdb",
    };

    expect(() => ClickHouseClientFactory.createClient(credentials)).toThrow(
      "connection failed",
    );
  });
});
