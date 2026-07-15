// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Validates a database connection, removes its data from Qdrant, deletes it from the registry, and returns success.
const ConnectionRegistry = require("../dbConfigAI/ConnectionRegistry");
const QdrantService = require("./QdrantService");
// const { RD_ShcemaData } = require("./rdService");
const {aiDatabaseDetails} = require("../db/schema")
const {db} = require("../db/index");
const { eq } = require("drizzle-orm");
// const RD_SERVICE = new RD_ShcemaData();

class DeleteDatabaseService {
  constructor() {
    this.qdrant = new QdrantService();
  }

  async deleteDatabase(databaseId) {
    // const exists = ConnectionRegistry.exists(databaseId);
    const exists =  db?.select()?.from(aiDatabaseDetails).where(eq(aiDatabaseDetails?.database_id,databaseId)).get();
    if (!exists) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

    // deleting the Database schema data's based on databaseID
    // RD_SERVICE?.deleteSchemaData(databaseId);

    await this.qdrant.deleteDatabaseVectors(databaseId);

    db?.delete(aiDatabaseDetails).where(eq(aiDatabaseDetails?.database_id,databaseId))?.run();

    ConnectionRegistry.remove(databaseId);

    return {
      success: true,
      database_id: databaseId,
      message: "Database deleted successfully",
    };
  }
}

module.exports = DeleteDatabaseService;
