// Tests for the shared HTML chart toolbar and the echarts helper changes that
// replaced the in-canvas ECharts toolbox and browser fullscreen.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "vitest";
import fs from "fs";
import { withZoomable } from "../../src/frontend/utils/echarts.js";

const read = (f) => fs.readFileSync(f, "utf8");
const TOOLBAR = "src/frontend/components/common/ChartToolbar.jsx";
const ECHARTS = "src/frontend/utils/echarts.js";
const CHARTCARD = "src/frontend/components/layout/ChartCard.jsx";

describe("withZoomable", () => {
  it("adds a programmatic inside dataZoom to a cartesian option", () => {
    const out = withZoomable({ xAxis: {}, series: [] });
    expect(Array.isArray(out.dataZoom)).toBe(true);
    expect(out.dataZoom[0].type).toBe("inside");
    expect(out.dataZoom[0].zoomOnMouseWheel).toBe(false);
  });

  it("is a no-op for a non-cartesian option (no xAxis)", () => {
    const opt = { series: [{ type: "pie" }] };
    expect(withZoomable(opt).dataZoom).toBeUndefined();
  });

  it("leaves an existing dataZoom untouched", () => {
    const opt = { xAxis: {}, dataZoom: [{ type: "slider" }] };
    expect(withZoomable(opt).dataZoom).toHaveLength(1);
    expect(withZoomable(opt).dataZoom[0].type).toBe("slider");
  });

  it("returns non-objects unchanged", () => {
    expect(withZoomable(null)).toBe(null);
    expect(withZoomable(true)).toBe(true);
  });

  it("returns primitive values unchanged", () => {
    expect(withZoomable(0)).toBe(0);
    expect(withZoomable("x")).toBe("x");
    expect(withZoomable(false)).toBe(false);
  });

  it("preserves existing option fields when injecting dataZoom", () => {
    const opt = { xAxis: { type: "category" }, yAxis: { type: "value" }, series: [{ type: "line" }] };
    const out = withZoomable(opt);
    expect(out.xAxis).toEqual(opt.xAxis);
    expect(out.yAxis).toEqual(opt.yAxis);
    expect(out.series).toEqual(opt.series);
  });
});

describe("ChartToolbar component", () => {
  const code = read(TOOLBAR);

  it("always renders zoom buttons, disabled when not zoomable", () => {
    expect(code).not.toMatch(/\{zoomable && \(/);
    expect(code).toMatch(/onClick=\{onZoomIn\}\s+disabled=\{!zoomable\}/);
    expect(code).toMatch(/onClick=\{onZoomOut\}\s+disabled=\{!zoomable\}/);
    expect(code).toMatch(/onClick=\{onZoomReset\}\s+disabled=\{!zoomable\}/);
  });

  it("only shows the save button when an onSave handler is given", () => {
    expect(code).toContain("{onSave && isWantFeature?.saveFun && (");
    expect(code).toContain("onClick={onSave}");
    expect(code).toContain('title="Save PNG"');
    expect(code).toContain('aria-label="Save PNG"');
  });

  it("uses arrows-maximize / arrows-minimize for the full-screen toggle", () => {
    expect(code).toContain("ti-arrows-minimize");
    expect(code).toContain("ti-arrows-maximize");
  });

  it("exports on the theme background, not forced white", () => {
    expect(code).toContain("--bg-page");
    expect(code).not.toContain("backgroundColor: '#ffffff'");
  });

  it("exports savePng and useChartTools", () => {
    expect(code).toContain("export function savePng");
    expect(code).toContain("export function useChartTools");
  });

  it("wires fullscreen state and toggle in the hook", () => {
    expect(code).toContain("const [fullscreen, setFullscreen] = useState(false);");
    expect(code).toContain("const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);");
    expect(code).toContain("fullscreen, setFullscreen, toggleFullscreen,");
  });

  it("adds escape key handling for fullscreen exit", () => {
    expect(code).toContain("if (e.key === 'Escape') setFullscreen(false);");
    expect(code).toContain("document.addEventListener('keydown', onKey);");
    expect(code).toContain("document.removeEventListener('keydown', onKey)");
  });

  it("keeps feature flags for zoom, reset, save, and fullscreen", () => {
    expect(code).toContain("zoomFun: true");
    expect(code).toContain("resetFun: true");
    expect(code).toContain("saveFun: true");
    expect(code).toContain("fullscreenFun: true");
    expect(code).toContain("isWantFeature?.zoomFun");
    expect(code).toContain("isWantFeature?.resetFun");
    expect(code).toContain("isWantFeature?.saveFun");
    expect(code).toContain("isWantFeature?.fullscreenFun");
  });

  it("uses the expected accessibility labels for toolbar actions", () => {
    expect(code).toContain('aria-label="Zoom in"');
    expect(code).toContain('aria-label="Zoom out"');
    expect(code).toContain('aria-label="Reset zoom"');
    expect(code).toContain('aria-label="Save PNG"');
  });

  it("dispatches dataZoom actions from the hook", () => {
    expect(code).toContain("i.dispatchAction({ type: 'dataZoom', start: s, end: e });");
    expect(code).toContain("dispatchZoom(0, 100);");
  });

  it("uses chart-toolbar container styles", () => {
    expect(code).toContain('className="chart-toolbar"');
    expect(code).toContain('justifyContent: "flex-end"');
    expect(code).toContain('alignItems: "center"');
    expect(code).toContain("flexShrink: 0");
  });
});

describe("echarts helpers: toolbox removed, no browser fullscreen", () => {
  const code = read(ECHARTS);

  it("no longer exports the ECharts-toolbox helpers", () => {
    for (const gone of [
      "standardToolbox",
      "applyChartToolbox",
      "reserveToolboxBand",
      "fullscreenFeature",
      "TOOLBOX_BAND",
    ]) {
      expect(code).not.toContain(`export function ${gone}`);
      expect(code).not.toContain(`export const ${gone}`);
    }
  });

  it("initChart does not auto-inject a toolbox", () => {
    expect(code).not.toContain("applyChartToolbox");
  });

  it("never uses the browser fullscreen API", () => {
    expect(code).not.toContain("requestFullscreen");
  });

  it("contains withZoomable helper", () => {
    expect(code).toContain("export function withZoomable");
    expect(code).toContain("dataZoom");
  });
});

describe("ChartCard", () => {
  const code = read(CHARTCARD);

  it("strips any option toolbox so no in-canvas toolbox renders", () => {
    expect(code).toContain("toolbox: { show: false }");
  });

  it("renders the shared HTML toolbar", () => {
    expect(code).toContain("import ChartToolbar");
    expect(code).toContain("<ChartToolbar");
  });

  it("uses chart tools hook integration", () => {
    expect(code).toContain("useChartTools");
  });
});
