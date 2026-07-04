// ChartCard - Wrapper component for ECharts with an HTML control toolbar
//
// Renders an ECharts-based chart inside a card. Handles init, disposal, option
// updates, and resizing. A shared HTML ChartToolbar (zoom for cartesian charts,
// save, and CSS-overlay full screen) sits in the card header, so the controls
// never overlap the figure and full screen is a CSS overlay, not browser F11.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useRef, useEffect } from 'react';
import ChartToolbar, { useChartTools } from '../common/ChartToolbar.jsx';
import { initChart, disposeChart, withZoomable } from '../../utils/echarts.js';

export default function ChartCard({ title, option, height = 280, loading = false, scrollToHeight = null ,chartType='all'}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const tools = useChartTools(() => chartRef.current, { filename: title });
  const fullscreen = tools.fullscreen;
  const zoomable = !!(option && option.xAxis);

  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = initChart(containerRef.current);
    if (option) { chartRef.current.setOption(withZoomable({ ...option, toolbox: { show: false } }), true); setTimeout(() => chartRef.current?.resize(), 50); }
    return () => { disposeChart(containerRef.current); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !option) return;
    chartRef.current.setOption(withZoomable({ ...option, toolbox: { show: false } }), true);
    setTimeout(() => chartRef.current?.resize(), 50);
  }, [option]);

  useEffect(() => {
    // Delay resize to let layout settle after a full-screen toggle.
    const timer = setTimeout(() => chartRef.current?.resize(), 150);
    return () => clearTimeout(timer);
  }, [fullscreen]);

  // Give the canvas extra vertical room to read. No toolbox band is reserved
  // now that controls live in the HTML header row above the chart.
  const EXTRA_HEIGHT = 80;
  const chartH = fullscreen
    ? 'calc(100vh - 96px)'
    : (height + EXTRA_HEIGHT) + 'px';

  // When scrollToHeight is set, cap the chart body to what a chart of that height
  // would occupy and let it scroll. The canvas keeps its natural (taller) height,
  // so bars/rows stay readable instead of being squished, and the card lines up
  // in height with a sibling chart of `scrollToHeight`. The title stays pinned.
  const bodyStyle = { position: 'relative', flex: fullscreen ? 1 : undefined };
  if (scrollToHeight != null && !fullscreen) {
    bodyStyle.maxHeight = (scrollToHeight + EXTRA_HEIGHT) + 'px';
    bodyStyle.overflowY = 'auto';
  }

  const pieChartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };
    const chartControlsFlags = {
    zoomFun: true,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
  };

  return (
    <div style={fullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' } : { position: 'relative', minWidth: 0, overflow: 'hidden' }}>
      <div className="card" style={{ padding: '16px', flex: fullscreen ? 1 : undefined, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexShrink: 0, gap: 8 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>{title}</span>
          <ChartToolbar
            zoomable={zoomable}
            fullscreen={fullscreen}
            onZoomIn={tools.zoomIn}
            onZoomOut={tools.zoomOut}
            onZoomReset={tools.zoomReset}
            onSave={tools.save}
            onToggleFullscreen={tools.toggleFullscreen}
            isWantFeature={chartType === 'pie' ? pieChartControlsFlags : chartControlsFlags}
          />
        </div>
        <div style={bodyStyle}>
          <div ref={containerRef} style={{ height: chartH, width: '100%' }} />
          {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', opacity: 0.7 }}><span className="loading-spinner"></span></div>}
        </div>
      </div>
    </div>
  );
}
