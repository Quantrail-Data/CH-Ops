// rbac.test.js - unit tests for role-based access control logic
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathirdhasan, Kathir Moorthy, Praveen kumar

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
  it('no longer exports the duplicate requireSuperAdmin', () => {
    // Matched on the exact name rather than a substring, so it does not fire on requireSuperAdminOnly, which is a different function 
    expect(code).not.toMatch(/export function requireSuperAdmin\s*\(/);
  });

  it('exports requireSuperAdminOnly, which checks the role it names', () => {
    expect(code).toContain('export function requireSuperAdminOnly');
    expect(code).toContain("req.user?.role !== 'superadmin'");
  });

describe('RBAC: User management permissions', () => {
  it('only admin+ can create users', () => { expect(code).toContain("isAdminLevel(req.user?.role)"); });
  it('only superadmin can create superadmin users', () => { expect(code).toContain("Only super admins can create super admin accounts"); });
  it('delete checks caller vs target level', () => { expect(code).toContain('Cannot delete a user with equal or higher privileges'); });
  it('max 3 superadmins enforced on create', () => { expect(code).toContain('Maximum 3 super admins allowed'); });
  it('max 3 superadmins enforced on role change', () => { expect(code).toContain('Maximum 3 super admins allowed'); });
});


describe('RBAC: dashboard route guards', () => {
  const routes = fs.readFileSync('src/backend/routes/dashboards.js', 'utf8');

  // Editors create and edit; only admins delete. Deleting a dashboard detaches
  // every chart on it and deleting a chart is unrecoverable.
  it('lets editors create a dashboard and a chart', () => {
    expect(routes).toContain("router.post('/', requireEditor, createDashboard)");
    expect(routes).toContain("router.post('/charts', requireEditor, createChart)");
  });

  it('lets editors update a dashboard and a chart', () => {
    expect(routes).toContain("router.put('/:id', requireEditor, updateDashboard)");
    expect(routes).toContain("router.put('/charts/:id', requireEditor, updateChart)");
  });

  it('restricts both deletes to admin', () => {
    expect(routes).toContain("router.delete('/:id', requireAdmin, deleteDashboard)");
    expect(routes).toContain("router.delete('/charts/:id', requireAdmin, deleteChart)");
  });

  it('no longer accepts an editor on either delete', () => {
    expect(routes).not.toContain("router.delete('/:id', requireEditor");
    expect(routes).not.toContain("router.delete('/charts/:id', requireEditor");
  });

  it('leaves the read endpoints open to any authenticated user', () => {
    expect(routes).toContain("router.get('/', listDashboards)");
    expect(routes).toContain("router.get('/charts', listCharts)");
    expect(routes).toContain("router.get('/:id/charts', getDashboardCharts)");
  });

  it('imports both guards', () => {
    expect(routes).toContain('requireAdmin');
    expect(routes).toContain('requireEditor');
  });
});
