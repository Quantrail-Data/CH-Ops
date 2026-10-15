// trustedCa.test.js - unit coverage for trusted CA storage and bundle caching
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { beforeEach, describe, expect, it, mock } from "bun:test";

let rows = [];
let existing = null;
let failReads = false;
const insertValues = mock(() => ({ run: mock(() => {}) }));
const deleteRun = mock(() => {});
const selectAll = mock(() => {
  if (failReads) throw new Error("database unavailable");
  return rows;
});

class FakeX509Certificate {
  constructor(pem) {
    if (pem === "invalid") throw new Error("invalid PEM");
    this.ca = pem !== "server";
    this.validTo = pem === "expired" ? "Jan 1 2000 00:00:00 GMT" : "Jan 1 2099 00:00:00 GMT";
    this.subject = "CN=Test Authority";
    this.issuer = "CN=Test Issuer";
    this.fingerprint256 = "AA:BB:CC";
    this.validFrom = "Jan 1 2020 00:00:00 GMT";
  }
}

mock.module("node:crypto", () => ({
  default: { X509Certificate: FakeX509Certificate },
  X509Certificate: FakeX509Certificate,
}));

mock.module("../../src/backend/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        all: selectAll,
        orderBy: () => ({ all: selectAll }),
        where: () => ({ get: () => existing }),
      }),
    }),
    insert: () => ({ values: insertValues }),
    delete: () => ({ where: () => ({ run: deleteRun }) }),
  },
}));

const {
  addTrustedCa,
  deleteTrustedCa,
  getCaBundle,
  invalidateCaBundle,
  listTrustedCas,
  parsePem,
} = await import("../../src/backend/services/trustedCa.js");

beforeEach(() => {
  rows = [];
  existing = null;
  failReads = false;
  insertValues.mockClear();
  deleteRun.mockClear();
  selectAll.mockClear();
  invalidateCaBundle();
});

describe("parsePem", () => {
  it("returns certificate details for a current CA", () => {
    expect(parsePem("valid")).toEqual({
      subject: "CN=Test Authority",
      issuer: "CN=Test Issuer",
      fingerprint: "AA:BB:CC",
      notBefore: "Jan 1 2020 00:00:00 GMT",
      notAfter: "Jan 1 2099 00:00:00 GMT",
    });
  });

  it("explains invalid PEM input", () => {
    expect(() => parsePem("invalid")).toThrow(/does not look like a certificate/);
  });

  it("rejects a server certificate", () => {
    expect(() => parsePem("server")).toThrow(/not a certificate authority/);
  });

  it("rejects an expired authority", () => {
    expect(() => parsePem("expired")).toThrow(/expired on/);
  });
});

describe("trusted CA storage", () => {
  it("lists rows ordered by the database query", () => {
    rows = [{ name: "Alpha" }];
    expect(listTrustedCas()).toEqual(rows);
  });

  it("trims and stores parsed certificate details", () => {
    addTrustedCa("  Authority A  ", "  valid  ");

    expect(insertValues).toHaveBeenCalledWith({
      name: "Authority A",
      pem: "valid",
      subject: "CN=Test Authority",
      issuer: "CN=Test Issuer",
      fingerprint: "AA:BB:CC",
      notBefore: "Jan 1 2020 00:00:00 GMT",
      notAfter: "Jan 1 2099 00:00:00 GMT",
    });
  });

  it("identifies the existing name when a certificate is already stored", () => {
    existing = { name: "Original Authority" };
    expect(() => addTrustedCa("Another name", "valid")).toThrow(/Original Authority/);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("deletes the requested row", () => {
    deleteTrustedCa(42);
    expect(deleteRun).toHaveBeenCalledTimes(1);
  });
});

describe("getCaBundle", () => {
  it("returns null for an empty store and caches that result", () => {
    expect(getCaBundle()).toBeNull();
    expect(getCaBundle()).toBeNull();
    expect(selectAll).toHaveBeenCalledTimes(1);
  });

  it("joins trimmed PEM blocks and reuses the cached bundle", () => {
    rows = [{ pem: " first " }, { pem: " second\n" }];
    expect(getCaBundle()).toBe("first\nsecond");
    expect(getCaBundle()).toBe("first\nsecond");
    expect(selectAll).toHaveBeenCalledTimes(1);
  });

  it("returns null when the store cannot be read and caches the fallback", () => {
    failReads = true;
    expect(getCaBundle()).toBeNull();
    expect(getCaBundle()).toBeNull();
    expect(selectAll).toHaveBeenCalledTimes(1);
  });

  it("clears a cached bundle after additions, deletions, or explicit invalidation", () => {
    rows = [{ pem: "first" }];
    expect(getCaBundle()).toBe("first");

    rows = [{ pem: "second" }];
    addTrustedCa("Authority A", "valid");
    expect(getCaBundle()).toBe("second");

    rows = [{ pem: "third" }];
    deleteTrustedCa(1);
    expect(getCaBundle()).toBe("third");

    rows = [{ pem: "fourth" }];
    invalidateCaBundle();
    expect(getCaBundle()).toBe("fourth");
  });
});
