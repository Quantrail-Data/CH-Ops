// chart-builder-preview.test.js - the Chart Builder preview never taking the page down
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const FILES = [
  'src/frontend/components/dashboards/ChartBuilder.jsx',
  'src/frontend/components/pages/ChartBuilder.jsx',
];

const file = FILES.find((f) => existsSync(f));
const code = file ? readFileSync(file, 'utf-8') : '';

describe('ChartBuilder: preview never crashes the page', () => {
  it('wraps buildChartOption in try/catch and reports the error inline', () => {
    expect(code).toContain('buildChartOption(');
    expect(code).toMatch(/try\s*\{[\s\S]*buildChartOption\([\s\S]*catch\s*\(err\)\s*\{[\s\S]*_error: true/);
  });

  it('wraps the preview subtree in an ErrorBoundary with a compact fallback that resets', () => {
    expect(code).toContain('import ErrorBoundary');
    expect(code).toContain('<ErrorBoundary');
    expect(code).toContain('resetKeys={[chartOption]}');
    expect(code).toMatch(/Chart preview\s*[\r\n\s]*failed:/);
  });

  it('keeps the read-only guard on the query run', () => {
    expect(code).toContain('isReadOnlySql(sql)');
    // The call gained a params argument so a parameterized chart can be
    // previewed with its defaults; readOnly is still non-negotiable.
    expect(code).toContain('runQuery(sql.trim(), {');
    expect(code).toContain('readOnly: true');
  });

  it('previews a parameterized chart with its defaults', () => {
    expect(code).toContain('paramDefaults');
    expect(code).toContain('findParameters');
    // A required parameter with no default is explained rather than sent, so
    // the author does not get ClickHouse's substitution error instead.
    expect(code).toContain('to preview this chart');
  });

  it('warns when a parameter sits outside an optional block', () => {
    expect(code).toContain('outside an optional');
    // A warning, never a block: some filters genuinely should be mandatory.
    expect(code).toContain('alert-banner warning');
  });

  it('has no leftover debug logging', () => {
    expect(code).not.toContain('console.log(fields)');
  });

  it('uses ChartToolbar in the preview area', () => {
    expect(code).toContain('import ChartToolbar');
    expect(code).toContain('<ChartToolbar');
    expect(code).toContain('onZoomIn={previewTools.zoomIn}');
    expect(code).toContain('onZoomOut={previewTools.zoomOut}');
    expect(code).toContain('onZoomReset={previewTools.zoomReset}');
    expect(code).toContain('onSave={previewTools.save}');
    expect(code).toContain('onToggleFullscreen={previewTools.toggleFullscreen}');
  });

  it('disables in-canvas toolbox before preview rendering', () => {
    expect(code).toContain('toolbox: { show: false }');
    expect(code).toContain('withZoomable({');
  });

  it('shows empty state text before a chart option exists', () => {
    expect(code).toContain('Map columns to see preview.');
    expect(code).toContain('className="empty-state"');
  });

  it('resizes preview after chart render and layout toggles', () => {
    expect(code).toContain('setTimeout(() => previewInst.current?.resize(), 50);');
    expect(code).toContain('setTimeout(() => previewInst.current?.resize(), 150);');
  });

  it('defines chart control flags for pie and non-pie charts', () => {
    expect(code).toContain('const pieChartControlsFlags = {');
    expect(code).toContain('zoomFun: false');
    expect(code).toContain('resetFun: false');
    expect(code).toContain('saveFun: true');
    expect(code).toContain('fullscreenFun: true');
    expect(code).toContain('const chartControlsFlags = {');
    expect(code).toContain('zoomFun: true');
    expect(code).toContain('resetFun: true');
  });
});
