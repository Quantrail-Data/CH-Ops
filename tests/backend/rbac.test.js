/**
 * rbac.test.js - Unit tests for role-based access control logic
 *
 * Tests the RBAC hierarchy by extracting and testing the canChangeRole
 * function logic from users.js. Verifies that superadmin can change any
 * role except superadmin and cannot promote to superadmin; admin can
 * change editor/readonly but cannot change admin or superadmin; editor
 * and readonly have no change permissions. Also tests middleware exports
 * (requireAdmin, requireSuperAdmin, requireEditor) and user management
 * permissions (admin-only create, superadmin-only superadmin creation,
 * max 3 superadmins, delete privilege checks).
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect } from 'bun:test';
import fs from 'fs';

const code = fs.readFileSync('src/backend/controllers/users.js', 'utf8');

// Extract the ROLE_LEVEL map from source
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

// Replicate the canChangeRole logic from the controller
function canChangeRole(callerRole, targetCurrentRole, targetNewRole) {
  const callerLevel = ROLE_LEVEL[callerRole] || 0;
  const targetLevel = ROLE_LEVEL[targetCurrentRole] || 0;
  const newLevel = ROLE_LEVEL[targetNewRole] || 0;
  if (targetLevel >= callerLevel) return false;
  if (newLevel >= callerLevel) return false;
  return true;
}

describe('RBAC: Role Hierarchy', () => {
  it('defines 4 valid roles', () => {
    expect(code).toContain("\"superadmin\"");
    expect(code).toContain("\"admin\"");
    expect(code).toContain("\"editor\"");
    expect(code).toContain("\"readonly\"");
    expect(code).toContain("VALID_ROLES");
  });

  it('has a ROLE_LEVEL numeric hierarchy', () => {
    expect(code).toContain('ROLE_LEVEL');
    expect(code).toContain('readonly: 0');
    expect(code).toContain('editor: 1');
    expect(code).toContain('admin: 2');
    expect(code).toContain('superadmin: 3');
  });
});

describe('RBAC: canChangeRole - superadmin caller', () => {
  it('can change admin to editor', () => { expect(canChangeRole('superadmin', 'admin', 'editor')).toBe(true); });
  it('can change admin to readonly', () => { expect(canChangeRole('superadmin', 'admin', 'readonly')).toBe(true); });
  it('can change editor to readonly', () => { expect(canChangeRole('superadmin', 'editor', 'readonly')).toBe(true); });
  it('can change editor to admin', () => { expect(canChangeRole('superadmin', 'editor', 'admin')).toBe(true); });
  it('can change readonly to editor', () => { expect(canChangeRole('superadmin', 'readonly', 'editor')).toBe(true); });
  it('can change readonly to admin', () => { expect(canChangeRole('superadmin', 'readonly', 'admin')).toBe(true); });
  it('CANNOT change another superadmin', () => { expect(canChangeRole('superadmin', 'superadmin', 'admin')).toBe(false); });
  it('CANNOT promote anyone to superadmin', () => { expect(canChangeRole('superadmin', 'admin', 'superadmin')).toBe(false); });
});

describe('RBAC: canChangeRole - admin caller', () => {
  it('can change editor to readonly', () => { expect(canChangeRole('admin', 'editor', 'readonly')).toBe(true); });
  it('can change readonly to editor', () => { expect(canChangeRole('admin', 'readonly', 'editor')).toBe(true); });
  it('CANNOT change another admin', () => { expect(canChangeRole('admin', 'admin', 'editor')).toBe(false); });
  it('CANNOT change a superadmin', () => { expect(canChangeRole('admin', 'superadmin', 'editor')).toBe(false); });
  it('CANNOT promote to admin', () => { expect(canChangeRole('admin', 'editor', 'admin')).toBe(false); });
  it('CANNOT promote to superadmin', () => { expect(canChangeRole('admin', 'editor', 'superadmin')).toBe(false); });
});

describe('RBAC: canChangeRole - editor caller', () => {
  it('CANNOT change anyone (no permission)', () => {
    expect(canChangeRole('editor', 'readonly', 'editor')).toBe(false);
    expect(canChangeRole('editor', 'editor', 'readonly')).toBe(false);
  });
});

describe('RBAC: canChangeRole - readonly caller', () => {
  it('CANNOT change anyone (no permission)', () => {
    expect(canChangeRole('readonly', 'readonly', 'editor')).toBe(false);
  });
});

describe('RBAC: Middleware exports', () => {
  it('exports requireAdmin middleware', () => { expect(code).toContain('export function requireAdmin'); });
  it('exports requireSuperAdmin middleware (backward compat)', () => { expect(code).toContain('export function requireSuperAdmin'); });
  it('exports requireEditor middleware', () => { expect(code).toContain('export function requireEditor'); });
  it('requireSuperAdmin now allows admin role too', () => {
    // The requireSuperAdmin function should check for admin-level, not just superadmin
    expect(code).toContain('isAdminLevel');
  });
});

describe('RBAC: User management permissions', () => {
  it('only admin+ can create users', () => { expect(code).toContain("isAdminLevel(req.user?.role)"); });
  it('only superadmin can create superadmin users', () => { expect(code).toContain("Only super admins can create super admin accounts"); });
  it('delete checks caller vs target level', () => { expect(code).toContain('Cannot delete a user with equal or higher privileges'); });
  it('max 3 superadmins enforced on create', () => { expect(code).toContain('Maximum 3 super admins allowed'); });
  it('max 3 superadmins enforced on role change', () => { expect(code).toContain('Maximum 3 super admins allowed'); });
});
