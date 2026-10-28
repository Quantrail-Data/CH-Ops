// aiKeyCheck.test.js - The server decides if an AI API key exists, not the browser.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "./harness.js";

let app;

beforeAll(async () => {
  app = await startServer();
}, 30000);

afterAll(async () => {
  await app?.stop();
});

describe("AI SQL generation", () => {
  it("refuses when no API key exists, also when the request says one exists", async () => {
    const result = await app.api("editor", "POST", "/api/ai/editor/generate", {
      isApiConfigured: true,
      instruction: "count the rows",
      tables: [{ database: "default", table: "events" }],
    });
    expect(result.status).toBe(422);
    expect(result.json.error).toBe("No Api key configured yet");
  });
});
