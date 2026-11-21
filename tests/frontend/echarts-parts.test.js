// echarts-parts.test.js - utils/echarts.js imports only some ECharts parts.
// Every series type that the app code uses must be in USED_CHART_TYPES (and
// so registered), or that chart does not draw.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_DIR = path.join(ROOT, "src/frontend");
const SERIES_TYPES = [
  "line", "bar", "pie", "gauge", "tree", "treemap", "sunburst", "graph", "heatmap", "scatter",
  "effectScatter", "sankey", "funnel", "radar", "boxplot", "candlestick", "parallel", "themeRiver",
  "map", "lines", "pictorialBar", "custom",
];

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("ECharts parts", () => {
  const echartsCode = fs.readFileSync(path.join(SOURCE_DIR, "utils/echarts.js"), "utf8");

  it("imports from echarts/core, not the full library", () => {
    expect(echartsCode).toContain('from "echarts/core"');
    expect(echartsCode).not.toMatch(/from "echarts";/);
  });

  it("registers every series type that the code uses", async () => {
    const { USED_CHART_TYPES } = await import("../../src/frontend/utils/echarts.js");
    const typePattern = new RegExp(`type:\\s*["'](${SERIES_TYPES.join("|")})["']`, "g");
    const usedTypes = new Set();
    for (const file of listSourceFiles(SOURCE_DIR)) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(typePattern)) usedTypes.add(match[1]);
    }
    for (const type of usedTypes) expect(USED_CHART_TYPES, `series type "${type}"`).toContain(type);
  });

  it("no other file imports echarts directly", () => {
    const others = listSourceFiles(SOURCE_DIR).filter(
      (file) => !file.endsWith("utils/echarts.js") && /from ["']echarts["']/.test(fs.readFileSync(file, "utf8")),
    );
    expect(others).toEqual([]);
  });
});
