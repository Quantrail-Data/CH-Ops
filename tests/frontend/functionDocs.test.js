// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, vi } from "vitest";
import {
  buildCompletionOptions,
  loadFunctionRows,
  FUNCTIONS_QUERY_FULL,
  FUNCTIONS_QUERY_BASIC,
} from "../../src/frontend/components/editor/sqlEditorSetup.js";

const ROW = {
  name: "groupArray",
  description: "Creates an array of argument values.",
  syntax: "groupArray(x)",
  categories: "Aggregate,Array",
};

const fn = (fns) => {
  const o = buildCompletionOptions({ functions: fns });
  return Object.fromEntries(o.map((x) => [x.label, x]));
};

describe("loadFunctionRows", () => {
  it("asks for the documented columns first", async () => {
    const run = vi.fn(async () => ({ rows: [ROW] }));
    const rows = await loadFunctionRows(run);
    expect(run).toHaveBeenCalledWith(FUNCTIONS_QUERY_FULL);
    expect(run).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([ROW]);
  });

  it("falls back to bare names when a column is unknown", async () => {
    // An older server rejects the whole query for one unrecognised column.
    const run = vi.fn(async (q) => {
      if (q === FUNCTIONS_QUERY_FULL) throw new Error("Unknown identifier: syntax");
      return { rows: [{ name: "count" }] };
    });
    const rows = await loadFunctionRows(run);
    expect(run).toHaveBeenCalledWith(FUNCTIONS_QUERY_BASIC);
    expect(rows).toEqual([{ name: "count" }]);
  });

  it("returns nothing rather than throwing when both fail", async () => {
    const rows = await loadFunctionRows(async () => { throw new Error("down"); });
    expect(rows).toEqual([]);
  });
});

describe("buildCompletionOptions with documented functions", () => {
  it("still accepts bare names, so an un-updated caller works", () => {
    const by = fn(["count"]);
    expect(by.count.type).toBe("function");
    expect(by.count.apply).toBe("count()");
    expect(by.count.info).toBeUndefined();
  });

  it("shows the first category as the detail, not the word function", () => {
    expect(fn([ROW]).groupArray.detail).toBe("Aggregate");
  });

  it("falls back to 'function' when there is no category", () => {
    expect(fn([{ name: "x" }]).x.detail).toBe("function");
  });

  it("attaches an info panel when there is documentation", () => {
    const info = fn([ROW]).groupArray.info;
    expect(typeof info).toBe("function");
    const node = info();
    expect(node.querySelector("code").textContent).toBe("groupArray(x)");
    expect(node.querySelector("p").textContent).toContain("array of argument values");
  });

  it("attaches nothing when there is no documentation", () => {
    // An empty panel is worse than none.
    expect(fn([{ name: "x", categories: "Other" }]).x.info).toBeUndefined();
  });

  it("shows syntax alone if that is all the server gave", () => {
    const node = fn([{ name: "x", syntax: "x(a)" }]).x.info();
    expect(node.querySelector("code").textContent).toBe("x(a)");
    expect(node.querySelector("p")).toBeNull();
  });

  it("sets the description as TEXT, so markup in it cannot execute", () => {
    // These strings come from the server and are not this code's to trust.
    const node = fn([{ name: "x", description: "<img src=x onerror=alert(1)>" }]).x.info();
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toContain("<img");
  });

  it("skips a row with no name rather than adding a blank entry", () => {
    expect(buildCompletionOptions({ functions: [{ description: "orphan" }] })).toEqual([]);
  });
});
