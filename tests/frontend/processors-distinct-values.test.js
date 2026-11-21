// processors-distinct-values.test.js - The SQL that fills the Processors
// Profile filter lists. `type` is an Enum, so the empty-string check must use
// toString(), or ClickHouse rejects the query and the list stays empty (F2).
import { describe, it, expect } from "vitest";
import { buildDistinctValuesSql } from "../../src/frontend/utils/processorsPipeline.js";

const START = new Date("2026-11-19T06:00:00Z");
const END = new Date("2026-11-19T07:00:00Z");

describe("buildDistinctValuesSql", () => {
  it("compares the Enum column type as text", () => {
    const sql = buildDistinctValuesSql("type", START, END);
    expect(sql).toContain("toString(type) != ''");
    expect(sql).not.toMatch(/AND type != ''/);
  });

  it("works the same for query_kind", () => {
    expect(buildDistinctValuesSql("query_kind", START, END)).toContain("toString(query_kind) != ''");
  });

  it("refuses a column that is not in the allow-list", () => {
    expect(() => buildDistinctValuesSql("query; DROP TABLE x", START, END)).toThrow("Column not allowed");
  });
});
