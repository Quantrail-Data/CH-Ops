#!/usr/bin/env bun
// test-each-file.mjs - Runs each test file in its own bun process.
// A mock.module call in one file then cannot leak into another file and hide a failure.
// Usage: bun scripts/test-each-file.mjs tests/backend
// Copyright (C) 2026 Quantrail Data Private Limited

import fs from "node:fs";
import path from "node:path";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: bun scripts/test-each-file.mjs <folder>");
  process.exit(2);
}

const files = fs
  .readdirSync(folder)
  .filter((name) => name.endsWith(".test.js") || name.endsWith(".test.jsx"))
  .sort();

const failedFiles = [];
for (const name of files) {
  const file = path.join(folder, name);
  const run = Bun.spawnSync([process.execPath, "test", file], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (run.exitCode !== 0) failedFiles.push(file);
}

console.log(
  `\n${files.length} test files run, each in its own process. ${failedFiles.length} failed.`,
);
for (const file of failedFiles) console.log(`FAILED: ${file}`);
process.exit(failedFiles.length === 0 ? 0 : 1);