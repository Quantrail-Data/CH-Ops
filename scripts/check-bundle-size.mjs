// check-bundle-size.mjs - Fails when the main JS file of the build is too big.
// Run after "bun run build":  bun run check:bundle
//
// The main file loads on every page. Large parts (ECharts, the SQL editor,
// the Login page) must load on demand in their own files.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The main file is about 472 KB now (139 KB compressed). The limit leaves room
// for normal growth, but not for a big library in the main file.
const MAX_MAIN_FILE_KB = 600;
const ASSETS_DIR = "dist/assets";

const mainFiles = readdirSync(ASSETS_DIR).filter((name) => /^index-.*\.js$/.test(name));
if (mainFiles.length === 0) {
  console.error(`No main JS file in ${ASSETS_DIR}. Run "bun run build" first.`);
  process.exit(1);
}
let hasFailed = false;
for (const name of mainFiles) {
  const sizeKb = Math.round(statSync(join(ASSETS_DIR, name)).size / 1024);
  const isTooBig = sizeKb > MAX_MAIN_FILE_KB;
  if (isTooBig) hasFailed = true;
  console.log(`${name}: ${sizeKb} KB (limit ${MAX_MAIN_FILE_KB} KB) ${isTooBig ? "TOO BIG" : "ok"}`);
}
process.exit(hasFailed ? 1 : 0);
