// trustedCa.test.js - storing certificate authorities and building the bundle
// Copyright (C) 2026 Quantrail™ Data Private Limited

// In tests/db because it needs the real trustedCa service against a real
// database. Files in tests/backend mock db/index.js, and mock.module applies to
// the whole test process, so sharing an invocation with them would replace the
// database this file supplies.

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../../src/backend/db/schema.js";

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE trusted_ca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pem TEXT NOT NULL,
    subject TEXT,
    issuer TEXT,
    fingerprint TEXT,
    not_before TEXT,
    not_after TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

const db = drizzle(sqlite, { schema });

mock.module("../../src/backend/db/index.js", () => ({
  db,
  appSettings: schema.appSettings,
  alertRules: schema.alertRules,
  alertChannels: schema.alertChannels,
  alertRuleChannels: schema.alertRuleChannels,
  dashboards: schema.dashboards,
  charts: schema.charts,
  appUsers: schema.appUsers,
  clusters: schema.clusters,
  clusterNodes: schema.clusterNodes,
  k8sConnections: schema.k8sConnections,
  trustedCas: schema.trustedCas,
  rawSqlite: sqlite,
  assertDatabaseReadable: () => {},
}));

const {
  listTrustedCas,
  addTrustedCa,
  deleteTrustedCa,
  getCaBundle,
  parsePem,
} = await import("../../src/backend/services/trustedCa.js");

// Real certificates, generated once. Using openssl rather than a fixture so
// nothing expires and breaks this suite in a year.
function makeCa(cn) {
  const dir = mkdtempSync(join(tmpdir(), "ca-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", join(dir, "ca.key"), "-out", join(dir, "ca.crt"),
    "-days", "365", "-subj", `/CN=${cn}`,
  ], { stdio: "ignore" });
  return readFileSync(join(dir, "ca.crt"), "utf8");
}

function makeServerCert() {
  const dir = mkdtempSync(join(tmpdir(), "srv-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", join(dir, "s.key"), "-out", join(dir, "s.crt"),
    "-days", "365", "-subj", "/CN=localhost",
    "-addext", "basicConstraints=CA:FALSE",
  ], { stdio: "ignore" });
  return readFileSync(join(dir, "s.crt"), "utf8");
}

const caA = makeCa("Test CA A");
const caB = makeCa("Test CA B");
const serverCert = makeServerCert();

beforeEach(() => {
  sqlite.exec("DELETE FROM trusted_ca");
  // The bundle is cached in the module, and the delete above bypasses the
  // functions that clear it.
  deleteTrustedCa(-1);
});

describe("storing a certificate authority", () => {
  it("saves it with its parsed fields", () => {
    addTrustedCa("Authority A", caA);

    const rows = listTrustedCas();
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Authority A");
    expect(rows[0].subject).toContain("Test CA A");
    expect(rows[0].fingerprint).toBeTruthy();
    expect(rows[0].notAfter).toBeTruthy();
  });

  it("stores the certificate as plain text, not encrypted", () => {
    // A CA certificate is public by design. Encrypting it would tie it to
    // SESSION_SECRET for no benefit, and it would be lost on a rotation.
    addTrustedCa("Authority A", caA);
    const raw = sqlite.query("SELECT pem FROM trusted_ca").get();
    expect(raw.pem).toContain("BEGIN CERTIFICATE");
  });

  it("refuses the same certificate twice", () => {
    addTrustedCa("Authority A", caA);
    // Named differently, same bytes. The fingerprint is what catches it.
    expect(() => addTrustedCa("Same one again", caA)).toThrow(/already stored/);
    expect(listTrustedCas().length).toBe(1);
  });

  it("names the existing entry when refusing a duplicate", () => {
    addTrustedCa("Authority A", caA);
    try {
      addTrustedCa("Different name", caA);
    } catch (err) {
      // Without the name, the user has to hunt through the list to find it.
      expect(err.message).toContain("Authority A");
    }
  });

  it("refuses a server certificate", () => {
    // The mistake people actually make: ca.crt and server.crt sit next to each
    // other and only one of them works.
    expect(() => addTrustedCa("Wrong file", serverCert)).toThrow(/not a certificate authority/);
    expect(listTrustedCas().length).toBe(0);
  });

  it("refuses rubbish", () => {
    expect(() => addTrustedCa("Nonsense", "hello")).toThrow();
    expect(listTrustedCas().length).toBe(0);
  });
});

describe("the bundle sent on every connection", () => {
  it("is null when nothing is stored", () => {
    // Callers must then leave the tls option out entirely rather than passing
    // an empty value, which is untested territory in Bun.
    expect(getCaBundle()).toBeNull();
  });

  it("contains one certificate when one is stored", () => {
    addTrustedCa("Authority A", caA);
    const bundle = getCaBundle();
    expect(bundle).toContain("BEGIN CERTIFICATE");
    expect(bundle.match(/BEGIN CERTIFICATE/g).length).toBe(1);
  });

  it("joins several certificates", () => {
    addTrustedCa("Authority A", caA);
    addTrustedCa("Authority B", caB);
    const bundle = getCaBundle();
    expect(bundle.match(/BEGIN CERTIFICATE/g).length).toBe(2);
  });

  it("changes as soon as one is added", () => {
    // This is what makes a new authority work without restarting CHOps.
    expect(getCaBundle()).toBeNull();
    addTrustedCa("Authority A", caA);
    expect(getCaBundle()).toContain("BEGIN CERTIFICATE");
  });

  it("changes as soon as one is removed", () => {
    addTrustedCa("Authority A", caA);
    const id = listTrustedCas()[0].id;

    deleteTrustedCa(id);

    expect(getCaBundle()).toBeNull();
    expect(listTrustedCas().length).toBe(0);
  });

  it("drops only the one removed", () => {
    addTrustedCa("Authority A", caA);
    addTrustedCa("Authority B", caB);
    const a = listTrustedCas().find(r => r.name === "Authority A");

    deleteTrustedCa(a.id);

    const bundle = getCaBundle();
    expect(bundle.match(/BEGIN CERTIFICATE/g).length).toBe(1);
    expect(listTrustedCas()[0].name).toBe("Authority B");
  });
});

describe("parsePem", () => {
  it("returns the fields the list needs", () => {
    const p = parsePem(caA);
    expect(p.subject).toContain("Test CA A");
    expect(p.issuer).toContain("Test CA A");
    expect(p.fingerprint).toMatch(/^[0-9A-F:]+$/);
    expect(p.notBefore).toBeTruthy();
    expect(p.notAfter).toBeTruthy();
  });
});
