/**
 * apiKeys-ollama-route.test.js - Unit tests for POST /ollama/models
 *
 * Lets the API Key Management UI fetch the list of models actually pulled on
 * a target Ollama server (via its /api/tags endpoint) before saving a key.
 * Covers input validation (missing/malformed/non-http base URL), an
 * unreachable server (network error), a non-2xx response, a malformed JSON
 * body, and the happy path mapping {models:[{name}]} to a flat name list.
 * Always resolves with HTTP 200 and a {success, ...} body - an unreachable
 * dev server is an expected setup state, not a server error.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

mock.module("../../src/backend/db/index.js", () => ({
  db: {},
  appUsers: {},
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  appSettings: {},
  dashboards: {},
  charts: {},
}));

const { default: apiKeysRouter } = await import(
  "../../src/backend/routes/apiKeys.js"
);

function getHandler(method, path) {
  const layer = apiKeysRouter.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  return layer.route.stack[0].handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

const handler = getHandler("post", "/ollama/models");
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

describe("POST /ollama/models - validation", () => {
  it("rejects a missing base URL", async () => {
    const req = { body: {} };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ success: false, message: "Base URL is required." });
  });

  it("rejects a blank base URL", async () => {
    const req = { body: { baseUrl: "   " } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it("rejects a malformed URL", async () => {
    const req = { body: { baseUrl: "not-a-url" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/valid URL/);
  });

  it("rejects a non-http(s) protocol", async () => {
    const req = { body: { baseUrl: "ftp://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/http:\/\/ or https:\/\//);
  });
});

describe("POST /ollama/models - server responses", () => {
  it("returns success:false (still HTTP 200) when the server is unreachable", async () => {
    globalThis.fetch = mock(() => {
      throw new Error("fetch failed");
    });

    const req = { body: { baseUrl: "http://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Could not reach Ollama/);
  });

  it("returns success:false when Ollama responds with a non-2xx status", async () => {
    globalThis.fetch = mock(async () => ({ ok: false, status: 500 }));

    const req = { body: { baseUrl: "http://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: false,
      message: "Ollama responded with HTTP 500.",
    });
  });

  it("returns an empty model list when the response body isn't valid JSON", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => {
        throw new Error("not json");
      },
    }));

    const req = { body: { baseUrl: "http://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
  });

  it("returns an empty model list when the models field is missing/malformed", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ notModels: [] }),
    }));

    const req = { body: { baseUrl: "http://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.body).toEqual({ success: true, models: [] });
  });

  it("maps {models:[{name}]} to a flat list of model names", async () => {
    let requestedUrl = null;
    globalThis.fetch = mock(async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          models: [
            { name: "qwen2.5-coder:7b", size: 123 },
            { name: "phi4:latest", size: 456 },
          ],
        }),
      };
    });

    const req = { body: { baseUrl: "http://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      models: ["qwen2.5-coder:7b", "phi4:latest"],
    });
    expect(requestedUrl).toBe("http://localhost:11434/api/tags");
  });

  it("strips a trailing slash from the base URL before requesting /api/tags", async () => {
    let requestedUrl = null;
    globalThis.fetch = mock(async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ models: [] }) };
    });

    const req = { body: { baseUrl: "http://localhost:11434/" } };
    const res = createRes();

    await handler(req, res);

    expect(requestedUrl).toBe("http://localhost:11434/api/tags");
  });

  it("filters out models with an empty/missing name", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: "llama3.2" }, { name: "" }, {}],
      }),
    }));

    const req = { body: { baseUrl: "http://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.body).toEqual({ success: true, models: ["llama3.2"] });
  });
});
