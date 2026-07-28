// Copyright (C) 2026 Quantrail™ Data Private Limited
// Rendering tests for the Cluster Overview building blocks.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan


import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

const setOption = vi.fn();
const resize = vi.fn();
const initChart = vi.fn(() => ({ setOption, resize, dispose: vi.fn() }));
const disposeChart = vi.fn();

vi.mock("../../src/frontend/utils/echarts.js", () => ({
  initChart: (...a) => initChart(...a),
  disposeChart: (...a) => disposeChart(...a),
  withZoomable: (o) => o,
}));

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
  default: ({ className }) => <span data-testid="icon" data-icon={className} />,
}));

// ReactFlow does not lay out in jsdom, so it is replaced by something that
// reports what it was asked to draw. The value in these tests is the node model
// the component builds, not the canvas.
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, children }) => (
    <div data-testid="flow" data-node-count={nodes.filter((n) => n.type === "chNode").length}>
      {nodes
        .filter((n) => n.type === "chNode")
        .map((n) => (
          <div key={n.id} data-testid="flow-node" data-shard={n.data.shard} data-replica={n.data.replica}>
            {n.data.hostName} {n.data.hostAddress}:{n.data.port}
            {n.data.errors > 0 ? ` errors:${n.data.errors}` : ""}
            {n.data.selected ? " SELECTED" : ""}
          </div>
        ))}
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }) => <div>{children}</div>,
  Controls: () => <div data-testid="flow-controls" />,
  MiniMap: () => <div data-testid="flow-minimap" />,
  Background: () => null,
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
  useReactFlow: () => ({ fitView: vi.fn() }),
}));

vi.mock("@xyflow/react/dist/style.css", () => ({}));

import InfoTip from "../../src/frontend/components/common/InfoTip.jsx";
import {
  formatValue,
  ChartCard,
  KpiStrip,
  HealthStrip,
  GaugeGroup,
} from "../../src/frontend/components/overview/OverviewCards.jsx";
import ClusterTopology, {
  groupByCluster,
  readHealth,
  formatHealth,
  nodeIsUnhealthy,
} from "../../src/frontend/components/overview/ClusterTopology.jsx";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InfoTip", () => {
  const props = {
    what: "Rows scanned per row returned.",
    read: "Near 1 means the primary key is filtering well.",
    formula: "delta(Scanned) / delta(Returned)",
    unit: "rows/row",
  };

  it("renders nothing when it has no content to show", () => {
    const { container } = render(<InfoTip />);
    expect(container.firstChild).toBeNull();
  });

  it("shows only the icon until it is hovered", () => {
    render(<InfoTip {...props} />);
    expect(screen.getByTestId("icon")).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("reveals the bubble on hover and hides it again on leave", () => {
    render(<InfoTip {...props} />);
    const trigger = screen.getByRole("note");
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("reveals the bubble on keyboard focus, so it is not mouse only", () => {
    render(<InfoTip {...props} />);
    fireEvent.focus(screen.getByRole("note"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("closes on Escape", () => {
    render(<InfoTip {...props} />);
    const trigger = screen.getByRole("note");
    fireEvent.focus(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the what, the how to read it, and the formula", () => {
    render(<InfoTip {...props} />);
    fireEvent.mouseEnter(screen.getByRole("note"));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Rows scanned per row returned");
    expect(tip.textContent).toContain("primary key is filtering well");
    expect(tip.textContent).toContain("delta(Scanned)");
    expect(tip.textContent).toContain("rows/row");
  });

  it("gives a screen reader the same text as the hover bubble", () => {
    render(<InfoTip {...props} />);
    const label = screen.getByRole("note").getAttribute("aria-label");
    expect(label).toContain("Rows scanned per row returned");
    expect(label).toContain("primary key is filtering well");
  });

  it("is reachable without a mouse", () => {
    render(<InfoTip {...props} />);
    expect(screen.getByRole("note").getAttribute("tabindex")).toBe("0");
  });
});

describe("formatValue", () => {
  it("renders a dash rather than NaN for an undefined reading", () => {
    expect(formatValue(null, "%")).toBe("-");
    expect(formatValue(undefined, "cores")).toBe("-");
    expect(formatValue(NaN, "x")).toBe("-");
  });
  it("renders percentages from a 0 to 1 ratio", () => {
    expect(formatValue(0.84, "%")).toBe("84.0%");
  });
  it("keeps precision on a very small percentage rather than showing 0.0%", () => {
    expect(formatValue(0.0009, "%")).toBe("0.09%");
  });
  it("renders bytes and byte rates", () => {
    expect(formatValue(1024, "bytes")).toContain("KB");
    expect(formatValue(1024, "B/s")).toContain("/s");
  });
  it("renders ratios and cores", () => {
    expect(formatValue(31.97, "x")).toBe("32.0x");
    expect(formatValue(0.4, "cores")).toBe("0.40");
  });
  it("abbreviates large plain numbers", () => {
    expect(formatValue(2_400_000, "")).toBe("2.40M");
  });
});

describe("KpiStrip", () => {
  it("renders a label and a value for each item", () => {
    render(<KpiStrip title="Throughput" items={[{ key: "part_churn", value: 1.4 }]} />);
    expect(screen.getByText("Throughput")).toBeTruthy();
    expect(screen.getByText("Part churn")).toBeTruthy();
    expect(screen.getByText("1.40x")).toBeTruthy();
  });

  it("shows a dash and explains why when a value is unavailable", () => {
    render(<KpiStrip items={[{ key: "ddl_lag", value: null }]} />);
    const dash = screen.getByText("-");
    expect(dash.parentElement.getAttribute("title")).toContain("Not enough samples");
  });

  it("carries a tooltip for every value", () => {
    render(<KpiStrip items={[{ key: "part_churn", value: 1 }]} />);
    expect(screen.getByRole("note")).toBeTruthy();
  });
});

describe("HealthStrip", () => {
  const clear = [
    { key: "a", label: "Readonly replicas", severity: "danger", hint: "x", value: 0 },
    { key: "b", label: "Delayed inserts", severity: "danger", hint: "y", value: 0 },
  ];

  it("collapses to a single reassuring line when everything is clear", () => {
    render(<HealthStrip chips={clear} />);
    expect(screen.getByText(/All 2 health checks are clear/)).toBeTruthy();
    expect(screen.queryByText("Readonly replicas")).toBeNull();
  });

  it("surfaces only the failing checks when something is wrong", () => {
    render(<HealthStrip chips={[{ ...clear[0], value: 3 }, clear[1]]} />);
    expect(screen.getByText("Readonly replicas")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("Delayed inserts")).toBeNull();
  });

  it("can expand to show the clear checks too", () => {
    render(<HealthStrip chips={clear} />);
    fireEvent.click(screen.getByText(/Show all 2 checks/));
    expect(screen.getByText("Readonly replicas")).toBeTruthy();
    expect(screen.getByText("Delayed inserts")).toBeTruthy();
  });
});

describe("ChartCard", () => {
  const option = {
    xAxis: { type: "category", data: ["a"] },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: [1] }],
  };

  it("shows the empty message instead of a blank canvas when there is no option", () => {
    render(<ChartCard title="Queries" option={null} emptyMessage="Collecting..." />);
    expect(screen.getByText("Collecting...")).toBeTruthy();
    expect(initChart).not.toHaveBeenCalled();
  });

  it("builds a chart and hands it a polished option", () => {
    render(<ChartCard title="Queries" option={option} type="bar" format="count" />);
    expect(initChart).toHaveBeenCalled();
    const passed = setOption.mock.calls.at(-1)[0];
    expect(passed.toolbox).toBeUndefined();
    expect(passed.series[0].label.position).toBe("top");
  });

  it("falls back to the registry label when no title is given", () => {
    render(<ChartCard metricKey="part_churn" option={option} type="bar" />);
    expect(screen.getByText("Part churn")).toBeTruthy();
  });

  it("passes the unit through to the value axis", () => {
    render(<ChartCard title="Memory" option={option} type="bar" format="bytes" />);
    expect(setOption.mock.calls.at(-1)[0].yAxis.name).toBe("bytes");
  });
});

describe("GaugeGroup", () => {
  it("renders one dial per item", () => {
    render(
      <GaugeGroup
        title="Machine"
        items={[
          { key: "cpu_used", value: 0.5 },
          { key: "memory_used", value: 0.2 },
        ]}
      />,
    );
    expect(screen.getByText("Machine")).toBeTruthy();
    expect(initChart).toHaveBeenCalledTimes(2);
  });

  it("hides an item marked as not applicable to this server", () => {
    render(
      <GaugeGroup
        items={[
          { key: "cpu_used", value: 0.5 },
          { key: "fs_cache_used", value: null, show: false },
        ]}
      />,
    );
    expect(initChart).toHaveBeenCalledTimes(1);
  });

  it("renders nothing at all when every item is hidden", () => {
    const { container } = render(
      <GaugeGroup items={[{ key: "fs_cache_used", value: null, show: false }]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("uses a custom readout when one is supplied", () => {
    render(
      <GaugeGroup
        items={[{ key: "pool_utilization", label: "Merges", value: 0.09, formatter: () => "3/32" }]}
      />,
    );
    expect(setOption.mock.calls.at(-1)[0].series[0].detail.formatter()).toBe("3/32");
  });
});

describe("groupByCluster", () => {
  const rows = [
    { cluster: "beta", shard_num: 1, replica_num: 1, host_name: "b1" },
    { cluster: "alpha", shard_num: 1, replica_num: 1, host_name: "a1" },
    { cluster: "alpha", shard_num: 2, replica_num: 1, host_name: "a2" },
  ];

  it("groups nodes under their cluster", () => {
    const out = groupByCluster(rows);
    expect(out.map((c) => c.name)).toEqual(["alpha", "beta"]);
    expect(out[0].nodes).toHaveLength(2);
  });

  it("sorts by name rather than by health, so cards do not jump between polls", () => {
    expect(groupByCluster(rows)[0].name).toBe("alpha");
  });

  it("survives an empty or missing result", () => {
    expect(groupByCluster([])).toEqual([]);
    expect(groupByCluster(null)).toEqual([]);
  });
});

describe("readHealth", () => {
  it("returns a number when the column is reported", () => {
    expect(readHealth({ errors_count: 4 }, "errors_count")).toBe(4);
  });
  it("keeps zero as a real reading rather than folding it into null", () => {
    // Zero means "reported, and nothing is wrong". Null means "this cluster
    // does not report it at all". Collapsing them hides a working measurement.
    expect(readHealth({ errors_count: 0 }, "errors_count")).toBe(0);
  });
  it("returns null for a Nullable column that came back empty", () => {
    expect(readHealth({ replication_lag: null }, "replication_lag")).toBeNull();
    expect(readHealth({}, "replication_lag")).toBeNull();
    expect(readHealth({ replication_lag: "" }, "replication_lag")).toBeNull();
  });
  it("returns null for a value that is not a number", () => {
    expect(readHealth({ recovery_time: "n/a" }, "recovery_time")).toBeNull();
  });
});

describe("formatHealth", () => {
  it("renders a dash only for a column that is not reported", () => {
    expect(formatHealth(null, "count")).toBe("-");
  });
  it("renders a reported zero as zero", () => {
    expect(formatHealth(0, "count")).toBe("0");
    expect(formatHealth(0, "seconds")).toBe("0");
  });
  it("formats seconds and milliseconds as durations", () => {
    expect(formatHealth(45, "seconds")).toBe("45s");
    expect(formatHealth(150, "seconds")).toBe("2m 30s");
    expect(formatHealth(7200, "seconds")).toBe("2h 0m");
    expect(formatHealth(90000, "millis")).toBe("1m 30s");
  });
});

describe("nodeIsUnhealthy", () => {
  it("is false when every health column is zero or absent", () => {
    expect(nodeIsUnhealthy({ errors_count: 0, replication_lag: null })).toBe(false);
  });
  it("is true when any health column is above zero", () => {
    expect(nodeIsUnhealthy({ errors_count: 0, replication_lag: 12 })).toBe(true);
    expect(nodeIsUnhealthy({ unsynced_after_recovery: 1 })).toBe(true);
  });
});

describe("ClusterTopology", () => {
  const node = (over) => ({
    cluster: "prod", shard_num: 1, replica_num: 1,
    host_name: "ch-01", host_address: "10.0.0.1", port: 9000,
    errors_count: 0, slowdowns_count: 0, is_local: 1,
    ...over,
  });

  const rows = [
    node({}),
    node({ shard_num: 1, replica_num: 2, host_name: "ch-02", host_address: "10.0.0.2", errors_count: 4, is_local: 0 }),
    node({ shard_num: 2, replica_num: 1, host_name: "ch-03", host_address: "10.0.0.3", is_local: 0 }),
  ];

  const twoClusters = [
    ...rows,
    node({ cluster: "analytics", host_name: "an-01", host_address: "10.1.0.1", is_local: 0 }),
    node({ cluster: "analytics", shard_num: 2, host_name: "an-02", host_address: "10.1.0.2", is_local: 0 }),
  ];

  const open = () => fireEvent.click(screen.getByText("Cluster topology"));

  it("is collapsed by default, so it does not push the live section off screen", () => {
    render(<ClusterTopology rows={rows} loading={false} />);
    expect(screen.queryByTestId("flow")).toBeNull();
    expect(screen.getByText("Cluster topology")).toBeTruthy();
  });

  it("summarises the clusters and nodes while collapsed", () => {
    render(<ClusterTopology rows={twoClusters} loading={false} />);
    expect(screen.getByText("2 clusters, 5 nodes")).toBeTruthy();
  });

  it("carries the health count in the collapsed summary, so collapsing hides nothing", () => {
    render(<ClusterTopology rows={rows} loading={false} />);
    expect(screen.getByText("1 reporting problems")).toBeTruthy();
  });

  it("expands and collapses on click", () => {
    render(<ClusterTopology rows={rows} loading={false} />);
    open();
    expect(screen.getByTestId("flow")).toBeTruthy();
    open();
    expect(screen.queryByTestId("flow")).toBeNull();
  });

  it("shows a loading state once expanded and before the first result", () => {
    render(<ClusterTopology rows={null} loading />);
    open();
    expect(screen.getByText(/Loading topology/)).toBeTruthy();
  });

  it("says so plainly when no clusters are configured", () => {
    render(<ClusterTopology rows={[]} loading={false} />);
    open();
    expect(screen.getByText(/No clusters are configured/)).toBeTruthy();
  });

  it("gives every cluster its own provider and its own canvas", () => {
    // A single shared provider is a single shared store, which rendered every
    // cluster with the same nodes and panned them all together.
    render(<ClusterTopology rows={twoClusters} loading={false} />);
    open();
    const canvases = screen.getAllByTestId("flow");
    expect(canvases).toHaveLength(2);
    expect(canvases.map((c) => c.getAttribute("data-node-count"))).toEqual(["2", "3"]);
  });

  it("draws each cluster with its own nodes rather than repeating one of them", () => {
    render(<ClusterTopology rows={twoClusters} loading={false} />);
    open();
    expect(screen.getByText(/an-01 10\.1\.0\.1:9000/)).toBeTruthy();
    expect(screen.getByText(/ch-01 10\.0\.0\.1:9000/)).toBeTruthy();
  });

  it("places nodes by shard and replica", () => {
    render(<ClusterTopology rows={rows} loading={false} />);
    open();
    const nodes = screen.getAllByTestId("flow-node");
    expect(nodes.map((n) => `${n.dataset.shard}/${n.dataset.replica}`)).toEqual(["1/1", "1/2", "2/1"]);
  });

  it("surfaces error counts on the node and summarises them on the card", () => {
    render(<ClusterTopology rows={rows} loading={false} />);
    open();
    expect(screen.getByText(/errors:4/)).toBeTruthy();
    expect(screen.getByText("1 of 3 reporting problems")).toBeTruthy();
  });

  it("marks the node the live section is showing", () => {
    render(<ClusterTopology rows={rows} loading={false} selectedHost="10.0.0.3" />);
    open();
    expect(screen.getByText(/ch-03 .* SELECTED/)).toBeTruthy();
  });

  it("offers a full screen control per cluster", () => {
    render(<ClusterTopology rows={twoClusters} loading={false} />);
    open();
    const buttons = screen.getAllByLabelText("Full screen");
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(screen.getByLabelText("Exit full screen")).toBeTruthy();
  });

  it("leaves full screen on Escape", () => {
    render(<ClusterTopology rows={rows} loading={false} />);
    open();
    fireEvent.click(screen.getByLabelText("Full screen"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("Full screen")).toBeTruthy();
  });

  it("shows a minimap only once a cluster is large enough to need one", () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      node({ shard_num: i + 1, host_name: `n${i}`, host_address: `10.9.0.${i}`, is_local: 0 }),
    );
    render(<ClusterTopology rows={many} loading={false} />);
    open();
    expect(screen.getByTestId("flow-minimap")).toBeTruthy();
  });
});

describe("ClusterTopology health table", () => {
  const open = () => fireEvent.click(screen.getByText("Cluster topology"));
  const base = {
    cluster: "prod", shard_num: 1, replica_num: 1,
    host_name: "ch-01", host_address: "10.0.0.1", port: 9000, is_local: 0,
  };

  it("lists the columns the cluster actually reports", () => {
    render(
      <ClusterTopology
        loading={false}
        rows={[{ ...base, errors_count: 0, slowdowns_count: 2, replication_lag: null }]}
      />,
    );
    open();
    expect(screen.getByText("Errors")).toBeTruthy();
    expect(screen.getByText("Slowdowns")).toBeTruthy();
  });

  it("drops a column no node reports, rather than showing a row of dashes", () => {
    render(
      <ClusterTopology
        loading={false}
        rows={[{ ...base, errors_count: 0, replication_lag: null, unsynced_after_recovery: null }]}
      />,
    );
    open();
    expect(screen.queryByText("Replication lag")).toBeNull();
    expect(screen.queryByText("Unsynced")).toBeNull();
  });

  it("shows a reported zero as zero and an unreported column as a dash", () => {
    render(
      <ClusterTopology
        loading={false}
        rows={[
          { ...base, errors_count: 0, replication_lag: 5 },
          { ...base, replica_num: 2, host_name: "ch-02", host_address: "10.0.0.2", errors_count: 1, replication_lag: null },
        ]}
      />,
    );
    open();
    const table = screen.getByText("Replication lag").closest("table");
    const cells = within(table).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toContain("0"); // reported and healthy
    expect(cells).toContain("-"); // not reported by this node
    expect(cells).toContain("5");
  });

  it("renders no table at all when the cluster reports no health columns", () => {
    render(<ClusterTopology loading={false} rows={[base]} />);
    open();
    expect(screen.queryByText("Errors")).toBeNull();
  });

  it("formats recovery times as durations", () => {
    render(
      <ClusterTopology
        loading={false}
        rows={[{ ...base, estimated_recovery_time: 150 }]}
      />,
    );
    open();
    expect(screen.getByText("2m 30s")).toBeTruthy();
  });
});
