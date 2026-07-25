// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// TestCases for clickHouseClientFactory file
import { describe, it, expect, beforeEach } from "bun:test";
import ConnectionRegistry from "../../../src/backend/dbConfigAI/ConnectionRegistry";

describe("connection registry testing", () => {
  beforeEach(() => {
    ConnectionRegistry.connections = new Map();
  });
});

describe("ConnectionRegistry", () => {
  it("should add a connection successfully", () => {
    ConnectionRegistry.add("db1", { host: "localhost" });
    expect(ConnectionRegistry.connections.has("db1")).toBe(true);
    expect(ConnectionRegistry.get("db1")).toEqual({
      host: "localhost",
    });
  });

  it("should overwrite existing connection with same databaseId", () => {
    ConnectionRegistry.add("db1", { host: "localhost" });
    ConnectionRegistry.add("db1", { host: "remote" });
    expect(ConnectionRegistry.get("db1")).toEqual({
      host: "remote",
    });
  });
});

describe("get()", () => {
    it("should return undefined for non-existent databaseId", () => {
      expect(ConnectionRegistry.get("missing-db")).toBeUndefined();
    });

    it("should return correct connection data", () => {
      const data = { host: "127.0.0.1", port: 8123 };
      ConnectionRegistry.add("db2", data);
      expect(ConnectionRegistry.get("db2")).toEqual(data);
    });
  });

  describe("remove()", () => {
    it("should remove existing connection", () => {
      ConnectionRegistry.add("db3", { host: "localhost" });
      ConnectionRegistry.remove("db3");
      expect(ConnectionRegistry.get("db3")).toBeUndefined();
      expect(ConnectionRegistry.exists("db3")).toBe(false);
    });

    it("should not throw when removing non-existent connection", () => {
      expect(() => {
        ConnectionRegistry.remove("non-existent");
      }).not.toThrow();
    });
  });

  describe("exists()", () => {
    it("should return true if connection exists", () => {
      ConnectionRegistry.add("db4", { host: "localhost" });
      expect(ConnectionRegistry.exists("db4")).toBe(true);
    });

    it("should return false if connection does not exist", () => {
      expect(ConnectionRegistry.exists("db999")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle null databaseId gracefully", () => {
      ConnectionRegistry.add(null, { host: "test" });
      expect(ConnectionRegistry.exists(null)).toBe(true);
    });

    it("should handle undefined databaseId gracefully", () => {
      ConnectionRegistry.add(undefined, { host: "test" });
      expect(ConnectionRegistry.exists(undefined)).toBe(true);
    });
  });

