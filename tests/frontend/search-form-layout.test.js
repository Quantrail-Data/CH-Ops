// Search forms use the free width of the row, and the page background has
// only the moving particles (no dot pattern on top of them).
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect } from "vitest";
import fs from "fs";

const css = fs.readFileSync("src/frontend/styles/global.css", "utf8");

function ruleOf(selector) {
  const start = css.indexOf(selector + " {");
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("search form layout", () => {
  it("lets text fields grow to fill the row", () => {
    const rule = ruleOf(".search-field");
    expect(rule).toContain("flex: 2 1 14rem");
    expect(rule).not.toContain("max-width");
  });

  it("keeps dropdowns and number fields small", () => {
    expect(ruleOf(".search-field-select")).toContain("max-width: 16rem");
    expect(ruleOf(".search-field-small")).toContain("flex: 0 0 6.5rem");
  });

  it("gives a list of check boxes the full row", () => {
    expect(ruleOf(".search-form-wide")).toContain("flex: 1 1 100%");
  });
});

describe("background", () => {
  it("has no dot pattern on empty states or the tree canvas", () => {
    expect(css).not.toContain(".empty-state::before");
    expect(css).not.toMatch(/\.tree-graph-canvas \{\s*background-image: radial-gradient/);
  });
});
