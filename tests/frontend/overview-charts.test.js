// Copyright (C) 2026 Quantrail™ Data Private Limited
// Chart post-processing for the Cluster Overview live section.
//
// buildChartOption is built for the dashboard builder, where charts are large
// and stand alone. polish() adapts its output for twenty small cards, and every
// one of these tests corresponds to something that was visibly wrong on the page
// before it was written: clipped bar labels, dropped axis labels, a duplicate
// download icon over the plot, raw byte counts in tooltips, and dials whose
// colours changed meaning between one card and the next.

import { describe, it, expect } from "vitest";
import {
  polish,
  stageGauge,
  wrapLabel,
  compact,
  FORMATS,
} from "../../src/frontend/components/overview/overviewChart.js";

const barOption = () => ({
  toolbox: { feature: { saveAsImage: {} } },
  dataZoom: [{ type: "slider" }],
  grid: { top: 40, bottom: 60, left: 60 },
  xAxis: { type: "category", data: ["Waiting readers", "Preempted"] },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: [1, 2] }],
});

const horizontalBarOption = () => ({
  toolbox: {},
  grid: {},
  yAxis: { type: "category", data: ["CPU user", "Merge exec"] },
  xAxis: { type: "value" },
  series: [{ type: "bar", data: [1, 2] }],
});

describe("wrapLabel", () => {
  it("leaves a short label alone", () => {
    expect(wrapLabel("Preempted")).toBe("Preempted");
  });
  it("splits a long label at a word boundary", () => {
    expect(wrapLabel("Waiting readers")).toBe("Waiting\nreaders");
  });
  it("respects a tighter limit for stacked labels", () => {
    expect(wrapLabel("Message broker", 12)).toBe("Message\nbroker");
    expect(wrapLabel("Message broker", 14)).toBe("Message broker");
  });
  it("truncates a single word that cannot be wrapped", () => {
    // One unbreakable word must not be allowed to set the width of the axis.
    const out = wrapLabel("Supercalifragilistic", 10);
    expect(out).toContain("...");
    expect(out.length).toBeLessThan("Supercalifragilistic".length);
  });
  it("caps the number of lines", () => {
    const out = wrapLabel("one two three four five six seven eight", 5);
    expect(out.split("\n").length).toBeLessThanOrEqual(3);
  });
  it("handles null and undefined without throwing", () => {
    expect(wrapLabel(null)).toBe("");
    expect(wrapLabel(undefined)).toBe("");
  });
});

describe("compact", () => {
  it("abbreviates thousands, millions and billions", () => {
    expect(compact(1500)).toBe("1.5K");
    expect(compact(2_400_000)).toBe("2.4M");
    expect(compact(3_100_000_000)).toBe("3.1B");
  });
  it("leaves small integers alone", () => {
    expect(compact(42)).toBe("42");
  });
  it("returns a dash for a non-number", () => {
    expect(compact(undefined)).toBe("-");
    expect(compact(NaN)).toBe("-");
  });
});

describe("FORMATS", () => {
  it("renders a percentage from a 0 to 1 ratio", () => {
    expect(FORMATS.percent.fn(0.25)).toBe("25.0%");
  });
  it("renders bytes and bytes per second", () => {
    expect(FORMATS.bytes.fn(1024)).toContain("KB");
    expect(FORMATS.bytesPerSec.fn(1024)).toContain("/s");
  });
  it("renders cores to two decimals, because 0.4 cores is meaningful", () => {
    expect(FORMATS.cores.fn(0.4)).toBe("0.40");
  });
});

describe("polish", () => {
  it("removes the echarts toolbox, since the card header already has download", () => {
    expect(polish(barOption(), { type: "bar" }).toolbox).toBeUndefined();
  });

  it("removes the zoom slider, which cost a fifth of a 240px card", () => {
    expect(polish(barOption(), { type: "bar" }).dataZoom).toBeUndefined();
  });

  it("reclaims the grid space the toolbox and slider were reserving", () => {
    const out = polish(barOption(), { type: "bar" });
    expect(out.grid.left).toBeLessThan(60);
    expect(out.grid.bottom).toBeLessThan(60);
  });

  it("leaves headroom above vertical bars so the value label is not clipped", () => {
    // The label is drawn outside the plot area, so a bar at full scale loses its
    // number exactly when you want to read it.
    const bars = polish(barOption(), { type: "bar" });
    const noBars = polish({ ...barOption(), series: [{ type: "line" }] }, { type: "line" });
    expect(bars.grid.top).toBeGreaterThan(noBars.grid.top);
  });

  it("leaves room on the right for horizontal bar labels", () => {
    const out = polish(horizontalBarOption(), { type: "bar" });
    expect(out.grid.right).toBeGreaterThan(20);
  });

  it("puts vertical bar labels above the bar", () => {
    const out = polish(barOption(), { type: "bar" });
    expect(out.series[0].label.position).toBe("top");
  });

  it("puts horizontal bar labels to the right of the bar", () => {
    const out = polish(horizontalBarOption(), { type: "bar" });
    expect(out.series[0].label.position).toBe("right");
  });

  it("forces every category label rather than dropping the ones that overlap", () => {
    // hideOverlap silently drops labels, which on a seven-bar chart leaves three
    // bars with no name at all.
    const out = polish(barOption(), { type: "bar" });
    expect(out.xAxis.axisLabel.interval).toBe(0);
    expect(out.xAxis.axisLabel.hideOverlap).toBe(false);
  });

  it("rotates and wraps x axis categories", () => {
    const out = polish(barOption(), { type: "bar" });
    expect(out.xAxis.axisLabel.rotate).toBe(45);
    expect(out.xAxis.axisLabel.formatter("Waiting readers")).toBe("Waiting\nreaders");
  });

  it("wraps y axis categories without rotating them", () => {
    // A horizontal bar's categories already stack vertically; turning them 45
    // degrees would make them worse. They still need wrapping, or echarts
    // truncates them on the left edge.
    const out = polish(horizontalBarOption(), { type: "bar" });
    expect(out.yAxis.axisLabel.rotate).toBe(0);
    expect(out.yAxis.axisLabel.formatter("Waiting readers")).toBe("Waiting\nreaders");
  });

  it("handles an axis supplied as an array", () => {
    // Spreading an array into an object yields {0:..., 1:...} and the axis
    // config is silently lost, so this path has to map rather than spread.
    const opt = { ...barOption(), xAxis: [{ type: "category", data: [] }] };
    const out = polish(opt, { type: "bar" });
    expect(Array.isArray(out.xAxis)).toBe(true);
    expect(out.xAxis[0].axisLabel.rotate).toBe(45);
  });

  it("puts the unit on the value axis and formats its ticks", () => {
    const out = polish(barOption(), { type: "bar", format: "bytes" });
    expect(out.yAxis.name).toBe("bytes");
    expect(out.yAxis.axisLabel.formatter(1024)).toContain("KB");
  });

  it("shows a legend only when there is more than one series", () => {
    expect(polish(barOption(), { type: "bar" }).legend.show).toBe(false);
    const two = { ...barOption(), series: [{ type: "bar" }, { type: "bar" }] };
    expect(polish(two, { type: "bar" }).legend.show).toBe(true);
  });

  it("formats pie and treemap tooltips instead of showing raw counts", () => {
    // Left alone, a cache slice renders as 41943040 rather than 40 MB.
    const pie = { series: [{ type: "pie" }], tooltip: {} };
    const out = polish(pie, { type: "pie", format: "bytes" });
    expect(out.tooltip.formatter({ name: "Mark", value: 1024, percent: 50 })).toContain("KB");
  });

  it("hides pie labels on slices too small to label legibly", () => {
    const out = polish({ series: [{ type: "pie" }] }, { type: "pie" });
    expect(out.series[0].label.formatter({ name: "Tiny", percent: 2 })).toBe("");
    expect(out.series[0].label.formatter({ name: "Big", percent: 40 })).toContain("Big");
  });

  it("does not build a grid for chart types that have no axes", () => {
    expect(polish({ series: [{ type: "pie" }] }, { type: "pie" }).xAxis).toBeUndefined();
  });

  it("returns null for a null option rather than throwing", () => {
    expect(polish(null, { type: "bar" })).toBeNull();
  });
});

describe("stageGauge", () => {
  const bands = (o) => o.series[0].axisLine.lineStyle.color;

  it("uses the same colour bands regardless of the value", () => {
    // An earlier version coloured the whole arc by the reading, which made the
    // colour carry nothing the needle was not already carrying.
    expect(bands(stageGauge({ value: 0.1 }))).toEqual(bands(stageGauge({ value: 0.95 })));
  });

  it("uses the same colour bands in both themes", () => {
    expect(bands(stageGauge({ value: 0.5, dark: true }))).toEqual(
      bands(stageGauge({ value: 0.5, dark: false })),
    );
  });

  it("always runs green through amber to red, low to high", () => {
    const [first, mid, last] = bands(stageGauge({ value: 0.5 }));
    expect(first[0]).toBeLessThan(mid[0]);
    expect(mid[0]).toBeLessThan(last[0]);
    expect(first[1]).not.toBe(last[1]);
  });

  it("scales a 0 to 1 ratio onto a 0 to 100 dial", () => {
    expect(stageGauge({ value: 0.42 }).series[0].data[0].value).toBeCloseTo(42);
  });

  it("clamps out of range values instead of running off the dial", () => {
    expect(stageGauge({ value: 1.4 }).series[0].data[0].value).toBe(100);
    expect(stageGauge({ value: -0.2 }).series[0].data[0].value).toBe(0);
  });

  it("hides the needle and shows a dash when the ratio is undefined", () => {
    const g = stageGauge({ value: null });
    expect(g.series[0].pointer.show).toBe(false);
    expect(g.series[0].detail.formatter()).toBe("-");
  });

  it("uses a custom readout when one is supplied", () => {
    // Background pools show "3/32", because the raw counts tell an operator
    // more than a percentage when they are deciding whether to raise a limit.
    const g = stageGauge({ value: 0.09, formatter: () => "3/32" });
    expect(g.series[0].detail.formatter()).toBe("3/32");
  });

  it("draws ticks in the surface colour so they show on either theme", () => {
    // These were hardcoded white and invisible on the light theme.
    const light = stageGauge({ value: 0.5, dark: false });
    const dark = stageGauge({ value: 0.5, dark: true });
    expect(light.series[0].splitLine.lineStyle.color).not.toBe(
      dark.series[0].splitLine.lineStyle.color,
    );
  });
});
