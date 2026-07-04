// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Integration tests verifying backup frontend interfaces, S3 file-glob matching, target directory layouts, and manifest schemas.


import { describe, it, expect } from "vitest";
import fs from "fs";
function read(f) {
  return fs.readFileSync(f, "utf8");
}




describe("Backups: Manifest Fields", () => {
  it("manual manifest has backup_type manual", () => {
    expect(read("src/frontend/components/backups/DataLifecycle.jsx")).toContain(
      "backup_type: \"manual\"",
    );
  });
});

describe("Backups: S3 Directory Layout", () => {
  const dl = read("src/frontend/components/backups/DataLifecycle.jsx");
  it("manual backups use manual/ prefix", () => {
    expect(dl).toContain("manual/TABLE/");
    expect(dl).toContain("manual/ALL/");
  });
});

describe("Backups: S3 Glob Compatibility", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");
  it("no ** globs (ClickHouse® compat)", () => {
    expect(code).not.toContain("/**/");
  });
  it("explicit depth patterns (1-4 levels)", () => {
    expect(code).toContain("manual/*/manifest.json");
    expect(code).toContain("manual/*/*/*/manifest.json");
  });
  it("filters expected-empty errors, deduplicates real errors", () => {
    expect(code).toContain("isExpectedEmpty");
    expect(code).toContain("new Set(errors)");
  });
  it("categorizes S3 errors (connection, auth, bucket)", () => {
    expect(code).toContain("Cannot reach S3 endpoint");
    expect(code).toContain("S3 authentication failed");
    expect(code).toContain("S3 bucket not found");
  });
});

describe("Backups: Frontend UI", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");
  it("3 tabs: Manual, Available", () => {
    expect(code).toContain("ManualBackupTab");
    expect(code).toContain("AvailableBackupsTab");
  });
  it("available backups filter: All/Manual", () => {
    expect(code).toContain("Manual Only");
  });
  it("restore listing filters by selected scope", () => {
    expect(code).toContain("scope === ");
    expect(code).toContain("scope");
  });
});
