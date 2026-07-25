// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// TestCases for databaseAIConnectionfile
// tests/backend/ai_backend/databaseAIConnection.test.js
import request from "supertest";
import express from "express";
import { describe, beforeEach, it, expect,afterEach ,mock, spyOn } from "bun:test";
const mockGet = mock(() => {});
const mockWhere = mock(() => ({ get: mockGet }));
const mockFrom = mock(() => ({ where: mockWhere }));
const mockSelect = mock(() => ({ from: mockFrom }));
const mockRegisterConnection = mock();
const mockSynchronizeSchema = mock();
const mockDeleteDatabase = mock();
let consoleErrormock;

mock.module("../../../src/backend/db/index.js", () => ({
  db: {
    select: mockSelect,
    insert: mock(() => {}),
  },
}));

mock.module(
  "../../../src/backend/servicesAI/DatabaseConnectionService.js",
  () => ({
    default: mock(() => ({
      registerConnection: mockRegisterConnection,
    })),
  }),
);

mock.module(
  "../../../src/backend/servicesAI/SchemaIngestionService.js",
  () => ({
    default: mock(() => ({
      synchronizeSchema: mockSynchronizeSchema,
    })),
  }),
);

mock.module("../../../src/backend/servicesAI/DeleteDatabaseService.js", () => ({
  default: mock(() => ({
    deleteDatabase: mockDeleteDatabase,
  })),
}));

mock.module("../../../src/backend/db/schema.js", () => ({
  aiDatabaseDetails: {
    database_id: "database_id",
  },
}));

mock.module("../../../src/backend/routes/databaseAIConnection.js", () => ({
  router: mock(() => {}),
}));

import router from "../../../src/backend/routes/databaseAIConnection.js";
import DatabaseConnectionService from "../../../src/backend/servicesAI/DatabaseConnectionService.js";
import SchemaIngestionService from "../../../src/backend/servicesAI/SchemaIngestionService.js";
import DeleteDatabaseService from "../../../src/backend/servicesAI/DeleteDatabaseService.js";

const app = express();
app.use(express.json());
app.use("/database", router);
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
  });
});

describe("Database Routes", () => {
  beforeEach(() => {
    mockRegisterConnection.mockReset();
    mockSynchronizeSchema.mockReset();
    mockDeleteDatabase.mockReset();
    consoleErrormock= spyOn(console, "error").mockImplementation(() => {});
    mockGet.mockReturnValue({
      database_id: "db123",
      database_type: "mysql",
    });
  });
  afterEach(() => {
  consoleErrormock?.mockRestore();
});

  describe("POST /database/connect", () => {
    it("should connect database successfully", async () => {
      DatabaseConnectionService.mockImplementation(() => ({
        registerConnection: mock(() => {}).mockResolvedValue({
          database_id: "db123",
        }),
      }));

      mockSynchronizeSchema.mockResolvedValue({
        tables_synced: 5,
      });

      const response = await request(app)
        .post("/database/connect")
        .send({
          database_type: "mysql",
          credentials: {
            host: "localhost",
            user: "root",
          },
        });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        database_id: "db123",
        ingestion: {
          tables_synced: 5,
        },
      });
    });


    it("should return 422 when credentials are missing", async () => {
      const response = await request(app).post("/database/connect").send({
        database_type: "mysql",
      });
      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        success: false,
        message: "Database_type and credentials must be included",
      });
    });

    it("should return 500 when registerConnection throws", async () => {
      DatabaseConnectionService.mockImplementation(() => ({
        registerConnection: mock(() => {}).mockRejectedValue(
          new Error("Connection failed"),
        ),
      }));

      const response = await request(app).post("/database/connect").send({
        database_type: "mysql",
        credentials: {},
      });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: "Connection failed",
      });
    });

    it("should return 500 when schema ingestion fails", async () => {
      DatabaseConnectionService.mockImplementation(() => ({
        registerConnection: mock(() => {}).mockResolvedValue({
          database_id: "db123",
        }),
      }));

      mockSynchronizeSchema.mockRejectedValue(new Error("Ingestion failed"));

      const response = await request(app).post("/database/connect").send({
        database_type: "mysql",
        credentials: {},
      });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: "Ingestion failed",
      });
    });
  });

  describe("DELETE /database/delete", () => {
    it("should delete database successfully", async () => {
      mockDeleteDatabase.mockResolvedValue({
        success: true,
        message: "Database deleted",
      });

      const response = await request(app)
        .delete("/database/delete")
        .send({ database_id: "db123" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "Database deleted",
      });
    });

   it("should handle missing database_id", async () => {
  const response = await request(app)
    .delete("/database/delete")
    .send({});

  expect(response.status).toBe(200);
  expect(response.text).toBe("");
});


    it("should return 500 when delete service fails", async () => {
      mockDeleteDatabase.mockRejectedValue(new Error("Delete failed"));
      const response = await request(app)
        .delete("/database/delete")
        .send({ database_id: "db123" });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: "Delete failed",
      });
    });
  });
});
