// crypto.js - AES-256-GCM encryption for credentials
//
// Encrypts sensitive data (ClickHouse passwords, API keys) before
// storing in SQLite. Uses a per-installation salt derived from
// SESSION_SECRET via scrypt (memory-hard key derivation). Each
// encryption uses a fresh random IV, so the same plaintext produces
// different ciphertext each time. Values are tagged "v1:" so a genuine
// decryption failure can be reported instead of being mistaken for a
// legacy plaintext value; untagged legacy values are still read.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';

let derivedKey = null;

export function initCrypto(sessionSecret) {
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters for encryption key derivation. Generate one with: openssl rand -hex 32');
  }

  // Load or create the per-install salt
  const saltDir = path.join(process.cwd(), 'data');
  const saltPath = path.join(saltDir, 'crypto.salt');
  fs.mkdirSync(saltDir, { recursive: true });
  let salt;
  try {
    salt = fs.readFileSync(saltPath);
  } catch {
    const generatedSalt = randomBytes(32);
    try {
      fs.writeFileSync(saltPath, generatedSalt, { flag: 'wx' });
      salt = generatedSalt;
    } catch (err) {
      if (err?.code === 'EEXIST') {
        salt = fs.readFileSync(saltPath);
      } else {
        throw err;
      }
    }
  }

  derivedKey = scryptSync(sessionSecret, salt, 32);
}

// Ciphertext is tagged with a version prefix: "v1:iv:tag:ciphertext".
//
// The prefix exists to tell two very different situations apart. Without it,
// "this was never encrypted" and "this is encrypted but I cannot read it" both
// looked like a three-part string that failed to decrypt, and both returned the
// input unchanged. A wrong SESSION_SECRET therefore produced a silent garbage
// password and an authentication error from ClickHouse, instead of saying the
// key was wrong.
const V1 = 'v1:';

export function encrypt(plaintext) {
  if (!plaintext) return '';
  if (!derivedKey) throw new Error('Crypto not initialized. Call initCrypto() first.');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return V1 + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function openBox(ivHex, tagHex, ciphertext) {
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== 16 || tag.length !== 16) return null;
  const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);
  let out = decipher.update(ciphertext, 'hex', 'utf8');
  out += decipher.final('utf8');
  return out;
}

export function decrypt(encryptedStr) {
  if (!encryptedStr) return '';
  if (!derivedKey) throw new Error('Crypto not initialized. Call initCrypto() first.');

  // Current format. A failure here is a real failure: the value was definitely
  // written by this code, so a bad tag means the key is wrong or the row was
  // tampered with. Say so rather than handing back ciphertext.
  if (encryptedStr.startsWith(V1)) {
    const parts = encryptedStr.slice(V1.length).split(':');
    if (parts.length !== 3) {
      throw new Error('Credential is malformed and cannot be decrypted.');
    }
    let out;
    try {
      out = openBox(parts[0], parts[1], parts[2]);
    } catch {
      out = null;
    }
    if (out === null) {
      throw new Error(
        'Credential could not be decrypted. This usually means SESSION_SECRET ' +
        'has changed since the value was stored.',
      );
    }
    return out;
  }

  // Pre-v1 format, written before the prefix existed: iv:tag:ciphertext with
  // no marker. Still read, and re-encrypted with a prefix on the next save.
  // The permissive fallback is kept ONLY for this shape, because here a
  // three-part string really might be a legacy plaintext password that happens
  // to contain two colons.
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) return encryptedStr; // not encrypted (legacy plaintext)

  try {
    const out = openBox(parts[0], parts[1], parts[2]);
    return out === null ? encryptedStr : out;
  } catch {
    return encryptedStr; // decryption failed - probably legacy plaintext
  }
}
