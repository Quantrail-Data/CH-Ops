/**
 * api-keys.test.js - Unit tests for the API key service (services/apiKeys.js)
 *
 * Tests creating, reading, updating, deleting and activating API keys,
 * and the errors for a duplicate name, too many keys and an unknown key.
 *
 * The test uses its own temporary database. It never reads or changes
 * data/chops.db, so it does not delete the keys of a developer.
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */

import { afterAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initCrypto } from "../../src/backend/services/crypto.js";

// Each file in tests/backend runs in its own process, so this DB_PATH is used
// only by this file. It must be set before the database module is loaded.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-api-keys-"));
process.env.DB_PATH = path.join(tempDir, "chops.db");

const migration = Bun.spawnSync([process.execPath, "src/backend/db/migrate.js"], {
  env: {
    ...process.env,
    SUPER_ADMIN_1: "api-keys-test-admin",
    SUPER_ADMIN_1_PASSWORD: "api-keys-test-password",
    SUPER_ADMIN_1_EMAIL: "api-keys-admin@example.com",
    ENCRYPTION_SECRET: "api-keys-test-encryption-secret-32-chars",
  },
});
if (migration.exitCode !== 0) {
  throw new Error(`migrate.js failed: ${migration.stderr.toString()}`);
}

initCrypto("api-keys-test-encryption-secret-32-chars");

const {
  createApiKey,
  deleteApiKey,
  getActiveApiKey,
  getAllApiKeys,
  getApiKeyById,
  getApiKeysWithValues,
  setActiveApiKey,
  updateApiKey,
} = await import("../../src/backend/services/apiKeys.js");

const MAX_API_KEYS = 5;

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// The keys are made in order by the tests below.
let firstKey;
let secondKey;

describe("createApiKey", () => {
  it("makes the first key active and gives back the plain key", () => {
    firstKey = createApiKey("Team OpenAI", "sk-test-key", "gpt-5.4", "OPEN AI");
    expect(firstKey.key).toBe("sk-test-key");
    expect(firstKey.model).toBe("gpt-5.4");
    expect(firstKey.isActive).toBe(true);
  });

  it("does not make the second key active", () => {
    secondKey = createApiKey("Team Gemini", "gm-test-key", "gemini-2.5-flash", "GEMINI");
    expect(secondKey.key).toBe("gm-test-key");
    expect(secondKey.isActive).toBe(false);
  });

  it("refuses a name that is already used, with other letter case and spaces", () => {
    expect(() => createApiKey("  team openai ", "sk-other", "gpt-5.4", "OPEN AI")).toThrow(
      "An API key with this name already exists.",
    );
  });

  it(`refuses a key after ${MAX_API_KEYS} keys`, () => {
    createApiKey("Key 3", "key-3", "model", "CLAUDE");
    createApiKey("Key 4", "key-4", "model", "MISTRAL");
    createApiKey("Key 5", "key-5", "model", "OLLAMA");
    expect(() => createApiKey("Key 6", "key-6", "model", "GEMINI")).toThrow(
      `Maximum ${MAX_API_KEYS} API keys allowed.`,
    );
    expect(getAllApiKeys()).toHaveLength(MAX_API_KEYS);
  });
});

describe("reading keys", () => {
  it("getAllApiKeys gives the fields, but never the key value", () => {
    const keys = getAllApiKeys();
    expect(keys).toHaveLength(MAX_API_KEYS);
    for (const key of keys) {
      for (const field of ["id", "name", "provider", "isActive", "createdAt", "updatedAt", "model"]) {
        expect(key[field]).toBeDefined();
      }
      expect(key.key).toBeUndefined();
    }
  });

  it("getActiveApiKey gives the active key with the plain key value", () => {
    const activeKey = getActiveApiKey();
    expect(activeKey.id).toBe(firstKey.id);
    expect(activeKey.key).toBe("sk-test-key");
  });

  it("getApiKeyById gives the key, or null for an unknown id", () => {
    expect(getApiKeyById(secondKey.id).name).toBe("Team Gemini");
    expect(getApiKeyById(999999)).toBeNull();
  });

  it("getApiKeysWithValues gives the plain value of each key", () => {
    const valuesByName = Object.fromEntries(getApiKeysWithValues().map((key) => [key.name, key.key]));
    expect(valuesByName["Team OpenAI"]).toBe("sk-test-key");
    expect(valuesByName["Team Gemini"]).toBe("gm-test-key");
  });
});

describe("updateApiKey", () => {
  it("changes the name, the key and the model", () => {
    const updatedKey = updateApiKey(firstKey.id, "Team OpenAI 2", "sk-new-key", "gpt-5.5", "OPEN AI");
    expect(updatedKey.name).toBe("Team OpenAI 2");
    expect(updatedKey.key).toBe("sk-new-key");
    expect(updatedKey.model).toBe("gpt-5.5");
  });

  it("refuses the name of another key", () => {
    expect(() => updateApiKey(firstKey.id, "Team Gemini", "sk-new-key", "gpt-5.5", "OPEN AI")).toThrow(
      "An API key with this name already exists.",
    );
  });

  it("refuses an unknown id", () => {
    expect(() => updateApiKey(999999, "Any name", "any-key", "model", "GEMINI")).toThrow("API key not found.");
  });
});

describe("setActiveApiKey", () => {
  it("makes the key active, and only that key", () => {
    const activeKey = setActiveApiKey(secondKey.id);
    expect(activeKey.id).toBe(secondKey.id);
    const activeKeys = getAllApiKeys().filter((key) => key.isActive);
    expect(activeKeys.map((key) => key.id)).toEqual([secondKey.id]);
  });

  it("refuses an unknown id", () => {
    expect(() => setActiveApiKey(999999)).toThrow("API key not found.");
  });
});

describe("deleteApiKey", () => {
  it("makes another key active when the active key is deleted", () => {
    expect(deleteApiKey(secondKey.id)).toEqual({ deleted: true });
    expect(getApiKeyById(secondKey.id)).toBeNull();
    const activeKey = getActiveApiKey();
    expect(activeKey).not.toBeNull();
    expect(activeKey.id).not.toBe(secondKey.id);
  });

  it("refuses an unknown id", () => {
    expect(() => deleteApiKey(999999)).toThrow("API key not found.");
  });
});
