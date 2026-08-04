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
import { aiDatabaseDetails, clusterNodes } from "../db/schema";
import { db } from "../db/index";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../services/crypto";
import LocalVectorStore from "../servicesAI/LocalVectorStoreService";

const router = Router();

router.post("/connect", async (req, res, next) => {
  try {
    const { database_type, credentials, databases, cluster_id, node_id } =
      req.body;

    if (!Array.isArray(databases) || databases.length === 0) {
      const error = new Error("Database list is required");
      error.statusCode = 422;
      return next(error);
    }

    if (
      (database_type === undefined ||
        database_type === null ||
        credentials === undefined ||
        credentials === null,
      cluster_id === null ||
        cluster_id === undefined ||
        node_id === null ||
        node_id === undefined)
    ) {
      const error = new Error("Database Type and credentials must be included");
      error.statusCode = 422;
      return next(error);
    }

    const findPassword = db
      .select()
      .from(clusterNodes)
      .where(
        and(
          eq(clusterNodes?.clusterId, cluster_id),
          eq(clusterNodes?.name, node_id),
        ),
      )
      .get();

    if (!findPassword) {
      const error = new Error("Invalid cluster and node info!");
      error.statusCode = 409;
      return next(error);
    }

    const databaseIds = [];
    const ingestionResults = [];
    credentials["password"] = decrypt(findPassword?.passwordEnc);
    for (const database of databases) {
      credentials.database = database;
      const creds = credentials;

      const connectionService = new DatabaseConnectionService(
        database_type,
        creds,
        cluster_id,
        node_id,
      );

      const result = await connectionService.registerConnection();
      const databaseId = result.database_id;

      databaseIds.push({ database, databaseId });

      const connection = db
        .select()
        .from(aiDatabaseDetails)
        .where(eq(aiDatabaseDetails.database_id, databaseId))
        .get();

      const ingestionService = new SchemaIngestionService(
        databaseId,
        connection,
      );

      const ingestionResult = await ingestionService.synchronizeSchema();

      ingestionResults.push(ingestionResult);
    }

    return res.status(200).json({
      success: true,
      database_id: databaseIds,
      ingestion: ingestionResults,
    });
  } catch (error) {
    console.error("AI database connection error:", error?.message);
    next(error);
  }
});

router.post("/refresh-schema", async (req, res, next) => {
  try {
    const { database_ids } = req.body;

    if (database_ids == null || database_ids === undefined) {
      const error = new Error("Database_id must be included");
      error.statusCode = 422;
      return next(error);
    }
    const ingestionResults = [];

    for (const database_id of database_ids) {
      const connection = db
        ?.select()
        ?.from(aiDatabaseDetails)
        ?.where(eq(aiDatabaseDetails?.database_id, database_id))
        .get();

      if (!connection) {
        const error = new Error("Database connection not found");
        error.statusCode = 404;
        return next(error);
      }

      const ingestionService = new SchemaIngestionService(
        database_id,
        connection,
      );
      const ingestionResult = await ingestionService.synchronizeSchema();
      ingestionResults.push(ingestionResult);
    }

    return res.status(200).json({
      success: true,
      database_id: database_ids,
      ingestion: ingestionResults,
    });
  } catch (error) {
    console.error("Schema update error:", error.message);
    next(error);
  }
});

router.delete("/delete/schema", async (req, res, next) => {
  try {
    const { database_ids } = req.body;
    if (database_ids === null || database_ids === undefined) {
      const error = new Error("Database_id  must be included");
      error.statusCode = 422;
      next(error);
    }

    if (!Array.isArray(database_ids) || database_ids.length === 0) {
      const error = new Error("Database list is required");
      error.statusCode = 422;
      return next(error);
    }

    for (const dbs of database_ids) {
      const service = new DeleteDatabaseService();
      const result = await service.deleteDatabase(dbs);
      if (result) {
        const ls = new LocalVectorStore(dbs);
        await ls?.deleteDatabaseFile();
      }
    }

    return res
      .status(200)
      .json({ success: true, message: "deleted successfully!" });
  } catch (error) {
    next(error);
  }
});

router.post("/generated/databaseid", async (req, res, next) => {
  try {
    const { cluster_id, node_id } = req.body;
    if (
      cluster_id === undefined ||
      cluster_id === null ||
      node_id === undefined ||
      node_id === null
    ) {
      const error = new Error("Cluster ID and Node ID must be included");
      error.statusCode = 422;
      next(error);
    }

    const database =
      (await db
        ?.select()
        ?.from(aiDatabaseDetails)
        ?.where(
          and(
            eq(aiDatabaseDetails?.cluster_id, cluster_id),
            eq(aiDatabaseDetails?.node_id, node_id),
          ),
        )) || [];

    return res.status(200).json({
      success: true,
      databaseIDs: database || [],
    });
  } catch (error) {
    console.error("AI database connection error:", error?.message);
    next(error);
  }
});

export default router;
