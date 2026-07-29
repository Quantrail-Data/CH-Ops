// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathirdhasan, Praveen kumar
// bodyLimits.test.js - guards the request body size limits in server.js

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const server = readFileSync(
  join(import.meta.dir, "../../src/backend/server.js"),
  "utf8",
);

const SQL_ROUTES = ["/api/query", "/api/export"];

describe("request body limits", () => {
  it("caps the SQL-carrying routes at 512kb", () => {
    for (const route of SQL_ROUTES) {
      const re = new RegExp(
        `app\\.use\\(['"]${route}['"],\\s*express\\.json\\(\\{\\s*limit:\\s*['"]512kb['"]`,
      );
      expect(server).toMatch(re);
    }
  });

  it("mounts the tight limits before the global parser", () => {
    const globalAt = server.indexOf("app.use(express.json({ limit: '2mb' }))");
    expect(globalAt).toBeGreaterThan(-1);

    for (const route of SQL_ROUTES) {
      const tightAt = server.indexOf(
        `app.use('${route}', express.json({ limit: '512kb' }))`,
      );
      expect(tightAt).toBeGreaterThan(-1);
      // Strictly before: a tighter limit mounted after the global one is dead.
      expect(tightAt).toBeLessThan(globalAt);
    }
  });

  it("no longer declares a dead route-level parser on /api/query", () => {
    // The old wiring put express.json after authMiddleware in the route chain,
    // where it could never run.
    expect(server).not.toMatch(
      /app\.use\('\/api\/query',\s*authMiddleware[^)]*express\.json/,
    );
  });

  it("still allows 2mb on everything else", () => {
    expect(server).toContain("app.use(express.json({ limit: '2mb' }));");
  });
});

describe("proxy trust", () => {
  it("is opt-in rather than defaulted on", () => {
    // Trusting X-Forwarded-For unconditionally would let any client spoof its
    // IP and bypass the rate limiter entirely - worse than the shared-bucket
    // problem it solves.
    expect(server).toContain("if (process.env.TRUST_PROXY)");
    expect(server).not.toMatch(/app\.set\(['"]trust proxy['"],\s*true\)/);
  });
});
