// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Integration tests verifying dark mode log themes, tab-based log search routing, and query heatmap visualizations.


import { describe, it, expect } from "vitest";
import fs from "fs";
function read(f) {
  return fs.readFileSync(f, "utf8");
}

describe("LogHeatmap: Shared Builder", () => {
  const code = read("src/frontend/components/layout/LogHeatmap.jsx");
  it("exports buildHeatmapEchartsOption + helpers", () => {
    expect(code).toContain("export { buildHeatmapEchartsOption");
    expect(code).toContain("HEATMAP_COLORS");
    expect(code).toContain("interpolateScale");
    expect(code).toContain("varianceDepth");
  });
  it("single amber scale for both themes (ANCHORS, not per-theme)", () => {
    expect(code).toContain("const ANCHORS");
    expect(code).toContain("interpolateScale(ANCHORS, 1000)");
  });
  it("starts from white", () => {
    expect(code).toContain("white");
  });
  it("ends at deep blue", () => {
    expect(code).toContain("blue");
  });
  it("getHeatmapColors returns same scale regardless of theme", () => {
    expect(code).toContain("return HEATMAP_SCALE");
  });
  it("theme switch uses themeKey for ECharts re-init (axis colors, etc.)", () => {
    expect(code).toContain("themeKey");
    expect(code).toContain("setThemeKey(k => k + 1)");
    expect(code).toContain("[data, countCol, themeKey]");
  });
  it("varianceDepth scales color range by coefficient of variation", () => {
    expect(code).toContain("varianceDepth");
    expect(code).toContain("Math.sqrt(variance) / mean");
  });
  it("slices color scale by variance depth (at least 50 steps)", () => {
    expect(code).toContain("fullColors.slice(0");
    expect(code).toContain("Math.max(usedCount, 50)");
  });
  it("HTML download and fullscreen buttons (not ECharts toolbox)", () => {
    expect(code).not.toContain("toolbox: { show: true");
    expect(code).toContain("downloadChart");
    expect(code).toContain("ti-download");
    expect(code).toContain("ti-arrows-maximize");
  });
  it("no slider (visualMap.show: false)", () => {
    expect(code).toContain("show: false");
  });
  it("axis labels: auto-thin x, every 3rd hour y", () => {
    expect(code).toContain("dates.length > 14");
    expect(code).toContain("interval: 2");
  });
  it("disposes chart before re-init", () => {
    expect(code).toContain("disposeChart(chartRef.current)");
  });
});

describe("QueriesSection: Analytics", () => {
  const code = read("src/frontend/components/queries/QueriesSection.jsx");
  it("builds throughput and error-rate analytics", () => {
    expect(code).toContain("buildThroughputSql");
    expect(code).toContain("errorRatePct");
  });
  it("shows latency percentiles and a duration distribution", () => {
    expect(code).toContain("p50");
    expect(code).toContain("p99");
    expect(code).toContain("query_duration_ms <");
  });
  it("single-column layout", () => {
    expect(code).toContain("gridTemplateColumns: \"1fr\"");
  });
  it("query_kind filter", () => {
    expect(code).toContain("queryKind");
  });
});

describe("Log Pages: Overview + Search Tabs", () => {
  ["logs/CrashLog", "logs/ErrorLog", "logs/TextLog", "logs/SessionLog"].forEach((p) => {
    const name = p.split("/").pop();
    describe(name, () => {
      const code = read(`src/frontend/components/${p}.jsx`);
      it("has a metrics-dashboard overview tab", () => {
        expect(code).toMatch(/LogOverview/);
        expect(code).toContain("overview");
      });
      it("has variant=single for search table", () => {
        expect(
          code.includes('variant="single"') || code.includes("dt-single"),
        ).toBe(true);
      });
    });
  });
});

describe("Dark Mode Log Colors", () => {
  const css = read("src/frontend/styles/global.css");
  it("Trace: dark #6ee7b7, light #2e7d32", () => {
    expect(css).toContain("#6ee7b7");
    expect(css).toContain("#2e7d32");
  });
  it("Information: dark #60a5fa, light #1565C0", () => {
    expect(css).toContain("#60a5fa");
    expect(css).toContain("#1565c0");
  });
  it("Fatal: dark #fb7185, light #880E4F", () => {
    expect(css).toContain("#fb7185");
    expect(css).toContain("#880e4f");
  });
});
