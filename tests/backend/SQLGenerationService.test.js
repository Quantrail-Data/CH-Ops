// SQLGenerationService.test.js - unit + integration tests for servicesAI/SQLGenerationService.js
//
// Part A tests the pure regex helpers directly (extractExplicitLimit/enforceLimit
// were exported for this purpose - see the comment above their export in the
// source file). Part B exercises generateSql end-to-end with DdlService, the
// active-AI-config lookup, and the AIServices provider client all mocked away -
// no real network call or ClickHouse query ever happens. PromptBuilder and
// SqlPostProcessor are left real: they're pure and already covered elsewhere,
// and running them for real is what proves generateSql wires them correctly.
//
// mock.module patches a module for the whole bun test process, not just this
// file (see the same warning in schema-studio-routes.test.js), so every mock
// factory below stubs ALL of the real module's exports - including ones this
// file doesn't call - so another test file loaded in the same run never sees a
// half-replaced module. chatStore.js is deliberately NOT mocked here: it's used
// for real, with an injected in-memory db via __setDb, exactly like
// aiChats.test.js - that sidesteps the leak risk entirely for that module and
// exercises real persistence.

import { describe, it, expect, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import * as ChatStore from "../../src/backend/servicesAI/chatStore.js";

// The mock.module calls below must run BEFORE SQLGenerationService.js is
// imported: its internal imports of these three dependencies resolve at
// import time, so registering the mocks any later would be too late for
// them to take effect.
let fetchDdlImpl = async () => ({ results: [], failures: [] });
mock.module("../../src/backend/servicesAI/ddlService.js", () => ({
  fetchDdl: (...args) => fetchDdlImpl(...args),
  resolveTarget: () => {
    throw new Error("resolveTarget is not mocked in this test run");
  },
  listDatabases: async () => [],
  listTables: async () => [],
  __setDb: () => {},
}));

let getActiveAiConfigImpl = () => ({ provider: "CLAUDE", model: "test-model", apiKey: "enc" });
mock.module("../../src/backend/services/studioAi.js", () => ({
  getActiveAiConfig: (...args) => getActiveAiConfigImpl(...args),
  // Real, pure implementation - schema-studio.test.js exercises this export
  // directly, so a leaked mock must behave identically to the source.
  aiStatusFromConfig(cfg) {
    if (!cfg) return { configured: false, executable: false };
    return {
      configured: true,
      provider: cfg.provider,
      model: cfg.model,
      executable: ["GEMINI", "MISTRAL", "CLAUDE", "OPEN AI", "OLLAMA"]?.includes(cfg?.provider),
    };
  },
  getAiStatus() {
    return this.aiStatusFromConfig(getActiveAiConfigImpl());
  },
  completeDdl: async () => {
    throw new Error("completeDdl is not mocked in this test run");
  },
}));

let askImpl = async () => "GREETING";
mock.module("../../src/backend/servicesAI/AIService.js", () => ({
  default: class FakeAIServices {
    constructor(provider, modelName, apiKey) {
      this.provider = provider;
      this.modelName = modelName;
      this.apiKey = apiKey;
    }
    async ask(prompt) {
      return askImpl(prompt);
    }
  },
}));

// "?real" (matching the convention in aiService-constructor.test.js and
// siblings) guarantees this file gets the genuine SQLGenerationService.js
// regardless of whether some other file in the same bun test run has called
// mock.module() on the bare specifier (aiGenerate.test.js does exactly that,
// to stub generateSql away for its own route-only tests).
const {
  generateSql,
  extractExplicitLimit,
  enforceLimit,
} = await import("../../src/backend/servicesAI/SQLGenerationService.js?real");

// ---------------------------------------------------------------------------
// Part A - pure functions
// ---------------------------------------------------------------------------

describe("extractExplicitLimit", () => {
  it("reads 'top N'", () => {
    expect(extractExplicitLimit("top 5 users")).toBe(5);
  });

  it("reads 'first N'", () => {
    expect(extractExplicitLimit("first 100")).toBe(100);
  });

  it("reads 'limit N'", () => {
    expect(extractExplicitLimit("limit 50")).toBe(50);
  });

  it("reads 'limit: N'", () => {
    expect(extractExplicitLimit("limit: 20")).toBe(20);
  });

  it("reads 'limit=N'", () => {
    expect(extractExplicitLimit("limit=20")).toBe(20);
  });

  it("is case-insensitive", () => {
    expect(extractExplicitLimit("LIMIT 30")).toBe(30);
  });

  it("returns null when there is no match", () => {
    expect(extractExplicitLimit("show me users")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractExplicitLimit("")).toBeNull();
  });
});

describe("enforceLimit", () => {
  it("appends LIMIT when absent", () => {
    expect(enforceLimit("SELECT * FROM t", 10)).toBe("SELECT * FROM t LIMIT 10");
  });

  it("rewrites an existing LIMIT rather than duplicating it", () => {
    expect(enforceLimit("SELECT * FROM t LIMIT 5", 10)).toBe("SELECT * FROM t LIMIT 10");
  });

  it("preserves OFFSET while only changing the limit number", () => {
    expect(enforceLimit("SELECT * FROM t LIMIT 5 OFFSET 20", 10)).toBe(
      "SELECT * FROM t LIMIT 10 OFFSET 20",
    );
  });

  it("treats WITH ... SELECT as row-returning and appends LIMIT", () => {
    expect(enforceLimit("WITH x AS (SELECT 1) SELECT * FROM x", 10)).toBe(
      "WITH x AS (SELECT 1) SELECT * FROM x LIMIT 10",
    );
  });

  it("leaves SHOW TABLES unchanged", () => {
    expect(enforceLimit("SHOW TABLES", 10)).toBe("SHOW TABLES");
  });

  it("leaves DESCRIBE TABLE unchanged", () => {
    expect(enforceLimit("DESCRIBE TABLE t", 10)).toBe("DESCRIBE TABLE t");
  });

  it("leaves CANNOT_GENERATE_SQL unchanged (no SELECT/WITH prefix)", () => {
    expect(enforceLimit("CANNOT_GENERATE_SQL", 10)).toBe("CANNOT_GENERATE_SQL");
  });
});

// ---------------------------------------------------------------------------
// Part B - generateSql, with DdlService / studioAi / AIService mocked away
// (mock.module calls are above, before the module-under-test is imported)
// ---------------------------------------------------------------------------

// Mirrors SQLGenerationService.js's own lists, for membership assertions -
// these aren't exported, so the fixture is a deliberate copy of the source.
const GREETING_RESPONSES = [
  "--Hello! How can I help you with your database today?",
  "--Hi there! What database question can I help you with?",
  "--Hey! I'm ready to help you explore your database.",
  "--Welcome! Ask me anything about your database.",
  "--Hi! What would you like to query today?",
  "--Hello! I'm here to help generate ClickHouse SQL.",
  "--Hey! How can I assist with your database?",
  "--Welcome back! What would you like to know about your data?",
  "--Hi! Ask me about your tables, columns, or SQL queries.",
  "--Hello! Ready when you are. What's your database question?",
  "--Hey there! Let's explore your database together.",
  "--Hi! What insights are you looking for today?",
  "--Hello! I'm here to help with your ClickHouse database.",
  "--Welcome! Feel free to ask about your schema or data.",
  "--Hi! What can I help you find in your database?",
];

const OUT_OF_DOMAIN_RESPONSES = [
  "--I specialize in answering questions about the provided database and generating ClickHouse SQL.",
  "--I'd be happy to help if your question is related to the connected database.",
  "--I can help with your database schema, tables, columns, and SQL generation.",
  "--That topic is outside my scope. Feel free to ask about your database instead.",
  "--I'm designed specifically for database exploration and ClickHouse SQL generation.",
  "--I can only answer questions related to the connected database.",
  "--I'd be happy to help if your question is about the provided database.",
  "--My expertise is limited to database analysis and SQL generation.",
  "--Please ask me something about your database, and I'll be glad to help.",
  "--I can't assist with unrelated topics, but I can help explore your database.",
  "--I'm here to answer database questions and generate ClickHouse SQL.",
  "--Ask me about your tables, columns, relationships, or data.",
  "--I'm built for ClickHouse SQL generation and database exploration.",
  "--I can help you analyze the connected database, but not unrelated subjects.",
  "--Try asking about your database structure, data, or SQL queries.",
];

const DDL_BLOCK = {
  database: "analytics",
  table: "events",
  ddl: "CREATE TABLE analytics.events (id UInt64, name String) ENGINE = MergeTree ORDER BY id",
};

function baseArgs(overrides = {}) {
  return {
    jti: "j",
    context: "qurioz",
    appUser: "tester",
    chatId: null,
    clusterId: null,
    node: null,
    tables: [{ database: "analytics", table: "events" }],
    instruction: "show me events",
    ...overrides,
  };
}

describe("generateSql - intent routing", () => {
  it("makes two AI calls for a DATABASE-intent question, and the second prompt carries the instruction and DDL", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    let call = 0;
    askImpl = mock(async () => {
      call += 1;
      return call === 1 ? "DATABASE" : "SELECT id FROM analytics.events LIMIT 10";
    });

    const result = await generateSql(baseArgs({ instruction: "show me all events" }));

    expect(askImpl).toHaveBeenCalledTimes(2);
    const secondPrompt = askImpl.mock.calls[1][0];
    expect(secondPrompt).toContain("show me all events");
    expect(secondPrompt).toContain(DDL_BLOCK.ddl);
    expect(result.sql).toBe("SELECT id FROM analytics.events LIMIT 10");
  });

  it("makes exactly one AI call for GREETING and returns a greeting response with sql: null", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    askImpl = mock(async () => "GREETING");

    const result = await generateSql(baseArgs({ instruction: "hi there" }));

    expect(askImpl).toHaveBeenCalledTimes(1);
    expect(result.sql).toBeNull();
    expect(GREETING_RESPONSES).toContain(result.responseText);
  });

  it("makes exactly one AI call for OUT_OF_DOMAIN and returns an out-of-domain response with sql: null", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    askImpl = mock(async () => "OUT_OF_DOMAIN");

    const result = await generateSql(baseArgs({ instruction: "tell me a joke" }));

    expect(askImpl).toHaveBeenCalledTimes(1);
    expect(result.sql).toBeNull();
    expect(OUT_OF_DOMAIN_RESPONSES).toContain(result.responseText);
  });

  it("treats CANNOT_GENERATE_SQL from the model as a valid outcome, not a thrown error", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    let call = 0;
    askImpl = mock(async () => {
      call += 1;
      return call === 1 ? "DATABASE" : "CANNOT_GENERATE_SQL";
    });

    const result = await generateSql(baseArgs());

    expect(result.sql).toBeNull();
    expect(result.responseText).toMatch(/unable to generate sql/i);
  });

  it("strips markdown fences from a generated SQL response", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    let call = 0;
    askImpl = mock(async () => {
      call += 1;
      return call === 1 ? "DATABASE" : "```sql\nSELECT 1\n```";
    });

    const result = await generateSql(baseArgs({ instruction: "give me a constant" }));

    expect(result.sql).not.toContain("```");
    expect(result.sql).toBe(result.sql.trim());
  });

  it("enforces the instruction's explicit limit instead of the default of 10", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    let call = 0;
    askImpl = mock(async () => {
      call += 1;
      return call === 1 ? "DATABASE" : "SELECT * FROM analytics.events";
    });

    const result = await generateSql(baseArgs({ instruction: "top 3 users" }));

    expect(result.sql.endsWith("LIMIT 3")).toBe(true);
    expect(result.sql.endsWith("LIMIT 10")).toBe(false);
  });
});

describe("generateSql - chat persistence", () => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE ai_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_user TEXT NOT NULL,
      title TEXT,
      cluster_id TEXT,
      node TEXT,
      selected_tables TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE ai_chat_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL REFERENCES ai_chat(id) ON DELETE CASCADE,
      instruction TEXT NOT NULL,
      sql TEXT,
      response_text TEXT,
      ddl_snapshot TEXT,
      ddl_truncated INTEGER NOT NULL DEFAULT 0,
      tokens_estimated INTEGER,
      provider TEXT,
      model TEXT,
      error_code TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  ChatStore.__setDb(drizzle(sqlite, { schema }));

  it("appends a message with instruction/sql/responseText/ddlSnapshot/tokensEstimated/provider/model when chatId is given", async () => {
    const chat = await ChatStore.createChat("tester", { title: "t" });
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    getActiveAiConfigImpl = () => ({ provider: "CLAUDE", model: "sonnet-x", apiKey: "enc" });
    let call = 0;
    askImpl = mock(async () => {
      call += 1;
      return call === 1 ? "DATABASE" : "SELECT id FROM analytics.events";
    });

    const result = await generateSql(
      baseArgs({ chatId: chat.id, appUser: "tester", instruction: "show ids" }),
    );

    const messages = await ChatStore.listMessages("tester", chat.id);
    expect(messages.length).toBe(1);
    expect(messages[0].instruction).toBe("show ids");
    expect(messages[0].sql).toBe(result.sql);
    expect(messages[0].responseText).toBe(result.responseText);
    expect(messages[0].ddlSnapshot).toBe(DDL_BLOCK.ddl + "\n");
    expect(messages[0].tokensEstimated).toBe(result.tokensEstimated);
    expect(messages[0].provider).toBe("CLAUDE");
    expect(messages[0].model).toBe("sonnet-x");
  });

  it("never calls appendMessage (no row is written) when chatId is null - the wizard path", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    askImpl = mock(async () => "GREETING");

    const before = sqlite.query("SELECT count(*) AS c FROM ai_chat_message").get().c;
    await generateSql(baseArgs({ chatId: null, instruction: "hello" }));
    const after = sqlite.query("SELECT count(*) AS c FROM ai_chat_message").get().c;

    expect(after).toBe(before);
  });

  it("uses previousInstruction/previousSql passed directly by the caller, never looked up from ChatStore - guards the wizard refine-flow regression", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    let call = 0;
    askImpl = mock(async () => {
      call += 1;
      return call === 1 ? "DATABASE" : "SELECT 1";
    });

    await generateSql(
      baseArgs({
        chatId: null,
        instruction: "refine that",
        previousInstruction: "what were last week's signups",
        previousSql: "SELECT count() FROM analytics.signups",
      }),
    );

    const secondPrompt = askImpl.mock.calls[1][0];
    expect(secondPrompt).toContain("Previous Question: what were last week's signups");
    expect(secondPrompt).toContain("Previous SQL: SELECT count() FROM analytics.signups");
  });
});

describe("generateSql - ddlFailures pass-through", () => {
  it("returns fetchDdl's failures untouched, even for a partial success", async () => {
    const failures = [{ table: "analytics.missing", error: "No DDL returned." }];
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures });
    let call = 0;
    askImpl = mock(async () => {
      call += 1;
      return call === 1 ? "DATABASE" : "SELECT 1";
    });

    const result = await generateSql(baseArgs());
    expect(result.ddlFailures).toEqual(failures);
  });
});

describe("generateSql - AI provider configuration guards", () => {
  it("rejects with statusCode 400 before any ask() call when no AI provider is configured", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    getActiveAiConfigImpl = () => null;
    askImpl = mock(async () => "GREETING");

    await expect(generateSql(baseArgs())).rejects.toMatchObject({ statusCode: 400 });
    await expect(generateSql(baseArgs())).rejects.toThrow(/no ai provider configured/i);
    expect(askImpl).not.toHaveBeenCalled();
  });

  it("rejects with statusCode 400 before any ask() call when the configured API key is empty", async () => {
    fetchDdlImpl = async () => ({ results: [DDL_BLOCK], failures: [] });
    getActiveAiConfigImpl = () => ({ provider: "CLAUDE", model: "m", apiKey: "" });
    askImpl = mock(async () => "GREETING");

    await expect(generateSql(baseArgs())).rejects.toMatchObject({ statusCode: 400 });
    expect(askImpl).not.toHaveBeenCalled();
  });
});
