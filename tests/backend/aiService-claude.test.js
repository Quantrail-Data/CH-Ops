// aiService-claude.test.js - Unit tests for the CLAUDE provider branch of AIService
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";

try {
  initCrypto("aiservice-claude-test-secret-at-least-32-chars!");
} catch {
  // Already initialized from a previous test file in the same process.
}

let lastConstructorOpts = null;
const messagesCreate = mock();

mock.module("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor(opts) {
      lastConstructorOpts = opts;
      this.messages = { create: messagesCreate };
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

const ENCRYPTED_KEY = encrypt("claude-test-fixture-key");

beforeEach(() => {
  messagesCreate.mockReset();
  lastConstructorOpts = null;
});

describe("AIServices - CLAUDE constructor", () => {
  it("configures the client with the decrypted API key", () => {
    new AIServices("CLAUDE", "claude-sonnet-5", ENCRYPTED_KEY);

    expect(lastConstructorOpts).toEqual({ apiKey: "claude-test-fixture-key" });
  });

  it("accepts the provider name case-insensitively", () => {
    new AIServices("claude", "claude-sonnet-5", ENCRYPTED_KEY);

    expect(lastConstructorOpts).toEqual({ apiKey: "claude-test-fixture-key" });
  });
});

describe("AIServices - CLAUDE ask()", () => {
  it("calls messages.create with model, max_tokens, and the prompt, returning the text block", async () => {
    messagesCreate.mockResolvedValue({
      content: [{ text: "SELECT version()" }],
    });

    const ai = new AIServices("CLAUDE", "claude-sonnet-5", ENCRYPTED_KEY);
    const result = await ai.ask("what version is running?");

    expect(messagesCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-5",
      max_tokens: 8048,
      messages: [{ role: "user", content: "what version is running?" }],
    });
    expect(result).toBe("SELECT version()");
  });

  it("returns an empty string when content is missing", async () => {
    messagesCreate.mockResolvedValue({});

    const ai = new AIServices("CLAUDE", "claude-sonnet-5", ENCRYPTED_KEY);
    const result = await ai.ask("hi");

    expect(result).toBe("");
  });

  it("classifies a 403 as an authentication failure", async () => {
    const err = new Error("Forbidden");
    err.status = 403;
    messagesCreate.mockRejectedValue(err);

    const ai = new AIServices("CLAUDE", "claude-sonnet-5", ENCRYPTED_KEY);

    await expect(ai.ask("hi")).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "AI_AUTHENTICATION_FAILED",
    });
  });
});
