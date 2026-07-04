/**
 * appUser.test.js - Unit tests for app_user schema and CRUD operations
 *
 * Tests the app_user table schema using an in-memory SQLite database.
 * Verifies user creation with default roles (readonly), unique username
 * enforcement, role updates (readonly → editor), password hash updates,
 * user deletion, and superadmin count validation. Covers all four roles:
 * superadmin, admin, editor, and readonly.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/backend/db/schema.js';

let db;

beforeAll(() => {
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(`CREATE TABLE app_user (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'readonly', email TEXT, must_change_password INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_at TEXT, updated_at TEXT);`);
  db = drizzle(sqlite, { schema });
});

describe('AppUser CRUD', () => {
  it('creates a user with default role readonly', () => {
    const u = db.insert(schema.appUsers).values({ username: 'alice', passwordHash: 'hash123' }).returning().get();
    expect(u.username).toBe('alice');
    expect(u.role).toBe('readonly');
    expect(u.mustChangePassword).toBe(true);
  });

  it('enforces unique username', () => {
    expect(() => db.insert(schema.appUsers).values({ username: 'alice', passwordHash: 'x' }).run()).toThrow();
  });

  it('creates superadmin', () => {
    const u = db.insert(schema.appUsers).values({ username: 'sa1', passwordHash: 'h', role: 'superadmin', mustChangePassword: false }).returning().get();
    expect(u.role).toBe('superadmin');
  });

  it('creates admin', () => {
    const u = db.insert(schema.appUsers).values({ username: 'adm1', passwordHash: 'h', role: 'admin' }).returning().get();
    expect(u.role).toBe('admin');
  });

  it('creates editor', () => {
    const u = db.insert(schema.appUsers).values({ username: 'ed1', passwordHash: 'h', role: 'editor' }).returning().get();
    expect(u.role).toBe('editor');
  });

  it('updates password hash', () => {
    db.update(schema.appUsers).set({ passwordHash: 'newhash' }).where(eq(schema.appUsers.username, 'alice')).run();
    const u = db.select().from(schema.appUsers).where(eq(schema.appUsers.username, 'alice')).get();
    expect(u.passwordHash).toBe('newhash');
  });

  it('updates role from readonly to editor', () => {
    db.update(schema.appUsers).set({ role: 'editor' }).where(eq(schema.appUsers.username, 'alice')).run();
    const u = db.select().from(schema.appUsers).where(eq(schema.appUsers.username, 'alice')).get();
    expect(u.role).toBe('editor');
  });

  it('deletes user', () => {
    db.delete(schema.appUsers).where(eq(schema.appUsers.username, 'alice')).run();
    expect(db.select().from(schema.appUsers).where(eq(schema.appUsers.username, 'alice')).get()).toBeUndefined();
  });

  it('counts superadmins', () => {
    const count = db.select().from(schema.appUsers).all().filter(u => u.role === 'superadmin').length;
    expect(count).toBe(1);
  });

  it('counts by role', () => {
    const all = db.select().from(schema.appUsers).all();
    const roles = all.map(u => u.role);
    expect(roles).toContain('superadmin');
    expect(roles).toContain('admin');
    expect(roles).toContain('editor');
  });
});
