// trustedCa.js - certificate authorities CHOps trusts for outbound TLS.
// Contributors - Praveen, Kathirmoorthy, Kathirdhasan
// Copyright (C) 2026 Quantrail™ Data Private Limited

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, trustedCas } from '../db/index.js';
import { trustedCas } from '../db/schema.js';

// Built once and reused. Rebuilt whenever a certificate is added or removed.

let cachedBundle = null;

// Reads a certificate and pulls out what the list needs to show.
export function parsePem(pem) {
  let cert;
  try {
    cert = new crypto.X509Certificate(pem);
  } catch {
    throw new Error('That does not look like a certificate. Paste the whole PEM block, including the BEGIN and END lines.');
  }

  // A server certificate is not an authority and cannot sign anything.

  if (!cert.ca) {
    throw new Error('That is a certificate, but not a certificate authority. You need the CA certificate that signed your server, not the server certificate itself.');
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

export function listTrustedCas() {
  return db.select().from(trustedCas).orderBy(trustedCas.name).all();
}

export function addTrustedCa(name, pem) {
  const parsed = parsePem(pem);

  // The fingerprint identifies a certificate uniquely, so this catches the same one being pasted twice under two names.
  const existing = db.select().from(trustedCas)
    .where(eq(trustedCas.fingerprint, parsed.fingerprint)).get();
  if (existing) {
    throw new Error(`That certificate authority is already stored, under the name "${existing.name}".`);
  }

  db.insert(trustedCas).values({ name: name.trim(), pem: pem.trim(), ...parsed }).run();
  cachedBundle = null;
}

export function deleteTrustedCa(id) {
  db.delete(trustedCas).where(eq(trustedCas.id, id)).run();
  cachedBundle = null;
}

// Every stored certificate, joined into one block.

export function getCaBundle() {
  if (cachedBundle !== null) return cachedBundle || null;

  const rows = db.select().from(trustedCas).all();
  if (!rows.length) {
    cachedBundle = '';
    return null;
  }

  // Supplying these adds to the system list rather than replacing it
  cachedBundle = rows.map(r => r.pem.trim()).join('\n');
  return cachedBundle;
}

// For tests and for anything that changes the table without going through the functions above.
export function invalidateCaBundle() {
  cachedBundle = null;
}