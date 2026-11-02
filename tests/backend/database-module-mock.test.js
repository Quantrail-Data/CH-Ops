// database-module-mock.test.js - The shared database mock gives every export of db/index.js.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { Glob } from "bun";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { databaseModuleMock } from "../db/databaseModuleMock.js";

const databaseSource = readFileSync("src/backend/db/index.js", "utf8");
const exportedNames = [...databaseSource.matchAll(/^export (?:const|function|let) (\w+)/gm)].map(
  (match) => match[1],
);

describe("databaseModuleMock", () => {
  it("gives every export of db/index.js, so a mock never misses a name", () => {
    const sqlite = new Database(":memory:");
    const mockNames = Object.keys(databaseModuleMock(drizzle(sqlite), sqlite));
    expect(exportedNames.length).toBeGreaterThan(10);
    expect(mockNames.sort()).toEqual([...exportedNames].sort());
  });

  it("is the only mock of db/index.js in tests/db", () => {
    const testFiles = new Glob("tests/db/*.test.js").scanSync();
    for (const testFile of testFiles) {
      const source = readFileSync(testFile, "utf8");
      if (!source.includes("db/index.js")) continue;
      expect(source).toContain("databaseModuleMock(db, sqlite)");
    }
  });
});
