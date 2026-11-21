// Memory and CPU gates. Run against a running app with the recorded data:
//   bun run build && bunx vite preview --port 7721
//   bun tests/visual/memory.mjs          (all gates)
//   bun tests/visual/memory.mjs pages    (gates 1, 2 and 3 only)
//   bun tests/visual/memory.mjs idle     (gate 4 only)
// It ends with exit code 1 when a gate fails.
//
// Gates:
//   1. Leak: visit a page twice to load its code and fill its caches (that
//      memory stays by design; the SQL Editor needs two visits), then 4 more
//      times, each time back to Home. Per visit, at most
//      MAX_NODES_PER_VISIT DOM nodes, MAX_LISTENERS_PER_VISIT listeners and
//      MAX_HEAP_KB_PER_VISIT KB of JS heap may stay.
//   2. Running work: on Home after visits to all pages, the animation frames
//      per second may be at most 2 times the fresh value (plus a small margin).
//   3. Page size: each page at most MAX_PAGE_HEAP_MB of JS heap and
//      MAX_PAGE_NODES DOM nodes.
//   4. Idle CPU on Home: at most 5% of one core with the background
//      animation on, and 3% with it off (Home polls its data every few seconds).
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { chromium } from "playwright";
import { loadFixtures, startReplay } from "./lib/api-store.js";
import { contextOptions, prepareContext, openRoute, makeRequestCounter, waitUntilQuiet } from "./lib/app.js";

const MAX_NODES_PER_VISIT = 20;
const MAX_LISTENERS_PER_VISIT = 2;
const MAX_HEAP_KB_PER_VISIT = 300;
const MAX_FRAME_FACTOR = 2;
const FRAME_MARGIN = 5;
const MAX_PAGE_HEAP_MB = 40;
const MAX_PAGE_NODES = 10000;
const MAX_IDLE_CPU_MOTION_ON = 0.05;
const MAX_IDLE_CPU_MOTION_OFF = 0.03;
const WARM_UP_VISITS = 2;
const VISITS_PER_PAGE = 4;
const IDLE_SECONDS = 20;

const PAGES = [
  "overview/cluster", "overview/summary", "overview/queries", "overview/parts", "overview/operations",
  "overview/queues", "editor/query", "tools/profiler", "tools/pipeline", "tools/metrics", "tools/qurioz",
  "logs/crash", "logs/error", "logs/text", "logs/session", "monitoring/dashboards", "monitoring/playback",
  "alerting/rules", "rbac/view/users", "rbac/users", "indexes/visualizer", "indexes/secondary",
  "indexes/projections", "custom/dashboards",
];

const onlyGroup = process.argv[2] || "all";
const fixtures = loadFixtures("stress");
const meta = fixtures.meta;
const browser = await chromium.launch({ args: ["--js-flags=--expose-gc"] });
const failures = [];

function check(isOk, message) {
  if (!isOk) failures.push(message);
  return isOk ? "ok" : "FAIL";
}

async function openApp(motion) {
  const context = await browser.newContext(contextOptions({ width: 1920, height: 1080 }));
  await prepareContext(context, { session: meta.session, theme: "dark", clusterId: meta.clusterId, nodeName: meta.nodeName });
  await context.addInitScript((value) => {
    localStorage.setItem("chops_background_motion", value);
    window.__frameRequests = 0;
    const originalRequest = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      window.__frameRequests += 1;
      return originalRequest(callback);
    };
  }, motion);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const counter = makeRequestCounter(page);
  await startReplay(page, fixtures, []);
  await openRoute(page, "home");
  await waitUntilQuiet(page, counter);
  await page.bringToFront();
  return { context, page, cdp, counter };
}

async function measure(page, cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(200);
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const byName = Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  return {
    heapKb: byName.JSHeapUsedSize / 1024,
    nodes: byName.Nodes,
    listeners: byName.JSEventListeners,
    cpuSeconds: byName.TaskDuration,
  };
}

async function framesPerSecond(page, seconds = 3) {
  const before = await page.evaluate(() => window.__frameRequests);
  await page.waitForTimeout(seconds * 1000);
  const after = await page.evaluate(() => window.__frameRequests);
  return (after - before) / seconds;
}

async function goTo(page, route) {
  await page.evaluate((target) => {
    location.hash = "#/" + target;
  }, route);
}

// Gates 1, 2 and 3.
if (onlyGroup === "all" || onlyGroup === "pages") {
  const { context, page, cdp } = await openApp("off");
  await page.waitForTimeout(4000);
  const freshFrames = await framesPerSecond(page);
  console.log("Gate 1 (leak per visit) and gate 3 (page size)");
  for (const route of PAGES) {
    // Warm-up visits: they load the page code (for example ECharts) and fill
    // its caches.
    for (let warmUp = 0; warmUp < WARM_UP_VISITS; warmUp++) {
      await goTo(page, route);
      await page.waitForTimeout(1500);
      await goTo(page, "home");
      await page.waitForTimeout(800);
    }
    const before = await measure(page, cdp);
    let pageSize = null;
    for (let visit = 0; visit < VISITS_PER_PAGE; visit++) {
      await goTo(page, route);
      await page.waitForTimeout(1500);
      if (visit === 0) pageSize = await measure(page, cdp);
      await goTo(page, "home");
      await page.waitForTimeout(800);
    }
    const after = await measure(page, cdp);
    const nodesPerVisit = (after.nodes - before.nodes) / VISITS_PER_PAGE;
    const listenersPerVisit = (after.listeners - before.listeners) / VISITS_PER_PAGE;
    const heapKbPerVisit = (after.heapKb - before.heapKb) / VISITS_PER_PAGE;
    const leakResult = check(
      nodesPerVisit <= MAX_NODES_PER_VISIT && listenersPerVisit <= MAX_LISTENERS_PER_VISIT && heapKbPerVisit <= MAX_HEAP_KB_PER_VISIT,
      `${route}: leak per visit ${nodesPerVisit} nodes, ${listenersPerVisit} listeners, ${Math.round(heapKbPerVisit)} KB`,
    );
    const sizeResult = check(
      pageSize.heapKb / 1024 <= MAX_PAGE_HEAP_MB && pageSize.nodes <= MAX_PAGE_NODES,
      `${route}: page size ${Math.round(pageSize.heapKb / 1024)} MB, ${pageSize.nodes} nodes`,
    );
    console.log(
      `  ${route.padEnd(24)} per visit: ${String(nodesPerVisit).padStart(5)} nodes ${String(listenersPerVisit).padStart(4)} listeners ` +
        `${String(Math.round(heapKbPerVisit)).padStart(5)} KB  ${leakResult}   page: ${(pageSize.heapKb / 1024).toFixed(1)} MB ${pageSize.nodes} nodes  ${sizeResult}`,
    );
  }
  await goTo(page, "home");
  await page.waitForTimeout(4000);
  const framesAfter = await framesPerSecond(page);
  const frameLimit = freshFrames * MAX_FRAME_FACTOR + FRAME_MARGIN;
  const frameResult = check(framesAfter <= frameLimit, `Home frames per second after all pages: ${framesAfter} (limit ${frameLimit})`);
  console.log(`Gate 2 (running work): Home frames per second fresh ${freshFrames}, after all pages ${framesAfter}  ${frameResult}`);
  await context.close();
}

// Gate 4.
if (onlyGroup === "all" || onlyGroup === "idle") console.log("Gate 4 (idle CPU on Home)");
const idleRuns = onlyGroup === "all" || onlyGroup === "idle" ? [["on", MAX_IDLE_CPU_MOTION_ON], ["off", MAX_IDLE_CPU_MOTION_OFF]] : [];
for (const [motion, limit] of idleRuns) {
  const { context, page, cdp } = await openApp(motion);
  await page.waitForTimeout(4000);
  const before = await measure(page, cdp);
  await page.waitForTimeout(IDLE_SECONDS * 1000);
  const after = await measure(page, cdp);
  const cpuShare = (after.cpuSeconds - before.cpuSeconds) / IDLE_SECONDS;
  const result = check(cpuShare <= limit, `Idle CPU with background animation ${motion}: ${(cpuShare * 100).toFixed(1)}%`);
  console.log(`  background animation ${motion.padEnd(3)}: ${(cpuShare * 100).toFixed(1)}% of one core (limit ${limit * 100}%)  ${result}`);
  await context.close();
}

await browser.close();
if (failures.length > 0) {
  console.log(`\n${failures.length} gate(s) failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log("\nAll memory gates passed.");
