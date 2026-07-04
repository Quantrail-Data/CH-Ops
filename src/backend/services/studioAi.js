// studioAi.js - AI completion for Schema Studio DDL generation
//
// Reuses the existing encrypted API-key storage (the api_key table) and crypto
// helper, but calls the provider from clean ESM rather than the CommonJS
// AIService class, which avoids a CJS-requires-ESM module conflict. v1 ships on
// the active provider (Gemini); additional providers can be added here behind
// the same getActiveAiConfig() lookup when the Settings provider dropdown lands.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { GoogleGenAI } from '@google/genai';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { decrypt } from './crypto.js';

// Read the active AI key. The api_key table's "name" column doubles as the
// provider, mirroring how the rest of the app constructs its AI client.
export function getActiveAiConfig() {
  const active = db.select().from(apiKeys).where(eq(apiKeys.isActive, 1)).get();
  if (!active) return null;
  return {
    provider: String(active.name || '').toUpperCase(),
    model: active.model,
    apiKey: decrypt(active.encryptedKey),
  };
}

// Pure mapping from a resolved config to the non-secret status shown in the UI.
// v1 executes Gemini; other providers can be selected (and stored) but are not
// yet executable, so the UI can warn instead of failing at generate time.
export function aiStatusFromConfig(cfg) {
  if (!cfg) return { configured: false, executable: false };
  return {
    configured: true,
    provider: cfg.provider,
    model: cfg.model,
    executable: cfg.provider === 'GEMINI',
  };
}

// Non-secret status for the client (never includes the API key).
export function getAiStatus() {
  return aiStatusFromConfig(getActiveAiConfig());
}

// Run a completion for the given prompt and return the text. Throws a tagged
// error (with a .status) the route surfaces to the user.
export async function completeDdl(prompt) {
  const cfg = getActiveAiConfig();
  if (!cfg) {
    const e = new Error('No AI provider configured. Set one in Settings.');
    e.status = 400;
    throw e;
  }
  if (!cfg.apiKey) {
    const e = new Error('The configured AI key is empty.');
    e.status = 400;
    throw e;
  }
  if (cfg.provider !== 'GEMINI') {
    const e = new Error(`AI provider "${cfg.provider}" is not supported yet. Select Gemini.`);
    e.status = 400;
    throw e;
  }

  try {
    const client = new GoogleGenAI({ apiKey: cfg.apiKey });
    const response = await client.models.generateContent({
      model: cfg.model || 'gemini-1.5-pro',
      contents: prompt,
    });
    return response.text || '';
  } catch (err) {
    const status = err?.status || err?.code || err?.statusCode;
    const message = err?.message || '';
    if (status === 429 || message.includes('Resource exhausted')) {
      const e = new Error('AI provider rate limit exceeded. Please try again later.');
      e.status = 429;
      throw e;
    }
    if (status === 401 || message.includes('invalid authentication')) {
      const e = new Error('AI authentication failed. Please verify the API key in Settings.');
      e.status = 400;
      throw e;
    }
    const e = new Error('AI request failed: ' + (message || 'unknown error'));
    e.status = 502;
    throw e;
  }
}
