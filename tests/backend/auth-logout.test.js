// auth-logout.test.js - Logout revokes the token and (via the revoke hook) the
// credential lifecycle it owns.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, test, expect, beforeAll } from 'bun:test';
import { setSecret, create, verify, onRevoke } from '../../src/backend/services/jwt.js';
import { logout } from '../../src/backend/controllers/auth.js';

beforeAll(() => setSecret('test-jwt-secret-32chars-minimum!'));

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

describe('auth logout', () => {
  test('revokes the token and fires the credential-clear hook', async () => {
    const cleared = [];
    onRevoke((jti) => cleared.push(jti));
    const token = create({ username: 'alice' });
    const { jti } = verify(token);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createRes();
    await logout(req, res);

    expect(res.body).toEqual({ ok: true });
    expect(cleared).toContain(jti);          // credential sessions get cleared
    expect(() => verify(token)).toThrow();    // token can no longer be used
  });

  test('is idempotent: still succeeds with no / invalid token', async () => {
    const res1 = createRes();
    await logout({ headers: {} }, res1);
    expect(res1.body).toEqual({ ok: true });

    const res2 = createRes();
    await logout({ headers: { authorization: 'Bearer not.a.token' } }, res2);
    expect(res2.body).toEqual({ ok: true });
  });
});
