/**
 * sqlExport.test.js - The SQL preparation helpers used by the export wizard.
 * Copyright (C) 2026 Quantrail™ Data Private Limited
    * @author: Sanjeev Kumar G
 */
import { describe, test, expect } from "bun:test";
import {
  normalizeForExport,
  isSelectLike,
  hasMultipleStatements,
  wrapForCount,
  wrapForSample,
} from "../../src/shared/sqlExport.js";

describe("normalizeForExport", () => {
  test("leaves a plain query alone", () => {
    expect(normalizeForExport("SELECT a FROM t")).toBe("SELECT a FROM t");
  });

  test("drops a trailing semicolon", () => {
    expect(normalizeForExport("SELECT 1;")).toBe("SELECT 1");
  });

  test("drops several trailing semicolons and whitespace", () => {
    expect(normalizeForExport("  SELECT 1 ;;  ")).toBe("SELECT 1");
  });

 
  test("drops a trailing FORMAT clause", () => {
    expect(normalizeForExport("SELECT a FROM t FORMAT JSONEachRow")).toBe("SELECT a FROM t");
  });

  test("drops FORMAT even with a semicolon after it", () => {
    expect(normalizeForExport("SELECT a FROM t FORMAT CSV;")).toBe("SELECT a FROM t");
  });

 
  test("removes a trailing line comment", () => {
    expect(normalizeForExport("SELECT a FROM t -- a note")).toBe("SELECT a FROM t");
  });

  test("keeps only the first statement", () => {
    expect(normalizeForExport("SELECT 1; SELECT 2")).toBe("SELECT 1");
  });

  test("does not split on a semicolon inside a string literal", () => {
    expect(normalizeForExport("SELECT 'a; b' AS s")).toContain("'a; b'");
  });

  test("handles empty and missing input", () => {
    expect(normalizeForExport("")).toBe("");
    expect(normalizeForExport(undefined)).toBe("");
  });
});

describe("isSelectLike", () => {
  test("accepts SELECT and WITH", () => {
    expect(isSelectLike("SELECT 1")).toBe(true);
    expect(isSelectLike("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
  });

  test("accepts them regardless of case or leading whitespace", () => {
    expect(isSelectLike("   select 1")).toBe(true);
  });

  test("still recognises a SELECT that carried a FORMAT clause", () => {
    expect(isSelectLike("SELECT 1 FORMAT CSV")).toBe(true);
  });

  test("rejects statements that cannot be wrapped in a subquery", () => {
    for (const sql of ["SHOW TABLES", "DESCRIBE t", "INSERT INTO t VALUES (1)", "DROP TABLE t"]) {
      expect(isSelectLike(sql)).toBe(false);
    }
  });
});

describe("hasMultipleStatements", () => {
  test("false for one statement, with or without a trailing semicolon", () => {
    expect(hasMultipleStatements("SELECT 1")).toBe(false);
    expect(hasMultipleStatements("SELECT 1;")).toBe(false);
  });

  test("true for two statements", () => {
    expect(hasMultipleStatements("SELECT 1; SELECT 2")).toBe(true);
  });

  test("a semicolon inside a string does not count as a separator", () => {
    expect(hasMultipleStatements("SELECT 'a; b'")).toBe(false);
  });
});

describe("wrapForCount", () => {
  test("wraps the normalized query", () => {
    expect(wrapForCount("SELECT a FROM t;")).toBe("SELECT count() AS c FROM (\nSELECT a FROM t\n)");
  });


  test("the closing bracket is on its own line", () => {
    expect(wrapForCount("SELECT 1").endsWith("\n)")).toBe(true);
  });

  test("a query ending in a comment still produces a valid wrapper", () => {
    const sql = wrapForCount("SELECT a FROM t -- note");
    expect(sql).toContain("SELECT a FROM t");
    expect(sql).not.toContain("-- note");
  });
});

describe("wrapForSample", () => {
  test("applies the requested limit", () => {
    expect(wrapForSample("SELECT 1", 500)).toContain("LIMIT 500");
  });

  test("defaults to 10000 when the limit is missing or nonsense", () => {
    expect(wrapForSample("SELECT 1")).toContain("LIMIT 10000");
    expect(wrapForSample("SELECT 1", 0)).toContain("LIMIT 10000");
    expect(wrapForSample("SELECT 1", -5)).toContain("LIMIT 10000");
  });

  
  test("a non-numeric limit cannot reach the SQL", () => {
    expect(wrapForSample("SELECT 1", "1; DROP TABLE t")).toContain("LIMIT 10000");
  });
});
