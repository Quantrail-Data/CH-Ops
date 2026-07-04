// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Test suite validating custom scrollbar variant builds, page layouts, and dark/light theme style compatibility.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
function read(f) { return fs.readFileSync(f, 'utf8'); }


describe('Scrollbars: DataTable Variant Construction', () => {
  const code = read('src/frontend/components/layout/DataTable.jsx');
  it('accepts variant prop', () => { expect(code).toContain('variant'); });
  it('builds class with ternary: dt-single / dt-fixed / none', () => {
    expect(code.includes("variant === 'single'") || code.includes('variant === "single"')).toBe(true);
    expect(code.includes("' dt-single'") || code.includes('" dt-single"')).toBe(true);
    expect(code.includes("variant === 'fixed'") || code.includes('variant === "fixed"')).toBe(true);
    expect(code.includes("' dt-fixed'") || code.includes('" dt-fixed"')).toBe(true);
  });
});

describe('Scrollbars: Single-Table Pages', () => {
  const singlePages = [
    ['CrashLog', 'src/frontend/components/logs/CrashLog.jsx'],
    ['ErrorLog', 'src/frontend/components/logs/ErrorLog.jsx'],
    ['TextLog', 'src/frontend/components/logs/TextLog.jsx'],
    ['RbacUsers', 'src/frontend/components/rbac/RbacUsers.jsx'],
    ['RbacRoles', 'src/frontend/components/rbac/RbacRoles.jsx'],
    ['UserManagement', 'src/frontend/components/admin/UserManagement.jsx'],
    ['AllCharts', 'src/frontend/components/dashboards/AllCharts.jsx'],
  ];
  singlePages.forEach(([name, path]) => {
    it(`${name} uses single variant`, () => { const c = read(path); expect(c.includes('variant="single"') || c.includes("variant='single'") || c.includes('dt-single')).toBe(true); });
  });
});

describe('Scrollbars: Multi-Table Pages', () => {
  const fixedPages = [
    ['ClusterOverview', 'src/frontend/components/overview/ClusterOverview.jsx'],
    ['DistributedDDL', 'src/frontend/components/overview/DistributedDDL.jsx'],
    ['TablesAndParts', 'src/frontend/components/tables/TablesAndParts.jsx'],
    ['MergesMutations', 'src/frontend/components/merges/MergesMutations.jsx'],
    ['RbacViewGrants', 'src/frontend/components/rbac/RbacViewGrants.jsx'],
    ['RbacProfiles', 'src/frontend/components/rbac/RbacProfiles.jsx'],
  ];
  fixedPages.forEach(([name, path]) => {
    it(`${name} uses fixed variant`, () => {
      const c = read(path);
      expect(c.includes('variant="fixed"') || c.includes("variant='fixed'") || c.includes('dt-fixed')).toBe(true);
    });
  });
});

describe('Scrollbars: Theme Support', () => {
  const css = read('src/frontend/styles/global.css');
  it('dark theme variables exist', () => { expect(css).toContain('--bg-page'); expect(css).toContain('--text-primary'); });
  it('light theme overrides exist', () => { expect(css).toContain('[data-theme="light"]'); });
});
