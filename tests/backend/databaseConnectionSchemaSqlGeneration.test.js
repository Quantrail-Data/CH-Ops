// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// databaseConnectionSchemaSqlGeneration.test.js - unit tests for DatabaseConnectionService, SchemaIngestionService, and SQLGenerationService

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createHash } from "crypto";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";
import { serialize as realSerialize } from "../../src/backend/servicesAI/aiCredentials.js";

try {
  initCrypto("db-schema-sql-generation-test-secret-32-chars!!");
} catch {
}

const createClientMock = mock();
mock.module(
  "../../src/backend/dbConfigAI/ClickHouseClientFactory.js",
  () => ({
    default: { createClient: createClientMock },
  }),
);

const getMock = mock();
const returningGetMock = mock(() => ({}));
const valuesMock = mock(() => ({
  returning: () => ({ get: returningGetMock }),
}));
mock.module("../../src/backend/db/index.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ get: getMock }) }) }),
    insert: () => ({ values: valuesMock }),
  },
  appSettings: {},
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  dashboards: {},
  charts: {},
  appUsers: {},
  clusters: {},
  clusterNodes: {},
  k8sConnections: {},
  rawSqlite: {},
}));

const embedMock = mock(async () => new Array(384).fill(0.01));
mock.module("../../src/backend/servicesAI/EmbeddingService.js", () => ({
  default: class {
    embed(...args) {
      return embedMock(...args);
    }
  },
}));

const initializeMock = mock(async () => true);
const clearStoreMock = mock(async () => {});
const upsertMock = mock(async () => ({ upserted: 1 }));
const buildIndexesMock = mock(() => {});
const saveMock = mock(async () => {});
const searchAcrossDatabasesMock = mock(async () => []);
mock.module("../../src/backend/servicesAI/LocalVectorStoreService.js", () => ({
  default: class {
    constructor(databaseId) {
      this.databaseId = databaseId;
    }
    initialize(...args) {
      return initializeMock(...args);
    }
    clearStore(...args) {
      return clearStoreMock(...args);
    }
    upsert(...args) {
      return upsertMock(...args);
    }
    buildIndexes(...args) {
      return buildIndexesMock(...args);
    }
    save(...args) {
      return saveMock(...args);
    }
    static searchAcrossDatabases(...args) {
      return searchAcrossDatabasesMock(...args);
    }
  },
}));

// SQLGenerationService 
const askMock = mock(async () => "DATABASE");
mock.module("../../src/backend/servicesAI/AIService.js", () => ({
  default: class {
    constructor(...args) {
      this.args = args;
    }
    ask(...args) {
      return askMock(...args);
    }
  },
}));

const DatabaseConnectionService = (
  await import("../../src/backend/servicesAI/DatabaseConnectionService.js")
).default;
const SchemaIngestionService = (
  await import("../../src/backend/servicesAI/SchemaIngestionService.js")
).default;
const SQLGenerationService = (
  await import("../../src/backend/servicesAI/SQLGenerationService.js?real")
).default;
const {
  ClickHouseInvalidHostError,
  ClickHouseInvalidPortError,
  ClickHouseInvalidDatabaseError,
  ClickHouseInvalidUsernameError,
  ClickHouseInvalidPasswordError,
  ClickHouseConnectionError,
} = await import("../../src/backend/exceptions/ClickHouseErrors.js");

function resetAllMocks() {
  createClientMock.mockReset();
  getMock.mockReset();
  returningGetMock.mockReset();
  returningGetMock.mockReturnValue({});
  valuesMock.mockClear();
  embedMock.mockReset();
  embedMock.mockResolvedValue(new Array(384).fill(0.01));
  initializeMock.mockClear();
  clearStoreMock.mockClear();
  upsertMock.mockClear();
  buildIndexesMock.mockClear();
  saveMock.mockClear();
  searchAcrossDatabasesMock.mockReset();
  searchAcrossDatabasesMock.mockResolvedValue([]);
  askMock.mockReset();
  askMock.mockResolvedValue("DATABASE");
}

beforeEach(resetAllMocks);
// DatabaseConnectionService
const CH_CREDENTIALS = {
  host: "10.0.0.1",
  port: 8123,
  username: "chops",
  password: "secret",
  database: "analytics",
};

function makeChClient(queryImpl) {
  return { query: queryImpl ?? mock(async () => ({ json: async () => ({}) })) };
}

describe("DatabaseConnectionService constructor", () => {
  beforeEach(() => {
    createClientMock.mockReturnValue(makeChClient());
    getMock.mockReturnValue(undefined);
  });

  it("throws for a non-clickhouse database type", () => {
    expect(
      () =>
        new DatabaseConnectionService("postgres", CH_CREDENTIALS, "c1", "n1"),
    ).toThrow("Invalid database_type");
  });
});

describe("DatabaseConnectionService.generateDatabaseId", () => {
  it("is deterministic for identical credentials", () => {
    const a = new DatabaseConnectionService(
      "clickhouse",
      CH_CREDENTIALS,
      "c1",
      "n1",
    ).generateDatabaseId();
    const b = new DatabaseConnectionService(
      "clickhouse",
      { ...CH_CREDENTIALS },
      "c2",
      "n2",
    ).generateDatabaseId();

    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs when a credential field changes", () => {
    const a = new DatabaseConnectionService(
      "clickhouse",
      CH_CREDENTIALS,
      "c1",
      "n1",
    ).generateDatabaseId();
    const b = new DatabaseConnectionService(
      "clickhouse",
      { ...CH_CREDENTIALS, database: "other" },
      "c1",
      "n1",
    ).generateDatabaseId();

    expect(a).not.toBe(b);
  });
});

describe("DatabaseConnectionService.registerConnection - success", () => {
  beforeEach(() => {
    createClientMock.mockReturnValue(makeChClient());
  });

  it("registers the client and inserts a new row when none exists", async () => {
    getMock.mockReturnValue(undefined);

    const service = new DatabaseConnectionService(
      "clickhouse",
      CH_CREDENTIALS,
      "cluster1",
      "node1",
    );
    const result = await service.registerConnection();

    expect(result.database_id).toBe(service.generateDatabaseId());
    expect(valuesMock).toHaveBeenCalledTimes(1);

    const inserted = valuesMock.mock.calls[0][0];
    expect(inserted.database_id).toBe(result.database_id);
    expect(inserted.cluster_id).toBe("cluster1");
    expect(inserted.node_id).toBe("node1");
    expect(inserted.credentials).not.toContain("secret");
  });

  it("skips the insert when a row already exists", async () => {
    getMock.mockReturnValue({ database_id: "already-there" });
    const service = new DatabaseConnectionService(
      "clickhouse",
      CH_CREDENTIALS,
      "cluster1",
      "node1",
    );
    await service.registerConnection();
    expect(valuesMock).not.toHaveBeenCalled();
  });
});

describe("DatabaseConnectionService.registerConnection - error mapping", () => {
  beforeEach(() => {
    getMock.mockReturnValue(undefined);
  });

  async function expectMapped(error, ErrorClass) {
    createClientMock.mockReturnValue(
      makeChClient(
        mock(async () => {
          throw error;
        }),
      ),
    );

    const service = new DatabaseConnectionService(
      "clickhouse",
      CH_CREDENTIALS,
      "c1",
      "n1",
    );

    await expect(service.registerConnection()).rejects.toBeInstanceOf(
      ErrorClass,
    );
  }

  it("maps DNS failures to ClickHouseInvalidHostError", async () => {
    await expectMapped(
      new Error("getaddrinfo ENOTFOUND bad-host"),
      ClickHouseInvalidHostError,
    );
  });

  it("maps ECONNREFUSED to ClickHouseInvalidPortError", async () => {
    const err = new Error("connect ECONNREFUSED 10.0.0.1:9999");
    err.code = "ECONNREFUSED";
    await expectMapped(err, ClickHouseInvalidPortError);
  });

  it("maps an invalid URL error code to ClickHouseInvalidPortError", async () => {
    const err = new Error("Invalid URL");
    err.code = "ERR_INVALID_URL";
    await expectMapped(err, ClickHouseInvalidPortError);
  });

  it("maps an unknown database to ClickHouseInvalidDatabaseError", async () => {
    const err = new Error("Database analytics does not exist");
    err.type = "UNKNOWN_DATABASE";
    await expectMapped(err, ClickHouseInvalidDatabaseError);
  });

  it("maps an authentication failure for the given username to ClickHouseInvalidUsernameError", async () => {
    const err = new Error(`${CH_CREDENTIALS.username}: Authentication failed`);
    err.type = "AUTHENTICATION_FAILED";
    await expectMapped(err, ClickHouseInvalidUsernameError);
  });

  it("maps a generic authentication failure to ClickHouseInvalidPasswordError", async () => {
    const err = new Error("Authentication failed");
    err.type = "AUTHENTICATION_FAILED";
    await expectMapped(err, ClickHouseInvalidPasswordError);
  });

  it("maps a required-password error to ClickHouseInvalidPasswordError", async () => {
    const err = new Error("Password required");
    err.type = "REQUIRED_PASSWORD";
    await expectMapped(err, ClickHouseInvalidPasswordError);
  });

  it("maps anything unrecognized to ClickHouseConnectionError", async () => {
    await expectMapped(
      new Error("something odd happened"),
      ClickHouseConnectionError,
    );
  });
});

// SchemaIngestionService
const INGESTION_CREDENTIALS = {
  host: "10.0.0.1",
  port: 8123,
  username: "chops",
  password: "secret",
  database: "analytics",
};
const CONNECTION = { credentials: realSerialize(INGESTION_CREDENTIALS) };

function setupIngestionQueries({ tables, schemas, columns, failTables = [] }) {
  createClientMock.mockReturnValue({
    query: mock(async ({ query, query_params } = {}) => {
      if (query.includes("system.tables")) {
        return { json: async () => ({ data: tables }) };
      }
      if (query.includes("SHOW CREATE TABLE")) {
        const tableName = query.match(/analytics\.(\w+)/)[1];
        if (failTables.includes(tableName)) {
          throw new Error(`schema lookup failed for ${tableName}`);
        }
        return {
          json: async () => ({ data: [{ statement: schemas[tableName] }] }),
        };
      }
      if (query.includes("system.columns")) {
        return { json: async () => ({ data: columns[query_params.table] }) };
      }
      throw new Error(`Unexpected query: ${query}`);
    }),
  });
}

describe("SchemaIngestionService constructor", () => {
  it("throws when no connection is provided", () => {
    expect(() => new SchemaIngestionService("db1", null)).toThrow(
      /Database Connection not found for db1/,
    );
  });
});

describe("SchemaIngestionService.getTables/getTableSchema/getColumns", () => {
  it("getTables queries system.tables scoped to the database", async () => {
    const queryMock = mock(async () => ({
      json: async () => ({ data: [{ name: "orders" }, { name: "customers" }] }),
    }));
    createClientMock.mockReturnValue({ query: queryMock });
    const service = new SchemaIngestionService("db1", CONNECTION);
    const tables = await service.getTables();
    expect(tables).toEqual([{ name: "orders" }, { name: "customers" }]);
    const call = queryMock.mock.calls[0][0];
    expect(call.query).toContain("system.tables");
    expect(call.query_params).toEqual({ db: "analytics" });
  });

  it("getTableSchema runs SHOW CREATE TABLE for the fully-qualified table", async () => {
    createClientMock.mockReturnValue({
      query: mock(async () => ({
        json: async () => ({
          data: [{ statement: "CREATE TABLE analytics.orders (id UInt64)" }],
        }),
      })),
    });

    const service = new SchemaIngestionService("db1", CONNECTION);
    const statement = await service.getTableSchema("orders");
    expect(statement).toBe("CREATE TABLE analytics.orders (id UInt64)");
  });

  it("getColumns queries system.columns scoped to database and table", async () => {
    createClientMock.mockReturnValue({
      query: mock(async () => ({
        json: async () => ({
          data: [
            { name: "id", type: "UInt64" },
            { name: "name", type: "String" },
          ],
        }),
      })),
    });

    const service = new SchemaIngestionService("db1", CONNECTION);
    const columns = await service.getColumns("orders");
    expect(columns).toEqual([
      { name: "id", type: "UInt64" },
      { name: "name", type: "String" },
    ]);
  });
});

describe("SchemaIngestionService.buildSchemaText", () => {
  it("includes the database, table, create query, and each column", () => {
    createClientMock.mockReturnValue(makeChClient());
    const service = new SchemaIngestionService("db1", CONNECTION);
    const text = service.buildSchemaText(
      "orders",
      "CREATE TABLE analytics.orders (id UInt64)",
      [
        { name: "id", type: "UInt64" },
        { name: "total", type: "Float64" },
      ],
    );

    expect(text).toContain("analytics");
    expect(text).toContain("orders");
    expect(text).toContain("CREATE TABLE analytics.orders (id UInt64)");
    expect(text).toContain("id (UInt64)");
    expect(text).toContain("total (Float64)");
  });
});

describe("SchemaIngestionService.generatePointId", () => {
  it("is a deterministic sha256 of databaseId|tableName", () => {
    createClientMock.mockReturnValue(makeChClient());
    const service = new SchemaIngestionService("db1", CONNECTION);
    const expected = createHash("sha256").update("db1|orders").digest("hex");
    expect(service.generatePointId("orders")).toBe(expected);
    expect(service.generatePointId("orders")).toBe(
      service.generatePointId("orders"),
    );
    expect(service.generatePointId("orders")).not.toBe(
      service.generatePointId("customers"),
    );
  });
});

describe("SchemaIngestionService.synchronizeSchema", () => {
  it("processes every table and upserts one point per table", async () => {
    setupIngestionQueries({
      tables: [{ name: "orders" }, { name: "customers" }],
      schemas: {
        orders: "CREATE TABLE analytics.orders (id UInt64)",
        customers: "CREATE TABLE analytics.customers (id UInt64)",
      },
      columns: {
        orders: [{ name: "id", type: "UInt64" }],
        customers: [{ name: "id", type: "UInt64" }],
      },
    });

    const service = new SchemaIngestionService("db1", CONNECTION);
    const result = await service.synchronizeSchema();
    expect(result).toEqual({
      database_id: "db1",
      tables_processed: 2,
      errors: [],
    });
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(clearStoreMock).toHaveBeenCalledWith({ save: false });
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(buildIndexesMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("records a per-table error and keeps processing the remaining tables", async () => {
    setupIngestionQueries({
      tables: [{ name: "orders" }, { name: "broken" }],
      schemas: {
        orders: "CREATE TABLE analytics.orders (id UInt64)",
      },
      columns: {
        orders: [{ name: "id", type: "UInt64" }],
      },
      failTables: ["broken"],
    });
    const service = new SchemaIngestionService("db1", CONNECTION);
    const result = await service.synchronizeSchema();
    expect(result.tables_processed).toBe(1);
    expect(result.errors).toEqual([
      { table: "broken", error: "schema lookup failed for broken" },
    ]);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(buildIndexesMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

// SQLGenerationService
const CURRENT_SERVICE = { provider: "gemini", model: "m", encryptedKey: "k" };
const SCHEMA_POINTS = [
  {
    payload: {
      database_name: "analytics",
      table_schema: "Table Name:\norders\nColumns:\nid (UInt64)",
    },
  },
];

describe("SQLGenerationService.generateSQL - database existence check", () => {
  it("throws when a requested databaseId does not exist", async () => {
    getMock.mockReturnValue(undefined);

    const service = new SQLGenerationService(CURRENT_SERVICE);

    await expect(
      service.generateSQL(["missing-db"], "how many orders?"),
    ).rejects.toThrow("Database connection not found");
  });
});

describe("SQLGenerationService.intentclassifier", () => {
  beforeEach(() => {
    getMock.mockReturnValue({ database_id: "db1" });
  });

  it.each([["greeting"], ["Greeting"], ["  GREETING  "]])(
    "normalizes %s to GREETING",
    async (raw) => {
      askMock.mockResolvedValue(raw);
      const service = new SQLGenerationService(CURRENT_SERVICE);

      expect(await service.intentclassifier("schema", "hi")).toBe("GREETING");
    },
  );

  it("defaults an unrecognized classification to OUT_OF_DOMAIN", async () => {
    askMock.mockResolvedValue("SOMETHING_ELSE");
    const service = new SQLGenerationService(CURRENT_SERVICE);

    expect(await service.intentclassifier("schema", "q")).toBe(
      "OUT_OF_DOMAIN",
    );
  });
});

describe("SQLGenerationService.getRandomResponse", () => {
  it("returns a member of the given array", () => {
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const responses = ["a", "b", "c"];
    expect(responses).toContain(service.getRandomResponse(responses));
  });
});

describe("SQLGenerationService.generateSQL orchestration", () => {
  beforeEach(() => {
    getMock.mockReturnValue({ database_id: "db1" });
    searchAcrossDatabasesMock.mockResolvedValue(SCHEMA_POINTS);
  });

  it("embeds the question and searches across the requested databases", async () => {
    askMock.mockResolvedValue("GREETING");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    await service.generateSQL(["db1", "db2"], "hello there");
    expect(embedMock).toHaveBeenCalledWith("hello there");
    expect(searchAcrossDatabasesMock.mock.calls[0][0]).toHaveLength(384);
    expect(searchAcrossDatabasesMock.mock.calls[0][1]).toEqual([
      "db1",
      "db2",
    ]);
    expect(searchAcrossDatabasesMock.mock.calls[0][2]).toBe(20);
  });

  it("returns a canned greeting without a second AI call", async () => {
    askMock.mockResolvedValue("GREETING");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "hi");
    expect(result.success).toBe(true);
    expect(service.greetingResponses).toContain(result.generated_sql);
    expect(askMock).toHaveBeenCalledTimes(1);
  });

  it("returns a canned out-of-domain response without a second AI call", async () => {
    askMock.mockResolvedValue("OUT_OF_DOMAIN");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "tell me a joke");
    expect(result.success).toBe(true);
    expect(service.outofDomainResponses).toContain(result.generated_sql);
    expect(askMock).toHaveBeenCalledTimes(1);
  });

  it("strips a markdown fence and trailing semicolon from a DATABASE-intent response", async () => {
    askMock
      .mockResolvedValueOnce("DATABASE")
      .mockResolvedValueOnce("```sql\nSELECT id FROM analytics.orders;\n```");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "show me orders");
    expect(result.generated_sql).toBe(
      "SELECT id FROM analytics.orders LIMIT 10",
    );
    expect(askMock).toHaveBeenCalledTimes(2);
  });

  it("uses the default LIMIT 10 when the AI omits a LIMIT and the question doesn't request one", async () => {
    askMock
      .mockResolvedValueOnce("DATABASE")
      .mockResolvedValueOnce("SELECT id FROM analytics.orders");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "show me orders");
    expect(result.generated_sql).toBe(
      "SELECT id FROM analytics.orders LIMIT 10",
    );
  });

  it.each([
    ["top 5 orders", 5],
    ["first 100 orders", 100],
    ["orders, limit 50", 50],
  ])(
    "honors an explicit user-requested limit in %s",
    async (question, expectedLimit) => {
      askMock
        .mockResolvedValueOnce("DATABASE")
        .mockResolvedValueOnce("SELECT id FROM analytics.orders");
      const service = new SQLGenerationService(CURRENT_SERVICE);
      const result = await service.generateSQL(["db1"], question);
      expect(result.generated_sql).toBe(
        `SELECT id FROM analytics.orders LIMIT ${expectedLimit}`,
      );
    },
  );

  it("overrides a LIMIT the AI generated on its own to match the user's explicit request", async () => {
    askMock
      .mockResolvedValueOnce("DATABASE")
      .mockResolvedValueOnce("SELECT id FROM analytics.orders LIMIT 999");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "top 5 orders");
    expect(result.generated_sql).toBe(
      "SELECT id FROM analytics.orders LIMIT 5",
    );
  });

  it("overrides a LIMIT the AI generated on its own down to the default when the question doesn't request one", async () => {
    askMock
      .mockResolvedValueOnce("DATABASE")
      .mockResolvedValueOnce("SELECT id FROM analytics.orders LIMIT 999");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "show me orders");
    expect(result.generated_sql).toBe(
      "SELECT id FROM analytics.orders LIMIT 10",
    );
  });

  it("preserves an OFFSET clause while rewriting the LIMIT", async () => {
    askMock
      .mockResolvedValueOnce("DATABASE")
      .mockResolvedValueOnce(
        "SELECT id FROM analytics.orders LIMIT 999 OFFSET 20",
      );

    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "top 5 orders");
    expect(result.generated_sql).toBe(
      "SELECT id FROM analytics.orders LIMIT 5 OFFSET 20",
    );
  });

  it("does not append a LIMIT to a non-row-returning statement", async () => {
    askMock.mockResolvedValueOnce("DATABASE").mockResolvedValueOnce(
      "SHOW TABLES FROM analytics",
    );
    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(["db1"], "what tables exist?");
    expect(result.generated_sql).toBe("SHOW TABLES FROM analytics");
  });

  it("includes the retrieved schema context in the SQL-generation prompt", async () => {
    askMock
      .mockResolvedValueOnce("DATABASE")
      .mockResolvedValueOnce("SELECT 1");
    const service = new SQLGenerationService(CURRENT_SERVICE);
    await service.generateSQL(["db1"], "show me orders");
    const sqlPrompt = askMock.mock.calls[1][0];
    expect(sqlPrompt).toContain("orders");
    expect(sqlPrompt).toContain("id (UInt64)");
  });

  it("maps CANNOT_GENERATE_SQL to a friendly canned message", async () => {
    askMock
      .mockResolvedValueOnce("DATABASE")
      .mockResolvedValueOnce("CANNOT_GENERATE_SQL");

    const service = new SQLGenerationService(CURRENT_SERVICE);
    const result = await service.generateSQL(
      ["db1"],
      "do something impossible",
    );

    expect(result.success).toBe(true);
    expect(result.generated_sql).toMatch(/Unable to generate SQL/);
  });
});
