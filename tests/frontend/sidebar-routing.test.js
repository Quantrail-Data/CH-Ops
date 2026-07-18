// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> kathir Moorthy
// Integration tests verifying sidebar sections, renamed labels, routing paths for all 27 pages, and layout integration behaviors.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
function read(f) { return fs.readFileSync(f, 'utf8'); }

describe('Sidebar: 10 Core Sections', () => {
  const code = read('src/frontend/components/layout/Sidebar.jsx');

  ['Overview', 'Tools', 'Dashboards', 'Schema', 'Monitoring', 'Alerts', 'Backups', 'RBAC', 'Logs', 'Admin'].forEach(s => {
    it(`has section "${s}"`, () => {
      expect(
        code.includes(`label: '${s}'`) || code.includes(`label: "${s}"`)
      ).toBe(true);
    });
  });

  it('collapsible', () => {
    expect(code).toContain('collapsed');
  });

  it('auto-collapsed on editor routes', () => {
    const ml = read('src/frontend/components/layout/MainLayout.jsx');
    expect(
      ml.includes('const isEditorRoute = route.startsWith("editor/")') ||
      ml.includes("const isEditorRoute = route.startsWith('editor/')") ||
      ml.includes('const isEditorRoute = route.includes("qurioz")') ||
      ml.includes("const isEditorRoute = route.includes('qurioz')")
    ).toBe(true);
    expect(ml).toContain('forceCollapsed={false}');
    expect(ml).toContain('collapsed={sidebarCollapsed}');
  });
});

describe('Sidebar: Renamed Labels', () => {
  const code = read('src/frontend/components/layout/Sidebar.jsx');

  it('Data Skipping Indexes (not Secondary)', () => {
    expect(
      code.includes("'Data Skipping Indexes'") ||
      code.includes('"Data Skipping Indexes"')
    ).toBe(true);
    expect(code).not.toContain("label: 'Secondary Indexes'");
  });

  it('Index Management (not Create Index)', () => {
    expect(
      code.includes("'Index Management'") ||
      code.includes('"Index Management"')
    ).toBe(true);
    expect(code).not.toContain("label: 'Create Index'");
  });

  it('Storage Profiles under Administration (not Backups)', () => {
    expect(
      code.includes("id: 'admin/profiles'") ||
      code.includes('id: "admin/profiles"')
    ).toBe(true);
    expect(code).not.toContain("id: 'backups/profiles'");
  });

  it('App Data Backup under Administration', () => {
    expect(
      code.includes("id: 'admin/app-backup'") ||
      code.includes('id: "admin/app-backup"')
    ).toBe(true);
    expect(
      code.includes("'App Data Backup'") ||
      code.includes('"App Data Backup"')
    ).toBe(true);
  });
});

describe('Routing: Every sidebar item has a page', () => {
  const sidebar = read('src/frontend/components/layout/Sidebar.jsx');
  const ml = read('src/frontend/components/layout/MainLayout.jsx');

  const ids = (sidebar.match(/id:\s*["']([^"']+)["']/g) || [])
    .map(m => m.match(/["']([^"']+)["']/)[1])
    .filter(id => id.includes('/'));

  ids.forEach(id => {
    it(`"${id}" routed in MainLayout`, () => {
      const baseId = id.replace(/\/:tab\?$/, '');
      expect(
        ml.includes(`'${id}'`) ||
        ml.includes(`"${id}"`) ||
        ml.includes(`'${baseId}'`) ||
        ml.includes(`"${baseId}"`) ||
        ml.includes(`'${baseId}/:tab?'`) ||
        ml.includes(`"${baseId}/:tab?"`)
      ).toBe(true);
    });
  });
});

describe('Routing: All page components exist', () => {
  const pages = [
    'overview/ClusterOverview', 'queries/QueriesSection', 'tables/TablesAndParts', 'merges/MergesMutations', 'overview/DistributedDDL',
    'editor/QueryEditor', 'editor/SqlEditorPage', 'profiler/QueryProfiler', 'profiler/QueryMetrics', 'dashboards/ChartBuilder', 'dashboards/DashboardView', 'dashboards/AllCharts',
    'indexes/SecondaryIndexes', 'indexes/Projections', 'indexes/CreateIndex',
    'logs/CrashLog', 'logs/ErrorLog', 'logs/TextLog', 'logs/SessionLog', 'monitoring/MonitoringDashboards', 'monitoring/Playback',
    'alerting/AlertRules',
    'rbac/RbacViewGrants', 'rbac/RbacUsers', 'rbac/RbacRoles', 'rbac/RbacProfiles',
    'backups/DataLifecycle', 'backups/StorageProfiles',
    'admin/UserManagement', 'admin/ClusterManagement', 'admin/AppDataBackup', 'admin/NotificationChannels',
    'schema-studio/SchemaStudio', 'schema-studio/StepSource', 'schema-studio/StepSchema', 'schema-studio/StepEngine', 'schema-studio/StepGenerate',
  ];

  pages.forEach(p => {
    it(`${p.split('/').pop()}.jsx exists`, () => {
      expect(fs.existsSync(`src/frontend/components/${p}.jsx`)).toBe(true);
      expect(read(`src/frontend/components/${p}.jsx`)).toContain('export default');
    });
  });
});

describe('Sidebar: current structure behavior', () => {
  const code = read('src/frontend/components/layout/Sidebar.jsx');

  it('contains CORE_NAV_ITEMS', () => {
    expect(code).toContain('const CORE_NAV_ITEMS = [');
  });

  it('includes playback item under monitoring', () => {
    expect(
      code.includes("id: 'monitoring/playback'") ||
      code.includes('id: "monitoring/playback"')
    ).toBe(true);
    expect(
      code.includes("label: 'Playback'") ||
      code.includes('label: "Playback"')
    ).toBe(true);
  });

  it('uses core nav items directly', () => {
    expect(code).toContain('const NAV_ITEMS = CORE_NAV_ITEMS;');
  });

  it('does not use plugin nav items', () => {
    expect(code).not.toContain('getPluginNavItems');
  });

  it('uses useLocation', () => {
    expect(code).toContain('useLocation');
  });

  it('uses useTheme', () => {
    expect(code).toContain('useTheme');
    expect(code).toContain('const {theme} = useTheme();');
  });

  it('contains openSections state', () => {
    expect(code).toContain('const [openSections, setOpenSections]');
  });

  it('contains section toggle logic', () => {
    expect(code).toContain('function toggleSection(id)');
    expect(code).toContain('function handleSectionClick(sectionId)');
  });

  it('contains navigation handler', () => {
    expect(code).toContain('function navigateTo(itemId, sectionId)');
    expect(code).toContain('onNavigate(itemId)');
  });

  it('contains sidebar toggle button', () => {
    expect(code).toContain('className="sidebar-toggle"');
  });

  it('contains collapsed class handling', () => {
    expect(
      code.includes('sidebar ${isCollapsed ? "collapsed" : ""}') ||
      code.includes("sidebar ${isCollapsed ? 'collapsed' : ''}")
    ).toBe(true);
  });

  it('contains dark theme helper', () => {
    expect(code).toContain('function isDark()');
    expect(
      code.includes("return theme === 'dark'") ||
      code.includes('return theme === "dark"')
    ).toBe(true);
  });
});

describe('MainLayout + Sidebar integration checks', () => {
  const ml = read('src/frontend/components/layout/MainLayout.jsx');

  it('passes currentRoute to Sidebar', () => {
    expect(ml).toContain('currentRoute={route}');
  });

  it('passes onNavigate to Sidebar', () => {
    expect(ml).toContain('onNavigate={handleNavigate}');
  });

  it('passes collapsed state to Sidebar', () => {
    expect(ml).toContain('collapsed={sidebarCollapsed}');
  });

  it('passes onToggle to Sidebar', () => {
    expect(ml).toContain('onToggle={() => setSidebarCollapsed((v) => !v)}');
  });

  it('includes monitoring playback route', () => {
    expect(
      ml.includes("'monitoring/playback'") ||
      ml.includes('"monitoring/playback"')
    ).toBe(true);
  });

  it('includes tools profiler and metrics routes', () => {
    expect(
      ml.includes("'tools/profiler'") ||
      ml.includes('"tools/profiler"')
    ).toBe(true);
    expect(
      ml.includes("'tools/metrics'") ||
      ml.includes('"tools/metrics"')
    ).toBe(true);
  });
});

describe('Sidebar: newly added function coverage', () => {
  const code = read('src/frontend/components/layout/Sidebar.jsx');

  it('uses isCollapsed with forceCollapsed fallback', () => {
    expect(code).toContain('const isCollapsed = forceCollapsed || collapsed;');
  });

  it('uses direct core nav assignment', () => {
    expect(code).toContain('const NAV_ITEMS = CORE_NAV_ITEMS;');
  });

  it('does not memoize plugin nav items with core items', () => {
    expect(code).not.toContain('const NAV_ITEMS = useMemo(() => {');
    expect(code).not.toContain('const pluginItems = getPluginNavItems();');
    expect(code).not.toContain('if (!pluginItems.length) return CORE_NAV_ITEMS;');
    expect(code).not.toContain('return [...CORE_NAV_ITEMS, ...pluginItems];');
  });

  it('initializes openSections from location pathname segment', () => {
    expect(
      code.includes("const segment = location.pathname.split('/')[1]?.toLowerCase();") ||
      code.includes('const segment = location.pathname.split("/")[1]?.toLowerCase();')
    ).toBe(true);
    expect(code).toContain('const initial = {};');
    expect(
      code.includes("initial[s.id] = segment ? s.id === segment : s.id === 'overview';") ||
      code.includes('initial[s.id] = segment ? s.id === segment : s.id === "overview";')
    ).toBe(true);
  });

  it('has route-driven open section sync useEffect', () => {
    expect(code).toContain('useEffect(() => {');
    expect(
      code.includes("const route = (currentRoute || '').toLowerCase();") ||
      code.includes('const route = (currentRoute || "").toLowerCase();')
    ).toBe(true);
    expect(
      code.includes("const pathSegment = location.pathname.split('/')[1]?.toLowerCase();") ||
      code.includes('const pathSegment = location.pathname.split("/")[1]?.toLowerCase();')
    ).toBe(true);
    expect(code).toContain('const activeSection =');
    expect(code).toContain('NAV_ITEMS.find(');
    expect(code).toContain('setOpenSections(next);');
    expect(code).toContain('}, [location.pathname, currentRoute, NAV_ITEMS]);');
  });

  it('toggleSection enforces single-open-section behavior', () => {
    expect(code).toContain('next[key] = key === id ? !openSections[key] : false;');
  });

  it('handleSectionClick expands sidebar when collapsed and opens target section', () => {
    expect(code).toContain('if (isCollapsed) {');
    expect(code).toContain('onToggle();');
    expect(code).toContain('next[key] = key === sectionId;');
    expect(code).toContain('} else {');
    expect(code).toContain('toggleSection(sectionId);');
  });

  it('render logic includes section header click and collapsed item click handlers', () => {
    expect(code).toContain('onClick={() => handleSectionClick(section.id)}');
    expect(code).toContain('{isCollapsed && (');
    expect(
      code.includes('className={`sidebar-item ${openSections[section.id] ? "active" : ""}`}') ||
      code.includes("className={`sidebar-item ${openSections[section.id] ? 'active' : ''}`}")
    ).toBe(true);
  });

  it('expanded mode renders children only for open section', () => {
    expect(
      code.includes('{!isCollapsed &&') &&
      code.includes('openSections[section.id] &&') &&
      code.includes('section.children.map((item) =>')
    ).toBe(true);
  });

  it('uses chevron direction based on open state', () => {
    expect(
      code.includes('className={`ti ti-chevron-${openSections[section.id] ? "down" : "right"}`}') ||
      code.includes("className={`ti ti-chevron-${openSections[section.id] ? 'down' : 'right'}`}")
    ).toBe(true);
  });

  it('passes title tooltip for collapsed section header', () => {
    expect(code).toContain('title={isCollapsed ? section.label : undefined}');
  });

  it('renders collapsed sidebar item title tooltip', () => {
    expect(code).toContain('title={section.label}');
  });

  it('renders collapse button label only when expanded', () => {
    expect(code).toContain('{!isCollapsed && <span>Collapse</span>}');
  });

  it('includes special qurioz item handling branch', () => {
    expect(code).toContain('item?.id === "/qurioz" ? (');
    expect(code).toContain('item.id?.replace("/", "")');
  });

  it('styles icons based on theme', () => {
    expect(
      code.includes('color: isDark() ? "white" : "black"') ||
      code.includes("color: isDark() ? 'white' : 'black'")
    ).toBe(true);
  });
});