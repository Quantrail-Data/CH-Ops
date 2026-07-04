// crypto.js - AES-256-GCM encryption for credentials
//
// Encrypts sensitive data (ClickHouse passwords, API keys) before
// storing in SQLite. Uses a per-installation salt derived from
// SESSION_SECRET via scrypt (memory-hard key derivation). Each
// encryption uses a fresh random IV, so the same plaintext produces
// different ciphertext each time. Decrypt() falls back to returning
// plaintext for legacy values that were stored before encryption.
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
  let salt;
  if (fs.existsSync(saltPath)) {
    salt = fs.readFileSync(saltPath);
  } else {
    if (!fs.existsSync(saltDir)) fs.mkdirSync(saltDir, { recursive: true });
    salt = randomBytes(32);
    fs.writeFileSync(saltPath, salt);
  }

  derivedKey = scryptSync(sessionSecret, salt, 32);
}

export function encrypt(plaintext) {
  if (!plaintext) return '';
  if (!derivedKey) throw new Error('Crypto not initialized. Call initCrypto() first.');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedStr) {
  if (!encryptedStr) return '';
  if (!derivedKey) throw new Error('Crypto not initialized. Call initCrypto() first.');

  // Check if it looks like our format (three colon-separated hex strings)
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) return encryptedStr; // not encrypted (legacy plaintext)

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    if (iv.length !== 16 || tag.length !== 16) return encryptedStr; // wrong lengths, not our format
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedStr; // decryption failed - probably legacy plaintext
  }
}
