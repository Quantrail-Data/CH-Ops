// Contributors - Kathirdhasan, Praveen kumar, Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect } from "vitest";
import {
  toJson, toMarkdown, toSql, parseImport, planImport, applyImport,
  uniqueName, summarise, exportFileName, FORMATS, CHOICES,
} from "../../src/frontend/utils/bookmarkExport.js";

const A = { name: "errors", sql: "SELECT 1", createdAt: "2026-07-20T09:00:00Z",
            defaults: { level: "error" } };
const B = { name: "tables", sql: "SELECT 2", createdAt: "2026-07-21T09:00:00Z" };
const LIST = [A, B];

describe("JSON", () => {
  it("round-trips through import unchanged", () => {
    const back = parseImport(toJson(LIST));
    expect(back.ok).toBe(true);
    expect(back.bookmarks).toEqual([
      { name: "errors", sql: "SELECT 1", createdAt: A.createdAt, defaults: { level: "error" } },
      { name: "tables", sql: "SELECT 2", createdAt: B.createdAt },
    ]);
  });

  it("keeps the defaults, which is the reason it is the importable one", () => {
    expect(parseImport(toJson([A])).bookmarks[0].defaults).toEqual({ level: "error" });
  });

  it("omits an empty defaults object rather than writing {}", () => {
    expect(toJson([{ name: "x", sql: "y", defaults: {} }])).not.toContain("defaults");
  });
});

describe("Markdown", () => {
  it("contains every query with its name", () => {
    const md = toMarkdown(LIST);
    expect(md).toContain("## errors");
    expect(md).toContain("## tables");
    expect(md).toContain("SELECT 1");
    expect(md).toContain("SELECT 2");
  });

  it("shows defaults as prose, since a human is reading it", () => {
    expect(toMarkdown([A])).toContain("Defaults: level = error");
  });

  it("uses a four-backtick fence, so a query containing a fence cannot end it early", () => {
    const md = toMarkdown([{ name: "x", sql: "SELECT '```'" }]);
    const body = md.slice(md.indexOf("````sql"));
    expect(body.match(/````/g)).toHaveLength(2);
  });
});

describe("SQL", () => {
  it("contains every query with its name as a comment", () => {
    const sql = toSql(LIST);
    expect(sql).toContain("-- errors");
    expect(sql).toContain("SELECT 1;");
  });

  it("flattens a multi-line name, which would otherwise escape the comment", () => {
    // A newline ends a -- comment, turning the rest of the name into SQL.
    const sql = toSql([{ name: "line one\nDROP TABLE t", sql: "SELECT 1" }]);
    expect(sql).toContain("-- line one DROP TABLE t");
    expect(sql.split("\n")[0]).toContain("DROP TABLE");
  });

  it("does not double a semicolon the query already ends with", () => {
    expect(toSql([{ name: "x", sql: "SELECT 1;" }])).toContain("SELECT 1;\n");
    expect(toSql([{ name: "x", sql: "SELECT 1;" }])).not.toContain(";;");
  });

  it("drops the defaults, which is why it is one-way", () => {
    expect(toSql([A])).not.toContain("level");
  });
});

describe("parseImport", () => {
  it("rejects a non-JSON file with a message, not a throw", () => {
    const r = parseImport("-- just some sql\nSELECT 1;");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JSON/);
  });

  it("rejects JSON that is not an export", () => {
    expect(parseImport('{"hello":"world"}').ok).toBe(false);
  });

  it("accepts a bare array as well as the wrapped form", () => {
    expect(parseImport(JSON.stringify([A])).ok).toBe(true);
  });

  it("refuses a newer format version rather than guessing", () => {
    const r = parseImport(JSON.stringify({ version: 99, bookmarks: [A] }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/newer version/);
  });

  it("skips entries with no name or no SQL", () => {
    const r = parseImport(JSON.stringify({ bookmarks: [A, { name: "x" }, { sql: "y" }, null] }));
    expect(r.bookmarks).toHaveLength(1);
  });

  it("reports an empty file rather than importing nothing silently", () => {
    expect(parseImport(JSON.stringify({ bookmarks: [] })).ok).toBe(false);
  });
});

describe("planImport", () => {
  it("marks an unseen name as new", () => {
    const plan = planImport([A], [B]);
    expect(plan[0].status).toBe("new");
  });

  it("marks a byte-identical query as identical, so nothing is asked", () => {
    // There is nothing to decide between two things that are the same.
    expect(planImport([A], [A])[0].status).toBe("identical");
  });

  it("treats a defaults difference as a conflict, not as identical", () => {
    const changed = { ...A, defaults: { level: "warn" } };
    expect(planImport([A], [changed])[0].status).toBe("conflict");
  });

  it("marks a same-name different-query as a conflict", () => {
    expect(planImport([A], [{ ...A, sql: "SELECT 99" }])[0].status).toBe("conflict");
  });

  it("ignores trailing whitespace when comparing", () => {
    expect(planImport([A], [{ ...A, sql: "SELECT 1  " }])[0].status).toBe("identical");
  });

  it("suggests a free name for keep-both", () => {
    expect(planImport([A], [{ ...A, sql: "x" }])[0].copyName).toBe("errors (2)");
  });

  it("does not resolve two incoming entries of one name to the same slot", () => {
    const plan = planImport([A], [{ ...A, sql: "x" }, { ...A, sql: "y" }]);
    expect(plan[0].copyName).not.toBe(plan[1].copyName);
  });

  it("changes nothing by itself", () => {
    const existing = [A];
    planImport(existing, [B]);
    expect(existing).toEqual([A]);
  });
});

describe("applyImport", () => {
  const conflict = { ...A, sql: "SELECT 99" };

  it("adds a new query", () => {
    const out = applyImport([A], planImport([A], [B]));
    expect(out.map((b) => b.name)).toEqual(["errors", "tables"]);
  });

  it("does nothing for an identical one", () => {
    expect(applyImport([A], planImport([A], [A]))).toEqual([A]);
  });

  it("keeps mine by default, so a dismissed dialog changes nothing", () => {
    const out = applyImport([A], planImport([A], [conflict]));
    expect(out).toHaveLength(1);
    expect(out[0].sql).toBe("SELECT 1");
  });

  it("keeps mine when asked", () => {
    const plan = planImport([A], [conflict]);
    const out = applyImport([A], plan, { errors: CHOICES.KEEP });
    expect(out[0].sql).toBe("SELECT 1");
  });

  it("takes theirs when asked", () => {
    const plan = planImport([A], [conflict]);
    const out = applyImport([A], plan, { errors: CHOICES.REPLACE });
    expect(out).toHaveLength(1);
    expect(out[0].sql).toBe("SELECT 99");
  });

  it("keeps both when asked, renaming the incoming one", () => {
    const plan = planImport([A], [conflict]);
    const out = applyImport([A], plan, { errors: CHOICES.BOTH });
    expect(out.map((b) => b.name)).toEqual(["errors", "errors (2)"]);
    expect(out[0].sql).toBe("SELECT 1");
    expect(out[1].sql).toBe("SELECT 99");
  });

  it("does not collide when keep-both happens twice", () => {
    const plan = planImport([A], [{ ...A, sql: "x" }, { ...A, sql: "y" }]);
    const out = applyImport([A], plan, { errors: CHOICES.BOTH });
    const names = out.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never loses an existing bookmark that was not mentioned", () => {
    const out = applyImport([A, B], planImport([A, B], [{ name: "new", sql: "z" }]));
    expect(out.map((b) => b.name)).toContain("tables");
  });

  it("is pure", () => {
    const existing = [A];
    applyImport(existing, planImport(existing, [B]));
    expect(existing).toHaveLength(1);
  });
});

describe("uniqueName", () => {
  it("returns the name when it is free", () => {
    expect(uniqueName("x", ["y"])).toBe("x");
  });
  it("counts up past every taken variant", () => {
    expect(uniqueName("x", ["x", "x (2)", "x (3)"])).toBe("x (4)");
  });
});

describe("summarise", () => {
  it("counts what will happen", () => {
    const plan = planImport([A], [A, B, { ...A, name: "errors", sql: "zz" }]);
    const s = summarise(plan, { errors: CHOICES.REPLACE });
    expect(s.identical).toBe(1);
    expect(s.added).toBe(1);
    expect(s.replaced).toBe(1);
  });
});

describe("file names and formats", () => {
  it("names the file by date and extension", () => {
    const d = new Date("2026-07-26T00:00:00Z");
    expect(exportFileName("markdown", d)).toBe("chops-queries-2026-07-26.md");
    expect(exportFileName("json", d)).toBe("chops-queries-2026-07-26.json");
    expect(exportFileName("sql", d)).toBe("chops-queries-2026-07-26.sql");
  });

  it("falls back to JSON for an id it does not know", () => {
    // Callers only ever pass an id from FORMATS. This pins the behaviour so a
    // typo produces a usable file rather than "undefined" as an extension.
    expect(exportFileName("nonsense")).toMatch(/\.json$/);
  });
  it("offers exactly three, with JSON first", () => {
    expect(FORMATS.map((f) => f.id)).toEqual(["json", "markdown", "sql"]);
  });
});
