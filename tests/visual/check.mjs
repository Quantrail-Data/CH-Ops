// Opens every page with recorded API data and saves what it sees.
//
// Needs only the Vite dev server (bunx vite). No backend, no ClickHouse.
//
// Run:
//   bun tests/visual/check.mjs                 all data sets
//   bun tests/visual/check.mjs normal          one data set
//   bun tests/visual/check.mjs normal home     one page
//
// The result goes to tests/visual/output/. Then run compare.mjs.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { PAGES } from "./pages.js";
import { loadFixtures, startReplay } from "./lib/api-store.js";
import { BROWSER_OPTIONS, contextOptions, makeRequestCounter, openRoute, prepareContext, screenshotWholePage, waitUntilQuiet } from "./lib/app.js";
import { readCharts } from "./lib/charts.js";
import { scanLayout } from "./lib/layout.js";
import { clickEachTab } from "./lib/tabs.js";
import { readKeyStyles } from "./lib/styles.js";
import { DATASETS, OUTPUT_DIR, THEMES, WINDOW_SIZES } from "./lib/settings.js";

const require = createRequire(import.meta.url);
const AXE_SCRIPT = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const datasets = process.argv[2] && process.argv[2] !== "all" ? [process.argv[2]] : DATASETS;
const onlyPage = process.argv[3] || null;

function safeName(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function runAxe(page) {
  await page.addScriptTag({ content: AXE_SCRIPT });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    // The first few elements of each problem, with axe's message, so a new problem can be found.
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      count: violation.nodes.length,
      examples: violation.nodes.slice(0, 5).map((node) => `${node.target.join(" ")} | ${node.any[0]?.message || ""}`),
    }));
  });
}

// Saves one state of one page: picture, charts, layout, styles and accessibility.
async function captureState(page, folder, stateName, withAxe) {
  fs.mkdirSync(folder, { recursive: true });
  // Read everything at the normal window size first. The screenshot makes the
  // window taller for a moment.
  const result = {
    charts: await readCharts(page),
    layout: await scanLayout(page),
    styles: await readKeyStyles(page),
  };
  if (withAxe) result.accessibility = await runAxe(page);
  await screenshotWholePage(page, path.join(folder, `${stateName}.png`));
  fs.writeFileSync(path.join(folder, `${stateName}.json`), JSON.stringify(result, null, 1));
  return result;
}

async function checkPage(browser, fixtures, entry, theme, size, folder, withAxe) {
  const meta = fixtures.meta;
  const context = await browser.newContext(contextOptions(size));
  await prepareContext(context, {
    session: meta.session, theme, clusterId: meta.clusterId, nodeName: meta.nodeName, fixedTime: meta.fixedTime,
  });
  const page = await context.newPage();
  const counter = makeRequestCounter(page);
  const missing = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 300)));
  await startReplay(page, fixtures, missing);

  await openRoute(page, entry.route);
  await waitUntilQuiet(page, counter);
  const states = [{ name: entry.name, result: await captureState(page, folder, entry.name, withAxe) }];

  if (entry.tabs) {
    await clickEachTab(page, () => waitUntilQuiet(page, counter), async (label, index) => {
      const stateName = `${entry.name}__${index}-${safeName(label)}`;
      states.push({ name: stateName, result: await captureState(page, folder, stateName, withAxe) });
    });
  }
  for (const step of entry.steps || []) {
    await step.action(page);
    await waitUntilQuiet(page, counter);
    const stateName = `${entry.name}__${safeName(step.name)}`;
    states.push({ name: stateName, result: await captureState(page, folder, stateName, withAxe) });
  }
  await context.close();
  return { states, missing: [...new Set(missing)], pageErrors };
}

async function main() {
  const browser = await chromium.launch(BROWSER_OPTIONS);
  const summary = {};
  for (const dataset of datasets) {
    const fixtures = loadFixtures(dataset);
    if (!fixtures.meta.fixedTime) {
      console.log(`No recorded data for "${dataset}". Run record.mjs first.`);
      continue;
    }
    const pages = onlyPage ? PAGES.filter((entry) => entry.name === onlyPage) : PAGES;
    for (const size of WINDOW_SIZES[dataset]) {
      for (const theme of THEMES) {
        const runName = `${dataset}/${size.width}/${theme}`;
        const folder = path.join(OUTPUT_DIR, dataset, String(size.width), theme);
        // The accessibility scan is the same at each size, so it runs once.
        const withAxe = size.width === 1440;
        for (const entry of pages) {
          process.stdout.write(`${runName} ${entry.name} `);
          const result = await checkPage(browser, fixtures, entry, theme, size, folder, withAxe);
          summary[`${runName}/${entry.name}`] = { missing: result.missing, pageErrors: result.pageErrors };
          console.log(`${result.states.length} states${result.missing.length ? `, ${result.missing.length} not recorded` : ""}`);
        }
      }
    }
  }
  await browser.close();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "run.json"), JSON.stringify(summary, null, 1));
  console.log(`Done. Output: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
