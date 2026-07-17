// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Validates a database connection, removes its data from  deletes it from the registry, and returns success.
import ConnectionRegistry from "../dbConfigAI/ConnectionRegistry";

import LocalVectorStore from "./LocalVectorStoreService";

class DeleteDatabaseService {
  constructor() {
    this.localdb = new LocalVectorStore();
  }

  async deleteDatabase(databaseId) {
    const exists = ConnectionRegistry.exists(databaseId);

    if (!exists) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

    await this.localdb.deleteDatabaseVectors(databaseId);

    ConnectionRegistry.remove(databaseId);

    return {
      success: true,
      database_id: databaseId,
      message: "Database deleted successfully",
    };
  }
}

export default DeleteDatabaseService;
