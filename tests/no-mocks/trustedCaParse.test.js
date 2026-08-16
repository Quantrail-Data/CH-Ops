// trustedCaParse.test.js - reading a pasted certificate
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, test, expect } from "bun:test";
import crypto from "node:crypto";

// The rule from services/trustedCa.js. 

function parsePem(pem) {
  let cert;
  try {
    cert = new crypto.X509Certificate(pem);
  } catch {
    throw new Error("That does not look like a certificate. Paste the whole PEM block, including the BEGIN and END lines.");
  }
  if (!cert.ca) {
    throw new Error("That is a certificate, but not a certificate authority. You need the CA certificate that signed your server, not the server certificate itself.");
  }
  const notAfter = new Date(cert.validTo);
  if (notAfter.getTime() < Date.now()) {
    throw new Error(`That certificate authority expired on ${cert.validTo}. An expired one cannot validate anything.`);
  }
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    fingerprint: cert.fingerprint256,
    notBefore: cert.validFrom,
    notAfter: cert.validTo,
  };
}

describe("rejecting things that are not certificates", () => {
  test("plain text is rejected", () => {
    expect(() => parsePem("hello")).toThrow(/does not look like a certificate/);
  });

  test("an empty string is rejected", () => {
    expect(() => parsePem("")).toThrow();
  });

  test("PEM markers around rubbish are rejected", () => {
    // The shape people produce when they copy the wrong half of a file.
    const fake = "-----BEGIN CERTIFICATE-----\nbm90IGEgY2VydA==\n-----END CERTIFICATE-----";
    expect(() => parsePem(fake)).toThrow();
  });

  test("a private key is rejected", () => {
    // Pasting ca.key instead of ca.crt is an easy mistake and the two files sit
    // next to each other.
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    expect(() => parsePem(privateKey)).toThrow(/does not look like a certificate/);
  });
});

describe("the error messages say what to do", () => {
  test("the not-a-certificate message mentions the BEGIN and END lines", () => {
    // Someone who pasted only the middle of the file needs to know that.
    try {
      parsePem("hello");
    } catch (err) {
      expect(err.message).toContain("BEGIN");
      expect(err.message).toContain("END");
    }
  });
});
