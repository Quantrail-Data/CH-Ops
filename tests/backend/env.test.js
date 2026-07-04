/**
 * env.test.js - Unit tests for environment variable loader
 *
 * Tests the loadEnv() function with various environment configurations.
 * Verifies that multiple super admins are collected from numbered env vars
 * (SUPER_ADMIN_1, SUPER_ADMIN_2, etc.), legacy SUPER_ADMIN fallback works,
 * SMTP config is read correctly, and validation throws errors when required
 * variables (super admin, SESSION_SECRET) are missing.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import { loadEnv } from '../../src/backend/utils/env.js';

beforeAll(() => {
  process.env.SUPER_ADMIN_1 = 'admin';
  process.env.SUPER_ADMIN_1_PASSWORD = 'secure_pass';
  process.env.SUPER_ADMIN_2 = 'admin2';
  process.env.SUPER_ADMIN_2_PASSWORD = 'pass2';
  process.env.SESSION_SECRET = 'long_random_secret_32_chars_min!';
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '465';
});

describe('Env Loader - super admins', () => {
  it('collects multiple super admins from numbered env vars', () => {
    expect(loadEnv().superAdmins.length).toBe(2);
  });

  it('assigns correct usernames', () => {
    const admins = loadEnv().superAdmins;
    expect(admins[0].username).toBe('admin');
    expect(admins[1].username).toBe('admin2');
  });

  it('assigns correct passwords', () => {
    const admins = loadEnv().superAdmins;
    expect(admins[0].password).toBe('secure_pass');
    expect(admins[1].password).toBe('pass2');
  });

  it('supports legacy SUPER_ADMIN fallback', () => {
    const saved1 = process.env.SUPER_ADMIN_1;
    const saved1p = process.env.SUPER_ADMIN_1_PASSWORD;
    const saved2 = process.env.SUPER_ADMIN_2;
    const saved2p = process.env.SUPER_ADMIN_2_PASSWORD;
    delete process.env.SUPER_ADMIN_1;
    delete process.env.SUPER_ADMIN_1_PASSWORD;
    delete process.env.SUPER_ADMIN_2;
    delete process.env.SUPER_ADMIN_2_PASSWORD;
    process.env.SUPER_ADMIN = 'legacy_admin';
    process.env.SUPER_ADMIN_PASSWORD = 'legacy_pass';
    const env = loadEnv();
    expect(env.superAdmins.length).toBe(1);
    expect(env.superAdmins[0].username).toBe('legacy_admin');
    delete process.env.SUPER_ADMIN;
    delete process.env.SUPER_ADMIN_PASSWORD;
    process.env.SUPER_ADMIN_1 = saved1;
    process.env.SUPER_ADMIN_1_PASSWORD = saved1p;
    process.env.SUPER_ADMIN_2 = saved2;
    process.env.SUPER_ADMIN_2_PASSWORD = saved2p;
  });

  it('reads SMTP config from env', () => {
    const env = loadEnv();
    expect(env.smtp.host).toBe('smtp.example.com');
    expect(env.smtp.port).toBe('465');
  });
});

describe('Env Loader - validation', () => {
  it('throws on missing super admin and legacy super admin', () => {
    const saved1 = process.env.SUPER_ADMIN_1;
    const saved1p = process.env.SUPER_ADMIN_1_PASSWORD;
    delete process.env.SUPER_ADMIN_1;
    delete process.env.SUPER_ADMIN_1_PASSWORD;
    expect(() => loadEnv()).toThrow();
    process.env.SUPER_ADMIN_1 = saved1;
    process.env.SUPER_ADMIN_1_PASSWORD = saved1p;
  });

  it('throws on missing SESSION_SECRET', () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    expect(() => loadEnv()).toThrow();
    process.env.SESSION_SECRET = saved;
  });
});
