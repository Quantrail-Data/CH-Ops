/**
 * apiKeys-ollama-route.test.js - Unit tests for POST /ollama/models
 *
 * Lets the API Key Management UI fetch the list of models actually pulled on
 * a target Ollama server (via its /api/tags endpoint) before saving a key.
 * Covers: the requireSuperAdmin gate, input validation (missing/malformed/
 * non-http base URL), the SSRF guard (localhost/127.0.0.1/::1 loopback is
 * allowed - that's the normal way Ollama is run; other private/LAN/link-local
 * addresses are rejected), DNS-rebinding protection (the fetch is pinned to
 * the already-validated IP, not re-resolved), an unreachable server (network
 * error), a non-2xx response, a malformed JSON body, and the happy path
 * mapping {models:[{name}]} to a flat name list. Non-SSRF-guard failures
 * always resolve with HTTP 200 and a {success, ...} body - an unreachable dev
 * server is an expected setup state, not a server error.
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

const mockLookup = mock();
mock.module("node:dns/promises", () => ({ lookup: mockLookup }));

const { default: apiKeysRouter } = await import(
  "../../src/backend/routes/apiKeys.js"
);

function getRouteLayer(method, path) {
  const layer = apiKeysRouter.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  return layer.route.stack;
}

// requireSuperAdmin runs first in the chain; the route's own logic is the
// last handler after it.
function getMiddleware(method, path) {
  return getRouteLayer(method, path)[0].handle;
}
function getHandler(method, path) {
  const stack = getRouteLayer(method, path);
  return stack[stack.length - 1].handle;
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

// RFC 5737 TEST-NET-3 - reserved for documentation/examples, never a real
// routable address, so it's a safe "public-looking" fixture for exercising
// the code path past the SSRF guard without touching real infrastructure.
const PUBLIC_BASE_URL = "http://203.0.113.10:11434";

const handler = getHandler("post", "/ollama/models");
const middleware = getMiddleware("post", "/ollama/models");
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
  mockLookup.mockReset();
  mockLookup.mockRejectedValue(new Error("no mock DNS response configured"));
});

describe("POST /ollama/models - requireSuperAdmin gate", () => {
  it("rejects a readonly user with 403, never calls next", () => {
    const req = { user: { role: "readonly" } };
    const res = createRes();
    const next = mock();

    middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Admin access required." });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an editor user with 403", () => {
    const req = { user: { role: "editor" } };
    const res = createRes();
    const next = mock();

    middleware(req, res, next);

    expect(res.statusCode).toBe(403);
  });

  it("lets an admin user through", () => {
    const req = { user: { role: "admin" } };
    const res = createRes();
    const next = mock();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("lets a superadmin user through", () => {
    const req = { user: { role: "superadmin" } };
    const res = createRes();
    const next = mock();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
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
    const req = { body: { baseUrl: "ftp://203.0.113.10" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/http:\/\/ or https:\/\//);
  });
});

describe("POST /ollama/models - SSRF guard", () => {
  it("allows localhost (the normal way Ollama is run - same machine)", async () => {
    let requestedUrl = null;
    globalThis.fetch = mock(async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ models: [] }) };
    });

    const req = { body: { baseUrl: "http://localhost:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
    // Pinned to the literal loopback IP rather than the "localhost" hostname.
    expect(requestedUrl).toBe("http://127.0.0.1:11434/api/tags");
  });

  it("allows a literal 127.0.0.1 address", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ models: [] }),
    }));

    const req = { body: { baseUrl: "http://127.0.0.1:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
  });

  it("allows the IPv6 loopback address", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ models: [] }),
    }));

    const req = { body: { baseUrl: "http://[::1]:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
  });

  it("pins the fetch to the resolved IP for a hostname (DNS-rebinding protection)", async () => {
    mockLookup.mockResolvedValue([{ address: "203.0.113.20", family: 4 }]);
    let requestedUrl = null;
    let requestedHeaders = null;
    globalThis.fetch = mock(async (url, options) => {
      requestedUrl = url;
      requestedHeaders = options?.headers;
      return { ok: true, json: async () => ({ models: [] }) };
    });

    const req = { body: { baseUrl: "http://ollama.example.com:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // Connects to the validated IP directly, not the hostname...
    expect(requestedUrl).toBe("http://203.0.113.20:11434/api/tags");
    // ...but keeps the original hostname in the Host header.
    expect(requestedHeaders).toEqual({ Host: "ollama.example.com:11434" });
  });

  it("rejects a hostname that resolves to a private IP", async () => {
    mockLookup.mockResolvedValue([{ address: "192.168.1.50", family: 4 }]);

    const req = { body: { baseUrl: "http://internal.example.com:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
  });

  it("rejects a hostname if any resolved address is private (partial rebinding)", async () => {
    mockLookup.mockResolvedValue([
      { address: "203.0.113.20", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    const req = { body: { baseUrl: "http://mixed.example.com:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
  });

  it("rejects a private IPv4 LAN address (192.168.x.x)", async () => {
    const req = { body: { baseUrl: "http://192.168.1.5:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
  });

  it("rejects a private IPv4 address (10.x.x.x)", async () => {
    const req = { body: { baseUrl: "http://10.0.0.5:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
  });

  it("rejects a link-local IPv4 address (169.254.x.x)", async () => {
    const req = { body: { baseUrl: "http://169.254.169.254:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
  });

  it("allows a public-looking IP through to the fetch step", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ models: [] }),
    }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

describe("POST /ollama/models - server responses", () => {
  it("returns success:false (still HTTP 200) when the server is unreachable", async () => {
    globalThis.fetch = mock(() => {
      throw new Error("fetch failed");
    });

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Could not reach Ollama/);
  });

  it("returns success:false when Ollama responds with a non-2xx status", async () => {
    globalThis.fetch = mock(async () => ({ ok: false, status: 500 }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
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

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
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

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
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

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      models: ["qwen2.5-coder:7b", "phi4:latest"],
    });
    expect(requestedUrl).toBe(`${PUBLIC_BASE_URL}/api/tags`);
  });

  it("strips a trailing slash from the base URL before requesting /api/tags", async () => {
    let requestedUrl = null;
    globalThis.fetch = mock(async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ models: [] }) };
    });

    const req = { body: { baseUrl: `${PUBLIC_BASE_URL}/` } };
    const res = createRes();

    await handler(req, res);

    expect(requestedUrl).toBe(`${PUBLIC_BASE_URL}/api/tags`);
  });

  it("filters out models with an empty/missing name", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: "llama3.2" }, { name: "" }, {}],
      }),
    }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.body).toEqual({ success: true, models: ["llama3.2"] });
  });
});
