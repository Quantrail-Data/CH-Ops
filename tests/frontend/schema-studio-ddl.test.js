// schema-studio-ddl.test.js - Tests for the deterministic CREATE TABLE composer
//
// Covers identifier quoting, string escaping, tuple parsing, the primary-key
// prefix rule, key normalization, every column modifier, index and projection
// lines, spec validation, and full statement assembly.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, it, expect } from "vitest";
import {
  quoteIdent, sqlString, splitTopLevel, keyList, primaryKeyIsPrefix, normalizeKeys,
  composeColumn, composeIndex, composeProjection, validateSpec, composeCreateTable,
  DEFAULT_KINDS, SKIP_INDEX_TYPES, joinKey,
} from "../../src/frontend/utils/ddlCompose.js";

describe("identifier and string helpers", () => {
  it("quotes only non-plain identifiers", () => {
    expect(quoteIdent("user_id")).toBe("user_id");
    expect(quoteIdent("weird name")).toBe("`weird name`");
    expect(quoteIdent("a`b")).toBe("`a``b`");
  });
  it("escapes comment strings", () => {
    expect(sqlString("it's")).toBe("'it\\'s'");
  });
});

describe("tuple parsing", () => {
  it("splits on top-level commas only", () => {
    expect(splitTopLevel("cityHash64(a, b), c")).toEqual(["cityHash64(a, b)", "c"]);
  });
  it("keyList handles bare, tuple, and tuple()", () => {
    expect(keyList("a")).toEqual(["a"]);
    expect(keyList("(a, b)")).toEqual(["a", "b"]);
    expect(keyList("tuple()")).toEqual([]);
  });
  it("joinKey serializes ordered parts (inverse of keyList)", () => {
    expect(joinKey([])).toBe("");
    expect(joinKey(["a"])).toBe("a");
    expect(joinKey(["a", "b", "c"])).toBe("(a, b, c)");
    expect(joinKey([" a ", "", "b"])).toBe("(a, b)");
  });
  it("keyList(joinKey(parts)) round-trips and preserves order", () => {
    const parts = ["country", "event_date", "cityHash64(user_id)"];
    expect(keyList(joinKey(parts))).toEqual(parts);
  });
});

describe("primary key prefix rule", () => {
  it("accepts a true prefix", () => {
    expect(primaryKeyIsPrefix("(a, b)", "(a, b, c)")).toBe(true);
    expect(primaryKeyIsPrefix("a", "(a, b)")).toBe(true);
  });
  it("rejects a non-prefix", () => {
    expect(primaryKeyIsPrefix("(a, c)", "(a, b, c)")).toBe(false);
    expect(primaryKeyIsPrefix("(a, b, c)", "(a, b)")).toBe(false);
  });
});

describe("normalizeKeys", () => {
  it("promotes a lone primary key to ORDER BY", () => {
    expect(normalizeKeys({ primaryKey: "(a, b)" })).toEqual({ orderBy: "(a, b)", primaryKey: "" });
  });
  it("keeps both when both given", () => {
    expect(normalizeKeys({ orderBy: "(a, b, c)", primaryKey: "(a, b)" }))
      .toEqual({ orderBy: "(a, b, c)", primaryKey: "(a, b)" });
  });
});

describe("composeColumn", () => {
  it("renders type only", () => {
    expect(composeColumn({ name: "id", type: "UInt64" })).toBe("id UInt64");
  });
  it("renders NOT NULL", () => {
    expect(composeColumn({ name: "id", type: "UInt64", nullability: "notnull" })).toBe("id UInt64 NOT NULL");
  });
  it("renders a DEFAULT expression", () => {
    expect(composeColumn({ name: "created", type: "DateTime", defaultKind: "DEFAULT", defaultExpr: "now()" }))
      .toBe("created DateTime DEFAULT now()");
  });
  it("renders MATERIALIZED, comment, codec, statistics, ttl, primary key, settings", () => {
    const s = composeColumn({
      name: "amount", type: "Float64",
      defaultKind: "MATERIALIZED", defaultExpr: "price * qty",
      comment: "derived", codec: "ZSTD(3)", statistics: "TDigest", ttl: "d + INTERVAL 1 DAY",
      primaryKey: true, settings: "min_compress_block_size = 8192",
    });
    expect(s).toBe("amount Float64 MATERIALIZED price * qty COMMENT 'derived' CODEC(ZSTD(3)) STATISTICS(TDigest) TTL d + INTERVAL 1 DAY PRIMARY KEY SETTINGS (min_compress_block_size = 8192)");
  });
  it("quotes an odd column name", () => {
    expect(composeColumn({ name: "weird col", type: "String" })).toBe("`weird col` String");
  });
});

describe("composeIndex and composeProjection", () => {
  it("renders an index with params and granularity", () => {
    expect(composeIndex({ name: "idx_u", expr: "u64", type: "bloom_filter", params: "0.01", granularity: 3 }))
      .toBe("INDEX idx_u u64 TYPE bloom_filter(0.01) GRANULARITY 3");
  });
  it("renders an index without params or granularity", () => {
    expect(composeIndex({ name: "idx_m", expr: "u64 * i32", type: "minmax" }))
      .toBe("INDEX idx_m u64 * i32 TYPE minmax");
  });
  it("renders a projection", () => {
    expect(composeProjection({ name: "by_day", select: "SELECT day, count() GROUP BY day" }))
      .toBe("PROJECTION by_day (SELECT day, count() GROUP BY day)");
  });
});

describe("validateSpec", () => {
  const base = {
    table: "events", columns: [{ name: "id", type: "UInt64" }], engine: "MergeTree()", orderBy: "id",
  };
  it("passes a valid spec", () => {
    expect(validateSpec(base)).toEqual([]);
  });
  it("flags a missing table and columns", () => {
    const e = validateSpec({ columns: [], orderBy: "id" });
    expect(e.some((x) => /Table name/.test(x))).toBe(true);
    expect(e.some((x) => /one column/.test(x))).toBe(true);
  });
  it("requires an ORDER BY or PRIMARY KEY", () => {
    const e = validateSpec({ ...base, orderBy: "", primaryKey: "" });
    expect(e.some((x) => /ORDER BY or PRIMARY KEY/.test(x))).toBe(true);
  });
  it("flags a primary key that is not a prefix", () => {
    const e = validateSpec({ ...base, orderBy: "(a, b)", primaryKey: "(a, c)" });
    expect(e.some((x) => /prefix/.test(x))).toBe(true);
  });
});

describe("composeCreateTable", () => {
  it("assembles a full statement in clause order", () => {
    const sql = composeCreateTable({
      ifNotExists: true,
      database: "analytics",
      table: "events",
      onCluster: "main",
      columns: [
        { name: "id", type: "UInt64" },
        { name: "country", type: "LowCardinality(String)" },
        { name: "event_date", type: "Date" },
      ],
      indexes: [{ name: "idx_c", expr: "country", type: "set", params: "100", granularity: 2 }],
      projections: [{ name: "by_country", select: "SELECT country, count() GROUP BY country" }],
      engine: "MergeTree()",
      orderBy: "(country, event_date, id)",
      primaryKey: "(country, event_date)",
      partitionBy: "toYYYYMM(event_date)",
      sampleBy: "id",
      ttl: "event_date + INTERVAL 90 DAY",
      settings: "index_granularity = 8192",
    });
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS analytics.events ON CLUSTER main");
    expect(sql).toContain("INDEX idx_c country TYPE set(100) GRANULARITY 2");
    expect(sql).toContain("PROJECTION by_country (SELECT country, count() GROUP BY country)");
    // Clause order: ENGINE, ORDER BY, PARTITION BY, PRIMARY KEY, SAMPLE BY, TTL, SETTINGS
    const order = ["ENGINE = MergeTree()", "ORDER BY (country, event_date, id)", "PARTITION BY toYYYYMM(event_date)", "PRIMARY KEY (country, event_date)", "SAMPLE BY id", "TTL event_date + INTERVAL 90 DAY", "SETTINGS index_granularity = 8192"];
    let idx = -1;
    for (const piece of order) {
      const at = sql.indexOf(piece);
      expect(at).toBeGreaterThan(idx);
      idx = at;
    }
  });

  it("defaults ORDER BY to tuple() and omits optional clauses", () => {
    const sql = composeCreateTable({
      table: "t", columns: [{ name: "a", type: "Int32" }], engine: "MergeTree()", orderBy: "",
    });
    expect(sql).toContain("ORDER BY tuple()");
    expect(sql).not.toContain("PARTITION BY");
    expect(sql).not.toContain("SAMPLE BY");
  });

  it("promotes a lone primary key to ORDER BY without a separate PRIMARY KEY clause", () => {
    const sql = composeCreateTable({
      table: "t", columns: [{ name: "a", type: "Int32" }], engine: "MergeTree()",
      orderBy: "", primaryKey: "a",
    });
    expect(sql).toContain("ORDER BY a");
    expect(sql).not.toContain("PRIMARY KEY");
  });
});

describe("catalogs", () => {
  it("exposes the four default kinds and the skip index types", () => {
    expect(DEFAULT_KINDS).toEqual(["DEFAULT", "MATERIALIZED", "ALIAS", "EPHEMERAL"]);
    expect(SKIP_INDEX_TYPES.map((t) => t.value)).toContain("bloom_filter");
    expect(SKIP_INDEX_TYPES.map((t) => t.value)).toContain("minmax");
  });
});

describe("composeCreateTable: Distributed", () => {
  it("emits only ENGINE for a Distributed table (no MergeTree clauses)", () => {
    const sql = composeCreateTable({
      database: "db", table: "events", columns: [{ name: "a", type: "Int32" }],
      engine: "Distributed(main, db, events_local, rand())",
      orderBy: "a", partitionBy: "toYYYYMM(d)",
    });
    expect(sql).toContain("ENGINE = Distributed(main, db, events_local, rand())");
    expect(sql).not.toContain("ORDER BY");
    expect(sql).not.toContain("PARTITION BY");
  });
});
