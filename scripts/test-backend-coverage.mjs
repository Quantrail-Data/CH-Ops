#!/usr/bin/env bun
// test-backend-coverage.mjs - Runs the backend tests with Bun coverage.
// It runs the same tests as "bun run test:backend", in the same processes:
// each file of tests/backend alone, and each other folder as one run.
// Each run writes its own lcov.info under coverage/backend/parts/.
// scripts/coverage-report.mjs merges these files.
// Usage: bun scripts/test-backend-coverage.mjs
// Copyright (C) 2026 Quantrail Data Private Limited

import fs from "node:fs";
import path from "node:path";

const PARTS_DIR = "coverage/backend/parts";
const FOLDERS_RUN_TOGETHER = [
  "tests/isolated",
  "tests/no-mocks",
  "tests/db",
  "tests/net",
  "tests/security",
];

const backendFiles = fs
  .readdirSync("tests/backend")
  .filter((name) => name.endsWith(".test.js") || name.endsWith(".test.jsx"))
  .sort()
  .map((name) => path.join("tests/backend", name));

const runs = [...backendFiles, ...FOLDERS_RUN_TOGETHER];

fs.rmSync(PARTS_DIR, { recursive: true, force: true });

const failedRuns = [];
runs.forEach((target, index) => {
  const partDir = path.join(PARTS_DIR, String(index));
  const run = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "--coverage",
      "--coverage-reporter=lcov",
      `--coverage-dir=${partDir}`,
      target,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (run.exitCode !== 0) failedRuns.push(target);
});

console.log(
  `\n${runs.length} test runs with coverage. ${failedRuns.length} failed. Reports are in ${PARTS_DIR}.`,
);
for (const target of failedRuns) console.log(`FAILED: ${target}`);
process.exit(failedRuns.length === 0 ? 0 : 1);
