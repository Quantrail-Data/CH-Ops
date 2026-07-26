// Copyright (C) 2026 Quantrail™ Data Private Limited
// The Cluster Overview page shell.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const setOption = vi.fn();
const initChart = vi.fn(() => ({ setOption, resize: vi.fn(), dispose: vi.fn() }));
const queries = [];

// One useQuery instance per call, each remembering the SQL it was given so the
// test can assert on what the page asked for.

vi.mock("../../src/frontend/hooks/useQuery.js", async () => {
  const React = await import("react");
  return {
    useQuery: () => {
      const [data, setData] = React.useState(null);
      const execute = React.useCallback((sql) => {
        queries.push(sql);
        setData(globalThis.__answer?.(sql) ?? null);
      }, []);
      return { data, columns: [], loading: false, error: null, execute };
    },
  };
});

vi.mock("../../src/frontend/App.jsx", () => ({
  useConnection: () => ({ selectedNode: "10.0.0.1", nodeName: "ch-node-01" }),
}));

vi.mock("../../src/frontend/utils/echarts.js", () => ({
  initChart: (...a) => initChart(...a),
  disposeChart: vi.fn(),
  withZoomable: (o) => o,
}));

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
  default: ({ className }) => <span data-testid="icon" data-icon={className} />,
}));

vi.mock("../../src/frontend/components/common/Select.jsx", () => ({
  default: ({ value, onChange, children, title }) => (
    <select aria-label={title} value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));

vi.mock("../../src/frontend/components/common/ChartToolbar.jsx", () => ({
  default: () => <div data-testid="chart-toolbar" />,
  useChartTools: () => ({ fullscreen: false, save: vi.fn(), toggleFullscreen: vi.fn() }),
  savePng: vi.fn(),
}));

vi.mock("../../src/frontend/components/layout/DataTable.jsx", () => ({
  default: ({ rows, columns }) => (
    <table data-testid="data-table" data-rows={rows?.length ?? 0}>
      <tbody>
        <tr>{columns?.map((c) => <td key={c}>{c}</td>)}</tr>
      </tbody>
    </table>
  ),
}));

vi.mock("../../src/frontend/components/overview/ClusterTopology.jsx", () => ({
  default: ({ rows, selectedHost }) => (
    <div data-testid="topology" data-rows={rows?.length ?? 0} data-selected={selectedHost} />
  ),
}));

vi.mock("../../src/frontend/components/overview/LiveOverview.jsx", () => ({
  default: () => <div data-testid="live" />,
  useLiveOverview: () => ({ live: true, interval: 5, loaded: false }),
  LiveControlBar: ({ nodeName }) => <div data-testid="live-bar" data-node={nodeName} />,
  MachineGauges: () => <div data-testid="machine-gauges" />,
}));

import ClusterOverview from "../../src/frontend/components/overview/ClusterOverview.jsx";

const DISKS = [
  { name: "default", total_space: 1000, free_space: 400, total_fmt: "1 KB", free_fmt: "400 B", used_pct: 60 },
  { name: "cold", total_space: 2000, free_space: 1800, total_fmt: "2 KB", free_fmt: "1.8 KB", used_pct: 10 },
];

function answers({ readonly = 0, disks = DISKS } = {}) {
  return (sql) => {
    if (sql.includes("version()")) return [{ version: "26.3.1" }];
    if (sql.includes("uptime()")) return [{ seconds: 90061 }];
    if (sql.includes("system.databases")) return [{ cnt: 6 }];
    if (sql.includes("FROM system.tables")) return [{ cnt: 10 }];
    if (sql.includes("system.processes")) return [{ cnt: 2 }];
    if (sql.includes("system.merges")) return [{ cnt: 0 }];
    if (sql.includes("system.mutations")) return [{ cnt: 0 }];
    if (sql.includes("is_readonly = 1") && sql.includes("count()")) return [{ cnt: readonly }];
    if (sql.includes("is_readonly = 1")) return readonly ? [{ database: "d", table: "t", readonly_start_time: "now" }] : [];
    if (sql.includes("system.clusters")) return [{ cluster: "prod", shard_num: 1, replica_num: 1, host_name: "ch-01" }];
    if (sql.includes("system.disks")) return disks;
    if (sql.includes("zookeeper_connection")) {
      return [{ host: "keeper", port: 9181, session_uptime_elapsed_seconds: 7200,
                connected_time: "2026-07-25 10:00:00", is_expired: 0, keeper_api_version: 3,
                session_timeout_ms: 30000, xid: 42, enabled_feature_flags: ["a"] }];
    }
    if (sql.includes("LIKE '%Connection'")) {
      return [{ metric: "TCPConnection", value: 3 }, { metric: "HTTPConnection", value: 1 }];
    }
    return [];
  };
}

/** Only the stat cards start open, so a test reading another section opens it. */
const expand = (title) => fireEvent.click(screen.getByText(title));

beforeEach(() => {
  vi.clearAllMocks();
  // Section open state persists. Without clearing it, a test inherits whatever
  // the previous one expanded and expand() toggles it shut.
  localStorage.clear();
  queries.length = 0;
  globalThis.__answer = answers();
});

describe("ClusterOverview: what it asks for", () => {
  it("issues the slow-refresh queries once on mount", () => {
    render(<ClusterOverview />);
    const all = queries.join(" ");
    expect(all).toContain("version()");
    expect(all).toContain("system.disks");
    expect(all).toContain("system.clusters");
    expect(all).toContain("zookeeper_connection");
  });

  it("reads system.clusters with SELECT * rather than a column list", () => {
    // Deliberate. The table has gained columns across releases, and naming one
    // a given server does not have fails the whole query and empties the
    // topology. It is one row per node, so reading all of it costs nothing.
    render(<ClusterOverview />);
    const clusters = queries.find((q) => q.includes("system.clusters"));
    expect(clusters).toContain("SELECT *");
    expect(clusters).toContain("ORDER BY cluster, shard_num, replica_num");
  });

  it("orders cluster rows so the diagram is stable between polls", () => {
    render(<ClusterOverview />);
    const clusters = queries.find((q) => q.includes("system.clusters"));
    expect(clusters).toMatch(/ORDER BY\s+cluster,\s*shard_num,\s*replica_num/);
  });

  it("no longer queries asynchronous_metrics for the removed memory donuts", () => {
    render(<ClusterOverview />);
    expect(queries.join(" ")).not.toContain("OSMemoryTotal");
  });
});

describe("ClusterOverview: stat cards", () => {
  it("renders each headline number", () => {
    render(<ClusterOverview />);
    expect(screen.getByText("26.3.1")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("formats uptime as days, hours and minutes", () => {
    render(<ClusterOverview />);
    expect(screen.getByText("1 Days, 1 Hrs and 1 Mins")).toBeTruthy();
  });
});

describe("ClusterOverview: readonly replicas", () => {
  it("shows no alert when nothing is readonly", () => {
    render(<ClusterOverview />);
    expect(screen.queryByText(/readonly replica\(s\) detected/)).toBeNull();
  });

  it("raises an alert and lists the affected tables when something is", () => {
    globalThis.__answer = answers({ readonly: 2 });
    render(<ClusterOverview />);
    expect(screen.getByText(/2 readonly replica\(s\) detected/)).toBeTruthy();
    expect(screen.getByText("Readonly replicas")).toBeTruthy();
    expect(screen.getByText("2 affected")).toBeTruthy();
  });
});

describe("ClusterOverview: disks", () => {
  it("draws the first disk and lists them all", () => {
    render(<ClusterOverview />);
    expand("Disks");
    expect(initChart).toHaveBeenCalled();
    expect(setOption.mock.calls.at(-1)[0].title.text).toBe("Disk: default");
    expect(screen.getByTestId("data-table").getAttribute("data-rows")).toBe("2");
  });

  it("offers a selector only when there is more than one disk", () => {
    render(<ClusterOverview />);
    expand("Disks");
    expect(screen.getByLabelText("Switch disk")).toBeTruthy();
  });

  it("hides the selector when there is only one disk to pick", () => {
    globalThis.__answer = answers({ disks: [DISKS[0]] });
    render(<ClusterOverview />);
    expand("Disks");
    expect(screen.queryByLabelText("Switch disk")).toBeNull();
  });

  it("switches the chart when another disk is chosen", () => {
    // The index arrives from the select as a string, and using it to subscript
    // without coercion is how this broke the first time.
    render(<ClusterOverview />);
    expand("Disks");
    fireEvent.change(screen.getByLabelText("Switch disk"), { target: { value: "1" } });
    expect(setOption.mock.calls.at(-1)[0].title.text).toBe("Disk: cold");
  });

  it("offers no empty placeholder option", () => {
    // Selecting it used to index past the array and draw a chart of NaN.
    render(<ClusterOverview />);
    expand("Disks");
    const options = [...screen.getByLabelText("Switch disk").querySelectorAll("option")];
    expect(options.map((o) => o.value)).toEqual(["0", "1"]);
  });
});

describe("ClusterOverview: sections", () => {
  it("passes the cluster rows and the connected host to the topology", () => {
    render(<ClusterOverview />);
    const topo = screen.getByTestId("topology");
    expect(topo.getAttribute("data-rows")).toBe("1");
    expect(topo.getAttribute("data-selected")).toBe("10.0.0.1");
  });

  it("names the node on the control bar", () => {
    render(<ClusterOverview />);
    expect(screen.getByTestId("live-bar").getAttribute("data-node")).toBe("ch-node-01");
  });

  it("puts the live control bar before everything else on the page", () => {
    // It governs every reading below it, including the stat cards, so a control
    // sitting halfway down would read as belonging only to what follows it.
    const { container } = render(<ClusterOverview />);
    const order = [...container.querySelectorAll("[data-testid], .card, button")];
    const bar = screen.getByTestId("live-bar");
    expect(order.indexOf(bar)).toBe(0);
  });

  it("puts the machine gauges directly after the stat cards", () => {
    // They answer "is this node under load", which belongs with "which node is
    // this" rather than buried among the collapsed sections below.
    const { container } = render(<ClusterOverview />);
    const pos = (el) => [...container.querySelectorAll("*")].indexOf(el);
    const gauges = screen.getByTestId("machine-gauges");
    expect(pos(gauges)).toBeGreaterThan(pos(screen.getByText("Node Overview")));
    expect(pos(gauges)).toBeLessThan(pos(screen.getByText("Disks")));
  });

  it("puts the cluster topology last, after every other section", () => {
    const { container } = render(<ClusterOverview />);
    const topo = screen.getByTestId("topology");
    const bar = screen.getByTestId("live-bar");
    const pos = (el) => [...container.querySelectorAll("*")].indexOf(el);
    expect(pos(topo)).toBeGreaterThan(pos(bar));
    expect(pos(topo)).toBeGreaterThan(pos(screen.getByTestId("live")));
  });

  it("renders the Keeper panel, including when the connection was last lost", () => {
    render(<ClusterOverview />);
    expand("Keeper and connections");
    expect(screen.getByText("Zookeeper Connection")).toBeTruthy();
    expect(screen.getByText("Last Connection Loss")).toBeTruthy();
    expect(screen.getByText("never")).toBeTruthy();
  });

  it("renders active connections with a total", () => {
    render(<ClusterOverview />);
    expand("Keeper and connections");
    expect(screen.getByText("Active Connections")).toBeTruthy();
    expect(screen.getByText("4 total")).toBeTruthy();
  });

  it("no longer renders the clusters table, which the topology replaced", () => {
    render(<ClusterOverview />);
    expect(screen.queryByText("Clusters")).toBeNull();
  });
});

describe("ClusterOverview: what starts open", () => {
  it("opens only the stat cards, leaving every other section collapsed", () => {
    render(<ClusterOverview />);
    // Open: a stat card value is rendered.
    expect(screen.getByText("26.3.1")).toBeTruthy();
    // Collapsed: headers present, contents not.
    expect(screen.getByText("Disks")).toBeTruthy();
    expect(screen.queryByLabelText("Switch disk")).toBeNull();
    expect(screen.getByText("Keeper and connections")).toBeTruthy();
    expect(screen.queryByText("Zookeeper Connection")).toBeNull();
  });
});

describe("ClusterOverview: charts inside collapsed sections", () => {
  it("draws the disk chart when its section is expanded, not only at mount", () => {
    // The render effect belongs to the page, which never unmounts; the chart div
    // belongs to a collapsible section, which does. With a plain ref the effect
    // ran once against a null element and expanding Disks showed an empty card.
    render(<ClusterOverview />);
    expect(initChart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Disks"));
    expect(initChart).toHaveBeenCalled();
    expect(setOption.mock.calls.at(-1)[0].title.text).toBe("Disk: default");
  });

  it("redraws after collapsing and expanding again", () => {
    render(<ClusterOverview />);
    fireEvent.click(screen.getByText("Disks"));
    const first = setOption.mock.calls.length;
    fireEvent.click(screen.getByText("Disks"));
    fireEvent.click(screen.getByText("Disks"));
    expect(setOption.mock.calls.length).toBeGreaterThan(first);
  });
});
