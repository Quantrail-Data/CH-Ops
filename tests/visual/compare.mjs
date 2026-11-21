// Compares the last check (tests/visual/output) with the baseline
// (tests/visual/baseline) and writes tests/visual/output/report.html.
//
// Run:
//   bun tests/visual/compare.mjs              review mode: lists every difference
//   bun tests/visual/compare.mjs --strict     fails on any pixel or style difference
//   bun tests/visual/compare.mjs --update     makes the last check the new baseline
//
// Charts always use the strict rule: their size, position and options must not
// change. Only colors and font names may differ.
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { withoutColors } from "./lib/charts.js";
import { BASELINE_DIR, OUTPUT_DIR } from "./lib/settings.js";

const strict = process.argv.includes("--strict");

// Canvas charts and small text get a few different pixels from anti-aliasing,
// even with the same code (up to about 130 in our tests). A real 1 pixel layout
// shift gives thousands. Smaller differences are listed, but strict mode does
// not fail on them.
const NOISE_PIXELS = 200;
const update = process.argv.includes("--update");

function listFiles(folder, ending) {
  if (!fs.existsSync(folder)) return [];
  const found = [];
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, item.name);
    if (item.isDirectory()) found.push(...listFiles(full, ending));
    else if (item.name.endsWith(ending)) found.push(full);
  }
  return found;
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

// Returns the number of different pixels, and writes a picture of them.
function comparePictures(oldFile, newFile, diffFile) {
  const oldPicture = readPng(oldFile);
  const newPicture = readPng(newFile);
  if (oldPicture.width !== newPicture.width || oldPicture.height !== newPicture.height) {
    return { pixels: -1, note: `size changed from ${oldPicture.width}x${oldPicture.height} to ${newPicture.width}x${newPicture.height}` };
  }
  // A plain object, not new PNG(): each PNG object stays in memory, and a full
  // normal and stress run then needs more than 5 GB.
  const diff = { width: oldPicture.width, height: oldPicture.height, data: Buffer.alloc(oldPicture.width * oldPicture.height * 4) };
  const pixels = pixelmatch(oldPicture.data, newPicture.data, diff.data, oldPicture.width, oldPicture.height, { threshold: 0.1 });
  if (pixels > 0) {
    fs.mkdirSync(path.dirname(diffFile), { recursive: true });
    fs.writeFileSync(diffFile, PNG.sync.write(diff));
  }
  return { pixels };
}

// Chart differences other than color and font name. Each one is a defect.
// A chart option lists an empty array for each ECharts part that is loaded
// but not used (for example "brush: []"). Since package 6 the app loads only
// the parts it uses, so these empty lists are gone. They draw nothing.
function withoutEmptyParts(option) {
  if (!option || typeof option !== "object") return option;
  return Object.fromEntries(Object.entries(option).filter(([, value]) => !(Array.isArray(value) && value.length === 0)));
}

function compareCharts(oldCharts, newCharts) {
  const problems = [];
  const oldByPath = Object.fromEntries((oldCharts?.charts || []).map((chart) => [chart.path, chart]));
  const newByPath = Object.fromEntries((newCharts?.charts || []).map((chart) => [chart.path, chart]));
  for (const [chartPath, oldChart] of Object.entries(oldByPath)) {
    const newChart = newByPath[chartPath];
    if (!newChart) {
      problems.push(`chart missing: ${chartPath}`);
      continue;
    }
    for (const key of ["width", "height", "x", "y"]) {
      if (Math.abs(oldChart.box[key] - newChart.box[key]) > 0.5) {
        problems.push(`chart ${key} changed from ${oldChart.box[key]} to ${newChart.box[key]}: ${chartPath}`);
      }
    }
    if (JSON.stringify(oldChart.canvases) !== JSON.stringify(newChart.canvases)) {
      problems.push(`canvas size changed: ${chartPath}`);
    }
    if (JSON.stringify(oldChart.legendBox) !== JSON.stringify(newChart.legendBox)) {
      problems.push(`legend size or position changed: ${chartPath}`);
    }
    if (JSON.stringify(withoutEmptyParts(withoutColors(oldChart.option))) !== JSON.stringify(withoutEmptyParts(withoutColors(newChart.option)))) {
      problems.push(`chart options changed (not only colors or fonts): ${chartPath}`);
    }
  }
  for (const chartPath of Object.keys(newByPath)) {
    if (!oldByPath[chartPath]) problems.push(`new chart: ${chartPath}`);
  }
  return problems;
}

function compareStyles(oldStyles = {}, newStyles = {}) {
  const changes = [];
  for (const [element, properties] of Object.entries(oldStyles)) {
    for (const [property, value] of Object.entries(properties)) {
      const newValue = newStyles[element]?.[property];
      if (newValue !== value) changes.push(`${element} ${property}: ${value} -> ${newValue}`);
    }
  }
  return changes;
}

// Problems in the new run that the baseline did not have.
function newOnly(oldList = [], newList = [], toText) {
  const known = new Set(oldList.map(toText));
  return newList.map(toText).filter((text) => !known.has(text));
}

// Adds the checked pages to the baseline. Pages that were not checked keep
// their old baseline, so a one-page check does not remove the other pages.
function addToBaseline(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function main() {
  if (update) {
    addToBaseline(OUTPUT_DIR, BASELINE_DIR);
    fs.rmSync(path.join(BASELINE_DIR, "diff"), { recursive: true, force: true });
    fs.rmSync(path.join(BASELINE_DIR, "report.html"), { force: true });
    console.log(`The checked pages are now in the baseline: ${BASELINE_DIR}`);
    return;
  }

  const rows = [];
  let failures = 0;
  const run = fs.existsSync(path.join(OUTPUT_DIR, "run.json")) ? JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "run.json"), "utf8")) : {};
  for (const [name, result] of Object.entries(run)) {
    if (result.missing.length) {
      failures += 1;
      rows.push({ name, kind: "not recorded", details: result.missing.map((key) => key.slice(0, 200)) });
    }
    if (result.pageErrors.length) rows.push({ name, kind: "page error", details: result.pageErrors });
  }

  for (const newPicture of listFiles(OUTPUT_DIR, ".png")) {
    const relative = path.relative(OUTPUT_DIR, newPicture);
    if (relative.startsWith("diff")) continue;
    const oldPicture = path.join(BASELINE_DIR, relative);
    const name = relative.replace(/\.png$/, "");
    if (!fs.existsSync(oldPicture)) {
      rows.push({ name, kind: "new state, no baseline", details: [] });
      continue;
    }
    const picture = comparePictures(oldPicture, newPicture, path.join(OUTPUT_DIR, "diff", relative));
    const newData = JSON.parse(fs.readFileSync(newPicture.replace(/\.png$/, ".json"), "utf8"));
    const oldData = JSON.parse(fs.readFileSync(oldPicture.replace(/\.png$/, ".json"), "utf8"));

    const chartProblems = compareCharts(oldData.charts, newData.charts);
    const styleChanges = compareStyles(oldData.styles, newData.styles);
    const layoutProblems = newOnly(oldData.layout, newData.layout, (item) => `${item.kind}: ${item.detail}`);
    const accessibilityProblems = newOnly(oldData.accessibility, newData.accessibility, (item) => `${item.id} (${item.impact})`);

    if (chartProblems.length) failures += 1;
    const isNoise = picture.pixels > 0 && picture.pixels < NOISE_PIXELS;
    if (strict && ((picture.pixels !== 0 && !isNoise) || styleChanges.length)) failures += 1;
    if (picture.pixels !== 0 || chartProblems.length || styleChanges.length || layoutProblems.length || accessibilityProblems.length) {
      rows.push({
        name, kind: "changed", relative,
        details: [
          picture.pixels === -1 ? picture.note : `${picture.pixels} different pixels${isNoise ? " (small, likely anti-aliasing)" : ""}`,
          ...chartProblems.map((text) => `CHART: ${text}`),
          ...styleChanges.map((text) => `style: ${text}`),
          ...layoutProblems.map((text) => `new layout problem: ${text}`),
          ...accessibilityProblems.map((text) => `new accessibility problem: ${text}`),
        ],
      });
    }
  }

  const html = [
    "<!doctype html><meta charset=utf-8><title>CHOps visual check</title>",
    "<style>body{font:14px system-ui;margin:24px;background:#f4f5f8;color:#0f1320}section{background:#fff;border:1px solid #e2e5eb;border-radius:12px;padding:16px;margin:0 0 16px}",
    "h2{font-size:16px;margin:0 0 8px}ul{margin:0 0 12px}.images{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}img{width:100%;border:1px solid #cdd2db}</style>",
    `<h1>CHOps visual check</h1><p>${rows.length} items. Mode: ${strict ? "strict" : "review"}.</p>`,
    ...rows.map((row) => {
      const images = row.relative
        ? `<div class=images><div>Baseline<img src="../baseline/${row.relative}"></div><div>Now<img src="${row.relative}"></div><div>Difference<img src="diff/${row.relative}"></div></div>`
        : "";
      return `<section><h2>${escapeHtml(row.name)}: ${escapeHtml(row.kind)}</h2><ul>${row.details.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>${images}</section>`;
    }),
  ].join("\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "report.html"), html);

  console.log(`${rows.length} items in ${path.join(OUTPUT_DIR, "report.html")}`);
  if (failures > 0) {
    console.log(`${failures} failures.`);
    process.exit(1);
  }
}

main();
