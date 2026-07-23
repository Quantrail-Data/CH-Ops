// sqlAIChat.js - Natural language to SQL generation REST API
//
// POST /generate-sql takes a database_id and a user question,
// fetches the active API key, and uses the AI provider to generate
// a SQL query from the question and schema. Requires an active
// API key to be configured. The generated SQL can then be executed
// or reviewed by the user.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import {Router} from "express";
import SQLGenerationService from "../servicesAI/SQLGenerationService";
import { apiKeys } from "../db/schema";
import { db } from "../db/index";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/generate-sql", async (req, res, next) => {
  try {
    const { database_id, user_question } = req.body;

    if (
      (database_id === undefined || database_id === null) &&
      (user_question === undefined || user_question === null)
    ) {
      const error = new Error("Database_id and user_question must be included");
      error.statusCode(422);
      next(error);
    }

    const currentService = db
      ?.select()
      ?.from(apiKeys)
      ?.where(eq(apiKeys?.isActive, 1))
      ?.get();

    if (!currentService) {
      const err = new Error(
        "No AI provider selected. Please choose one to continue.",
      );
      err.statusCode = 400;
      throw err;
    }

    const service = new SQLGenerationService(currentService);
    const result = await service.generateSQL(database_id, user_question);
    return res.json(result);
  } catch (error) {
    console.error("SQL generation error:", error.message);
    next(error);
  }
});


export default router;