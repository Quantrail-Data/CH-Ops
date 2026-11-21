// chart-cleanup-pattern.test.js - No unmount cleanup may dispose a chart
// through an element ref. React clears an element ref before the cleanup
// runs, so disposeChart(elementRef.current) does nothing there, and the chart
// stays in memory with its animation loop. Use
// disposeChartInstance(instanceRef.current) instead.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SOURCE_DIR = path.resolve(__dirname, "../../src/frontend");
// useEffect(() => () => { ... disposeChart(something.current) ... }, [])
const BAD_CLEANUP = /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{?[^}]{0,160}?disposeChart\(\s*\w+\.current\s*\)/g;

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("chart cleanup on unmount", () => {
  it("never disposes a chart through an element ref in an unmount cleanup", () => {
    const badPlaces = [];
    for (const file of listSourceFiles(SOURCE_DIR)) {
      const code = fs.readFileSync(file, "utf8");
      for (const match of code.matchAll(BAD_CLEANUP)) {
        const line = code.slice(0, match.index).split("\n").length;
        badPlaces.push(`${path.relative(SOURCE_DIR, file)}:${line}`);
      }
    }
    expect(badPlaces).toEqual([]);
  });

  it("finds the bad pattern in an example", () => {
    const example = "useEffect(() => () => { if (chartRef.current) disposeChart(chartRef.current); }, []);";
    expect(example.match(BAD_CLEANUP)).not.toBeNull();
  });
});
