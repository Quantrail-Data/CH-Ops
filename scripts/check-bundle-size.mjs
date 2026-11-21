// check-bundle-size.mjs - Fails when the main JS file of the build is too big,
// or when the build is a development build.
// Run after a production build:
//   NODE_ENV=production bun run build && bun run check:bundle
// ("bun run" loads .env. If .env has NODE_ENV=development, a plain
// "bun run build" makes a development build of React: bigger and slower.)
//
// The main file loads on every page. Large parts (ECharts, the SQL editor,
// the Login page) must load on demand in their own files.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The main file of a production build is about 272 KB now. The limit leaves
// room for normal growth, but not for a big library in the main file.
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
  // React's development code has jsxDEV. A development build does not show
  // the real size or speed.
  if (readFileSync(join(ASSETS_DIR, name), "utf8").includes("jsxDEV")) {
    console.error(`${name}: this is a development build. Build again with NODE_ENV=production.`);
    hasFailed = true;
    continue;
  }
  const isTooBig = sizeKb > MAX_MAIN_FILE_KB;
  if (isTooBig) hasFailed = true;
  console.log(`${name}: ${sizeKb} KB (limit ${MAX_MAIN_FILE_KB} KB) ${isTooBig ? "TOO BIG" : "ok"}`);
}
process.exit(hasFailed ? 1 : 0);
