// aiService-gemini.test.js - Unit tests for the GEMINI provider branch of AIService
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";

try {
  initCrypto("aiservice-gemini-test-secret-at-least-32-chars!");
} catch {
  // Already initialized from a previous test file in the same process.
}

let lastConstructorOpts = null;
const generateContent = mock();

mock.module("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor(opts) {
      lastConstructorOpts = opts;
      this.models = { generateContent };
    }
  },
}));

// `?real`: tests/backend/databaseConnectionSchemaSqlGeneration.test.js
// mocks AIService.js wholesale for SQLGenerationService's own tests; the
// query-suffixed specifier is a distinct module cache key that resolves to
// the genuine file regardless of that mock.
const AIServices = (
  await import("../../src/backend/servicesAI/AIService.js?real")
).default;

const ENCRYPTED_KEY = encrypt("gemini-test-fixture-key");

beforeEach(() => {
  generateContent.mockReset();
  lastConstructorOpts = null;
});

describe("AIServices - GEMINI constructor", () => {
  it("configures the client with the decrypted API key", () => {
    new AIServices("GEMINI", "gemini-2.5-flash", ENCRYPTED_KEY);

    expect(lastConstructorOpts).toEqual({ apiKey: "gemini-test-fixture-key" });
  });

  it("accepts the provider name case-insensitively", () => {
    new AIServices("gemini", "gemini-2.5-flash", ENCRYPTED_KEY);

    expect(lastConstructorOpts).toEqual({ apiKey: "gemini-test-fixture-key" });
  });
});

describe("AIServices - GEMINI ask()", () => {
  it("calls models.generateContent with the model and prompt, returning response.text", async () => {
    generateContent.mockResolvedValue({ text: "SELECT version()" });

    const ai = new AIServices("GEMINI", "gemini-2.5-flash", ENCRYPTED_KEY);
    const result = await ai.ask("what version is running?");

    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      contents: "what version is running?",
    });
    expect(result).toBe("SELECT version()");
  });

  it("classifies a 429 as a rate-limit error", async () => {
    const err = new Error("Resource exhausted");
    err.status = 429;
    generateContent.mockRejectedValue(err);

    const ai = new AIServices("GEMINI", "gemini-2.5-flash", ENCRYPTED_KEY);

    await expect(ai.ask("hi")).rejects.toMatchObject({
      statusCode: 504,
      errorCode: "AI_PROVIDER_RATE_LIMIT_EXCEEDED",
    });
  });
});
