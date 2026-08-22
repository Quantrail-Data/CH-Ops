// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Dhivyadharshini, Ravivarman)
// Shared constants for AI services


export const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const VECTOR_DIMENSION = 384;
export const VECTOR_STORE_FOLDER = "data/storage";
export const VECTOR_STORE_FILE = "store_schema.json";

export const CONTEXT_LIMITS = {
    openai : {default : 200000},
    anthropic : {default : 200000},
    gemini: {default : 200000},
    mistral : {default : 100000},
    ollama : {default : 24000}
}

export const SETTING_KEYS = Object.freeze({
  CHAT_RETENTION_MAX_PER_USER: "ai.chat.retention.maxPerUser",
  CHAT_RETENTION_MAX_AGE_DAYS: "ai.chat.retention.maxAgeDays",
  DDL_CACHE_TTL_MINUTES: "ai.ddlCache.ttlMinutes",
  GENERATE_RATE_PER_HOUR: "ai.generate.ratePerHour",
});

export const MAX_DDL_SNAPSHOT_BYTES = 256 * 1024;