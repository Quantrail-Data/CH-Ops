// auth-logout.test.js - Logout revokes the token and (via the revoke hook) the
// credential lifecycle it owns.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isChild = process.env.CHOPS_LOGOUT_TEST_CHILD === '1';

if (!isChild) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chops-logout-'));
  const dbPath = path.join(tempDir, 'chops.db');

  afterAll(() => {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });

  test('runs auth logout tests in an isolated process', async () => {
    const child = Bun.spawn({
      cmd: [process.execPath, 'test', import.meta.path],
      env: {
        ...process.env,
        CHOPS_LOGOUT_TEST_CHILD: '1',
        DB_PATH: dbPath,
        SUPER_ADMIN_1: 'logout-test-admin',
        SUPER_ADMIN_1_PASSWORD: 'logout-test-password',
        SUPER_ADMIN_1_EMAIL: 'logout-admin@example.com',
      },
      stdout: 'inherit',
      stderr: 'inherit',
    });

    expect(await child.exited).toBe(0);
  }, 60000);
} else {
  let create;
  let verify;
  let onRevoke;
  let logout;
  let rawSqlite;
  let user;

  beforeAll(async () => {
    const { initCrypto } = await import('../../src/backend/services/crypto.js');
    initCrypto('logout-test-secret-at-least-32-characters');

    const dbModule = await import('../../src/backend/db/index.js');
    rawSqlite = dbModule.rawSqlite;
    await import('../../src/backend/db/migrate.js');

    ({ create, verify, onRevoke } = await import('../../src/backend/services/jwt.js'));
    ({ logout } = await import('../../src/backend/controllers/auth.js'));

    user = rawSqlite
      .query('SELECT id, username, role, token_version FROM app_user WHERE username = ?')
      .get('logout-test-admin');

    if (!user) throw new Error('Logout test user was not created.');
  }, 30000);

  afterAll(() => {
    rawSqlite?.close();
  });

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
      const token = create({
        username: user.username,
        role: user.role,
        userId: user.id,
        tokenVersion: user.token_version,
      });
      const { jti } = verify(token);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createRes();
      await logout(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(cleared).toContain(jti);          // credential sessions get cleared
      expect(() => verify(token)).toThrow();    // token can no longer be used
    });

    test('is idempotent: still succeeds with no / invalid token', async () => {
      const res1 = createRes();
      await logout({ headers: {} }, res1);
      expect(res1.statusCode).toBe(200);
      expect(res1.body).toEqual({ ok: true });

      const res2 = createRes();
      await logout({ headers: { authorization: 'Bearer not.a.token' } }, res2);
      expect(res2.statusCode).toBe(200);
      expect(res2.body).toEqual({ ok: true });
    });

    test('rejects a token whose username does not match the database user', async () => {
      const token = create({
        username: 'different-user',
        role: user.role,
        userId: user.id,
        tokenVersion: user.token_version,
      });
      const res = createRes();

      await logout({ headers: { authorization: `Bearer ${token}` } }, res);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid or expired token' });
      expect(() => verify(token)).not.toThrow();
    });
  });
}
