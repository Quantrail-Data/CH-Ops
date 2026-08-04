// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Validates a database connection, removes its data from  deletes it from the registry, and returns success.

import { db } from "../db/index";
import { eq } from "drizzle-orm";
import { aiDatabaseDetails } from "../db/schema";

class DeleteDatabaseService {
  constructor() {}

  async deleteDatabase(databaseId) {
    const isExists = db
      ?.select()
      ?.from(aiDatabaseDetails)
      ?.where(eq(aiDatabaseDetails?.database_id, databaseId))
      ?.get();

    if (!isExists) {
      return false
    }

    // Remove from the sqlite
    db.delete(aiDatabaseDetails)
      .where(eq(aiDatabaseDetails?.database_id, databaseId))
      .run();

    return true
  }
}

export default DeleteDatabaseService;