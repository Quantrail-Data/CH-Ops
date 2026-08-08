// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// AIService.constructor.test.js - unit tests for AIServices constructor input validation

import { describe, it, expect } from "bun:test";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";

try {
  initCrypto("aiservice-constructor-test-secret-32-chars-min!");
} catch {
 
}

const AIServices = (await import("../../src/backend/servicesAI/AIService.js?real")).default;
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
