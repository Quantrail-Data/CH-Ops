// chatStore.js - persistence for Qurioz conversations
//
// A chat belongs to exactly one app user, and ownership is enforced in the
// WHERE clause of every statement rather than by comparing after the read. A
// chat the caller does not own is indistinguishable from one that does not
// exist: getChat returns null, and an update or delete affects nothing.
//
// One row per exchange in ai_chat_message - the question and the SQL it
// produced, together. See the note on the table in db/schema.js for why there
// is no role column.
//
// Author: Qurioz AI service layer
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { eq, and, desc } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { aiChat, aiChatMessage } from "../db/schema.js";
import { MAX_DDL_SNAPSHOT_BYTES } from "./constants.js";

// Tests inject an isolated in-memory database; production code never calls it.
let activeDb = defaultDb;
export function __setDb(d) {
  activeDb = d || defaultDb;
}

function nowIso() {
  return new Date().toISOString();
}

// SQLite has no JSON type, so selected_tables is TEXT. The encoding is this
// module's business - callers only ever see an array.
function encodeTables(tables) {
  return JSON.stringify(Array.isArray(tables) ? tables : []);
}

function decodeTables(raw) {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A value written by hand or by an older build should not break the read.
    return [];
  }
}

function shapeChat(row) {
  if (!row) return null;
  return { ...row, selectedTables: decodeTables(row.selectedTables) };
}

// Ownership is part of the key, not a check applied afterwards.
function ownedBy(appUser, chatId) {
  return and(eq(aiChat.id, Number(chatId)), eq(aiChat.appUser, appUser));
}

// Cut a string to a byte budget without splitting a UTF-8 character.
// MAX_DDL_SNAPSHOT_BYTES is a byte count and DDL can carry multi-byte
// identifiers, so measuring with .length would let an oversize snapshot through.
function truncateToBytes(text, maxBytes) {
  const s = String(text ?? "");
  if (Buffer.byteLength(s, "utf8") <= maxBytes)
    return { text: s, truncated: false };

  const buf = Buffer.from(s, "utf8").subarray(0, maxBytes);
  // Walk back off a partial trailing sequence: a continuation byte is 10xxxxxx.
  let end = buf.length;
  while (end > 0 && (buf[end - 1] & 0xc0) === 0x80) end--;
  // `end` now sits on a lead byte; drop it too, since its sequence was cut.
  if (end > 0 && buf[end - 1] > 0x7f) end--;

  return { text: buf.subarray(0, end).toString("utf8"), truncated: true };
}

export async function listChats(appUser) {
  const rows = activeDb
    .select()
    .from(aiChat)
    .where(eq(aiChat.appUser, appUser))
    .orderBy(desc(aiChat.updatedAt), desc(aiChat.id))
    .all();
  return rows.map(shapeChat);
}

// Returns null for a chat owned by someone else, exactly as for one that does
// not exist - the caller learns nothing about another user's data.
export async function getChat(appUser, chatId) {
  const row = activeDb
    .select()
    .from(aiChat)
    .where(ownedBy(appUser, chatId))
    .get();
  return shapeChat(row);
}

export async function createChat(
  appUser,
  { title, clusterId, node, selectedTables } = {},
) {
  const [row] = activeDb
    .insert(aiChat)
    .values({
      appUser,
      title: title ?? null,
      clusterId: clusterId ?? null,
      node: node ?? null,
      selectedTables: encodeTables(selectedTables),
    })
    .returning()
    .all();
  return shapeChat(row);
}

// Patch keys are whitelisted: an unknown key is ignored rather than passed
// through to the update, so a caller cannot reassign appUser and hand a chat to
// someone else.
export async function updateChat(appUser, chatId, patch = {}) {
  const set = { updatedAt: nowIso() };
  if ("title" in patch) set.title = patch.title ?? null;
  if ("clusterId" in patch) set.clusterId = patch.clusterId ?? null;
  if ("node" in patch) set.node = patch.node ?? null;
  if ("selectedTables" in patch)
    set.selectedTables = encodeTables(patch.selectedTables);

  activeDb.update(aiChat).set(set).where(ownedBy(appUser, chatId)).run();
  return getChat(appUser, chatId);
}

// Messages go with the chat through the ON DELETE CASCADE on
// ai_chat_message.chat_id. That only fires because db/index.js sets
// PRAGMA foreign_keys = ON - deleting them by hand here would paper over it.
export async function deleteChat(appUser, chatId) {
  const existing = await getChat(appUser, chatId);
  if (!existing) return false;
  activeDb.delete(aiChat).where(ownedBy(appUser, chatId)).run();
  return true;
}

export async function appendMessage(appUser, chatId, message = {}) {
  // Appending to a chat is a write to it, so it gets the same ownership check.
  const chat = await getChat(appUser, chatId);
  if (!chat) return null;

  const { text: ddlSnapshot, truncated } = truncateToBytes(
    message.ddlSnapshot ?? "",
    MAX_DDL_SNAPSHOT_BYTES,
  );

  const [row] = activeDb
    .insert(aiChatMessage)
    .values({
      chatId: chat.id,
      instruction: message.instruction ?? "",
      sql: message.sql ?? null,
      responseText: message.responseText ?? null,
      ddlSnapshot: message.ddlSnapshot == null ? null : ddlSnapshot,
      ddlTruncated: truncated,
      tokensEstimated: message.tokensEstimated ?? null,
      provider: message.provider ?? null,
      model: message.model ?? null,
      errorCode: message.errorCode ?? null,
    })
    .returning()
    .all();

  // The chat's position in the sidebar follows its last activity.
  activeDb
    .update(aiChat)
    .set({ updatedAt: nowIso() })
    .where(ownedBy(appUser, chatId))
    .run();

  return row;
}

// The refine path: one row gives previousInstruction and previousSql directly.
export async function lastExchange(appUser, chatId) {
  const chat = await getChat(appUser, chatId);
  if (!chat) return null;

  const row = activeDb
    .select({ instruction: aiChatMessage.instruction, sql: aiChatMessage.sql })
    .from(aiChatMessage)
    .where(eq(aiChatMessage.chatId, chat.id))
    .orderBy(desc(aiChatMessage.id))
    .limit(1)
    .get();

  return row ?? null;
}

export async function listMessages(appUser, chatId) {
  const chat = await getChat(appUser, chatId);
  if (!chat) return null;
  return activeDb
    .select()
    .from(aiChatMessage)
    .where(eq(aiChatMessage.chatId, chat.id))
    .orderBy(aiChatMessage.id)
    .all();
}

export async function updateChatMessage(
  appUser,
  chatId,
  messageId,
  message = {},
) {
  const chat = activeDb
    .select()
    .from(aiChat)
    .where(and(eq(aiChat.id, Number(chatId)), eq(aiChat.appUser, appUser)))
    .get();

  if (!chat) return null;

  const existingMessage = activeDb
    .select()
    .from(aiChatMessage)
    .where(
      and(
        eq(aiChatMessage.id, Number(messageId)),
        eq(aiChatMessage.chatId, chat.id),
      ),
    )
    .get();

  if (!existingMessage) return null;

  activeDb
    .update(aiChatMessage)
    .set({
      instruction: message.instruction ? message.insertError : existingMessage.instruction,
      sql: message.sql ? message.sql : existingMessage?.sql,
      responseText: message.responseText ?? null,
      ddlSnapshot: message.ddlSnapshot ?? null,
      ddlTruncated: message.ddlTruncated ?? false,
      tokensEstimated: message.tokensEstimated ?? null,
      provider: message.provider ?? null,
      model: message.model ?? null,
      errorCode: message.errorCode ?? null,
    }) 
    .where(
      and(eq(aiChatMessage.id, messageId), eq(aiChatMessage.chatId, chat.id)),
    )
    .run();

  return activeDb
    .select()
    .from(aiChatMessage)
    .where(
      and(eq(aiChatMessage.id, messageId), eq(aiChatMessage.chatId, chat.id)),
    )
    .get();
}

export async function insertError(
  appUser,
  chatId,
  messageId,
  error,
  instruction = null,
  ddlTruncated = false,
  sql = null,
  responseText = null,
  tokensEstimated = null,
  ddlSnapshot = null,
  provider = null,
  model = null,
  ddlFailures = null,
) {
  const errorCode = JSON.stringify({
    errorCode: error?.code,
    message: error?.message,
  });

  const messageData = {
    instruction,
    sql,
    responseText,
    ddlSnapshot,
    ddlTruncated,
    tokensEstimated,
    provider,
    model,
    errorCode,
  };

  if (chatId && messageId) {
    const chat = activeDb
      .select()
      .from(aiChat)
      .where(
        and(
          eq(aiChat.id, Number(chatId)),
          eq(aiChat.appUser, appUser),
        ),
      )
      .get();

    if (!chat) return null;

    const existingMessage = activeDb
      .select()
      .from(aiChatMessage)
      .where(
        and(
          eq(aiChatMessage.id, Number(messageId)),
          eq(aiChatMessage.chatId, chat.id),
        ),
      )
      .get();

    if (!existingMessage) return null;

    activeDb
      .update(aiChatMessage)
      .set(messageData)
      .where(
        and(
          eq(aiChatMessage.id, Number(messageId)),
          eq(aiChatMessage.chatId, chat.id),
        ),
      )
      .run();

    activeDb
      .update(aiChat)
      .set({ updatedAt: nowIso() })
      .where(ownedBy(appUser, chatId))
      .run();

    const updatedRow = activeDb
      .select()
      .from(aiChatMessage)
      .where(
        and(
          eq(aiChatMessage.id, Number(messageId)),
          eq(aiChatMessage.chatId, chat.id),
        ),
      )
      .get();
    return updatedRow;
  }


  const chat = await getChat(appUser, chatId);

  if (!chat) return null;

  const [row] = activeDb
    .insert(aiChatMessage)
    .values({
      chatId: chat.id,
      ...messageData,
    })
    .returning()
    .all();

  activeDb
    .update(aiChat)
    .set({ updatedAt: nowIso() })
    .where(ownedBy(appUser, chatId))
    .run();

  return row;
}