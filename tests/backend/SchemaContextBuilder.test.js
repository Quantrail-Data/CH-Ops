// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// SchemaContextBuilder.test.js - unit tests for the schema-context formatter
import { describe, it, expect } from "bun:test";
import SchemaContextBuilder from "../../src/backend/servicesAI/SchemaContextBuilder.js";

describe("SchemaContextBuilder.build", () => {
  it("returns an empty string for an empty array", () => {
    expect(SchemaContextBuilder.build([])).toBe("");
  });

  it("formats a single point with its database name and schema", () => {
    const points = [
      {
        payload: {
          database_name: "analytics",
          table_schema: "CREATE TABLE analytics.orders (id UInt64) ENGINE = MergeTree",
        },
      },
    ];

    const result = SchemaContextBuilder.build(points);
    expect(result).toContain("Database Name:\nanalytics");
    expect(result).toContain(
      "CREATE TABLE analytics.orders (id UInt64) ENGINE = MergeTree",
    );
  });

  it("joins multiple points with a blank line between them", () => {
    const points = [
      { payload: { database_name: "db1", table_schema: "schema1" } },
      { payload: { database_name: "db2", table_schema: "schema2" } },
    ];
    const result = SchemaContextBuilder.build(points);
    const parts = result.split("\n\n\n");
    expect(result).toContain("db1");
    expect(result).toContain("db2");
    expect(result).toContain("schema1");
    expect(result).toContain("schema2");
    expect(parts.length).toBeGreaterThan(1);
  });

  it("preserves point order in the output", () => {
    const points = [
      { payload: { database_name: "first", table_schema: "s1" } },
      { payload: { database_name: "second", table_schema: "s2" } },
    ];

    const result = SchemaContextBuilder.build(points);
    expect(result.indexOf("first")).toBeLessThan(result.indexOf("second"));
  });
});
