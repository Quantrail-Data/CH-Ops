/**
 * aiService-ollama.test.js - Unit tests for the OLLAMA provider branch of AIService
 *
 * Ollama has no real API key - the "APIkey" constructor argument carries its
 * base URL instead, and its OpenAI-compatible layer only implements the Chat
 * Completions API (not the Responses API the "OPEN AI" branch uses). Tests
 * the OpenAI client is configured with the right baseURL/apiKey, chat.completions.create
 * is called with temperature 0 and the right model/messages, the response is
 * unwrapped correctly (including the no-choices fallback), and that thrown
 * provider errors still flow through the shared rate-limit/auth/generic
 * classification in the catch block.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { initCrypto } from "../../src/backend/services/crypto.js";

try {
  initCrypto("test-session-secret-minimum-32-characters-long!");
} catch {
  // Already initialized from a previous test file in the same process.
}

let lastConstructorOpts = null;
const chatCompletionsCreate = mock();

mock.module("openai", () => ({
  default: class MockOpenAI {
    constructor(opts) {
      lastConstructorOpts = opts;
      this.chat = { completions: { create: chatCompletionsCreate } };
      this.responses = { create: mock() };
    }
  },
}));

const AIServices = (await import("../../src/backend/servicesAI/AIService.js")).default;

const BASE_URL = "http://localhost:11434";

beforeEach(() => {
  chatCompletionsCreate.mockReset();
  lastConstructorOpts = null;
});

describe("AIServices - OLLAMA constructor", () => {
  it("throws if the base URL (APIkey arg) is missing", () => {
    expect(() => new AIServices("OLLAMA", "llama3.2", "")).toThrow(
      "API key is missing",
    );
  });

  it("throws if the model name is missing", () => {
    expect(() => new AIServices("OLLAMA", "", BASE_URL)).toThrow(
      "Model name is missing",
    );
  });

  it("configures the OpenAI-compatible client with Ollama's /v1 endpoint", () => {
    new AIServices("OLLAMA", "llama3.2", BASE_URL);

    expect(lastConstructorOpts).toEqual({
      apiKey: "ollama",
      baseURL: "http://localhost:11434/v1",
    });
  });

  it("strips a trailing slash from the base URL before appending /v1", () => {
    new AIServices("OLLAMA", "llama3.2", "http://localhost:11434/");

    expect(lastConstructorOpts.baseURL).toBe("http://localhost:11434/v1");
  });

  it("accepts the provider name case-insensitively", () => {
    new AIServices("ollama", "llama3.2", BASE_URL);

    expect(lastConstructorOpts.baseURL).toBe("http://localhost:11434/v1");
  });
});

describe("AIServices - OLLAMA ask()", () => {
  it("calls chat.completions.create with temperature 0 and the prompt as a user message", async () => {
    chatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "SELECT version()" } }],
    });

    const ai = new AIServices("OLLAMA", "qwen2.5-coder:7b", BASE_URL);
    const result = await ai.ask("give me the clickhouse version");

    expect(chatCompletionsCreate).toHaveBeenCalledWith({
      model: "qwen2.5-coder:7b",
      temperature: 0,
      messages: [{ role: "user", content: "give me the clickhouse version" }],
    });
    expect(result).toBe("SELECT version()");
  });

  it("returns an empty string when the response has no choices", async () => {
    chatCompletionsCreate.mockResolvedValue({ choices: [] });

    const ai = new AIServices("OLLAMA", "llama3.2", BASE_URL);
    const result = await ai.ask("hi");

    expect(result).toBe("");
  });

  it("returns an empty string when the response is missing entirely", async () => {
    chatCompletionsCreate.mockResolvedValue({});

    const ai = new AIServices("OLLAMA", "llama3.2", BASE_URL);
    const result = await ai.ask("hi");

    expect(result).toBe("");
  });

  it("propagates an unreachable-server error through the generic classification", async () => {
    chatCompletionsCreate.mockRejectedValue(new Error("fetch failed"));

    const ai = new AIServices("OLLAMA", "llama3.2", BASE_URL);

    await expect(ai.ask("hi")).rejects.toThrow("fetch failed");
  });

  it("classifies a 429 from Ollama as a rate-limit error", async () => {
    const err = new Error("Too many requests");
    err.status = 429;
    chatCompletionsCreate.mockRejectedValue(err);

    const ai = new AIServices("OLLAMA", "llama3.2", BASE_URL);

    await expect(ai.ask("hi")).rejects.toMatchObject({
      statusCode: 504,
      errorCode: "AI_PROVIDER_RATE_LIMIT_EXCEEDED",
    });
  });
});
