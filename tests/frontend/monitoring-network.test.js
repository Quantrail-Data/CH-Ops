// monitoring-network.test.js - The network charts read the metric names of every ClickHouse version.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "vitest";
import { TABS } from "../../src/frontend/components/monitoring/MonitoringDashboards.jsx";

const networkCharts = TABS.find((tab) => tab.id === "network").charts;

function chartSql(key) {
  return networkCharts.find((chart) => chart.key === key).sql;
}

describe("network charts", () => {
  for (const [key, metricNames] of [
    ["net_bytes", ["NetworkReceiveBytes", "NetworkSendBytes"]],
    ["net_drops", ["NetworkReceiveDrop", "NetworkSendDrop"]],
  ]) {
    it(`${key} reads the 26.8 name and the older names, and counts one form only`, () => {
      const sql = chartSql(key);
      for (const metricName of metricNames) {
        expect(sql).toContain(`countIf(metric = '${metricName}') > 0`);
        expect(sql).toContain(`startsWith(metric, '${metricName}_')`);
      }
    });
  }
});
