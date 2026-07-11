// databaseAIConnection.js - AI database connection REST API
//
// POST /connect registers a new database connection for Qurioz AI,
// validates credentials, and ingests the schema for natural language
// query generation. DELETE /delete removes a registered database
// and its schema from the AI system. All operations require
// authentication.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
const {Router} = require("express");
const DeleteDatabaseService = require("../servicesAI/DeleteDatabaseService");
const DatabaseConnectionService = require("../servicesAI/DatabaseConnectionService");
const SchemaIngestionService = require("../servicesAI/SchemaIngestionService");
const { aiDatabaseDetails } = require("../db/schema");
const { db } = require("../db/index");
const { eq } = require("drizzle-orm");

const router = Router();

router.post("/connect", async (req, res, next) => {
  try {
    const { database_type, credentials } = req.body;

    if (
      database_type === undefined ||
      database_type === null ||
      credentials === undefined ||
      credentials === null
    ) {
      const error = new Error("Database_type and credentials must be included");
      error.statusCode = 422;
      next(error);
    }

    const connectionService = new DatabaseConnectionService(
      database_type,
      credentials,
    );
    const result = await connectionService.registerConnection();
    const databaseId = result.database_id;

    const connection = db
      ?.select()
      ?.from(aiDatabaseDetails)
      ?.where(eq(aiDatabaseDetails?.database_id, databaseId))
      .get();

    const ingestionService = new SchemaIngestionService(databaseId, connection);
    const ingestionResult = await ingestionService.synchronizeSchema();

    return res.status(200).json({
      success: true,
      database_id: databaseId,
      ingestion: ingestionResult,
    });
  } catch (error) {
    console.log(error)
    console.log(error?.message);
    next(error);
  }
});

router.delete("/delete", async (req, res, next) => {
  try {
    const { database_id } = req.body;
    if (database_id === null || database_id === undefined) {
      const error = new Error("Database_id  must be included");
      error.statusCode(422);
      next(error);
    }
    const service = new DeleteDatabaseService();
    const result = await service.deleteDatabase(database_id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
