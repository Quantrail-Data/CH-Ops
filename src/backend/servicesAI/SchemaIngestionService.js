// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// schemaIngestion service that retrieves database schemas from ClickHouse, converts them into embeddings, and upserts those embeddings into a vector database.
const EmbeddingService = require("./EmbeddingService");
const QdrantService = require("./QdrantService");
const ConnectionRegistry = require("../dbConfigAI/ConnectionRegistry");
const ClickHouseClientFactory = require("../dbConfigAI/ClickHouseClientFactory");

class SchemaIngestionService {
  constructor(databaseId, connection) {
    this.databaseId = databaseId;

    if (!connection) {
      throw new Error(`Connection not found for ${databaseId}`);
    }

    this.credentials = JSON.parse(connection?.credentials);
    this.client = ClickHouseClientFactory.createClient(this.credentials);

    this.embedding = new EmbeddingService();
    this.qdrant = new QdrantService();
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
    console.log("SHOW CREATE TABLE RESULT:");
    console.log(JSON.stringify(json, null, 2));
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

  async synchronizeSchema() {
    await this.qdrant.initCollection();
    const tables = await this.getTables();
    for (const table of tables) {
      const createTableQuery = await this.getTableSchema(table.name);
      const columns = await this.getColumns(table.name);
      const schemaText = this.buildSchemaText(
        table.name,
        createTableQuery,
        columns,
      );

      const embedding = await this.embedding.embed(schemaText);
      const point = {
        id: Math.floor(Math.random() * 1000000),
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
      await this.qdrant.upsert(point);
    }

    return {
      tables_added: tables.length,
      tables_updated: 0,
      tables_deactivated: 0,
      tables_unchanged: 0,
      errors: [],
    };
  }
}

module.exports = SchemaIngestionService;
