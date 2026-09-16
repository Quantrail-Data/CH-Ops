// SQLGenerationService.js
// Orchestrates: DdlService -> intent check -> PromptBuilder -> AIServices -> SqlPostProcessor -> ChatStore.

import { fetchDdl } from "./DdlService.js";
import { buildPrompt, joinPrompt } from "./PromptBuilder.js";
import { stripFences, extractSql } from "./SqlPostProcessor.js";
import { estimateTokens } from "./TokenEstimator.js";
import { appendMessage } from "./ChatStore.js";
import { getActiveAiConfig } from "../services/studioAi.js";
import AIServices from "./AIService.js";
import { updateChatMessage } from "../servicesAI/chatStore.js";

const DEFAULT_SQL_LIMIT = 10;

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

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function extractExplicitLimit(instruction) {
  const match = /\b(?:top|first|limit)\s*[:=]?\s*(\d+)\b/i.exec(instruction);
  return match ? parseInt(match[1], 10) : null;
}

export function enforceLimit(sql, limit) {
  const trimmed = sql.trim();
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) return trimmed;

  const limitPattern = /\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i;
  const existing = limitPattern.exec(trimmed);
  if (existing) {
    const offsetClause = existing[1] ?? "";
    return `${trimmed.slice(0, existing.index).trimEnd()} LIMIT ${limit}${offsetClause}`;
  }
  return `${trimmed} LIMIT ${limit}`;
}

// Resolves the active key and hands back a ready-to-use AIServices instance.
// getActiveAiConfig() must return the key still encrypted - AIServices
// decrypts it internally. Decrypting twice here would be the same bug
// flagged in studioAi.js's completeDdl().
function getAiClient() {
  const cfg = getActiveAiConfig();
  if (!cfg) {
    const e = new Error("No AI provider configured. Set one in Settings.");
    e.statusCode = 400;
    throw e;
  }
  if (!cfg.apiKey) {
    const e = new Error("The configured AI key is empty.");
    e.statusCode = 400;
    throw e;
  }
  return { client: new AIServices(cfg.provider, cfg.model, cfg.apiKey), cfg };
}

async function classifyIntent(client, schemaContext, instruction) {
  const classifierPrompt = `
    You are an intent classifier for a database assistant.

    Your task is to classify the user's message into exactly one of these categories.

    1. GREETING
    Examples:
    - Hi
    - Hello
    - Hey
    - Good morning
    - Good evening
    - How are you?

    2. DATABASE
    Anything related to databases, including:

    - SQL
    - ClickHouse
    - Tables
    - Columns
    - Schema
    - Metadata
    - Relationships
    - Constraints
    - Views
    - Indexes
    - Database structure
    - Query generation
    - Database exploration
    - Database statistics
    - Data retrieval

    Examples:

    "What tables exist?"

    "Show all columns."

    "Describe customers."

    "Find total sales."

    "Generate SQL."

    "What version of ClickHouse is running?"

    "What is the current database?"

    3. OUT_OF_DOMAIN

    Anything unrelated to the provided database.

    Examples:

    "What is AI?"

    "Who won yesterday's FIFA match?"

    "Tell me a joke."

    "What is happening in Ukraine?"

    "Write Python code."
    ## INPUTS

    Schema:
    ${schemaContext}

    User message:
    ${instruction}

    Return ONLY one of:

    GREETING

    DATABASE

    OUT_OF_DOMAIN

    Do not return anything else.`.trim();

  const raw = await client.ask(classifierPrompt);
  const intent = raw.trim().toUpperCase();
  if (
    intent !== "GREETING" &&
    intent !== "DATABASE" &&
    intent !== "OUT_OF_DOMAIN"
  ) {
    return "OUT_OF_DOMAIN";
  }
  return intent;
}

export async function generateSql({
  jti,
  context,
  appUser,
  chatId = null,
  clusterId,
  node,
  tables,
  instruction,
  previousInstruction = null,
  previousSql = null,
  forceRefreshDdl = false,
  messageId = null,
}) {
  const { results: ddlBlocks, failures: ddlFailures } = await fetchDdl({
    jti,
    context,
    clusterId,
    node,
    tables,
    forceRefresh: forceRefreshDdl,
  });

  // previousInstruction/previousSql come from the caller - the wizard has no
  // saved chat to look anything up from, so this cannot depend on ChatStore.
  const promptParts = buildPrompt({
    instruction,
    ddlBlocks,
    previousInstruction,
    previousSql,
  });

  const { client, cfg } = getAiClient();

  let sql = null;
  let responseText = null;

  const intent = await classifyIntent(client, promptParts.context, instruction);

  if (intent === "GREETING") {
    responseText = pickRandom(GREETING_RESPONSES);
  } else if (intent === "OUT_OF_DOMAIN") {
    responseText = pickRandom(OUT_OF_DOMAIN_RESPONSES);
  } else {
    const finalPrompt = joinPrompt(promptParts);
    const raw = await client.ask(finalPrompt);
    const cleaned = stripFences(raw);
    const { sql: extracted, rawIfNoSql } = extractSql(cleaned);

    if (extracted === null || rawIfNoSql === "CANNOT_GENERATE_SQL") {
      responseText =
        "Unable to generate SQL for that question. Try adding more detail, or check the tables you've selected.";
    } else {
      const limit = extractExplicitLimit(instruction) ?? DEFAULT_SQL_LIMIT;
      sql = enforceLimit(extracted, limit);
    }
  }

  const tokensEstimated = estimateTokens(joinPrompt(promptParts).length);

  if (chatId && messageId) {
    const updated = await updateChatMessage(appUser, chatId, messageId, {
      instruction,
      sql,
      responseText,
      ddlSnapshot: promptParts.context || null,
      tokensEstimated,
      provider: cfg.provider,
      model: cfg.model,
    });
    return {
      chatId,
      instruction,
      sql,
      responseText,
      tokensEstimated,
      provider: cfg.provider,
      model: cfg.model,
      ddlFailures,
      messageId: updated?.id,
    };
  }

  const newMessage = await appendMessage(appUser, chatId, {
    instruction,
    sql,
    responseText,
    ddlSnapshot: promptParts.context || null,
    tokensEstimated,
    provider: cfg.provider,
    model: cfg.model,
  });
  return {
    chatId,
    instruction,
    sql,
    responseText,
    tokensEstimated,
    provider: cfg.provider,
    model: cfg.model,
    ddlFailures,
    messageId: newMessage?.id,
  };
}
