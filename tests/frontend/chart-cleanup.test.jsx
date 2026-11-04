// chart-cleanup.test.jsx - A chart is disposed when its page closes.
// React clears a DOM ref before an effect cleanup runs on unmount. A cleanup that
// reads the ref then gets null, and the chart and its resize observer stay in memory.
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const disposedElements = [];

vi.mock("../../src/frontend/utils/echarts.js", () => ({
  initChart: () => ({ setOption: () => {}, resize: () => {}, on: () => {}, dispose: () => {} }),
  disposeChart: (element) => disposedElements.push(element),
  withZoomable: (option) => option,
}));

import ChartCard from "../../src/frontend/components/layout/ChartCard.jsx";
import ThroughputChart from "../../src/frontend/components/queues/ThroughputChart.jsx";

beforeEach(() => {
  disposedElements.length = 0;
});

describe("chart cleanup on unmount", () => {
  it("ChartCard disposes the chart of its own element", () => {
    const { unmount } = render(<ChartCard title="Test" option={{ series: [] }} />);
    unmount();
    expect(disposedElements).toHaveLength(1);
    expect(disposedElements[0]).toBeInstanceOf(HTMLElement);
    cleanup();
  });

  it("ThroughputChart disposes the chart of its own element", () => {
    const points = [{ bucket: "10:00", processed: 1, failed: 0, rows_ingested: 5 }];
    const { unmount } = render(<ThroughputChart points={points} />);
    unmount();
    expect(disposedElements).toHaveLength(1);
    expect(disposedElements[0]).toBeInstanceOf(HTMLElement);
    cleanup();
  });
});
