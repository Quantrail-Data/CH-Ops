// Regression tests for the July 2026 UI fix batch: the sidebar/navbar icon
// swaps and the twelve-item UI fix list (typography, dropdowns, Qurioz crash
// guard, chart-builder heights, pie labels, schema-visualizer + profiler
// layouts, and light-mode button icons).
//
// Most assertions are intentionally source-level ("source-drift" style, the
// convention used across this suite) because the changes are CSS/markup that
// JSDOM cannot compute; the icon sprite and the Select component are exercised
// for real.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { SPRITE, ICON_NAMES } from '../../src/frontend/assets/iconSprite.js';

const read = (f) => fs.readFileSync(f, 'utf8');

describe('Icon swaps: sidebar / navbar / sprite', () => {
  it('sprite manifest includes the swapped icons with real symbols', () => {
    for (const name of ['eye', 'file-smile', 'topology-star']) {
      expect(ICON_NAMES.has(name)).toBe(true);
      expect(SPRITE).toContain(`id="tabler-${name}"`);
    }
  });

  it('Overview section uses the eye icon (not dashboard)', () => {
    const code = read('src/frontend/components/layout/Sidebar.jsx');
    expect(code).toContain('icon: "ti-eye"');
    expect(code).not.toContain('icon: "ti-dashboard"');
  });

  it('Logs section uses the file-smile icon (not file-text)', () => {
    const code = read('src/frontend/components/layout/Sidebar.jsx');
    expect(code).toContain('icon: "ti-file-smile"');
  });

  it('Navbar cluster field uses the topology-star icon', () => {
    const code = read('src/frontend/components/layout/Navbar.jsx');
    expect(code).toContain('ti-topology-star');
  });
});

describe('Item 1: Cluster Overview page renamed to Node Overview', () => {
  it('section title reads "Node Overview"', () => {
    const code = read('src/frontend/components/overview/ClusterOverview.jsx');
    expect(code).toContain('Node Overview');
  });
});

describe('Items 2/3: dropdown chevron + B612 values', () => {
  const css = read('src/frontend/components/common/select.css');

  it('dropdown control and option text use the B612 table font', () => {
    expect(css).toContain('font-family: var(--font-table); font-size: 14px');
    expect(css).toContain('.cui-select-opt');
    expect(css).toMatch(/\.cui-select-opt[\s\S]*font-family: var\(--font-table\)/);
  });

  it('narrow datetime unit selects center value and chevron together', () => {
    const g = read('src/frontend/styles/global.css');
    expect(g).toContain('.datetime-unit .cui-select-control');
    expect(g).toMatch(/\.datetime-unit \.cui-select-control[\s\S]*justify-content: center/);
  });
});

describe('Item 4: form labels Jakarta, form fields B612', () => {
  const g = read('src/frontend/styles/global.css');

  it('form inputs use the B612 table font', () => {
    expect(g).toMatch(/\.form-input,\s*\.form-select,\s*\.form-textarea\s*\{[\s\S]*font-family: var\(--font-table\)/);
  });

  it('form labels are pinned to the Jakarta UI font', () => {
    expect(g).toMatch(/\.form-label\s*\{[\s\S]*font-family: var\(--font-ui\)/);
  });

  it('user-input elements default to B612 app-wide', () => {
    expect(g).toMatch(/input, select, textarea\s*\{\s*font-family: var\(--font-table\)/);
  });
});

describe('Item 5: Qurioz chat storage is always an array', () => {
  const app = read('src/frontend/App.jsx');

  it('reads stored chat through an array-guarded helper', () => {
    expect(app).toContain('readStoredChat');
    expect(app).toContain('Array.isArray');
  });

  it('no longer spreads a raw JSON.parse of localStorage into the message list', () => {
    // The crashing pattern was [...JSON.parse(localStorage?.getItem(...))]
    expect(app).not.toContain('...JSON.parse(localStorage?.getItem(ContextChatKey))');
  });

  it('filter call site is guarded against a non-array value', () => {
    const chat = read('src/frontend/components/qurioz/QuriozChatComponent.jsx');
    expect(chat).toContain('(quriozMessage || []).filter');
  });
});

describe('Item 6: Chart Builder heights are viewport-relative', () => {
  const code = read('src/frontend/components/dashboards/ChartBuilder.jsx');

  it('SQL, Results, Config and Preview panels size to the viewport, not fixed px', () => {
    for (const vh of ['26vh', '40vh', '60vh', '50vh']) {
      expect(code).toContain(`"${vh}"`);
    }
    // the old fixed caps are gone
    expect(code).not.toContain('maxHeight: 120');
    expect(code).not.toContain('maxHeight: 500');
  });
});

describe('Item 7: unlabelled pies now label their slices', () => {
  const pies = [
    'src/frontend/components/logs/SessionLog.jsx',
    'src/frontend/components/logs/ErrorLog.jsx',
    'src/frontend/components/logs/TextLog.jsx',
    'src/frontend/components/monitoring/MonitoringDashboards.jsx',
  ];
  pies.forEach((p) => {
    it(`${p.split('/').pop()} shows name + percent on each slice`, () => {
      const code = read(p);
      expect(code).toContain("formatter: '{b} ({d}%)'");
      expect(code).not.toContain('label: { show: false }');
    });
  });
});

describe('Item 8: Schema Visualizer selects have explicit widths', () => {
  const code = read('src/frontend/components/schema/SchemaVisualizer.jsx');
  it('uses fixed widths so dropdowns flow multiple per row (not full-width)', () => {
    expect(code).toContain('width: 200');
    expect(code).toContain('width: 240');
    // no longer relying on minWidth (which cannot beat .cui-select width:100%)
    expect(code).not.toContain('minWidth: 160');
  });
});

describe('Item 9: Query Profiler Query ID sits in the filter row', () => {
  const code = read('src/frontend/components/profiler/QueryProfiler.jsx');
  it('Query ID search is a flexible filter-row group', () => {
    expect(code).toContain('flex: "1 1 280px"');
  });
  it('the old standalone full-width Query ID block was removed', () => {
    expect(code).not.toContain('flexDirection:"column",gap:"10px"');
  });
});

describe('Item 10: Processors Kind/Type selects match the time inputs', () => {
  const code = read('src/frontend/components/profiler/ProcessorsProfile.jsx');
  const css = read('src/frontend/components/common/select.css');
  it('selects use the compact form-select modifier', () => {
    expect(code.match(/className="form-select cui-sm"/g)?.length).toBe(2);
  });
  it('compact modifier shrinks the control padding/font', () => {
    expect(css).toContain('.cui-select.cui-sm .cui-select-control');
    expect(css).toMatch(/\.cui-sm \.cui-select-control\s*\{\s*padding: 6px 8px; font-size: 12px/);
  });
});

describe('Item 11: Query Metrics Query ID input is wide enough for UUIDs', () => {
  const code = read('src/frontend/components/profiler/QueryMetrics.jsx');
  it('the query-id search input is widened', () => {
    expect(code).toContain('maxWidth: 480');
  });
});

describe('Item 12: light-mode filled buttons keep white icons', () => {
  const g = read('src/frontend/styles/global.css');
  it('forces white icons inside primary/danger buttons in light mode', () => {
    expect(g).toMatch(/\[data-theme="light"\] \.btn\.btn-primary \.ti/);
    expect(g).toMatch(/\[data-theme="light"\] \.btn\.btn-danger \.ti/);
  });
});
