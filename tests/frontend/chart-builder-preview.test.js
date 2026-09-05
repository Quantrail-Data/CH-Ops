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
    expect(code).toContain('runQuery(sql.trim(), {');
    expect(code).toContain('readOnly: true');
  });

  it('previews a parameterized chart with its defaults', () => {
    expect(code).toContain('paramDefaults');
    expect(code).toContain('findParameters');
    expect(code).toContain('to preview this chart');
  });

  it('warns when a parameter sits outside an optional block', () => {
    expect(code).toContain('outside an optional');
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
    expect(code).toContain('onZoomReset={resetZoom}');
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
    expect(code).toMatch(/setTimeout\(\(\)\s*=>\s*\{[\s\S]*previewInst\.current[\s\S]*resize\(\)[\s\S]*\}\s*,\s*50\s*\);/);
    expect(code).toMatch(/setTimeout\(\(\)\s*=>\s*\{[\s\S]*previewInst\.current[\s\S]*resize\(\)[\s\S]*\}\s*,\s*150\s*\);/);
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

  it('keeps fullscreen-aware preview toolbar wiring', () => {
    expect(code).toContain('fullscreen={previewTools.fullscreen}');
    expect(code).toContain('zoomable={!!chartOption?.xAxis || isTreemapChartType}');
  });

  it('keeps chart-change broadcast after save/update', () => {
    expect(code).toContain("window.dispatchEvent(new Event('charts:changed'))");
  });

  it('keeps KPI and table preview branches intact', () => {
    expect(code).toContain('chartOption?._kpi');
    expect(code).toContain('chartOption?._table');
    expect(code).toContain('Current Value');
    expect(code).toContain('<DataTable rows={chartOption.data} />');
  });

  it('keeps fullscreen body class lifecycle handling for preview mode', () => {
    expect(code).toContain('chart-builder-preview-fullscreen');
    expect(code).toContain('document.body.classList.add("chart-builder-preview-fullscreen")');
    expect(code).toContain('document.body.classList.remove("chart-builder-preview-fullscreen")');
  });

  it('keeps chart instance lifecycle safety guards', () => {
    expect(code).toContain('disposeChart(previewRef.current)');
    expect(code).toContain('if (!previewRef.current || !isMountedRef.current) return;');
    expect(code).toContain('previewInst.current = null;');
  });
});