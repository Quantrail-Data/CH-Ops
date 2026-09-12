import {CONTEXT_LIMITS} from "./constants.js";

const CHAR_PER_TOKEN = 3.5;
const HEAD_ROOM = 1.2;
const PROVIDER_LIMIT_KEYS = {
    "GEMINI": "gemini",
    "OPEN AI": "openai",
    "OPENAI" : "openai",
    "MISTRAL": "mistral",
    "CLAUDE": "anthropic",
    "OLLAMA": "ollama",
}

export function limitKeyFor(provider) {
    return PROVIDER_LIMIT_KEYS[String(provider).trim().toUpperCase()];
}


export function estimateTokens(charCount) {
    const n = Number(charCount);
    if (!Number.isFinite(n) || n<= 0) return 0 ;
    return Math.ceil((n / CHAR_PER_TOKEN) * HEAD_ROOM);
}

export function isOversize(tokens, provider) {
    const key = PROVIDER_LIMIT_KEYS[String(provider).trim()];
    const limit = CONTEXT_LIMITS[key]?.default;
    if (!Number.isFinite(limit)) return false;
    return Number(tokens) > limit;
}

