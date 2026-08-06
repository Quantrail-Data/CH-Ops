// aiService-constructor.test.js - Unit tests for AIService's provider-agnostic
// constructor validation (missing args, unsupported provider name). These
// checks run before or without needing to reach a real provider SDK, so no
// SDK is mocked here - see aiService-gemini/mistral/claude/ollama.test.js for
// the provider-specific client wiring.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect } from "bun:test";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";

try {
  initCrypto("aiservice-constructor-test-secret-32-chars-min!");
} catch {
  // Already initialized from a previous test file in the same process.
}

// `?real`: tests/backend/databaseConnectionSchemaSqlGeneration.test.js
// mocks AIService.js wholesale for SQLGenerationService's own tests; the
// query-suffixed specifier is a distinct module cache key that resolves to
// the genuine file regardless of that mock.
const AIServices = (
  await import("../../src/backend/servicesAI/AIService.js?real")
).default;

// A validly-encrypted key so decrypt() inside the constructor succeeds and
// execution reaches the provider switch's default branch.
const ENCRYPTED_KEY = encrypt("fixture-key");

describe("AIServices constructor - shared validation", () => {
  it("throws when the provider is missing", () => {
    expect(() => new AIServices("", "model", ENCRYPTED_KEY)).toThrow(
      "Provider is missing",
    );
  });

  it("throws when the model name is missing", () => {
    expect(() => new AIServices("GEMINI", "", ENCRYPTED_KEY)).toThrow(
      "Model name is missing",
    );
  });

  it("throws when the API key is missing", () => {
    expect(() => new AIServices("GEMINI", "model", "")).toThrow(
      "API key is missing",
    );
  });

  it("throws for an unrecognized provider name", () => {
    expect(
      () => new AIServices("COPILOT", "model", ENCRYPTED_KEY),
    ).toThrow("Unsupported AI provider: COPILOT");
  });
});
