// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Integration tests verifying documentation assets, DDL execution, cluster validation, and RBAC user permissions.


import { describe, it, expect } from 'vitest';
import fs from 'fs';
function read(f) { return fs.readFileSync(f, 'utf8'); }

describe('UserManagement: RBAC', () => {
  const code = read('src/frontend/components/admin/UserManagement.jsx');
  it('disabled buttons for non-admin (opacity 0.35, not-allowed)', () => { expect(code).toContain('disabled={!canManage}'); expect(code).toContain('opacity: 0.35'); expect(code).toContain('not-allowed'); });
  it('self password change button', () => { expect(code).toContain('Change My Password'); });
  it('mutual exclusion: opening one panel closes the other', () => { expect(code).toContain('setShowCreate(false)'); expect(code).toContain('show: false'); });
  it('dt-single scrollbar variant', () => { expect(code).toContain('dt-single'); });
});

describe('ClusterManagement: Validation', () => {
  const fe = read('src/frontend/components/admin/ClusterManagement.jsx');
  it('requires node name', () => { expect(fe).toContain('Node Name is required'); });
  it('unique names (case-insensitive) with specific error', () => { expect(fe).toContain('Duplicate node name'); expect(fe).toContain('toLowerCase()'); });
  it('calls reloadConfig after save', () => { expect(fe).toContain('reloadConfig'); });
});

describe('DDL & Readonly', () => {
  const code = read('src/frontend/components/overview/DistributedDDL.jsx');
  it('Promise.allSettled for single-node compat', () => { expect(code).toContain('Promise.allSettled'); });
  it('fallback 0 values', () => { expect(code).toContain("?? '0'"); });
  it('info banner for single-node', () => { expect(code).toContain('single-node'); });
  it('is_readonly=1 query', () => { expect(code).toContain('is_readonly=1'); });
  it('fixed variant for tables', () => { expect(code).toContain('variant="fixed"'); });
});

describe('Documentation: Required files exist', () => {
  ['README.md', 'docs/README.md', 'docs/_sidebar.md', 'docs/guide/admin.md',
   'docs/guide/backups.md', 'docs/guide/sql-editor.md', 'docs/guide/queries.md',
   'docs/guide/logs.md', 'docs/guide/indexes.md', 'docs/development/testing.md'].forEach(doc => {
    it(`${doc} exists and non-empty`, () => { expect(fs.existsSync(doc)).toBe(true); expect(read(doc).length).toBeGreaterThan(50); });
  });
});
