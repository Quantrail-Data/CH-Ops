/**
 * crypto.test.js - Unit tests for AES-256-GCM encryption service
 *
 * Tests the crypto module with a fixed test secret. Verifies that
 * encrypt/decrypt round-trip works, each encryption produces different
 * ciphertext (random IV), empty/null inputs are handled, and legacy
 * plaintext values are returned as-is. Also tests tampered ciphertext
 * detection, Unicode/special character support, and the 32-character
 * minimum secret requirement. Confirms per-install salt file usage.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { initCrypto, encrypt, decrypt } from '../../src/backend/services/crypto.js';

const TEST_SECRET = 'test-session-secret-minimum-32-characters-long!';

beforeAll(() => {
  try {
    initCrypto(TEST_SECRET);
  } catch {
    // Already initialized from a previous test run in the same process
  }
});

describe('AES-256-GCM Crypto', () => {
  it('encrypts and decrypts a string', () => {
    const plain = 'my-secret-password';
    const encrypted = encrypt(plain);
    expect(encrypted).not.toBe(plain);
    expect(decrypt(encrypted)).toBe(plain);
  });

it('if session secret is null throw error', () => {      
  // Wrap the call inside an arrow function
  expect(() => initCrypto(null)).toThrow(
    'SESSION_SECRET must be at least 32 characters for encryption key derivation. Generate one with: openssl rand -hex 32'
  );   
});



  it('produces different ciphertext each time (random IV)', () => {
    const plain = 'same-input';
    const a = encrypt(plain);
    const b = encrypt(plain);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plain);
    expect(decrypt(b)).toBe(plain);
  });

  it('returns empty string for empty/null input', () => {
    expect(encrypt('')).toBe('');
    expect(encrypt(null)).toBe('');
    expect(decrypt('')).toBe('');
    expect(decrypt(null)).toBe('');
  });

  it('returns legacy plaintext if not in encrypted format', () => {
    expect(decrypt('plain-password')).toBe('plain-password');
    expect(decrypt('no-colons-here')).toBe('no-colons-here');
  });

  it('encrypted format is v1:iv:tag:ciphertext (hex)', () => {
    const encrypted = encrypt('secret');
    const parts = encrypted.split(':');
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe('v1');
    expect(parts[1].length).toBe(32);
    expect(parts[2].length).toBe(32);
    expect(parts[3].length).toBeGreaterThan(0);
  });

  it('still reads pre-v1 ciphertext written before the prefix existed', () => {
    // Existing installations hold values in the old iv:tag:ciphertext shape.
    // They must keep working; they are re-encrypted with a prefix on next save.
    const fs = require('fs');
    const { createCipheriv, randomBytes, scryptSync } = require('crypto');
    const salt = fs.readFileSync(require('path').join(process.cwd(), 'data', 'crypto.salt'));
    const key = scryptSync(TEST_SECRET, salt, 32);
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    let ct = cipher.update('legacy-secret', 'utf8', 'hex');
    ct += cipher.final('hex');
    const legacy = iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + ct;

    expect(decrypt(legacy)).toBe('legacy-secret');
  });

  it('throws on tampered v1 ciphertext instead of returning it', () => {
    // A v1 value was definitely written by this code, so a bad tag means the
    // key is wrong or the row was altered. Returning the ciphertext unchanged
    // (the old behaviour) turned that into a silent garbage password and an
    // authentication error from ClickHouse.
    const encrypted = encrypt('secret');
    const parts = encrypted.slice(3).split(':');
    const tampered = 'v1:' + parts[0] + ':' + parts[1] + ':' + 'ff'.repeat(parts[2].length / 2);

    expect(() => decrypt(tampered)).toThrow(/could not be decrypted/i);
  });

  it('throws on a malformed v1 value', () => {
    expect(() => decrypt('v1:only:two')).toThrow(/malformed/i);
  });

  it('does not throw for a legacy value that merely looks encrypted', () => {
    // A pre-v1 plaintext password could contain two colons. That shape keeps
    // the permissive fallback; only v1 is strict.
    expect(decrypt('abc:def:ghi')).toBe('abc:def:ghi');
  });

  it('handles unicode and special characters', () => {
    const plain = 'p@$$w0rd!#%^&*()_+{}|:<>?';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('requires 32+ character secret', () => {
    // Cannot re-test initCrypto in the same process since it's already initialized,
    // but we can verify the source enforces the length check
    const code = require('fs').readFileSync('src/backend/services/crypto.js', 'utf8');
    expect(code).toContain('sessionSecret.length < 32');
  });

  it('uses per-install random salt file', () => {
    const code = require('fs').readFileSync('src/backend/services/crypto.js', 'utf8');
    expect(code).toContain('crypto.salt');
    expect(code).toContain('randomBytes(32)');
  });
});
