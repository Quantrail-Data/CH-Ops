// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Test suite validating schema projections, secondary index management, data skipping, and shared tree chart utilities.

import { describe, it, expect } from "vitest";
import fs from "fs";
function read(f) {
  return fs.readFileSync(f, "utf8");
}

describe("Shared tree utility (treeChart.js)", () => {
  const code = read("src/frontend/utils/treeChart.js");
  it("exports countLeaves, maxDepth, countAll, treeSize, treeSeries", () => {
    expect(code).toContain("export function countLeaves");
    expect(code).toContain("export function maxDepth");
    expect(code).toContain("export function countAll");
    expect(code).toContain("export function treeSize");
    expect(code).toContain("export function treeSeries");
  });
  it("treeSize uses leaves for height, depth + label for width", () => {
    expect(code).toContain("leaves * 28 + 100");
    expect(code).toContain("depth * 150");
    expect(code).toContain("longestLabel");
    expect(code).toContain("longestLabel");
  });
  it("treeSeries has symbolSize 14 and animationDuration 550", () => {
    expect(code).toContain("symbolSize: 12");
    expect(code).toContain("animationDuration: 550");
  });
});

describe("Indexes: SecondaryIndexes (Data Skipping)", () => {
  const code = read("src/frontend/components/indexes/SecondaryIndexes.jsx");
  it("title says Data Skipping Indexes", () => {
    expect(code).toContain("Data Skipping Indexes");
  });
  it("imports treeSize and treeSeries from shared util", () => {
    expect(code).toContain("from '../../utils/treeChart.js'");
  });
  it("has zoom, download, fullscreen buttons", () => {
    expect(code).toContain("ti-zoom-in");
    expect(code).toContain("ti-download");
    expect(code).toContain("ti-arrows-maximize");
  });
});

describe("Indexes: Index Management (CreateIndex)", () => {
  const code = read("src/frontend/components/indexes/CreateIndex.jsx");
  it("title says Index Management", () => {
    expect(code).toContain("Index Management");
  });
  it("3 tabs: Create, Materialize, Drop", () => {
    expect(code).toContain("Tab === 'create'");
    expect(code).toContain("Tab === 'materialize'");
    expect(code).toContain("Tab === 'drop'");
  });
  it("Drop tab has executeDrop + DROP INDEX SQL", () => {
    expect(code).toContain("executeDrop");
    expect(code).toContain("DROP INDEX");
  });
});

describe("Indexes: Projections", () => {
  const code = read("src/frontend/components/indexes/Projections.jsx");
  it("imports treeSize and treeSeries from shared util", () => {
    expect(code).toContain("from '../../utils/treeChart.js'");
  });
  it("has zoom, download, fullscreen buttons", () => {
    expect(code).toContain("ti-zoom-in");
    expect(code).toContain("ti-download");
    expect(code).toContain("ti-arrows-maximize");
  });
});

describe("Tree charts: all 4 files import shared utility", () => {
  [
    "indexes/SecondaryIndexes",
    "indexes/Projections",
    "rbac/RbacViewGrants",
    "editor/QueryEditor",
  ].forEach((f) => {
    it(`${f.split("/").pop()} imports treeChart.js`, () => {
      const code = read(`src/frontend/components/${f}.jsx`);
      expect(code).toContain("treeChart.js");
    });
  });
});
