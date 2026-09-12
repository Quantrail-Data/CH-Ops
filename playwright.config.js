// Playwright config - targeted end-to-end smoke suite.
//
// This is a regression baseline for the UI framework work (see
// docs/development/ui-framework.md), not a full app crawl: login, a handful
// of pages that use raw .btn/.card/.badge/.tab-bar markup, and the
// ConfirmModal call sites, since ConfirmModal is the one existing component
// being refactored onto the new ui/ primitives.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "fs";

// Loaded from tests/e2e/.env.e2e (written by `bun run gen:e2e-env`, which
// `test:e2e` runs first) - a throwaway random super-admin login generated
// fresh per run, so this suite never depends on the developer's real .env
// and needs no secrets in CI.
const envFile = "tests/e2e/.env.e2e";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1]] = match[2];
  }
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  // Specs share one backend/database (users, roles, dashboards, alert rules),
  // so different spec files running concurrently can race on the same rows -
  // one file's "first row" assertions flake when another file inserts or
  // deletes a row mid-test. Single worker trades speed for determinism here.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // HTML + JSON only in CI: html is uploaded as a workflow artifact for
  // inspecting a failure's trace/screenshots after the fact, and json feeds
  // scripts/e2e-report-summary.mjs to post a pass/fail table into the job
  // summary. Local runs keep the `list` reporter alone so a run doesn't also
  // pop open a browser tab or leave a results.json lying around.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "playwright-report/results.json" }]]
    : [["list"]],
  timeout: 30000,

  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },

  webServer: [
    {
      command: "bun run dev:backend",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "bun run dev:frontend",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],

  projects: [
    { name: "setup", testMatch: /auth\.setup\.js/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
