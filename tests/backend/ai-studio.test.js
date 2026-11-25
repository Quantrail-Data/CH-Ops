/**
 * ai-studio.test.js - Unit tests for the Schema Studio AI completion
 * (completeDdl and getAiStatus in services/studioAi.js)
 *
 * Tests the text from the provider, and the errors when no key is set, when
 * the key is empty, and when the provider fails.
 *
 * The test uses its own temporary database and a fake AI provider. It needs
 * no real API key and no network, and it never changes data/chops.db.
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */

import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initCrypto } from "../../src/backend/services/crypto.js";

// Each file in tests/backend runs in its own process, so this DB_PATH is used
// only by this file. It must be set before the database module is loaded.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-ai-studio-"));
process.env.DB_PATH = path.join(tempDir, "chops.db");

const migration = Bun.spawnSync([process.execPath, "src/backend/db/migrate.js"], {
  env: {
    ...process.env,
    SUPER_ADMIN_1: "ai-studio-test-admin",
    SUPER_ADMIN_1_PASSWORD: "ai-studio-test-password",
    SUPER_ADMIN_1_EMAIL: "ai-studio-admin@example.com",
    ENCRYPTION_SECRET: "ai-studio-test-encryption-secret-32-chars",
  },
});
if (migration.exitCode !== 0) {
  throw new Error(`migrate.js failed: ${migration.stderr.toString()}`);
}

initCrypto("ai-studio-test-encryption-secret-32-chars");

// The fake provider. Each test sets what ask() gives back or throws.
const providerCalls = [];
let askResult = () => "WORKING";

class FakeAIServices {
  constructor(provider, modelName, apiKey) {
    providerCalls.push({ provider, modelName, apiKey });
    if (!["GEMINI", "MISTRAL", "CLAUDE", "OPEN AI", "OLLAMA"].includes(provider)) {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  async ask(prompt) {
    return askResult(prompt);
  }
}

mock.module("../../src/backend/servicesAI/AIService.js", () => ({ default: FakeAIServices }));

const { createApiKey, deleteApiKey, getAllApiKeys, setActiveApiKey } = await import(
  "../../src/backend/services/apiKeys.js"
);
const { completeDdl, getAiStatus } = await import("../../src/backend/services/studioAi.js");

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// Deletes all keys, then makes one active key.
function useOnlyKey(name, keyValue, model, provider) {
  for (const key of getAllApiKeys()) deleteApiKey(key.id);
  const key = createApiKey(name, keyValue, model, provider);
  setActiveApiKey(key.id);
  return key;
}

// The error that completeDdl throws.
async function completeDdlError(prompt = "Make a table") {
  try {
    await completeDdl(prompt);
  } catch (error) {
    return error;
  }
  throw new Error("completeDdl did not throw.");
}

beforeEach(() => {
  providerCalls.length = 0;
  askResult = () => "WORKING";
});

describe("completeDdl", () => {
  it("gives an error with status 400 when no key is set", async () => {
    for (const key of getAllApiKeys()) deleteApiKey(key.id);
    const error = await completeDdlError();
    expect(error.status).toBe(400);
    expect(error.message).toBe("No AI provider configured. Set one in Settings.");
    expect(providerCalls).toHaveLength(0);
  });

  it("gives an error with status 400 when the active key is empty", async () => {
    useOnlyKey("Empty key", "", "gemini-2.5-flash", "GEMINI");
    const error = await completeDdlError();
    expect(error.status).toBe(400);
    expect(error.message).toBe("The configured AI key is empty.");
    expect(providerCalls).toHaveLength(0);
  });

  it("sends the prompt to the active provider and gives back its text", async () => {
    useOnlyKey("Team Gemini", "gm-test-key", "gemini-2.5-flash", "gemini");
    const prompts = [];
    askResult = (prompt) => {
      prompts.push(prompt);
      return "CREATE TABLE t (id UInt64) ENGINE = MergeTree ORDER BY id";
    };
    const text = await completeDdl("Make a table");
    expect(text).toBe("CREATE TABLE t (id UInt64) ENGINE = MergeTree ORDER BY id");
    expect(prompts).toEqual(["Make a table"]);
    // The provider name is in capitals, and the key is the plain value.
    expect(providerCalls).toEqual([{ provider: "GEMINI", modelName: "gemini-2.5-flash", apiKey: "gm-test-key" }]);
  });

  it("gives an empty text when the provider gives nothing", async () => {
    useOnlyKey("Team Gemini", "gm-test-key", "gemini-2.5-flash", "GEMINI");
    askResult = () => undefined;
    expect(await completeDdl("Make a table")).toBe("");
  });

  it("gives status 429 when the provider has a rate limit", async () => {
    useOnlyKey("Team Gemini", "gm-test-key", "gemini-2.5-flash", "GEMINI");
    askResult = () => {
      throw Object.assign(new Error("Resource exhausted"), { status: 429 });
    };
    const error = await completeDdlError();
    expect(error.status).toBe(429);
    expect(error.message).toBe("AI provider rate limit exceeded. Please try again later.");
  });

  it("gives status 400 when the provider refuses the key", async () => {
    useOnlyKey("Team Gemini", "gm-test-key", "gemini-2.5-flash", "GEMINI");
    askResult = () => {
      throw Object.assign(new Error("invalid authentication"), { status: 401 });
    };
    const error = await completeDdlError();
    expect(error.status).toBe(400);
    expect(error.message).toBe("AI authentication failed. Please verify the API key in Settings.");
  });

  it("gives status 502 with the provider message for other errors", async () => {
    useOnlyKey("Team Gemini", "gm-test-key", "gemini-2.5-flash", "GEMINI");
    askResult = () => {
      throw new Error("socket hang up");
    };
    const error = await completeDdlError();
    expect(error.status).toBe(502);
    expect(error.message).toBe("AI request failed: socket hang up");
  });

  it("gives status 502 for a provider that is not supported", async () => {
    useOnlyKey("Other", "other-key", "some-model", "OTHER");
    const error = await completeDdlError();
    expect(error.status).toBe(502);
    expect(error.message).toBe("AI request failed: Unsupported AI provider: OTHER");
  });
});

describe("getAiStatus", () => {
  it("says that nothing is configured when no key is set", () => {
    for (const key of getAllApiKeys()) deleteApiKey(key.id);
    expect(getAiStatus()).toEqual({ configured: false, executable: false });
  });

  it("gives the provider and the model, but never the key", () => {
    useOnlyKey("Team Claude", "secret-claude-key", "claude-sonnet", "CLAUDE");
    const status = getAiStatus();
    expect(status).toEqual({ configured: true, provider: "CLAUDE", model: "claude-sonnet", executable: true });
    expect(JSON.stringify(status)).not.toContain("secret-claude-key");
  });
});
