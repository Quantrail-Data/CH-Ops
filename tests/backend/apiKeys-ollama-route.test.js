// apiKeys-ollama-route.test.js - unit tests for POST /ollama/models
// Contributors - Kathirdhasan, Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

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
  // clusterUtils imports these, so a suite loading the real module after this
  // one needs them present.
  clusters: {},
  clusterNodes: {},
  k8sConnections: {},
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

// requireAdmin runs first in the chain; the route's own logic is the
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

describe("POST /ollama/models - requireAdmin gate", () => {
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
    expect(requestedUrl.href).toBe("http://127.0.0.1:11434/api/tags");
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
    expect(requestedUrl.href).toBe("http://203.0.113.20:11434/api/tags");
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

  it("rejects private, link-local, and multicast IPv6 addresses", async () => {
    for (const host of ["fc00::1", "fe80::1", "ff02::1"]) {
      const req = { body: { baseUrl: `http://[${host}]:11434` } };
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    }
  });

  it("rejects a hostname when DNS resolution fails", async () => {
    mockLookup.mockRejectedValueOnce(new Error("DNS unavailable"));
    const req = { body: { baseUrl: "http://unresolved.example.test:11434" } };
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
    expect(requestedUrl.href).toBe(`${PUBLIC_BASE_URL}/api/tags`);
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

    expect(requestedUrl.href).toBe(`${PUBLIC_BASE_URL}/api/tags`);
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

  it("rejects a base URL with a path", async () => {
    const req = { body: { baseUrl: `${PUBLIC_BASE_URL}/path` } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/must not contain a path/);
  });

  it("rejects a base URL with query parameters", async () => {
    const req = { body: { baseUrl: `${PUBLIC_BASE_URL}?key=value` } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/must not contain query parameters/);
  });

  it("rejects a base URL with a fragment", async () => {
    const req = { body: { baseUrl: `${PUBLIC_BASE_URL}#section` } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/must not contain a fragment/);
  });

  it("respects a 5 second timeout when fetching models", async () => {
    const fetchMock = mock(async (url, options) => {
      // Verify timeout is set
      expect(options.signal).toBeDefined();
      return { ok: true, json: async () => ({ models: [] }) };
    });
    globalThis.fetch = fetchMock;

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns success:false when fetch throws (network error, timeout, etc.)", async () => {
    globalThis.fetch = mock(() => {
      throw new Error("Network error");
    });

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Could not reach Ollama/);
  });

  it("handles JSON parsing errors gracefully", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Invalid JSON");
      },
    }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
  });

  it("returns empty models when models field is not an array", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ models: "not-an-array" }),
    }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.body).toEqual({ success: true, models: [] });
  });

  it("handles multiple models correctly with various data types", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        models: [
          { name: "model1" },
          { name: "model2", size: 5000 },
          { name: "model3", modified_at: "2024-01-01" },
        ],
      }),
    }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      models: ["model1", "model2", "model3"],
    });
  });

  it("connects to IPv6 loopback with correct URL format", async () => {
    let requestedUrl = null;
    globalThis.fetch = mock(async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ models: [] }) };
    });

    const req = { body: { baseUrl: "http://[::1]:11434" } };
    const res = createRes();

    await handler(req, res);

    // IPv6 should be bracketed in the URL
    expect(requestedUrl.href).toMatch(/\[::1\]/);
    expect(res.statusCode).toBe(200);
  });

  it("returns HTTP 500 error response from Ollama", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 500,
    }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("HTTP 500");
  });

  it("returns HTTP 404 error response from Ollama", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 404,
    }));

    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("HTTP 404");
  });

  it("catches and logs unexpected errors", async () => {
    // Create a scenario that would throw an error during processing
    const req = { body: { baseUrl: PUBLIC_BASE_URL } };
    const res = createRes();

    // Mock fetch to return a response that will fail during processing
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => {
        throw new Error("Unexpected parse error");
      },
    }));

    await handler(req, res);

    // Should return empty models on unexpected error
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, models: [] });
  });

  it("rejects hostname resolving to 172.16.0.0/12 private range", async () => {
    mockLookup.mockResolvedValue([{ address: "172.16.1.1", family: 4 }]);

    const req = { body: { baseUrl: "http://private.example.com:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
  });

  it("rejects hostname resolving to multicast address", async () => {
    mockLookup.mockResolvedValue([{ address: "224.0.0.1", family: 4 }]);

    const req = { body: { baseUrl: "http://multicast.example.com:11434" } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
  });
});
