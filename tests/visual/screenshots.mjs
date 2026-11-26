// Takes the screenshots of the README and of the docs, and makes the tour GIF.
//
// It uses the recorded "normal" data set, like check.mjs. It needs only the
// Vite dev server (bunx vite) and ffmpeg. No backend, no ClickHouse.
//
// Run:
//   bunx vite                          (in a second terminal)
//   bun tests/visual/screenshots.mjs
//   bun tests/visual/screenshots.mjs login dashboard   (only these pages, no GIF)
//
// The result goes to .github/images/: one PNG for each page and theme, and
// tour-dark.gif and tour-light.gif. The pictures are not in docs/, because
// the binary and the Docker image include all of docs/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { loadFixtures, startReplay } from "./lib/api-store.js";
import { BROWSER_OPTIONS, contextOptions, makeRequestCounter, openRoute, prepareContext, waitUntilQuiet } from "./lib/app.js";
import { TAB_SELECTOR, VISUAL_DIR } from "./lib/settings.js";
import { SAMPLE_DASHBOARD, serveSampleDashboard } from "./sample-dashboard.js";

const IMAGES_DIR = path.resolve(VISUAL_DIR, "../../.github/images");
const WINDOW_SIZE = { width: 1440, height: 900 };
const THEMES = ["dark", "light"];
// Each frame of the tour GIF shows for this many seconds.
const SECONDS_PER_FRAME = 2.5;
// The width of the GIF. It is smaller than the screenshots, so the file stays small.
const GIF_WIDTH = 1200;

// The pages, in the order of the tour. "tour: false" pages are screenshots only.
// "loggedOut" opens the page with no session. "sampleDashboard" shows the
// sample dashboard of sample-dashboard.js. "height" makes a taller window.
// "action" runs after the page loads, for example to open a tab.
function clickTab(text) {
  return async (page) => page.locator(TAB_SELECTOR).filter({ hasText: text }).first().click();
}

function clickButton(text) {
  return async (page) => page.getByRole("button", { name: text, exact: false }).first().click();
}

const PAGES = [
  { name: "login", route: "home", loggedOut: true },
  { name: "home", route: "home" },
  { name: "cluster-overview", route: "overview/cluster" },
  { name: "daily-summary", route: "overview/summary" },
  { name: "queries", route: "overview/queries" },
  { name: "dashboard", route: `custom/dashboards?d=${SAMPLE_DASHBOARD.id}`, sampleDashboard: true },
  { name: "dashboard-full", route: `custom/dashboards?d=${SAMPLE_DASHBOARD.id}`, sampleDashboard: true, height: 1620, tour: false },
  { name: "tables-and-parts", route: "overview/parts" },
  { name: "merges-and-mutations", route: "overview/operations" },
  { name: "replication-queue", route: "overview/queues", action: clickTab("Replication") },
  { name: "processors-profile", route: "tools/pipeline" },
  { name: "memory-allocator", route: "monitoring/allocator" },
  { name: "qurioz", route: "tools/qurioz" },
  { name: "rbac-overview", route: "rbac/view", action: clickTab("Full Overview") },
  { name: "new-alert-rule", route: "alerting/rules", action: clickButton("New Rule") },
  { name: "user-management", route: "admin/users" },
];

async function takeScreenshot(browser, fixtures, entry, theme) {
  const meta = fixtures.meta;
  const size = { width: WINDOW_SIZE.width, height: entry.height || WINDOW_SIZE.height };
  const context = await browser.newContext(contextOptions(size));
  await prepareContext(context, {
    session: entry.loggedOut ? null : meta.session, theme, clusterId: meta.clusterId, nodeName: meta.nodeName, fixedTime: meta.fixedTime,
  });
  const page = await context.newPage();
  const counter = makeRequestCounter(page);
  await startReplay(page, fixtures, []);
  // Added after the replay, so it answers first.
  if (entry.sampleDashboard) await serveSampleDashboard(page);
  await openRoute(page, entry.route);
  await waitUntilQuiet(page, counter);
  if (entry.action) {
    await entry.action(page);
    await waitUntilQuiet(page, counter);
  }
  const file = path.join(IMAGES_DIR, `${entry.name}-${theme}.png`);
  const fullColorFile = path.join(os.tmpdir(), `chops-${entry.name}-${theme}.png`);
  await page.screenshot({ path: fullColorFile });
  await context.close();
  makeSmallPng(fullColorFile, file);
  fs.rmSync(fullColorFile, { force: true });
  return file;
}

// Saves the PNG with 256 colors. A screenshot of the app has few colors, so
// it looks the same, and the file is about three times smaller.
function makeSmallPng(sourceFile, targetFile) {
  const filter = "split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none";
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", sourceFile, "-vf", filter, targetFile]);
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
}

// Joins the screenshots into one GIF with ffmpeg. A palette made from all
// frames keeps the colors right and the file small.
function makeGif(files, gifPath) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-tour-"));
  const listFile = path.join(workDir, "frames.txt");
  const lines = files.flatMap((file) => [`file '${file}'`, `duration ${SECONDS_PER_FRAME}`]);
  // ffmpeg uses the duration of the last frame only when the file is named again.
  lines.push(`file '${files[files.length - 1]}'`);
  fs.writeFileSync(listFile, lines.join("\n"));
  const filter = `scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a`;
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", filter, "-loop", "0", gifPath]);
  fs.rmSync(workDir, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
}

const onlyPages = process.argv.slice(2);

async function main() {
  const fixtures = loadFixtures("normal");
  if (!fixtures.meta.fixedTime) throw new Error('No recorded data for "normal". Run record.mjs first.');
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const browser = await chromium.launch(BROWSER_OPTIONS);
  for (const theme of THEMES) {
    const tourFiles = [];
    const pages = onlyPages.length ? PAGES.filter((entry) => onlyPages.includes(entry.name)) : PAGES;
    for (const entry of pages) {
      process.stdout.write(`${theme} ${entry.name} `);
      const file = await takeScreenshot(browser, fixtures, entry, theme);
      if (entry.tour !== false) tourFiles.push(file);
      console.log("done");
    }
    if (!onlyPages.length) makeGif(tourFiles, path.join(IMAGES_DIR, `tour-${theme}.gif`));
  }
  await browser.close();
  console.log(`Done. Output: ${IMAGES_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
