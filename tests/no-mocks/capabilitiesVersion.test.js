// capabilitiesVersion.test.js - reading the server version out of a probe row
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { describe, it, expect } from "bun:test";


function readVersion(rows) {
  const firstRow = rows?.[0];
  return firstRow ? String(Object.values(firstRow)[0]) : null;
}

describe("reading the version from the row", () => {
  it("reads a column whose name has brackets", () => {
    expect(readVersion([{ "version()": "24.8.14.10459" }])).toBe("24.8.14.10459");
  });

  it("reads it whatever the column is called", () => {
    expect(readVersion([{ v: "26.7.1.100" }])).toBe("26.7.1.100");
  });

  it("gives null for no rows", () => {
    expect(readVersion([])).toBeNull();
    expect(readVersion(null)).toBeNull();
    expect(readVersion(undefined)).toBeNull();
  });

  it("always gives text", () => {
    expect(typeof readVersion([{ "version()": 26.7 }])).toBe("string");
  });
});

describe("comparing versions", () => {
  function isAtLeast(version, major, minor) {
    if (typeof version !== "string") return false;
    const parts = version.split(".");
    const gotMajor = parseInt(parts[0], 10);
    const gotMinor = parseInt(parts[1], 10);
    if (!Number.isInteger(gotMajor) || !Number.isInteger(gotMinor)) return false;
    if (gotMajor !== major) return gotMajor > major;
    return gotMinor >= minor;
  }

  it("accepts the version the feature came in", () => {
    expect(isAtLeast("26.7.1.100", 26, 7)).toBe(true);
  });

  it("accepts a later version", () => {
    expect(isAtLeast("26.8.2.1", 26, 7)).toBe(true);
    expect(isAtLeast("27.1.0.0", 26, 7)).toBe(true);
  });

  it("refuses an earlier version", () => {
    expect(isAtLeast("26.3.0.1", 26, 7)).toBe(false);
    expect(isAtLeast("25.9.9.9", 26, 7)).toBe(false);
  });

  it("refuses a version it cannot read", () => {
    expect(isAtLeast(null, 26, 7)).toBe(false);
    expect(isAtLeast("", 26, 7)).toBe(false);
    expect(isAtLeast("not a version", 26, 7)).toBe(false);
    expect(isAtLeast("26", 26, 7)).toBe(false);
  });
});