// tests/backend/ai_backend/sqlAIChat.test.js
import express from "express";
import request from "supertest";
import { mock, describe, it, expect, beforeEach, afterEach } from "bun:test";

const mockGet = mock(() => {});
const mockGenerateSQL = mock(() => {});

mock.module("../../../src/backend/db/index.js", () => ({
  db: {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          get: mockGet,
        })),
      })),
    })),
  },
}));

mock.module("../../../src/backend/servicesAI/SQLGenerationService.js", () => ({
  default: mock(() => {}).mockImplementation(() => ({
    generateSQL: mockGenerateSQL,
  })),
}));

mock.module("../../../src/backend/db/schema.js", () => ({
  apiKeys: {
    isActive: "isActive",
  },
}));

mock.module("drizzle-orm", () => ({
  eq: mock(() => "mock-eq"),
}));

import sqlRouter from "../../../src/backend/routes/sqlAIChat.js";
const app = express();
app.use(express.json());
app.use("/sql", sqlRouter);
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
  });
});
let originalConsoleError;

describe("SQL Generation Route", () => {
  beforeEach(() => {
    mock.clearAllMocks();
    mockGenerateSQL.mockReset();
    mockGet.mockReset();

    originalConsoleError = console.error;
    console.error = mock(() => {});
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });
  it("should generate SQL successfully", async () => {
    mockGet.mockReturnValue({
      id: 1,
      provider: "gemini",
    });

    mockGenerateSQL.mockResolvedValue({
      sql: "SELECT * FROM users",
    });

    const res = await request(app).post("/sql/generate-sql").send({
      database_id: "db1",
      user_question: "get all users",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sql: "SELECT * FROM users",
    });
    expect(mockGenerateSQL).toHaveBeenCalledTimes(1);
    expect(mockGenerateSQL).toHaveBeenCalledWith("db1", "get all users");
  });

  it("should continue execution when inputs are missing", async () => {
    mockGet.mockReturnValue({
      id: 1,
      provider: "gemini",
    });

    mockGenerateSQL.mockResolvedValue({
      sql: "SELECT * FROM users",
    });

    const res = await request(app).post("/sql/generate-sql").send({});

    expect(res.status).toBe(200);

    expect(res.body).toEqual({
      sql: "SELECT * FROM users",
    });
  });

  it("should return 400 when no AI provider is selected", async () => {
    mockGet.mockReturnValue(null);
    const res = await request(app).post("/sql/generate-sql").send({
      database_id: "db1",
      user_question: "get users",
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "No AI provider selected. Please choose one to continue.",
    });
  });

  it("should handle service failure", async () => {
    mockGet.mockReturnValue({
      id: 1,
      provider: "gemini",
    });

    mockGenerateSQL.mockRejectedValue(new Error("Generation failed"));
    const res = await request(app).post("/sql/generate-sql").send({
      database_id: "db1",
      user_question: "get users",
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: "Generation failed",
    });
  });

  it("should call SQL service even when only database_id is provided", async () => {
    mockGet.mockReturnValue({
      id: 1,
      provider: "gemini",
    });

    mockGenerateSQL.mockResolvedValue({
      sql: "SELECT 1",
    });
    const res = await request(app)
      .post("/sql/generate-sql")
      .send({ database_id: "db1" });
    expect(res.status).toBe(200);
    expect(mockGenerateSQL).toHaveBeenCalledWith("db1", undefined);
  });

  it("should call SQL service even when only user_question is provided", async () => {
    mockGet.mockReturnValue({
      id: 1,
      provider: "gemini",
    });
    mockGenerateSQL.mockResolvedValue({
      sql: "SELECT 1",
    });
    const res = await request(app).post("/sql/generate-sql").send({
      user_question: "show users",
    });
    expect(res.status).toBe(200);
    expect(mockGenerateSQL).toHaveBeenCalledWith(undefined, "show users");
  });
});
