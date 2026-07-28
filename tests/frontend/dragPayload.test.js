// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect } from "vitest";
import { normalizeForExport } from "../../src/shared/sqlExport.js";

// The same expression QueryEditor uses. Kept here rather than exported from the
// component, because the component is not importable without forty stubs.
const asSubquery = (text) => {
  const one = normalizeForExport(text || "");
  return one ? `( ${one} ) ` : "";
};

describe("a saved query, dropped into the editor", () => {
  it("is wrapped in brackets, ready for SELECT count() FROM", () => {
    // The case that justifies dragging at all.
    expect(asSubquery("SELECT 1")).toBe("( SELECT 1 ) ");
  });

  it("keeps the trailing space, matching the schema drop", () => {
    expect(asSubquery("SELECT 1").endsWith(" ")).toBe(true);
  });

  it("carries no name comment", () => {
    expect(asSubquery("SELECT 1")).not.toContain("--");
  });

  it("drops a trailing FORMAT clause, which is an error in a subquery", () => {
    expect(asSubquery("SELECT 1 FORMAT JSONEachRow")).toBe("( SELECT 1 ) ");
  });

  it("drops a trailing semicolon", () => {
    expect(asSubquery("SELECT 1;")).toBe("( SELECT 1 ) ");
  });

  it("does not let a trailing line comment swallow the closing bracket", () => {
    // A regex would leave "( SELECT 1 -- a note )", commenting out the bracket
    // and producing a syntax error nobody would connect to the drag.
    expect(asSubquery("SELECT 1 -- a note")).toBe("( SELECT 1 ) ");
  });

  it("does the same for a trailing block comment", () => {
    expect(asSubquery("SELECT 1 /* note */")).toBe("( SELECT 1 ) ");
  });

  it("takes only the first of several statements", () => {
    // Two statements cannot be one subquery. Inserting the first is better than
    // refusing a drop the user did not ask to be validated.
    expect(asSubquery("SELECT 1; SELECT 2")).toBe("( SELECT 1 ) ");
  });

  it("is not fooled by a semicolon inside a string literal", () => {
    // The reason this uses the shared lexer rather than a split on ";".
    expect(asSubquery("SELECT 'a; b'")).toBe("( SELECT 'a; b' ) ");
  });

  it("returns nothing for an empty entry, so no drag starts", () => {
    expect(asSubquery("")).toBe("");
    expect(asSubquery(null)).toBe("");
    expect(asSubquery("   ")).toBe("");
  });
});
