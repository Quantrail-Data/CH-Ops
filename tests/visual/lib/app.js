// Opens CHOps pages in the same way for the recorder and the checker.
import fs from "node:fs";
import { PNG } from "pngjs";
import { APP_URL, LOCALE, MASK_SELECTORS, QUIET_MS, PAGE_TIMEOUT_MS } from "./settings.js";

// Stops CSS animations and transitions, so two runs give the same picture.
// ECharts animations are not changed: the check waits until they end.
// The footer shows the git commit, which changes with every commit. It is hidden
// but keeps its space, so the layout does not change.
const HIDE_CHANGING_TEXT_CSS = `
.app-version-badge { visibility: hidden !important; }`;

const NO_ANIMATION_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}`;

// Requests open longer than this are treated as stuck. A reload can cancel a
// request without a "finished" or "failed" event, so it would stay open forever.
const STUCK_REQUEST_MS = 5000;

// Keeps track of open API calls, to know when a page is quiet.
export function makeRequestCounter(page) {
  const counter = { openRequests: new Map(), lastChange: Date.now() };
  page.on("request", (request) => {
    if (request.url().includes("/api/")) {
      counter.openRequests.set(request, Date.now());
      counter.lastChange = Date.now();
    }
  });
  const done = (request) => {
    if (counter.openRequests.delete(request)) counter.lastChange = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return counter;
}

function countActiveRequests(counter) {
  const now = Date.now();
  let active = 0;
  for (const startedAt of counter.openRequests.values()) {
    if (now - startedAt < STUCK_REQUEST_MS) active += 1;
  }
  return active;
}

// Waits until no API call was open for QUIET_MS, then lets charts finish.
// A page that polls very often is never quiet, so the wait stops after
// PAGE_TIMEOUT_MS.
export async function waitUntilQuiet(page, counter) {
  const started = Date.now();
  while (Date.now() - started < PAGE_TIMEOUT_MS) {
    const quietFor = Date.now() - counter.lastChange;
    if (countActiveRequests(counter) === 0 && quietFor >= QUIET_MS) break;
    await page.waitForTimeout(200);
  }
  if (process.env.VISUAL_DEBUG && countActiveRequests(counter) > 0) {
    console.log(`\n  still open: ${[...counter.openRequests.keys()].map((request) => request.url()).join(", ")}`);
  }
  // Load every font face of the page, not only the fonts that are already
  // loading. Otherwise some text can show in the fallback font in one run.
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => null)));
    await document.fonts.ready;
  });
  // ECharts animations take up to one second.
  await page.waitForTimeout(1200);
}

// Chromium options that make text and colors look the same in every run.
export const BROWSER_OPTIONS = {
  args: [
    "--font-render-hinting=none",
    "--disable-font-subpixel-positioning",
    "--disable-lcd-text",
    "--force-color-profile=srgb",
    "--disable-gpu",
  ],
};

// Options for each new browser context. The same time zone and language on
// every machine, so times and numbers look the same.
export function contextOptions(size) {
  return { viewport: size, timezoneId: "UTC", locale: LOCALE };
}

// Prepares a new browser context: session, theme, cluster and a fixed clock.
export async function prepareContext(context, { session, theme, clusterId, nodeName, fixedTime }) {
  await context.addInitScript(
    ({ session, theme, clusterId, nodeName }) => {
      localStorage.setItem("chops_session", JSON.stringify(session));
      localStorage.setItem("chops_theme", theme);
      // The particle background moves all the time, so the pictures would never match.
      localStorage.setItem("chops_background_motion", "off");
      if (clusterId) localStorage.setItem("chops_cluster", clusterId);
      if (nodeName) localStorage.setItem("chops_nodename", nodeName);
    },
    { session, theme, clusterId, nodeName },
  );
  await context.addInitScript((css) => {
    const addStyle = () => {
      const style = document.createElement("style");
      style.setAttribute("data-visual-check", "");
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) addStyle();
    else document.addEventListener("DOMContentLoaded", addStyle);
  }, NO_ANIMATION_CSS + HIDE_CHANGING_TEXT_CSS);
  if (fixedTime) await context.clock.setFixedTime(new Date(fixedTime));
}

export async function openRoute(page, route) {
  await page.goto(`${APP_URL}/#/${route}`);
}

// The app scrolls inside its main panel, not the page. To show the whole
// panel in one picture, the panel is scrolled one screen at a time and the
// pieces are joined. The window size does not change: a resize changes the
// layout, and in CHOps it also makes the bug report button throw an error.
// Takes pictures until two in a row are the same. A part of the page that is
// drawn again at that moment (for example after a poll) cannot spoil the picture.
async function stableScreenshot(page, extraOptions = {}) {
  const options = { ...extraOptions, mask: MASK_SELECTORS.map((selector) => page.locator(selector)), maskColor: "#ff00ff" };
  let previous = await page.screenshot(options);
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.waitForTimeout(400);
    const current = await page.screenshot(options);
    if (current.equals(previous)) return current;
    previous = current;
  }
  return previous;
}

export async function screenshotWholePage(page, file) {
  const firstScreen = PNG.sync.read(await stableScreenshot(page));
  const panel = await page.evaluate(() => {
    const main = document.querySelector("main.app-main");
    if (!main) return null;
    const box = main.getBoundingClientRect();
    return {
      left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width),
      visibleHeight: main.clientHeight, fullHeight: main.scrollHeight,
    };
  });
  if (!panel || panel.fullHeight <= panel.visibleHeight) {
    fs.writeFileSync(file, PNG.sync.write(firstScreen));
    return;
  }

  // Floating buttons (position: fixed) would show in every piece. They are in
  // the first screen, so they are hidden for the other pieces.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll("body *")) {
      if (getComputedStyle(element).position === "fixed") {
        element.setAttribute("data-visual-hidden", element.style.visibility || "");
        element.style.visibility = "hidden";
      }
    }
  });

  const hiddenHeight = panel.fullHeight - panel.visibleHeight;
  const picture = new PNG({ width: firstScreen.width, height: firstScreen.height + hiddenHeight });
  PNG.bitblt(firstScreen, picture, 0, 0, firstScreen.width, firstScreen.height, 0, 0);

  // Each step shows the next part of the panel. The last step may scroll less,
  // so only its new rows are copied.
  let shownUpTo = panel.visibleHeight;
  while (shownUpTo < panel.fullHeight) {
    const scrollTop = await page.evaluate((target) => {
      const main = document.querySelector("main.app-main");
      main.scrollTop = target;
      return main.scrollTop;
    }, shownUpTo);
    await page.waitForTimeout(300);
    const piece = PNG.sync.read(await stableScreenshot(page, {
      clip: { x: panel.left, y: panel.top, width: panel.width, height: panel.visibleHeight },
    }));
    const newRows = scrollTop + panel.visibleHeight - shownUpTo;
    const firstNewRow = panel.visibleHeight - newRows;
    PNG.bitblt(piece, picture, 0, firstNewRow, panel.width, newRows, panel.left, panel.top + shownUpTo);
    shownUpTo += newRows;
    if (newRows <= 0) break;
  }
  await page.evaluate(() => {
    document.querySelector("main.app-main").scrollTop = 0;
    for (const element of document.querySelectorAll("[data-visual-hidden]")) {
      element.style.visibility = element.getAttribute("data-visual-hidden");
      element.removeAttribute("data-visual-hidden");
    }
  });
  fs.writeFileSync(file, PNG.sync.write(picture));
}
