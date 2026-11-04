// startupOrder.test.js - The steps in server.js at start run in the right order.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const server = readFileSync(
  join(import.meta.dir, "../../src/backend/server.js"),
  "utf8",
);

describe("server start order", () => {
  it("runs the migration before it encrypts the old secrets", () => {
    // On a new database the tables exist only after the migration.
    const migrationAt = server.indexOf('await import("./db/migrate.js")');
    const legacySecretsAt = server.indexOf("encryptLegacySecrets();");
    const signingKeysAt = server.indexOf("encryptStoredSigningKeys();");
    expect(migrationAt).toBeGreaterThan(-1);
    expect(legacySecretsAt).toBeGreaterThan(migrationAt);
    expect(signingKeysAt).toBeGreaterThan(migrationAt);
  });
});
