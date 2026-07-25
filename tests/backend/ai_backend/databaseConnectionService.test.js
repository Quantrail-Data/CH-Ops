// tests/backend/ai_backend/databaseConnectionService.test.js
import { describe, it, expect, beforeEach, mock,afterEach } from "bun:test";
import crypto from "crypto";

const mockCreateClient = mock(() => {});
mock.module("../../../src/backend/dbConfigAI/ClickHouseClientFactory.js",
  () => ({
    default: {
      createClient: mockCreateClient,
    },
  }),
);

mock.module("drizzle-orm", () => ({
  eq: mock(() => "mock-eq"),
}));

mock.module("../../../src/backend/db/schema.js", () => ({
  aiDatabaseDetails: {
    database_id: "database_id",
  },
}));

mock.module("../../../src/backend/db/index.js", () => ({
  db: {
    select: mock(),
    insert: mock(),
  },
}));


import DatabaseConnectionService from "../../../src/backend/servicesAI/DatabaseConnectionService.js";
import {db} from "../../../src/backend/db/index.js";

import {
  ClickHouseInvalidDatabaseError,
  ClickHouseInvalidUsernameError,
  ClickHouseInvalidPasswordError,
  ClickHouseInvalidHostError,
  ClickHouseInvalidPortError,
  ClickHouseConnectionError,
} from "../../../src/backend/exceptions/ClickHouseErrors.js";

let consoleErrorSpy;
describe("DatabaseConnectionService", () => {
  const credentials = {
    database: "test_db",
    username: "admin",
    password: "secret",
    host: "localhost",
    port: 8123,
  };

  beforeEach(() => {
    //mock.restore();
    //mockFingerprint64.mockReset();
    mockCreateClient.mockReset();
    db.select.mockReset();
    db.insert.mockReset();
     consoleErrorSpy = mock(() => {});
  console.error = consoleErrorSpy;
  });
  afterEach(() => {
  console.error = consoleErrorSpy;
});

  describe("constructor", () => {
    it("should create service for clickhouse", () => {
      const service = new DatabaseConnectionService("clickhouse", credentials);
      expect(service.databaseType).toBe("clickhouse");
      expect(service.credentials).toEqual(credentials);
    });

    it("should throw invalid database type", () => {
      expect(() => {
        new DatabaseConnectionService("mysql", credentials);
      }).toThrow("Failed to connect ClickHouse, Invalid database_type");
    });
  });

  describe("generateDatabaseId", () => {
    it("should generate database id", () => {
      const service = new DatabaseConnectionService("clickhouse", credentials);
      const expected = crypto
        .createHash("sha256")
        .update("clickhouse|test_db|admin|localhost|8123")
        .digest("hex");

      expect(service.generateDatabaseId()).toBe(expected);
    });
  });

  describe("registerConnection", () => {
    it("should insert new connection", async () => {
      //mockFingerprint64.mockReturnValue("test_db");
      const expectedDatabaseId = crypto
        .createHash("sha256")
        .update("clickhouse|test_db|admin|localhost|8123")
        .digest("hex");

      mockCreateClient.mockReturnValue({
        query: mock().mockResolvedValue({
          json: mock().mockResolvedValue({}),
        }),
      });

      db.select.mockReturnValue({
        from: mock().mockReturnValue({
          where: mock().mockReturnValue({
            get: mock().mockReturnValue(undefined),
          }),
        }),
      });

      db.insert.mockReturnValue({
        values: mock().mockReturnValue({
          returning: mock().mockReturnValue({
            get: mock(),
          }),
        }),
      });

      const service = new DatabaseConnectionService("clickhouse", credentials);

      const result = await service.registerConnection();
      expect(result).toEqual({
        database_id: expectedDatabaseId,
      });

      expect(db.insert.mock.calls.length).toBe(1);
    });

    it("should not insert when record exists", async () => {
      // mockFingerprint64.mockReturnValue("test_db");

      mockCreateClient.mockReturnValue({
        query: mock().mockResolvedValue({
          json: mock().mockResolvedValue({}),
        }),
      });

      db.select.mockReturnValue({
        from: mock().mockReturnValue({
          where: mock().mockReturnValue({
            get: mock().mockReturnValue({
              database_id: "test_db",
            }),
          }),
        }),
      });

      const service = new DatabaseConnectionService("clickhouse", credentials);

      const result = await service.registerConnection();

      expect(result).toEqual({
        database_id: "02386d706f599dc7c6cd30241d2c6e540e94e34a559f1f0f9f9b2e11a0fa58f5",
      });

      expect(db.insert.mock.calls.length).toBe(0);
    });
  });

  describe("connection errors", () => {
    it("invalid host", async () => {
      mockCreateClient.mockImplementation(() => {
        throw new Error("getaddrinfo ENOTFOUND");
      });

      const service = new DatabaseConnectionService("clickhouse", credentials);

      await expect(service.registerConnection()).rejects.toBeInstanceOf(
        ClickHouseInvalidHostError,
      );
    });

    it("invalid port", async () => {
      const error = new Error("connect ECONNREFUSED");
      error.code = "ECONNREFUSED";

      mockCreateClient.mockImplementation(() => {
        throw error;
      });

      const service = new DatabaseConnectionService("clickhouse", credentials);

      await expect(service.registerConnection()).rejects.toBeInstanceOf(
        ClickHouseInvalidPortError,
      );
    });

    it("invalid database", async () => {
      const error = new Error("database does not exist");
      error.type = "UNKNOWN_DATABASE";

      mockCreateClient.mockImplementation(() => {
        throw error;
      });

      const service = new DatabaseConnectionService("clickhouse", credentials);

      await expect(service.registerConnection()).rejects.toBeInstanceOf(
        ClickHouseInvalidDatabaseError,
      );
    });

    it("invalid username", async () => {
      const error = new Error("auth failed");
      error.type = "AUTHENTICATION_FAILED";

      mockCreateClient.mockImplementation(() => {
        throw error;
      });

      const service = new DatabaseConnectionService("clickhouse", credentials);

      await expect(service.registerConnection()).rejects.toBeInstanceOf(
        ClickHouseInvalidPasswordError,
      );
    });

    it("invalid password", async () => {
      const error = new Error("password required");
      error.type = "REQUIRED_PASSWORD";

      mockCreateClient.mockImplementation(() => {
        throw error;
      });

      const service = new DatabaseConnectionService("clickhouse", credentials);

      await expect(service.registerConnection()).rejects.toBeInstanceOf(
        ClickHouseInvalidPasswordError,
      );
    });

    it("generic connection error", async () => {
      mockCreateClient.mockImplementation(() => {
        throw new Error("unknown failure");
      });
       mockCreateClient.mockRestore();

      const service = new DatabaseConnectionService("clickhouse", credentials);

      await expect(service.registerConnection()).rejects.toBeInstanceOf(
        ClickHouseConnectionError,
      );
    });
  });
});
