// aiChats.test.js - route tests for routes/aiChats.js (GET/POST/PATCH/DELETE /chats)

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import * as ChatStore from "../../src/backend/servicesAI/chatStore.js";
import { TITLE_MAX_CHARS } from "../../src/backend/servicesAI/constants.js";
import aiChatsRouter from "../../src/backend/routes/aiChats.js";

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

function getHandler(method, path) {
  const layer = aiChatsRouter.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  return layer.route.stack[0].handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

function reqAs(username, extra = {}) {
  return { user: { username, jti: "test-jti" }, body: {}, params: {}, ...extra };
}

const listChats = getHandler("get", "/chats");
const postChat = getHandler("post", "/chats");
const getChat = getHandler("get", "/chats/:id");
const patchChat = getHandler("patch", "/chats/:id");
const deleteChat = getHandler("delete", "/chats/:id");

async function createChatAs(username, body) {
  const req = reqAs(username, { body });
  const res = createRes();
  await postChat(req, res);
  return res;
}

describe("POST /chats", () => {
  it("uses the given title verbatim", async () => {
    const res = await createChatAs("alice", { title: "My Chat" });
    expect(res.statusCode).toBe(201);
    expect(res.body.chat.title).toBe("My Chat");
  });

  it("derives the title from instruction, truncated to TITLE_MAX_CHARS, when no title is given", async () => {
    const instruction = "a very long question ".repeat(10);
    const res = await createChatAs("alice", { instruction });
    expect(res.statusCode).toBe(201);
    expect(res.body.chat.title).toBe(instruction.trim().slice(0, TITLE_MAX_CHARS));
    expect(res.body.chat.title.length).toBe(TITLE_MAX_CHARS);
  });

  it("uses null title when neither title nor instruction is given", async () => {
    const res = await createChatAs("alice", {});
    expect(res.statusCode).toBe(201);
    expect(res.body.chat.title).toBeNull();
  });

  it("normalises selectedTables before storing", async () => {
    const res = await createChatAs("alice", { title: "t", selectedTables: ["a.b"] });
    expect(res.statusCode).toBe(201);
    expect(res.body.chat.selectedTables).toEqual([{ database: "a", table: "b" }]);
  });
});

describe("GET /chats - privacy boundary", () => {
  it("only returns chats owned by the requesting user", async () => {
    await createChatAs("userA", { title: "A's chat" });
    await createChatAs("userB", { title: "B's chat" });

    const resA = createRes();
    await listChats(reqAs("userA"), resA);
    expect(resA.statusCode).toBe(200);
    expect(resA.body.chats.every((c) => c.appUser === "userA")).toBe(true);
    expect(resA.body.chats.some((c) => c.title === "B's chat")).toBe(false);

    const resB = createRes();
    await listChats(reqAs("userB"), resB);
    expect(resB.body.chats.every((c) => c.appUser === "userB")).toBe(true);
    expect(resB.body.chats.some((c) => c.title === "A's chat")).toBe(false);
  });
});

describe("GET /chats/:id", () => {
  it("returns 404 (not information leak) for a chat owned by a different user", async () => {
    const created = await createChatAs("owner", { title: "mine" });
    const id = created.body.chat.id;

    const res = createRes();
    await getChat(reqAs("intruder", { params: { id: String(id) } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Chat not found." });
  });

  it("returns the same 404 shape for a genuinely nonexistent id", async () => {
    const res = createRes();
    await getChat(reqAs("owner", { params: { id: "999999" } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Chat not found." });
  });

  it("returns 422 for a non-numeric id", async () => {
    const res = createRes();
    await getChat(reqAs("owner", { params: { id: "abc" } }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "A numeric chat id is required." });
  });

  it("returns 422 for id = 0", async () => {
    const res = createRes();
    await getChat(reqAs("owner", { params: { id: "0" } }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "A numeric chat id is required." });
  });

  it("returns 422 for a negative id", async () => {
    const res = createRes();
    await getChat(reqAs("owner", { params: { id: "-5" } }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: "A numeric chat id is required." });
  });

  it("returns both chat and messages for a real, owned chat", async () => {
    const created = await createChatAs("reader", { title: "t" });
    const id = created.body.chat.id;

    const res = createRes();
    await getChat(reqAs("reader", { params: { id: String(id) } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.chat.id).toBe(id);
    expect(res.body.messages).toEqual(await ChatStore.listMessages("reader", id));
  });
});

describe("PATCH /chats/:id", () => {
  it("changes only the title, leaving clusterId/node/selectedTables untouched", async () => {
    const created = await createChatAs("patcher", {
      title: "old",
      clusterId: "c1",
      node: "n1",
      selectedTables: ["a.b"],
    });
    const id = created.body.chat.id;

    const res = createRes();
    await patchChat(reqAs("patcher", { params: { id: String(id) }, body: { title: "new" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.chat.title).toBe("new");
    expect(res.body.chat.clusterId).toBe("c1");
    expect(res.body.chat.node).toBe("n1");
    expect(res.body.chat.selectedTables).toEqual([{ database: "a", table: "b" }]);
  });

  it("normalises selectedTables before storing", async () => {
    const created = await createChatAs("patcher2", { title: "t" });
    const id = created.body.chat.id;

    const res = createRes();
    await patchChat(
      reqAs("patcher2", { params: { id: String(id) }, body: { selectedTables: ["x.y"] } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.chat.selectedTables).toEqual([{ database: "x", table: "y" }]);
  });

  it("returns 404 for someone else's chat", async () => {
    const created = await createChatAs("owner2", { title: "mine" });
    const id = created.body.chat.id;

    const res = createRes();
    await patchChat(
      reqAs("intruder2", { params: { id: String(id) }, body: { title: "x" } }),
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for a nonexistent chat", async () => {
    const res = createRes();
    await patchChat(reqAs("owner2", { params: { id: "999999" }, body: { title: "x" } }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /chats/:id", () => {
  it("deletes an owned chat", async () => {
    const created = await createChatAs("deleter", { title: "gone" });
    const id = created.body.chat.id;

    const res = createRes();
    await deleteChat(reqAs("deleter", { params: { id: String(id) } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: true, id });
  });

  it("returns 404 for someone else's chat and leaves it intact", async () => {
    const created = await createChatAs("owner3", { title: "keep me" });
    const id = created.body.chat.id;

    const res = createRes();
    await deleteChat(reqAs("intruder3", { params: { id: String(id) } }), res);
    expect(res.statusCode).toBe(404);

    const stillThere = createRes();
    await getChat(reqAs("owner3", { params: { id: String(id) } }), stillThere);
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.body.chat.id).toBe(id);
  });

  it("returns 404 for a nonexistent chat", async () => {
    const res = createRes();
    await deleteChat(reqAs("owner3", { params: { id: "999999" } }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe("error handling", () => {
  it("routes a ChatStore failure through fail(res, e) instead of crashing", async () => {
    // Force a genuine DB-layer error via the same __setDb injection point
    // ChatStore already exposes for tests, rather than reassigning a
    // module-namespace export (ESM bindings from `import *` are not
    // configurable, so that approach throws a TypeError under bun).
    const throwingDb = {
      select() {
        return {
          from() {
            return {
              where() {
                throw new Error("boom");
              },
            };
          },
        };
      },
    };
    ChatStore.__setDb(throwingDb);

    const res = createRes();
    await listChats(reqAs("errUser"), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("boom");

    ChatStore.__setDb(drizzle(sqlite, { schema }));
  });
});
