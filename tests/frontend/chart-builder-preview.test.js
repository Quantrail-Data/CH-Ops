// Guards for the Chart Builder preview: a bad chart configuration must surface
// the exception in the preview area, never crash the page.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

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
    expect(code).toContain('runQuery(sql.trim(), { readOnly: true })');
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

  it('keeps zoom reset support in the component', () => {
    expect(code).toContain('function resetZoom()');
    expect(code).toContain('type: "dataZoom"');
    expect(code).toContain('dataZoomIndex: 0');
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
