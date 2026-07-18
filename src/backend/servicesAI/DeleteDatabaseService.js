// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Validates a database connection, removes its data from  deletes it from the registry, and returns success.
import ConnectionRegistry from "../dbConfigAI/ConnectionRegistry";

import LocalVectorStore from "./LocalVectorStoreService";

import { db } from "../db/index";
import { eq } from "drizzle-orm";
import { aiDatabaseDetails } from "../db/schema";

class DeleteDatabaseService {
  constructor() {
    this.localdb = new LocalVectorStore();
  }

  async deleteDatabase(databaseId) {
    const exists = ConnectionRegistry.exists(databaseId);

    if (!exists) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

    // Remove the local vector store json
    await this.localdb.initialize();
    await this.localdb.deleteDatabaseVectors(databaseId);

    // Remove from the sqlite
    db.delete(aiDatabaseDetails)
      .where(eq(aiDatabaseDetails?.database_id, databaseId))
      .run();

    // Remove from in-memory registry
    ConnectionRegistry.remove(databaseId);

    return {
      success: true,
      database_id: databaseId,
      message: "Database deleted successfully",
    };
  }
}

export default DeleteDatabaseService;
