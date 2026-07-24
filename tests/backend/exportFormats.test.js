// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G
import { describe, test, expect } from "bun:test";
import {
  FORMATS, FORMAT_GROUPS, COMPRESSIONS, SELF_COMPRESSED, OPTIONS,
  findFormat, findCompression, optionsForFormat,
} from "../../src/shared/exportFormats.js";

describe("format catalogue", () => {
  test("every format has an id, label, extension and group", () => {
    for (const f of FORMATS) {
      expect(typeof f.id).toBe("string");
      expect(f.id.length).toBeGreaterThan(0);
      expect(typeof f.label).toBe("string");
      expect(typeof f.ext).toBe("string");
      expect(f.ext).not.toContain(".");
      expect(typeof f.text).toBe("boolean");
    }
  });

  test("format ids are unique", () => {
    const ids = FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every format belongs to a declared group", () => {
    for (const f of FORMATS) expect(FORMAT_GROUPS).toContain(f.group);
  });

  test("every group has at least one format, so no empty headings appear", () => {
    for (const g of FORMAT_GROUPS) {
      expect(FORMATS.some((f) => f.group === g)).toBe(true);
    }
  });

  test("the default format is present and is CSV with headers", () => {
    expect(findFormat("CSVWithNames")).toBeTruthy();
    expect(findFormat("CSVWithNames").ext).toBe("csv");
  });


  test("formats that cannot work from a generic wizard are excluded", () => {
    const banned = ["Pretty", "PrettyCompact", "Protobuf", "CapnProto", "Template", "CustomSeparated", "Npy", "Prometheus", "Null"];
    for (const id of banned) expect(FORMATS.find((f) => f.id === id)).toBeUndefined();
  });

  test("text formats are the ones a byte order mark applies to", () => {
    expect(findFormat("CSVWithNames").text).toBe(true);
    expect(findFormat("TabSeparatedWithNames").text).toBe(true);
    expect(findFormat("Parquet").text).toBe(false);
    expect(findFormat("ORC").text).toBe(false);
  });

  test("findFormat returns null for something unknown", () => {
    expect(findFormat("NotAFormat")).toBeNull();
    expect(findFormat(undefined)).toBeNull();
  });
});

describe("compression catalogue", () => {
  test("offers exactly the agreed options", () => {
    expect(COMPRESSIONS.map((c) => c.id)).toEqual(["none", "gzip", "zstd", "zip", "targz"]);
  });

  test("none adds no extension, the rest start with a dot", () => {
    expect(findCompression("none").ext).toBe("");
    for (const c of COMPRESSIONS.filter((x) => x.id !== "none")) {
      expect(c.ext.startsWith(".")).toBe(true);
    }
  });

  test("findCompression returns null for something unknown", () => {
    expect(findCompression("rar")).toBeNull();
  });

  test("the self-compressed list only names real formats", () => {
    for (const id of SELF_COMPRESSED) expect(findFormat(id)).toBeTruthy();
  });
});

describe("advanced options", () => {
  test("every option has a key, label, type and default", () => {
    for (const o of OPTIONS) {
      expect(typeof o.key).toBe("string");
      expect(typeof o.label).toBe("string");
      expect(["bool", "select", "text", "number"]).toContain(o.type);
      expect(o.def).toBeDefined();
    }
  });

  test("option keys are unique", () => {
    const keys = OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  
  test("keys are plain setting names", () => {
    for (const o of OPTIONS) expect(/^[a-z0-9_]+$/.test(o.key)).toBe(true);
  });

  test("every option targets either all formats or real ones", () => {
    for (const o of OPTIONS) {
      if (o.formats === "*") continue;
      expect(Array.isArray(o.formats)).toBe(true);
      for (const id of o.formats) expect(findFormat(id)).toBeTruthy();
    }
  });

  test("a select option's default is one of its choices", () => {
    for (const o of OPTIONS.filter((x) => x.type === "select")) {
      expect(o.choices).toContain(o.def);
    }
  });

  test("optionsForFormat only returns options that apply", () => {
    const csv = optionsForFormat("CSVWithNames").map((o) => o.key);
    expect(csv).toContain("format_csv_delimiter");
    expect(csv).not.toContain("output_format_parquet_compression_method");

    const parquet = optionsForFormat("Parquet").map((o) => o.key);
    expect(parquet).toContain("output_format_parquet_compression_method");
    expect(parquet).not.toContain("format_csv_delimiter");
  });

  test("options marked for every format appear whatever is chosen", () => {
    const everywhere = OPTIONS.filter((o) => o.formats === "*").map((o) => o.key);
    for (const f of FORMATS) {
      const keys = optionsForFormat(f.id).map((o) => o.key);
      for (const k of everywhere) expect(keys).toContain(k);
    }
  });

  test("an unknown format simply has no format-specific options", () => {
    const keys = optionsForFormat("NotAFormat").map((o) => o.key);
    expect(keys).toEqual(OPTIONS.filter((o) => o.formats === "*").map((o) => o.key));
  });
});
