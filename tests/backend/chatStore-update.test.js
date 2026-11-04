// Tests for updateChatMessage in servicesAI/chatStore.js.
// A PATCH must change only the fields that it sends.

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import * as ChatStore from "../../src/backend/servicesAI/chatStore.js";

function makeDatabase() {
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
      chart_name TEXT,
      dash_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  return drizzle(sqlite, { schema });
}

async function makeFullMessage() {
  const chat = await ChatStore.createChat("tester", { title: "t" });
  const message = await ChatStore.appendMessage("tester", chat.id, {
    instruction: "show ids",
    sql: "SELECT id FROM t",
    responseText: "Here are the ids.",
    ddlSnapshot: "CREATE TABLE t (id UInt64)",
    tokensEstimated: 42,
    provider: "CLAUDE",
    model: "sonnet-x",
  });
  return { chat, message };
}

describe("updateChatMessage", () => {
  beforeEach(() => {
    ChatStore.__setDb(makeDatabase());
  });

  it("keeps the response fields when the PATCH changes only the instruction", async () => {
    const { chat, message } = await makeFullMessage();

    const updated = await ChatStore.updateChatMessage("tester", chat.id, message.id, {
      instruction: "show all ids",
    });

    expect(updated.instruction).toBe("show all ids");
    expect(updated.sql).toBe("SELECT id FROM t");
    expect(updated.responseText).toBe("Here are the ids.");
    expect(updated.ddlSnapshot).toBe("CREATE TABLE t (id UInt64)");
    expect(updated.tokensEstimated).toBe(42);
    expect(updated.provider).toBe("CLAUDE");
    expect(updated.model).toBe("sonnet-x");
    expect(updated.errorCode).toBeNull();
  });

  it("keeps a stored error when the PATCH changes only the instruction", async () => {
    const { chat, message } = await makeFullMessage();
    await ChatStore.updateChatMessage("tester", chat.id, message.id, { errorCode: "failed" });

    const updated = await ChatStore.updateChatMessage("tester", chat.id, message.id, {
      instruction: "try again",
    });

    expect(updated.errorCode).toBe("failed");
  });

  it("clears a stored error when the PATCH sends errorCode null", async () => {
    const { chat, message } = await makeFullMessage();
    await ChatStore.updateChatMessage("tester", chat.id, message.id, { errorCode: "failed" });

    const updated = await ChatStore.updateChatMessage("tester", chat.id, message.id, {
      sql: "SELECT 1",
      errorCode: null,
    });

    expect(updated.sql).toBe("SELECT 1");
    expect(updated.errorCode).toBeNull();
    expect(updated.responseText).toBe("Here are the ids.");
  });

  it("clears a stored error when a new AI response arrives", async () => {
    const { chat, message } = await makeFullMessage();
    await ChatStore.updateChatMessage("tester", chat.id, message.id, { errorCode: "failed" });

    const updated = await ChatStore.updateChatMessage("tester", chat.id, message.id, {
      instruction: "show ids",
      sql: "SELECT id FROM t LIMIT 5",
      responseText: "New answer.",
      provider: "GEMINI",
      model: "flash",
    });

    expect(updated.responseText).toBe("New answer.");
    expect(updated.provider).toBe("GEMINI");
    expect(updated.errorCode).toBeNull();
  });

  it("keeps the AI response when a chart update sends only chartName and dashId", async () => {
    const { chat, message } = await makeFullMessage();
    const updated = await ChatStore.updateChatMessage("tester", chat.id, message.id, {
      isUpdateChart: true,
      chartName: "orders_by_day",
      dashId: 7,
    });
    expect(updated.chartName).toBe("orders_by_day");
    expect(String(updated.dashId)).toBe("7");
    expect(updated.responseText).toBe(message.responseText);
    expect(updated.provider).toBe(message.provider);
  });
});
