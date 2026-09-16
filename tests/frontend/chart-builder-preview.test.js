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
    expect(code).toMatch(/try\s*\{[\s\S]*buildChartOption\([\s\S]*catch\s*\(err\)\s*\{[\s\S]*_error:\s*true/);
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
    expect(code).toContain('disposeChart(');
    expect(code).toContain('previewRef.current');
    expect(code).toContain('previewInst.current = null;');
    expect(
      code.includes('if (!previewRef.current || !isMountedRef.current)') ||
      code.includes('if (!host || !host.isConnected) return;')
    ).toBe(true);
  });

  it('cleans up chart on unmount with cleanupChart function', () => {
    expect(code).toContain('const cleanupChart = () => {');
    expect(code).toContain('chartEpochRef.current += 1');
    expect(code).toContain('clearTimeout(initTimerRef.current)');
    expect(code).toContain('clearTimeout(resizeTimerRef.current)');
  });

  it('handles chart instance disposal safely with try/catch', () => {
    expect(code).toContain('try {');
    expect(code).toContain('disposeChart(');
    expect(code).toMatch(/catch\s*\(\s*e\s*\)\s*\{[\s\S]*\}/);
  });

  it('validates column types after data loads', () => {
    expect(code).toContain('validateColumnType(data, mapping[f.key], f.expect)');
    expect(code).toContain('setValidationErrors(errs)');
  });

  it('checks isMountedRef before state updates', () => {
    expect(code).toContain('isMountedRef.current');
    expect(code).toContain('if (isMountedRef.current)');
  });

  it('manages zoom with dataZoomIndex for multiple axes', () => {
    expect(code).toContain('function zoomIn()');
    expect(code).toContain('function zoomOut()');
    expect(code).toContain('dataZoomIndex: 0');
  });

  it('handles treemap special case in resetZoom', () => {
    expect(code).toContain('isTreemapNow');
    expect(code).toContain('chartType === "treemap" || chartSubtype === "treemap"');
    expect(code).toContain('previewInst.current.clear()');
  });

  it('separates numeric columns for field mapping', () => {
    expect(code).toContain('function SeperateNumericColumns(column)');
    expect(code).toContain('typeof data[0][find] === "number"');
  });

  it('maintains authorization check for chart building', () => {
    expect(code).toContain('const canBuild = myLevel >= ROLE_LEVEL.admin');
    expect(code).toContain('if (!canBuild)');
    expect(code).toContain('Chart building is only available for administrators');
  });

  it('handles parameter defaults for dashboard filters', () => {
    expect(code).toContain('paramDefaults[p.name]');
    expect(code).toContain('setParamDefaults');
    expect(code).toContain('Give a default for');
  });

  it('saves chart with proper config structure', () => {
    expect(code).toContain('const config = {');
    expect(code).toContain('...mapping');
    expect(code).toContain('xLabel');
    expect(code).toContain('yLabel');
    expect(code).toContain('showLegend');
  });

  it('prevents duplicate chart names in the same dashboard', () => {
    expect(code).toContain('const duplicate = (existing || []).find((c) => {');
    expect(code).toContain('sameName && sameDashboard && !sameId');
    expect(code).toContain('Chart name already exists in this dashboard');
  });

  it('handles horizontal bar chart axis label swapping', () => {
    expect(code).toContain('chartSubtype === "horizontal_bar"');
    expect(code).toContain('effectiveXLabel = yLabel');
    expect(code).toContain('effectiveYLabel = xLabel');
  });

  it('applies responsive text and font sizing for density', () => {
    expect(code).toContain('densityThreshold');
    expect(code).toContain('tickCount > 80');
    expect(code).toContain('axisFontSize');
    expect(code).toContain('dataLabelFontSize');
  });

  it('manages grid and axis styling based on chart type', () => {
    expect(code).toContain('usesCartesianGrid');
    expect(code).toContain('gridLineColor');
    expect(code).toContain('gridLineColorSubtle');
    expect(code).toContain('splitLineStyle');
  });

  it('handles sunburst legend data collection', () => {
    expect(code).toContain('collectSunburstNames');
    expect(code).toContain('countSunburstNodes');
    expect(code).toContain('isSunBurst');
  });

  it('applies theme-aware styling for dark mode', () => {
    expect(code).toContain("theme === 'dark'");
    expect(code).toContain('isDarkColor');
    expect(code).toContain('textBorderColor');
  });

  it('maintains legend visibility logic per chart type', () => {
    expect(code).toContain('shouldShowLegend');
    expect(code).toContain('needsLegend(chartType, chartSubtype)');
    expect(code).toContain('legendVisible');
  });

  it('hides labels on pie charts when slice count exceeds threshold', () => {
    expect(code).toContain('hidePieLabels');
    expect(code).toContain('pieSliceCount > 16');
  });

  it('computes grid margins and spacing dynamically', () => {
    expect(code).toContain('gridTop');
    expect(code).toContain('gridLeft');
    expect(code).toContain('gridBottomFinal');
    expect(code).toContain('yNameGap');
  });

  it('manages chart epoch for concurrent renders', () => {
    expect(code).toContain('chartEpochRef.current');
    expect(code).toContain('epoch !== chartEpochRef.current');
  });

  it('initializes chart with proper host element check', () => {
    expect(code).toContain('host.isConnected');
    expect(code).toContain('initChart(host)');
  });

  it('formats axis labels with K/M notation for large numbers', () => {
    expect(code).toContain('Math.abs(n) >= 1000000');
    expect(code).toContain('toFixed(1)');
    expect(code).toContain('(n / 1000000).toFixed(1)');
  });

  it('provides max rows control for query execution', () => {
    expect(code).toContain('MaxRowsControl');
    expect(code).toContain('maxRows');
    expect(code).toContain('setMaxRows');
    expect(code).toContain('clampMaxRows');
  });

  it('handles edit mode with proper data initialization', () => {
    expect(code).toContain('if (editChart)');
    expect(code).toContain('editChart.sqlQuery');
    expect(code).toContain('editChart.chartType');
    expect(code).toContain('editChart.config');
  });

  it('manages top and bottom panel collapse state', () => {
    expect(code).toContain('topOpen');
    expect(code).toContain('bottomOpen');
    expect(code).toContain('setTopOpen');
    expect(code).toContain('setBottomOpen');
  });

  it('implements role-based access control', () => {
    expect(code).toContain('ROLE_LEVEL');
    expect(code).toContain('readonly: 0');
    expect(code).toContain('admin: 2');
    expect(code).toContain('myRole = auth?.role');
  });

  it('fetches dashboards on component mount', () => {
    expect(code).toContain('apiFetch("/api/dashboards")');
    expect(code).toContain('setDashboards');
  });

  it('updates legend based on data series configuration', () => {
    expect(code).toContain('hasLegendCheck');
    expect(code).toContain('option.legend?.show');
    expect(code).toContain('option.series.some(s => Array.isArray(s?.data)');
  });
});