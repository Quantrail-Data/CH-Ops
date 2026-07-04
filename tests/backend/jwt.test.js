/**
 * jwt.test.js - Unit tests for JWT token service
 *
 * Tests JWT creation, verification, and revocation. Verifies tokens
 * include username, role, iat, exp, and jti claims. Checks that invalid,
 * tampered, or revoked tokens are rejected. Also tests that the service
 * throws when the secret is not set. Token expiry is verified to be
 * 2 hours (7200 seconds).
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { setSecret, create, verify, revokeToken, onRevoke } from '../../src/backend/services/jwt.js';

beforeAll(() => setSecret('test-jwt-secret-32chars-minimum!'));

describe('JWT Service', () => {
  it('creates a valid JWT string with 3 parts', () => {
    const token = create({ username: 'admin' });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it('verifies token and returns correct payload', () => {
    const token = create({ username: 'admin', role: 'admin' });
    const p = verify(token);
    expect(p.username).toBe('admin');
    expect(p.role).toBe('admin');
    expect(p.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('rejects invalid token strings', () => {
    expect(() => verify('not.a.token')).toThrow();
    expect(() => verify('')).toThrow();
  });

  it('rejects tampered tokens', () => {
    const token = create({ username: 'admin' });
    expect(() => verify(token.slice(0, -6) + 'XXXXXX')).toThrow();
  });

  it('includes iat, exp, and jti claims', () => {
    const token = create({ username: 'test' });
    const p = verify(token);
    expect(p.iat).toBeDefined();
    expect(p.exp).toBeDefined();
    expect(p.jti).toBeDefined();
    expect(typeof p.jti).toBe('string');
    expect(p.jti.length).toBe(32); // 16 bytes hex
    expect(p.exp - p.iat).toBe(7200); // 2h
  });

  it('throws if secret is not set', () => {
    const origSecret = 'test-jwt-secret-32chars-minimum!';
    setSecret(null);
    expect(() => create({ username: 'admin' })).toThrow('JWT secret not set');
    setSecret(origSecret);
  });

  it('rejects revoked tokens', () => {
    const token = create({ username: 'admin' });
    const p = verify(token); // works before revocation
    expect(p.username).toBe('admin');
    revokeToken(p.jti);
    expect(() => verify(token)).toThrow('Token revoked');
  });
});

describe('JWT revoke hooks', () => {
  it('fires registered onRevoke hooks with the jti (credential lifecycle tie-in)', () => {
    const seen = [];
    onRevoke((jti) => seen.push(jti));
    const token = create({ username: 'admin' });
    const { jti } = verify(token);
    revokeToken(jti);
    expect(seen).toContain(jti);
    // and the token is now unusable
    expect(() => verify(token)).toThrow();
  });
});
