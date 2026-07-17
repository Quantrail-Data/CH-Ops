// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Qdrant vector database service and handles embedding storage and similarity search for database schema/context retrieval.
const { QdrantClient } = require("@qdrant/js-client-rest");
const { loadEnv } = require("../utils/env");

const env = loadEnv();

class QdrantService {
  constructor() {
    this.client = new QdrantClient({
      url:env?.QDRANTLINK,
    });

    this.collection = env?.QDRANTSCHEMANAME;
  }

  async initCollection() {
    try {
      await this.client.createCollection(this.collection, {
        vectors: {
          size: 384,
          distance: "Cosine",
        },
      });
    } catch (e) {
      // collection already exists
    }
  }

  async upsert(point) {
    await this.client.upsert(this.collection, {
      points: [point],
    });
  }

  async search(databaseId, vector, limit = 10) {
    const result = await this.client.search(this.collection, {
      vector,
      limit,
      filter: {
        must: [
          {
            key: "database_id",
            match: {
              value: databaseId,
            },
          },
        ],
      },
    });

    return result;
  }

  async deleteDatabaseVectors(databaseId) {
    await this.client.delete(this.collection, {
      filter: {
        must: [
          {
            key: "database_id",
            match: {
              value: databaseId,
            },
          },
        ],
      },
    });
  }

  async getDatabaseVectors(databaseId) {
    const result = await this.client.scroll(this.collection, {
      limit: 100,
      filter: {
        must: [
          {
            key: "database_id",
            match: {
              value: databaseId,
            },
          },
        ],
      },
    });

    return result.points;
  }
}

module.exports = QdrantService;
