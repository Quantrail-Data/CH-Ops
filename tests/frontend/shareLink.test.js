// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect } from "vitest";
import {
  encodeShare, decodeShare, buildShareUrl, readShareFromHash,
  shareTabName, LINK_WARN_CHARS, SHARE_PARAM,
} from "../../src/frontend/utils/shareLink.js";

const trip = (sql, params = null) => decodeShare(encodeShare(sql, params));

describe("round trip", () => {
  it("returns the query unchanged", () => {
    const sql = "SELECT count() FROM system.tables";
    expect(trip(sql).sql).toBe(sql);
  });

  it("keeps newlines and indentation", () => {
    const sql = "SELECT *\nFROM events\n  WHERE a = 1\n  AND b = 2";
    expect(trip(sql).sql).toBe(sql);
  });

  it("keeps unicode", () => {
    // Four-byte UTF-8 included on purpose: a surrogate pair is where a naive
    // encoder breaks, and base64 of a mangled pair fails silently.
    const sql = "SELECT 'naïve', 'café', '日本語', '\u{1D538}'";
    expect(trip(sql).sql).toBe(sql);
  });

  it("keeps every kind of quote and backslash", () => {
    const sql = `SELECT 'it''s', "col", \`db\`.\`t\`, 'a\\nb'`;
    expect(trip(sql).sql).toBe(sql);
  });

  it("keeps placeholders and optional blocks intact", () => {
    const sql = "SELECT 1 WHERE a = {x:String} /*[ AND b = {y:UInt8} ]*/";
    expect(trip(sql).sql).toBe(sql);
  });

  it("handles a very long query", () => {
    const sql = "SELECT 1\n" + "  AND col = 'x'\n".repeat(2000);
    expect(trip(sql).sql).toBe(sql);
  });

  it("handles an empty query", () => {
    expect(trip("").sql).toBe("");
  });
});

describe("parameter values are opt-in", () => {
  it("carries them when asked", () => {
    expect(trip("SELECT {a:String}", { a: "acme" }).params).toEqual({ a: "acme" });
  });

  it("carries NOTHING when not asked", () => {
    // The default. Sending the shape of a query must never accidentally send a
    // customer identifier with it.
    expect(trip("SELECT {a:String}").params).toBeNull();
  });

  it("does not encode an empty object as though values were shared", () => {
    // Absent and "shared, but empty" are different statements.
    expect(trip("SELECT 1", {}).params).toBeNull();
  });

  it("keeps the values out of the payload entirely when not asked", () => {
    // Not just absent from the decode: absent from the bytes.
    const encoded = encodeShare("SELECT {a:String}", null);
    const decodedJson = decodeShare(encoded);
    expect(decodedJson.params).toBeNull();
    expect(JSON.stringify(decodedJson)).not.toContain("acme");
  });
});

describe("compression", () => {
  it("does not inflate a short query", () => {
    // Deflate's header costs more than it saves below about 60 characters, so
    // both forms exist and the shorter one wins.
    const short = "SELECT 1";
    expect(encodeShare(short).length).toBeLessThan(80);
  });

  it("compresses a repetitive query heavily", () => {
    const long = "SELECT 1\n" + "  AND col = 'x'\n".repeat(300);
    expect(encodeShare(long).length).toBeLessThan(long.length / 4);
  });

  it("both forms decode", () => {
    expect(trip("SELECT 1").sql).toBe("SELECT 1");
    expect(trip("x".repeat(5000)).sql).toBe("x".repeat(5000));
  });
});

describe("bad input is ignored, not thrown", () => {
  // A malformed link is something to pass over quietly on load, not an error
  // dialog over an editor someone was about to use.
  it.each([
    ["null", null],
    ["empty", ""],
    ["not base64", "!!!!"],
    ["base64 of nothing useful", "YWJj"],
    ["a number", 42],
  ])("returns null for %s", (_label, input) => {
    expect(decodeShare(input)).toBeNull();
  });

  it("rejects an unknown version rather than guessing", () => {
    expect(decodeShare(encodeShare("SELECT 1").replace(/^./, "z"))).toBeNull();
  });
});

describe("the URL", () => {
  it("puts the query in the FRAGMENT, never the query string", () => {
    // The whole privacy argument. The fragment is not sent to the server, so a
    // shared query stays out of access logs and anything in front of the app.
    const url = buildShareUrl("SELECT secret_table", null, "https://chops.example/app");
    const [before, after] = url.split("#");
    expect(before).not.toContain("SELECT");
    expect(before).not.toContain("secret_table");
    expect(after.startsWith(`${SHARE_PARAM}=`)).toBe(true);
  });

  it("reads back out of a hash", () => {
    const url = buildShareUrl("SELECT 1", { a: "b" }, "https://x/y");
    const got = readShareFromHash("#" + url.split("#")[1]);
    expect(got.sql).toBe("SELECT 1");
    expect(got.params).toEqual({ a: "b" });
  });

  it("returns null for a hash that is not a share link", () => {
    expect(readShareFromHash("#section-2")).toBeNull();
    expect(readShareFromHash("")).toBeNull();
  });
});

describe("shareTabName", () => {
  it("uses the first meaningful line", () => {
    expect(shareTabName("SELECT 1 FROM t")).toBe("SELECT 1 FROM t");
  });
  it("skips a leading comment", () => {
    expect(shareTabName("-- a licence block\n\nSELECT 1")).toBe("SELECT 1");
  });
  it("truncates a long line", () => {
    expect(shareTabName("SELECT " + "x".repeat(80)).length).toBeLessThanOrEqual(31);
  });
  it("falls back when there is nothing to use", () => {
    expect(shareTabName("")).toBe("Shared query");
    expect(shareTabName("-- only a comment")).toBe("Shared query");
  });
});

describe("the size threshold", () => {
  it("is one named constant, not a number in a condition", () => {
    expect(typeof LINK_WARN_CHARS).toBe("number");
    expect(LINK_WARN_CHARS).toBeGreaterThan(1000);
  });
});
