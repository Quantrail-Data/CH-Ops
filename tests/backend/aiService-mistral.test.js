// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// aiService-mistral.test.js - Unit tests for the MISTRAL provider branch of AIService

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { initCrypto, encrypt } from "../../src/backend/services/crypto.js";

try {
  initCrypto("aiservice-mistral-test-secret-at-least-32-chars!");
} catch {
}

let lastConstructorOpts = null;
const chatComplete = mock();

mock.module("@mistralai/mistralai", () => ({
  Mistral: class MockMistral {
    constructor(opts) {
      lastConstructorOpts = opts;
      this.chat = { complete: chatComplete };
    }
  },
}));

const AIServices = (await import("../../src/backend/servicesAI/AIService.js?real")).default;
const ENCRYPTED_KEY = encrypt("mistral-test-fixture-key");

beforeEach(() => {
  chatComplete.mockReset();
  lastConstructorOpts = null;
});

describe("AIServices - MISTRAL constructor", () => {
  it("configures the client with the decrypted API key", () => {
    new AIServices("MISTRAL", "mistral-large-latest", ENCRYPTED_KEY);
    expect(lastConstructorOpts).toEqual({
      apiKey: "mistral-test-fixture-key",
    });
  });

  it("accepts the provider name case-insensitively", () => {
    new AIServices("mistral", "mistral-large-latest", ENCRYPTED_KEY);
    expect(lastConstructorOpts).toEqual({
      apiKey: "mistral-test-fixture-key",
    });
  });
});

describe("AIServices - MISTRAL ask()", () => {
  it("calls chat.complete with the model and prompt as a user message", async () => {
    chatComplete.mockResolvedValue({
      choices: [{ message: { content: "SELECT version()" } }],
    });
    const ai = new AIServices("MISTRAL", "mistral-large-latest", ENCRYPTED_KEY);
    const result = await ai.ask("what version is running?");
    expect(chatComplete).toHaveBeenCalledWith({
      model: "mistral-large-latest",
      messages: [{ role: "user", content: "what version is running?" }],
    });
    expect(result).toBe("SELECT version()");
  });

  it("returns an empty string when choices are missing", async () => {
    chatComplete.mockResolvedValue({});
    const ai = new AIServices("MISTRAL", "mistral-large-latest", ENCRYPTED_KEY);
    const result = await ai.ask("hi");
    expect(result).toBe("");
  });

  it("classifies a 503 as service unavailable", async () => {
    const err = new Error("Service unavailable");
    err.status = 503;
    chatComplete.mockRejectedValue(err);
    const ai = new AIServices("MISTRAL", "mistral-large-latest", ENCRYPTED_KEY);
    await expect(ai.ask("hi")).rejects.toMatchObject({
      statusCode: 503,
      errorCode: "AI_SERVICE_UNAVAILABLE",
    });
  });
});
