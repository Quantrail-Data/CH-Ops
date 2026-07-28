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


import { Router } from "express";
import DeleteDatabaseService from "../servicesAI/DeleteDatabaseService";
import DatabaseConnectionService from "../servicesAI/DatabaseConnectionService";
import SchemaIngestionService from "../servicesAI/SchemaIngestionService";
import { aiDatabaseDetails } from "../db/schema";
import { db } from "../db/index";
import { eq } from "drizzle-orm";
import { resolveFromCluster } from "../servicesAI/aiCredentials.js";

const router = Router();

router.post("/connect", async (req, res, next) => {
  try {
    const { database_type, clusterId, node, database } = req.body;

    if (database_type === undefined || database_type === null) {
      const error = new Error("database_type must be included");
      error.statusCode = 422;
      return next(error);
    }

    // Credentials are resolved from the saved cluster configuration rather
    // than taken from the request. The browser no longer holds a ClickHouse®
    // password, and accepting host/user/password here let any authenticated
    // user aim the server at an arbitrary address.
    const credentials = resolveFromCluster({ clusterId, node, database });

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
    console.error("AI database connection error:", error?.message);
    next(error);
  }
});

router.delete("/delete", async (req, res, next) => {
  try {
    const { database_id } = req.body;
    if (database_id === null || database_id === undefined) {
      const error = new Error("database_id must be included");
      error.statusCode = 422;
      return next(error);
    }
    const service = new DeleteDatabaseService();
    const result = await service.deleteDatabase(database_id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;