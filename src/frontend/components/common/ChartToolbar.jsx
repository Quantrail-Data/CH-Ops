// ChartToolbar - shared HTML control row for ECharts charts (zoom, save, full
// screen), replacing ECharts' in-canvas toolbox. Because the buttons live in
// normal document flow above the chart (not absolutely positioned over the
// canvas), they never overlap the figure at any display size, and full screen
// is a CSS overlay rather than the browser's F11 fullscreen.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { useState, useCallback, useEffect } from 'react';
import Icon from './Icon.jsx';

// Save an ECharts instance as a PNG (retina). Uses the current theme's surface
// colour as the export background so themed axis labels, legends, and in-canvas
// titles stay visible (a forced white background hid light text in dark mode).
export function savePng(inst, filename = 'chart') {
  if (!inst) return;
  const cs = getComputedStyle(document.documentElement);
  const bg =
    (cs.getPropertyValue('--bg-page') || cs.getPropertyValue('--bg-surface') || '').trim() ||
    '#ffffff';
  const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg });
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename || 'chart'}.png`;
  a.click();
}

// Hook that wires save / zoom / full screen to an ECharts instance obtained via
// getInst(). Zoom drives a programmatic xAxis dataZoom window (charts that pass
// zoomable must inject an inside dataZoom via withZoomable in echarts.js).
export function useChartTools(getInst, { filename = 'chart' } = {}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [win, setWin] = useState([0, 100]);

  const dispatchZoom = useCallback((s, e) => {
    const i = getInst && getInst();
    if (i) i.dispatchAction({ type: 'dataZoom', start: s, end: e });
  }, [getInst]);

  const zoomIn = useCallback(() => setWin(([s, e]) => {
    const c = (s + e) / 2;
    const half = Math.max(2.5, ((e - s) * 0.75) / 2);
    const ns = Math.max(0, c - half), ne = Math.min(100, c + half);
    dispatchZoom(ns, ne);
    return [ns, ne];
  }), [dispatchZoom]);

  const zoomOut = useCallback(() => setWin(([s, e]) => {
    const c = (s + e) / 2;
    const half = Math.min(50, ((e - s) / 0.75) / 2);
    const ns = Math.max(0, c - half), ne = Math.min(100, c + half);
    dispatchZoom(ns, ne);
    return [ns, ne];
  }), [dispatchZoom]);

  const zoomReset = useCallback(() => { setWin([0, 100]); dispatchZoom(0, 100); }, [dispatchZoom]);

  const save = useCallback(() => {
    savePng(getInst && getInst(), filename);
  }, [getInst, filename]);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);

  // Escape exits the CSS full-screen overlay.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return {
    fullscreen, setFullscreen, toggleFullscreen,
    save, zoomIn, zoomOut, zoomReset,
    zoomPct: Math.round((100 * 100) / (win[1] - win[0])),
    zoomed: win[0] !== 0 || win[1] !== 100,
  };
}

export default function ChartToolbar({
  zoomable = false,
  fullscreen = false,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSave,
  onToggleFullscreen,
  style,
  isWantFeature = {
    zoomFun: true,
    resetFun: true,
    saveFun: true,
    fullscreenFun: true,
  },
}) {
  return (
    <div
      className="chart-toolbar"
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        ...style,
      }}
    >
      {isWantFeature?.zoomFun && (
        <>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onZoomIn}
            disabled={!zoomable}
            title={zoomable ? "Zoom in" : "Zoom not available for this chart"}
            aria-label="Zoom in"
          >
            <Icon className="ti ti-zoom-in"></Icon>
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onZoomOut}
            disabled={!zoomable}
            title={zoomable ? "Zoom out" : "Zoom not available for this chart"}
            aria-label="Zoom out"
          >
            <Icon className="ti ti-zoom-out"></Icon>
          </button>
        </>
      )}
      {isWantFeature?.resetFun && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={onZoomReset}
          disabled={!zoomable}
          title={zoomable ? "Reset zoom" : "Zoom not available for this chart"}
          aria-label="Reset zoom"
        >
          <Icon className="ti ti-zoom-reset"></Icon>
        </button>
      )}
      {onSave && isWantFeature?.saveFun && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={onSave}
          title="Save PNG"
          aria-label="Save PNG"
        >
          <Icon className="ti ti-download"></Icon>
        </button>
      )}
      {isWantFeature?.fullscreenFun && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={onToggleFullscreen}
          title={fullscreen ? "Exit full screen" : "Full screen"}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        >
          <Icon
            className={`ti ${fullscreen ? "ti-arrows-minimize" : "ti-arrows-maximize"}`}
          ></Icon>
        </button>
      )}
    </div>
  );
}
