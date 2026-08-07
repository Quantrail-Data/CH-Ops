// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import SqlEditor from "../../src/frontend/components/editor/SqlEditor.jsx";

const cls = (text) =>
  [...document.querySelectorAll(".cm-content span")]
    .filter((n) => n.textContent === text)
    .flatMap((n) => [...n.classList]);

describe("what actually renders", () => {
  it("gives keywords, functions, tables and literals different classes", () => {
    render(
      <SqlEditor
        value="SELECT count() FROM system.tables WHERE a = 'x' AND b = 42"
        onChange={() => { }}
        dialectData={{ keywords: ["select", "from", "where", "and"], functions: ["count"] }}
      />,
    );
    const of = (t) => cls(t).join(" ");
    const keyword = of("SELECT");
    const fn = of("count");
    const str = of("'x'");
    const num = of("42");
    const table = of("tables");
    // Every one styled.
    for (const [label, c] of [
      ["keyword", keyword], ["function", fn], ["string", str],
      ["number", num], ["table", table],
    ]) {
      expect(c, `${label} has no highlight class`).not.toBe("");
    }
    // And no two the same.
    expect(fn, "functions and tables share a colour").not.toBe(table);
    expect(new Set([keyword, fn, table, str, num]).size).toBe(5);
  });

  it("marks the database qualifier separately from the table", () => {
    render(
      <SqlEditor
        value="SELECT * FROM system.tables"
        onChange={() => { }}
        dialectData={{ keywords: ["select", "from"], functions: [] }}
      />,
    );
    expect(cls("system")).toContain("cm-sql-qualifier");
    expect(cls("tables")).not.toContain("cm-sql-qualifier");
  });

  it("emits a colour for every role", () => {
    render(<SqlEditor value="SELECT 1" onChange={() => { }} />);
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    for (const v of [
      "--sql-keyword", "--sql-function", "--sql-identifier", "--sql-qualifier",
      "--sql-type", "--sql-string", "--sql-number", "--sql-comment",
      "--sql-operator", "--sql-punctuation",
    ]) {
      expect(css, `${v} is not used by the highlight style`).toContain(v);
    }
  });
});
