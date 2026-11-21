// Tests for the package 6.3 fixes (issues reported after package 6.2).
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import fs from "fs";
import { fullChartDataURL } from "../../src/frontend/components/common/ChartToolbar.jsx";

vi.mock("../../src/frontend/App.jsx", () => ({ useTheme: () => ({ theme: "dark" }) }));

const read = (file) => fs.readFileSync(file, "utf8");
const css = read("src/frontend/styles/global.css");

// A small stand-in for an ECharts instance: it records the zoom when the
// picture is taken.
function fakeChart(zoomWindows) {
  const state = { zoom: zoomWindows.map((zoom) => ({ ...zoom })), animation: true, zoomAtPicture: null };
  return {
    state,
    getOption: () => ({ dataZoom: state.zoom.map((zoom) => ({ ...zoom })), animation: state.animation }),
    setOption: (option) => {
      if ("animation" in option) state.animation = option.animation;
    },
    dispatchAction: ({ dataZoomIndex, start, end }) => {
      state.zoom[dataZoomIndex] = { start, end };
    },
    getDataURL: () => {
      state.zoomAtPicture = state.zoom.map((zoom) => ({ ...zoom }));
      state.animationAtPicture = state.animation;
      return "data:image/png;base64,x";
    },
  };
}

describe("chart download (point 16)", () => {
  it("takes the picture of the whole chart when it is zoomed, then puts the zoom back", () => {
    const chart = fakeChart([{ start: 40, end: 60 }]);
    fullChartDataURL(chart, { type: "png" });
    expect(chart.state.zoomAtPicture).toEqual([{ start: 0, end: 100 }]);
    expect(chart.state.animationAtPicture).toBe(false);
    expect(chart.state.zoom).toEqual([{ start: 40, end: 60 }]);
    expect(chart.state.animation).toBe(true);
  });

  it("does not touch a chart that is not zoomed", () => {
    const chart = fakeChart([{ start: 0, end: 100 }]);
    const setOption = vi.spyOn(chart, "setOption");
    fullChartDataURL(chart, { type: "png" });
    expect(setOption).not.toHaveBeenCalled();
  });

  it("works for a chart with no zoom", () => {
    const chart = fakeChart([]);
    expect(fullChartDataURL(chart, { type: "png" })).toContain("data:image/png");
  });

  it("is used by the shared save, the Log heatmap and the SQL Editor graph", () => {
    expect(read("src/frontend/components/common/ChartToolbar.jsx")).toContain("const url = fullChartDataURL(inst,");
    expect(read("src/frontend/components/layout/LogHeatmap.jsx")).toContain("fullChartDataURL(chartInst.current,");
    expect(read("src/frontend/components/editor/QueryEditor.jsx")).toContain("fullChartDataURL(graphInst.current,");
  });
});

describe("faded fields (point 1)", () => {
  it("fades only fields with the readonly attribute, not sliders or check boxes", () => {
    expect(css).toContain("input[readonly] {");
    expect(css).not.toMatch(/input:read-only\s*\{/);
  });
});

describe("SQL Editor logo (point 8)", () => {
  it("shows only the logo, in the whole results area, for a query with no result table", async () => {
    const { default: DataTable } = await import("../../src/frontend/components/layout/DataTable.jsx");
    const { container } = render(<DataTable rows={[]} columns={[]} isShowLogo={true} />);
    expect(container.querySelector(".results-logo img")).not.toBeNull();
    expect(container.querySelector(".data-table-wrap")).toBeNull();
  });
});

describe("Schema & Estimate dialog (point 7)", () => {
  it("does not replace the fixed position of the modal", () => {
    const code = read("src/frontend/components/common/AIDDLModelComponent.jsx");
    expect(code).not.toContain('position: "relative"');
  });
});

describe("Qurioz send button (point 4)", () => {
  it("disables send on the new-chat screen only while an answer loads", () => {
    const code = read("src/frontend/components/qurioz/QuriozChatComponent.jsx");
    expect(code).not.toContain("isAllowForRequestHandler() || !isLoading");
  });

  it("gives the disabled button a visible style", () => {
    expect(css).toContain(".qur-chat-btn.disabled {");
  });
});

describe("Kubernetes Insights (points 3 and 12)", () => {
  it("shows an empty state when the connected cluster uses a Direct connection", () => {
    const code = read("src/frontend/components/kubernetes/KubernetesInsightPage.jsx");
    expect(code).toContain("Switch to Kubernetes mode to view Kubernetes Insights.");
    expect(code).toContain('connectedCluster.kind !== "k8s"');
  });

  it("colors the health checks: green passed, red could not run", () => {
    const code = read("src/frontend/components/kubernetes/KubernetesInsight.jsx");
    expect(code).toContain("ti ti-circle-check check-status-ok");
    expect(code).toContain("ti ti-help-circle check-status-unknown");
    expect(css).toMatch(/\.check-status-ok \{\s*color: var\(--success\)/);
    expect(css).toMatch(/\.check-status-unknown \{\s*color: var\(--danger\)/);
  });

  it("shows when the logs were read", () => {
    const code = read("src/frontend/components/kubernetes/KubernetesInsight.jsx");
    expect(code).toContain("`Read at ${formatReadTime(fetchedAt)}`");
  });
});

describe("Alert Rules (points 9, 14 and 15)", () => {
  const code = read("src/frontend/components/alerting/AlertRules.jsx");

  it("does not open the rule when the card is clicked", () => {
    expect(code).not.toMatch(/if \(event\.target\.closest\("button, a"\)\) return;\s*edit\(r\);/);
  });

  it("keeps a template rule that was just disabled on the page", () => {
    expect(code).toContain("rulesKeptVisible.has(rule.id)");
  });

  it("scrolls to the test results", () => {
    expect(code).toContain("testResultsRef.current?.scrollIntoView");
  });
});

describe("Index Management drop (point 13)", () => {
  it("asks before the index is dropped", () => {
    const code = read("src/frontend/components/indexes/CreateIndex.jsx");
    expect(code).toContain("onClick={() => setIsConfirmingDrop(true)}");
    expect(code).toMatch(/onConfirm=\{\(\) => \{\s*setIsConfirmingDrop\(false\);\s*executeDrop\(\);/);
  });
});

describe("System Dashboards tabs (point 2)", () => {
  it("uses the tab bar with arrows", () => {
    const code = read("src/frontend/components/monitoring/MonitoringDashboards.jsx");
    expect(code).toContain("<ScrollableTabBar");
  });
});
