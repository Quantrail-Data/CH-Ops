// rbac-profiles-query.test.js - The Profiles list reads columns that current ClickHouse has.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync("src/frontend/components/rbac/RbacProfiles.jsx", "utf8");
const listQuery = source.match(/"SELECT profile_name[^"]*FROM system\.settings_profile_elements[^"]*"/)?.[0] || "";

describe("Settings Profiles list", () => {
  it("reads writability, because system.settings_profile_elements has no readonly column", () => {
    expect(listQuery).toContain("writability");
    expect(listQuery).not.toMatch(/\breadonly\b/);
  });

  it("lists only the rows of profiles", () => {
    expect(listQuery).toContain("WHERE profile_name IS NOT NULL");
  });
});
