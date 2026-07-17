// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
<<<<<<< HEAD
// Validates a database connection, removes its data from  deletes it from the registry, and returns success.
import ConnectionRegistry from "../dbConfigAI/ConnectionRegistry";

import LocalVectorStore from "./LocalVectorStoreService";
=======
// Validates a database connection, removes its data from Qdrant, deletes it from the registry, and returns success.
const ConnectionRegistry = require("../dbConfigAI/ConnectionRegistry");
const QdrantService = require("./QdrantService");
// const { RD_ShcemaData } = require("./rdService");
const {aiDatabaseDetails} = require("../db/schema")
const {db} = require("../db/index");
const { eq } = require("drizzle-orm");
// const RD_SERVICE = new RD_ShcemaData();
>>>>>>> bde0a9f83079795ff5851336aedf252ce31ac9ef

class DeleteDatabaseService {
  constructor() {
    this.localdb = new LocalVectorStore();
  }

  async deleteDatabase(databaseId) {
    // const exists = ConnectionRegistry.exists(databaseId);
    const exists =  db?.select()?.from(aiDatabaseDetails).where(eq(aiDatabaseDetails?.database_id,databaseId)).get();
    if (!exists) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

<<<<<<< HEAD
    await this.localdb.deleteDatabaseVectors(databaseId);
=======
    // deleting the Database schema data's based on databaseID
    // RD_SERVICE?.deleteSchemaData(databaseId);

    await this.qdrant.deleteDatabaseVectors(databaseId);
>>>>>>> bde0a9f83079795ff5851336aedf252ce31ac9ef

    db?.delete(aiDatabaseDetails).where(eq(aiDatabaseDetails?.database_id,databaseId))?.run();

    ConnectionRegistry.remove(databaseId);

    return {
      success: true,
      database_id: databaseId,
      message: "Database deleted successfully",
    };
  }
}

export default DeleteDatabaseService;
