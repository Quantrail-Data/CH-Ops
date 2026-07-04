// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Validates a database connection, removes its data from Qdrant, deletes it from the registry, and returns success.
const ConnectionRegistry = require("../dbConfigAI/ConnectionRegistry");
const QdrantService = require("./QdrantService");

class DeleteDatabaseService {
  constructor() {
    this.qdrant = new QdrantService();
  }

  async deleteDatabase(databaseId) {
    const exists = ConnectionRegistry.exists(databaseId);

    if (!exists) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

    await this.qdrant.deleteDatabaseVectors(databaseId);

    ConnectionRegistry.remove(databaseId);

    return {
      success: true,
      database_id: databaseId,
      message: "Database deleted successfully",
    };
  }
}

module.exports = DeleteDatabaseService;
