// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// schemaIngestion service that retrieves database schemas from ClickHouse, converts them into embeddings, and upserts those embeddings into a vector database.

import EmbeddingService from "./EmbeddingService";
import ClickHouseClientFactory from "../dbConfigAI/ClickHouseClientFactory";
import crypto from "crypto";
import LocalVectorStore from "./LocalVectorStoreService";
import {deserialize} from "./aiCredentials"

class SchemaIngestionService {
  constructor(databaseId, connection) {
    this.databaseId = databaseId;

    if (!connection) {
      throw new Error(`Database Connection not found for ${databaseId}`);
    }

    this.credentials = deserialize(connection?.credentials);
    this.client = ClickHouseClientFactory.createClient(this.credentials);
    this.embedding = new EmbeddingService();
    this.localdb = new LocalVectorStore(this.databaseId);
  }

  async getTables() {
    const result = await this.client.query({
      query: `SELECT name
                    FROM system.tables
                    WHERE database = {db:String}
                   ORDER BY name`,
      query_params: {
        db: this?.credentials?.database,
      },
    });
    const json = await result.json();
    return json.data;
  }

  async getTableSchema(tableName) {
    const result = await this.client.query({
      query: `
            SHOW CREATE TABLE
            ${this.credentials.database}.${tableName}
          `,
    });

    const json = await result.json();
    // console.log("SHOW CREATE TABLE RESULT:");
    // console.log(JSON.stringify(json, null, 2));
    return json.data[0].statement;
  }

  async getColumns(tableName) {
    const result = await this.client.query({
      query: `
                    SELECT
                        name,
                        type
                    FROM system.columns
                    WHERE database = {db:String}
                    AND table = {table:String}
                `,
      query_params: {
        db: this.credentials.database,
        table: tableName,
      },
    });

    const json = await result.json();
    return json.data;
  }

  buildSchemaText(tableName, createTableQuery, columns) {
    let schema = `
        Database Name:
        ${this.credentials.database}

        Table Name:
        ${tableName}

        Create Table Query:
        ${createTableQuery}

        Columns:
        `;

    columns.forEach((column) => {
      schema += `
${column.name} (${column.type})
`;
    });

    return schema;
  }

  generatePointId(tableName) {
    return crypto
      .createHash("sha256")
      .update(`${this.databaseId}|${tableName}`)
      .digest("hex");
  }


  async synchronizeSchema() {

    await this.localdb.initialize();
    await this.localdb.clearStore({save: false});

    const tables = await this.getTables();

    let tablesAdded = 0 ;
    const errors = [];

    for (const table of tables) {
      try {
        const createTableQuery = await this.getTableSchema(table.name);
        const columns = await this.getColumns(table.name);
        const schemaText = this.buildSchemaText(
        table.name,
        createTableQuery,
        columns,
      );

      const pointId = this.generatePointId(table.name);

      const embedding = await this.embedding.embed(schemaText);

      const point = {
        id: pointId,
        vector: embedding,
        payload: {
          database_id: this.databaseId,
          database_name: this.credentials.database,
          table_name: table.name,
          table_schema: schemaText,
          create_table_query: createTableQuery,
          columns_metadata: columns,
          is_active: true,
        },
      };

      await this.localdb.upsert([point], {save : false});
      tablesAdded++;
    } catch (error) {
        console.error(`Error processing ${table.name}:`, error.message);
        errors.push({ table: table.name, error: error.message });
    }
  }

  this.localdb.buildIndexes();
  await this.localdb.save();

  return {
      database_id: this.databaseId,
      tables_processed: tablesAdded,
      errors,
  };
}
}

export default SchemaIngestionService;