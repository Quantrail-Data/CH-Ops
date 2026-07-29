//sqlParams.test.js - typed query parameters and optional filter blocks.
//Copyright (C) 2026 Quantrail Data Private Limited
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar


import { describe, it, expect } from "bun:test";
import {
  findParameters,
  findBlocks,
  materialize,
  formatValue,
  enumMembers,
  hasValue,
  isTemporal,
  isNumeric,
} from "../../src/shared/sqlParams.js";

describe("findParameters", () => {
  it("finds a plain placeholder", () => {
    expect(findParameters("SELECT {a:String}")).toEqual([
      { name: "a", type: "String", required: true },
    ]);
  });
  it("ignores one inside a string literal", () => {
    expect(findParameters("SELECT '{a:String}'")).toEqual([]);
  });
  it("ignores one inside a line comment", () => {
    expect(findParameters("SELECT 1 -- {a:String}")).toEqual([]);
  });
  it("ignores one inside an ordinary block comment", () => {
    expect(findParameters("SELECT 1 /* {a:String} */")).toEqual([]);
  });
  it("de-duplicates the same name", () => {
    expect(findParameters("SELECT {a:String}, {a:String}")).toHaveLength(1);
  });
  it("rejects the same name with two types", () => {
    expect(() => findParameters("SELECT {a:String}, {a:UInt8}")).toThrow(/'a'/);
  });
  it("ignores a placeholder with no type", () => {
    expect(findParameters("SELECT {a}")).toEqual([]);
  });
  it("parses nested type brackets", () => {
    const [p] = findParameters("SELECT {a:Array(Tuple(UInt8, String))}");
    expect(p.type).toBe("Array(Tuple(UInt8, String))");
  });
  it("marks a parameter inside a block as optional", () => {
    const ps = findParameters("SELECT 1 /*[ AND x = {a:String} ]*/");
    expect(ps[0].required).toBe(false);
  });
  it("marks it required if it also appears outside a block", () => {
    const ps = findParameters("SELECT {a:String} /*[ AND x = {a:String} ]*/");
    expect(ps[0].required).toBe(true);
  });
  it("keeps first-appearance order", () => {
    const ps = findParameters("SELECT {b:String}, {a:String}");
    expect(ps.map((p) => p.name)).toEqual(["b", "a"]);
  });
});

describe("findParameters: types containing quotes", () => {
  // The scanner classifies quoted regions as string literals, and
  // an enum declaration contains quotes.
  it("recognises an Enum8 placeholder", () => {
    const ps = findParameters("SELECT {e:Enum8('prod'=1,'dev'=2)}");
    expect(ps).toHaveLength(1);
    expect(ps[0].name).toBe("e");
    expect(ps[0].type).toBe("Enum8('prod'=1,'dev'=2)");
  });
  it("recognises an Enum with no width", () => {
    expect(findParameters("SELECT {e:Enum('a'=1)}")).toHaveLength(1);
  });
  it("recognises Enum16", () => {
    expect(findParameters("SELECT {e:Enum16('a'=1,'b'=2)}")).toHaveLength(1);
  });
  it("still ignores a placeholder inside a genuine string literal", () => {
    expect(findParameters("SELECT '{a:String}'")).toEqual([]);
  });
  it("handles a string literal before and after a placeholder", () => {
    const ps = findParameters("SELECT 'x', {a:String}, 'y', {b:UInt8}");
    expect(ps.map((p) => p.name)).toEqual(["a", "b"]);
  });
  it("handles a doubled quote before a placeholder", () => {
    expect(findParameters("SELECT 'it''s', {a:String}")).toHaveLength(1);
  });
  it("finds an enum inside an optional block, and marks it optional", () => {
    const ps = findParameters("SELECT 1 /*[ AND e = {e:Enum8('a'=1)} ]*/");
    expect(ps).toHaveLength(1);
    expect(ps[0].required).toBe(false);
  });
});

describe("findBlocks", () => {
  it("rejects nested blocks", () => {
    expect(() => findBlocks("/*[ /*[ {a:String} ]*/ ]*/")).toThrow(/nested/i);
  });
  it("rejects a block with no parameter", () => {
    expect(() => findBlocks("/*[ AND 1=1 ]*/")).toThrow(/at least one parameter/i);
  });
  it("rejects a block containing a semicolon", () => {
    expect(() => findBlocks("/*[ {a:String}; ]*/")).toThrow(/semicolon/i);
  });
  it("rejects */ inside a string literal", () => {
    // ClickHouse ends the comment at the first */ regardless of quoting, so a
    // block that looks balanced to a reader is not balanced to the server.
    expect(() => findBlocks("/*[ AND s = '*/' AND x = {a:String} ]*/")).toThrow();
  });
  it("accepts several independent blocks", () => {
    const bs = findBlocks(
      "SELECT 1 /*[ AND a = {a:String} ]*/ /*[ AND b = {b:UInt8} ]*/",
    );
    expect(bs).toHaveLength(2);
  });
});

describe("materialize", () => {
  const SQL = `SELECT * FROM events
WHERE tenant = {tenant:String}
  /*[ AND level = {level:String} ]*/
  /*[ AND d >= {d:Date} ]*/`;

  it("keeps a block when its value is present", () => {
    const r = materialize(SQL, { tenant: "acme", level: "err", d: "" });
    expect(r.sql).toContain("AND level = {level:String}");
    expect(r.sql).not.toContain("/*[");
  });
  it("drops a block when its value is blank, and drops its parameter", () => {
    const r = materialize(SQL, { tenant: "acme", level: "", d: "" });
    expect(r.sql).not.toContain("level");
    expect(r.params.level).toBeUndefined();
    expect(r.params.tenant).toBe("acme");
  });
  it("treats 0 and false as values, not as blank", () => {
    //A cleared filter and a filter set to zero are different queries.
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
    expect(hasValue("  ")).toBe(false);
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
  });
  it("keeps a block whose value is the string zero", () => {
    const sql = "SELECT 1 /*[ AND n = {n:UInt8} ]*/";
    expect(materialize(sql, { n: "0" }).sql).toContain("AND n =");
  });
  it("NEVER substitutes a value into the SQL", () => {
    // The security property of the entire feature.
    const r = materialize(SQL, { tenant: "acme", level: "err", d: "2026-01-01" });
    expect(r.sql).toContain("{tenant:String}");
    expect(r.sql).not.toContain("acme");
  });
  it("does not let a value that looks like SQL reach the statement", () => {
    const r = materialize("SELECT * FROM t WHERE a = {a:String}", {
      a: "x' OR 1=1 --",
    });
    expect(r.sql).toContain("{a:String}");
    expect(r.sql).not.toContain("OR 1=1");
    expect(r.params.a).toBe("x' OR 1=1 --");
  });
  it("carries an enum value through", () => {
    const r = materialize("SELECT {e:Enum8('prod'=1,'dev'=2)}", { e: "prod" });
    expect(r.params.e).toBe("prod");
    expect(r.sql).toContain("{e:Enum8('prod'=1,'dev'=2)}");
  });
  it("throws on a malformed block rather than mangling it", () => {
    expect(() => materialize("SELECT 1 /*[ AND 1=1 ]*/", {})).toThrow();
  });
});

describe("formatValue", () => {
  it("never emits ISO form for a temporal type", () => {
    // This exact shape broke the archival scheduler: ClickHouse answered
    // "Cannot convert string 1995-06-23T18:30:00.000Z to type DateTime".
    const v = formatValue("DateTime", "2026-07-24T09:30:00.000Z");
    expect(v).toBe("2026-07-24 09:30:00");
    expect(v).not.toContain("T");
    expect(v).not.toContain("Z");
  });
  it("formats Date without a time", () => {
    expect(formatValue("Date", "2026-07-24T09:30:00Z")).toBe("2026-07-24");
  });
  it("formats DateTime64 with milliseconds", () => {
    expect(formatValue("DateTime64(3)", "2026-07-24T09:30:00.123Z")).toBe(
      "2026-07-24 09:30:00.123",
    );
  });
  it("sends integers bare", () => {
    expect(formatValue("UInt32", "42")).toBe("42");
  });
  it("unwraps Nullable and LowCardinality", () => {
    expect(formatValue("Nullable(Date)", "2026-07-24T00:00:00Z")).toBe("2026-07-24");
    expect(formatValue("LowCardinality(String)", "x")).toBe("x");
  });
  it("passes an unparseable date through for ClickHouse to reject", () => {
    // Better a clear server error naming the value than a silent NaN.
    expect(formatValue("DateTime", "not a date")).toBe("not a date");
  });
  it("passes Array and Map through in ClickHouse text form", () => {
    expect(formatValue("Array(UInt8)", "[1,2,3]")).toBe("[1,2,3]");
    expect(formatValue("Map(String,UInt8)", "{'a':1}")).toBe("{'a':1}");
  });
});

describe("type helpers", () => {
  it("reads enum members", () => {
    expect(enumMembers("Enum8('prod'=1,'dev'=2)")).toEqual(["prod", "dev"]);
  });
  it("reads enum members through Nullable", () => {
    expect(enumMembers("Nullable(Enum8('a'=1))")).toEqual(["a"]);
  });
  it("returns nothing for a type that is not an enum", () => {
    expect(enumMembers("String")).toEqual([]);
  });
  it("recognises temporal types, including wrapped ones", () => {
    expect(isTemporal("Date")).toBe(true);
    expect(isTemporal("DateTime64(3)")).toBe(true);
    expect(isTemporal("Nullable(DateTime)")).toBe(true);
    expect(isTemporal("String")).toBe(false);
  });
  it("recognises numeric types", () => {
    expect(isNumeric("UInt8")).toBe(true);
    expect(isNumeric("Float64")).toBe(true);
    expect(isNumeric("Decimal(10,2)")).toBe(true);
    expect(isNumeric("String")).toBe(false);
  });
});
