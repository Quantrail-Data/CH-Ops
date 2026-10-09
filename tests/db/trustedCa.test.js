// trustedCa.test.js - storing certificate authorities and building the bundle
// Copyright (C) 2026 Quantrail™ Data Private Limited

// In tests/db because it needs the real trustedCa service against a real
// database. Files in tests/backend mock db/index.js, and mock.module applies to
// the whole test process, so sharing an invocation with them would replace the
// database this file supplies.

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { generateKeyPairSync, randomBytes, sign as signData } from "node:crypto";
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

function encodeLength(length) {
  if (length < 128) return Buffer.from([length]);

  const bytes = [];
  while (length > 0) {
    bytes.unshift(length & 0xff);
    length >>>= 8;
  }

  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, ...values) {
  const body = Buffer.concat(values);
  return Buffer.concat([
    Buffer.from([tag]),
    encodeLength(body.length),
    body,
  ]);
}

function encodeOidValue(value) {
  const bytes = [value & 0x7f];
  value = Math.floor(value / 128);

  while (value > 0) {
    bytes.unshift(0x80 | (value & 0x7f));
    value = Math.floor(value / 128);
  }

  return bytes;
}

function derOid(value) {
  const parts = value.split(".").map(Number);
  const bytes = encodeOidValue(parts[0] * 40 + parts[1]);

  for (const part of parts.slice(2)) {
    bytes.push(...encodeOidValue(part));
  }

  return der(0x06, Buffer.from(bytes));
}

function derCertificateTime(date) {
  const pad = value => String(value).padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  if (year >= 1950 && year <= 2049) {
    const twoDigitYear = pad(year % 100);
    return der(
      0x17,
      Buffer.from(`${twoDigitYear}${month}${day}${hours}${minutes}${seconds}Z`),
    );
  }

  return der(
    0x18,
    Buffer.from(`${year}${month}${day}${hours}${minutes}${seconds}Z`),
  );
}

function makeCertificate(cn, isCa) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 65537,
  });

  let serial = randomBytes(16);
  while (serial[0] === 0) {
    serial = randomBytes(16);
  }
  if (serial[0] & 0x80) {
    serial = Buffer.concat([Buffer.from([0]), serial]);
  }

  const algorithm = der(
    0x30,
    derOid("1.2.840.113549.1.1.11"),
    der(0x05),
  );

  const name = der(
    0x30,
    der(
      0x31,
      der(
        0x30,
        derOid("2.5.4.3"),
        der(0x0c, Buffer.from(cn, "utf8")),
      ),
    ),
  );

  const notBefore = new Date(Date.now() - 60_000);
  const notAfter = new Date();
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + 100);

  const validity = der(
    0x30,
    derCertificateTime(notBefore),
    derCertificateTime(notAfter),
  );

  const basicConstraints = der(
    0x30,
    derOid("2.5.29.19"),
    der(0x01, Buffer.from([0xff])),
    der(
      0x04,
      isCa
        ? der(0x30, der(0x01, Buffer.from([0xff])))
        : der(0x30),
    ),
  );

  const extensions = der(0xa3, der(0x30, basicConstraints));

  const tbsCertificate = der(
    0x30,
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    algorithm,
    name,
    validity,
    name,
    publicKey.export({ type: "spki", format: "der" }),
    extensions,
  );

  const signature = signData("sha256", tbsCertificate, privateKey);
  const certificate = der(
    0x30,
    tbsCertificate,
    algorithm,
    der(0x03, Buffer.concat([Buffer.from([0]), signature])),
  );
  const encoded = certificate.toString("base64").match(/.{1,64}/g).join("\n");

  return `-----BEGIN CERTIFICATE-----\n${encoded}\n-----END CERTIFICATE-----\n`;
}

function makeCa(cn) {
  return makeCertificate(cn, true);
}

function makeServerCert() {
  return makeCertificate("localhost", false);
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
    expect(bundle).toContain(caA.trim());
    expect(bundle.match(/BEGIN CERTIFICATE/g).length).toBeGreaterThan(50);
  });

  it("joins several certificates", () => {
    addTrustedCa("Authority A", caA);
    addTrustedCa("Authority B", caB);
    const bundle = getCaBundle();
    expect(bundle).toContain(caA.trim());
    expect(bundle).toContain(caB.trim());
    expect(bundle.match(/BEGIN CERTIFICATE/g).length).toBeGreaterThan(50);
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
    expect(bundle).not.toContain(caA.trim());
    expect(bundle).toContain(caB.trim());
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
