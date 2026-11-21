// Records the API answers for the visual check.
//
// Needs, all running:
//   1. The fake ClickHouse:  python3 tests/visual/fake-clickhouse/server.py --dataset normal
//   2. The CHOps backend:    bun src/backend/server.js   (with a test .env)
//   3. The Vite dev server:  bunx vite
//
// Run:
//   VISUAL_ADMIN_PASSWORD=... bun tests/visual/record.mjs normal          all pages
//   VISUAL_ADMIN_PASSWORD=... bun tests/visual/record.mjs normal home     one page, added to the saved answers
//
// The result is tests/visual/fixtures/<dataset>/api.json.
import { chromium } from "playwright";
import { PAGES } from "./pages.js";
import { loadFixtures, saveFixtures, startRecording } from "./lib/api-store.js";
import { BROWSER_OPTIONS, contextOptions, makeRequestCounter, openRoute, prepareContext, waitUntilQuiet } from "./lib/app.js";
import { clickEachTab } from "./lib/tabs.js";
import { setUpBackend } from "./lib/backend-setup.js";
import { FAKE_CLICKHOUSE_URL } from "./lib/settings.js";

const dataset = process.argv[2] || "normal";
const onlyPage = process.argv[3] || null;

async function readAnchorTime() {
  const response = await fetch(FAKE_CLICKHOUSE_URL, {
    method: "POST",
    body: "SELECT toUnixTimestamp(anchor) FROM seed.meta",
  });
  const seconds = Number((await response.text()).trim());
  if (!seconds) throw new Error("Could not read the anchor time from the fake ClickHouse.");
  return seconds * 1000;
}

async function main() {
  const setup = await setUpBackend(dataset);
  const { session, clusterId, nodeName } = setup;
  // One page: keep the clock of the saved answers, so the times in the other
  // pages' requests still match. All pages: use the anchor of the fake data.
  const saved = onlyPage ? loadFixtures(dataset) : { answers: {} };
  const fixedTime = saved.meta?.fixedTime || (await readAnchorTime());
  console.log(`Recording "${dataset}". Clock: ${new Date(fixedTime).toISOString()}. Cluster: ${clusterId}.`);

  const fixtures = {
    meta: {
      dataset,
      fixedTime,
      clusterId,
      nodeName,
      // The checker needs no real token, because no backend is involved.
      session: { ...session, token: "visual-check-token" },
      recordedAt: new Date().toISOString(),
    },
    answers: saved.answers,
  };

  const browser = await chromium.launch(BROWSER_OPTIONS);
  const context = await browser.newContext(contextOptions({ width: 1440, height: 900 }));
  // The theme does not change the API calls, so one theme is enough here.
  await prepareContext(context, { session, theme: "dark", clusterId, nodeName, fixedTime });
  const page = await context.newPage();
  const counter = makeRequestCounter(page);
  await startRecording(page, fixtures);

  const pages = onlyPage ? PAGES.filter((entry) => entry.name === onlyPage) : PAGES;
  for (const entry of pages) {
    const started = Date.now();
    process.stdout.write(`  ${entry.name} `);
    // A full page load, the same way the checker opens each page.
    await openRoute(page, entry.route);
    await page.reload();
    const loaded = Date.now();
    await waitUntilQuiet(page, counter);
    process.stdout.write(`[load ${Math.round((loaded - started) / 1000)} s, quiet ${Math.round((Date.now() - loaded) / 1000)} s] `);
    if (entry.tabs) {
      const tabCount = await clickEachTab(page, () => waitUntilQuiet(page, counter));
      process.stdout.write(`(${tabCount} tabs) `);
    }
    for (const step of entry.steps || []) {
      await step.action(page);
      await waitUntilQuiet(page, counter);
    }
    console.log(`done in ${Math.round((Date.now() - started) / 1000)} s`);
    // Each full load makes one connection test, and the backend allows only
    // 10 of them per minute. So each page takes at least 7 seconds.
    const waitMore = 7000 - (Date.now() - started);
    if (waitMore > 0) await page.waitForTimeout(waitMore);
  }

  await browser.close();
  saveFixtures(dataset, fixtures);
  const count = Object.keys(fixtures.answers).length;
  console.log(`Saved ${count} different API requests for "${dataset}".`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
