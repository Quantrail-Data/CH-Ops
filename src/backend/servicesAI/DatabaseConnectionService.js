// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Manages connections to a ClickHouse database, stores successful connections, and handles various connection errors such as invalid host, port, credentials, or database name.
import crypto from "crypto";
import {
  ClickHouseInvalidDatabaseError,
  ClickHouseInvalidUsernameError,
  ClickHouseInvalidPasswordError,
  ClickHouseInvalidHostError,
  ClickHouseInvalidPortError,
  ClickHouseConnectionError,
} from "../exceptions/ClickHouseErrors";
import ConnectionRegistry from "../dbConfigAI/ConnectionRegistry";
import ClickHouseClientFactory from "../dbConfigAI/ClickHouseClientFactory";
import { aiDatabaseDetails } from "../db/schema";
import { db } from "../db/index";
import { eq } from "drizzle-orm";

class DatabaseConnectionService {
  constructor(databaseType, credentials) {
    if (databaseType !== "clickhouse") {
      throw new Error("Failed to connect ClickHouse, Invalid database_type");
    }
    this.databaseType = databaseType;
    this.credentials = credentials;
  }

  generateDatabaseId() {
    const identity =
      `${this.databaseType}|` +
      `${this.credentials.database}|` +
      `${this.credentials.username}|` +
      `${this.credentials.host}|` +
      `${this.credentials.port}`;

    return crypto.createHash("sha256").update(identity).digest("hex");
  }

  async registerConnection() {
    try {
      const client = ClickHouseClientFactory.createClient(this.credentials);

      const result = await client.query({
        query: "SELECT 1",
      });

      await result.json();

      const databaseId = this.generateDatabaseId();

      const isExists = db
        ?.select()
        ?.from(aiDatabaseDetails)
        ?.where(eq(aiDatabaseDetails?.database_id, databaseId))
        ?.get();

      if (!isExists) {
        db.insert(aiDatabaseDetails)
          .values({
            database_id: databaseId,
            database_type: "clickhouse",
            client: JSON.stringify(client),
            credentials: JSON.stringify(this.credentials),
          })
          .returning()
          .get();
      }

      return {
        database_id: databaseId,
      };
    } catch (error) {
      console.error(error);
      const msg = (error.message || "").toLowerCase();

      // Invalid Host
      if (
        msg.includes("eai_again") ||
        msg.includes("getaddrinfo") ||
        msg.includes("enotfound")
      ) {
        throw new ClickHouseInvalidHostError();
      }

      // Invalid Port
      if (
        error.code === "ECONNREFUSED" ||
        error.code === "ERR_INVALID_URL" ||
        msg.includes("econnrefused")
      ) {
        throw new ClickHouseInvalidPortError();
      }

      // Invalid Database
      if (msg.includes("does not exist") || error.type === "UNKNOWN_DATABASE") {
        throw new ClickHouseInvalidDatabaseError(this.credentials.database);
      }

      // Invalid Username / Password
      if (error.type === "AUTHENTICATION_FAILED") {
        if (error.message.startsWith(this.credentials.username + ":")) {
          throw new ClickHouseInvalidUsernameError();
        }

        throw new ClickHouseInvalidPasswordError();
      }

      // Wrong Password
      if (error.type === "REQUIRED_PASSWORD") {
        throw new ClickHouseInvalidPasswordError();
      }

      throw new ClickHouseConnectionError({
        original_error: error.message,
      });
    }
  }
}

export default DatabaseConnectionService;
