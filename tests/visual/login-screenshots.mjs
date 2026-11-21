// Makes the Login page carousel screenshots from the recorded "normal" data.
// Run against a running app:
//   bun run build && bunx vite preview --port 7721
//   bun tests/visual/login-screenshots.mjs
// It writes src/frontend/assets/login-dark-01.webp to login-dark-10.webp and
// login-light-01.webp to login-light-10.webp (1920 x 993).
// For better pictures, take the screenshots from a real cluster with the same
// size and file names.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadFixtures, startReplay } from "./lib/api-store.js";
import { contextOptions, prepareContext, openRoute, makeRequestCounter, waitUntilQuiet } from "./lib/app.js";

const ASSETS_FOLDER = "src/frontend/assets";
const WEBP_QUALITY = 86;

function clickButton(text) {
  return async (page) => page.getByRole("button", { name: text, exact: false }).first().click();
}
const noAction = async () => {};

// The pages in the order of the carousel.
const SCREENS = [
  ["home", noAction],
  ["overview/cluster", noAction],
  ["overview/queries", noAction],
  ["monitoring/dashboards", clickButton("Load Charts")],
  ["overview/parts", noAction],
  ["overview/operations", noAction],
  ["monitoring/allocator", noAction],
  ["overview/ddl", noAction],
  ["rbac/view/overview", noAction],
  ["tools/qurioz", noAction],
];

const fixtures = loadFixtures("normal");
const meta = fixtures.meta;
const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), "login-screenshots-"));
const browser = await chromium.launch();

for (const theme of ["dark", "light"]) {
  const context = await browser.newContext({ ...contextOptions({ width: 1920, height: 993 }), deviceScaleFactor: 1 });
  await prepareContext(context, { session: meta.session, theme, clusterId: meta.clusterId, nodeName: meta.nodeName });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const counter = makeRequestCounter(page);
  await startReplay(page, fixtures, []);
  for (const [index, [route, action]] of SCREENS.entries()) {
    const name = `login-${theme}-${String(index + 1).padStart(2, "0")}`;
    await openRoute(page, route);
    await waitUntilQuiet(page, counter).catch(() => {});
    // The visual check hides changing text such as times. Show it again.
    await page.evaluate(() => document.querySelectorAll("style[data-visual-check]").forEach((style) => style.remove()));
    await page.waitForTimeout(1000);
    await action(page);
    await waitUntilQuiet(page, counter).catch(() => {});
    await page.mouse.move(1900, 980);
    await page.waitForTimeout(3000);
    const pngFile = path.join(tempFolder, `${name}.png`);
    await page.screenshot({ path: pngFile });
    // Pillow makes the WebP file (python3 -m pip install pillow).
    execFileSync("python3", [
      "-c",
      "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'WEBP', quality=int(sys.argv[3]), method=6)",
      pngFile,
      path.join(ASSETS_FOLDER, `${name}.webp`),
      String(WEBP_QUALITY),
    ]);
    console.log(`  ${name}.webp  ${route}`);
  }
  await context.close();
}

await browser.close();
fs.rmSync(tempFolder, { recursive: true, force: true });
