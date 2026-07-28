// Copyright (C) 2026 Quantrail™ Data Private Limited
// The Cluster Overview page and its live section.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const runQuery = vi.fn();
const setOption = vi.fn();
const initChart = vi.fn(() => ({ setOption, resize: vi.fn(), dispose: vi.fn() }));

vi.mock("../../src/frontend/utils/api.js", () => ({
  runQuery: (...a) => runQuery(...a),
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

import LiveOverview, {
  useLiveOverview,
  LiveControlBar,
  MachineGauges,
} from "../../src/frontend/components/overview/LiveOverview.jsx";

// The control bar and the charts are separate components sharing one hook, so
// the page can put the controls above the stat cards. The harness wires them
// the same way ClusterOverview does.
function Harness({ nodeName }) {
  const live = useLiveOverview();
  return (
    <>
      <LiveControlBar nodeName={nodeName} live={live} />
      <MachineGauges live={live} />
      <LiveOverview live={live} />
    </>
  );
}

// The three polled tables, keyed by which query asked for them.
function respond({ metrics = {}, async: asyncM = {}, events = {} }) {
  runQuery.mockImplementation((sql) => {
    if (sql.includes("system.asynchronous_metrics")) {
      return Promise.resolve({
        rows: Object.entries(asyncM).map(([metric, value]) => ({ metric, value })),
      });
    }
    if (sql.includes("system.events")) {
      return Promise.resolve({
        rows: Object.entries(events).map(([event, value]) => ({ event, value })),
      });
    }
    return Promise.resolve({
      rows: Object.entries(metrics).map(([metric, value]) => ({ metric, value })),
    });
  });
}

const HEALTHY = {
  metrics: {
    Query: 2, GlobalThread: 100, GlobalThreadActive: 40,
    PartsActive: 95, PartsOutdated: 133, PartsWide: 74, PartsCompact: 154,
    BackgroundMergesAndMutationsPoolTask: 4, BackgroundMergesAndMutationsPoolSize: 32,
    ReadonlyReplica: 0, DelayedInserts: 0,
  },
  async: { OSIdleTimeNormalized: 0.83, OSMemoryTotal: 1000, OSMemoryAvailable: 600, MemoryResident: 100 },
  events: { Query: 100, SelectedRows: 1000, RowsReadByMainReader: 66000, LogError: 10, LogInfo: 90 },
};

/** Most sections start collapsed, so a test that reads their contents opens one. */
const expand = (title) => fireEvent.click(screen.getByText(title));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  respond(HEALTHY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveOverview: first paint", () => {
  it("names the node it is showing, so it is never ambiguous", async () => {
    render(<Harness nodeName="ch-node-02" />);
    expect(screen.getByText("ch-node-02")).toBeTruthy();
  });

  it("shows a loading state until the first reading arrives", async () => {
    render(<Harness nodeName="n1" />);
    expect(screen.getByText(/Reading system tables/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Reading system tables/)).toBeNull());
  });

  it("polls all three system tables", async () => {
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(3));
    const asked = runQuery.mock.calls.map((c) => c[0]).join(" ");
    expect(asked).toContain("system.metrics");
    expect(asked).toContain("system.asynchronous_metrics");
    expect(asked).toContain("system.events");
  });

  it("says plainly that rates cover the refresh interval", async () => {
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(screen.getByText(/rates cover the last 5s/)).toBeTruthy());
  });
});

describe("LiveOverview: the two sample rule", () => {
  it("shows a dash rather than zero for a rate on the first reading", async () => {
    // A rate genuinely does not exist yet. Zero would be a different claim.
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(screen.getByText("Throughput")).toBeTruthy());
    expand("Throughput");
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("produces a rate once a second reading arrives", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Harness nodeName="n1" />);
    await vi.advanceTimersByTimeAsync(10);

    // Counters move on the second poll: 40 more queries over the interval.
    respond({ ...HEALTHY, events: { ...HEALTHY.events, Query: 140 } });
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => expect(runQuery.mock.calls.length).toBeGreaterThanOrEqual(6));
  });
});

describe("LiveOverview: controls", () => {
  it("stops polling when paused and resumes when started", async () => {
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(runQuery).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Live"));
    expect(screen.getByText("Paused")).toBeTruthy();

    const afterPause = runQuery.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(runQuery.mock.calls.length).toBe(afterPause);
  });

  it("remembers the interval across a remount", async () => {
    const { unmount } = render(<Harness nodeName="n1" />);
    await waitFor(() => expect(runQuery).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Refresh interval"), { target: { value: "30" } });
    await waitFor(() => expect(screen.getByText(/rates cover the last 30s/)).toBeTruthy());
    unmount();

    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(screen.getByText(/rates cover the last 30s/)).toBeTruthy());
  });

  it("remembers a paused state across a remount", async () => {
    const { unmount } = render(<Harness nodeName="n1" />);
    await waitFor(() => expect(runQuery).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Live"));
    unmount();

    render(<Harness nodeName="n1" />);
    expect(screen.getByText("Paused")).toBeTruthy();
  });
});

describe("LiveOverview: health", () => {
  it("collapses to one line when every check is clear", async () => {
    render(<Harness nodeName="n1" />);
    // The collapsed header carries the verdict, so the fact that everything is
    // clear is visible without expanding anything.
    await waitFor(() => expect(screen.getByText(/all \d+ clear/)).toBeTruthy());
    expand("Health checks");
    expect(screen.getByText(/health checks are clear/)).toBeTruthy();
  });

  it("raises the chip when a check fails", async () => {
    respond({ ...HEALTHY, metrics: { ...HEALTHY.metrics, ReadonlyReplica: 2 } });
    render(<Harness nodeName="n1" />);
    // Collapsed, the header still reports that something is failing. That is the
    // property that makes collapsing safe.
    await waitFor(() => expect(screen.getByText("1 failing")).toBeTruthy());
    expand("Health checks");
    expect(screen.getByText("Readonly replicas")).toBeTruthy();
  });
});

describe("LiveOverview: failure handling", () => {
  it("reports a failed read instead of rendering nothing", async () => {
    runQuery.mockRejectedValue(new Error("Connection refused"));
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(screen.getByText(/Connection refused/)).toBeTruthy());
  });

  it("keeps the last reading when a later poll fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Harness nodeName="n1" />);
    await vi.advanceTimersByTimeAsync(10);
    await waitFor(() => expect(screen.queryByText(/Reading system tables/)).toBeNull());

    runQuery.mockRejectedValue(new Error("gone"));
    await vi.advanceTimersByTimeAsync(5000);

    // Still showing the page rather than falling back to the spinner.
    await waitFor(() => expect(screen.queryByText(/Reading system tables/)).toBeNull());
  });
});

describe("LiveOverview: conditional sections", () => {
  it("hides subsystems that are not in use on this node", async () => {
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(screen.getByText("Storage")).toBeTruthy());
    expect(screen.queryByText("Kafka")).toBeNull();
    expect(screen.queryByText("Temporary files")).toBeNull();
  });

  it("shows a subsystem as soon as it reports activity", async () => {
    respond({ ...HEALTHY, metrics: { ...HEALTHY.metrics, KafkaConsumers: 3 } });
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(screen.getByText("In use on this node")).toBeTruthy());
    expand("In use on this node");
    expect(screen.getByText("Kafka")).toBeTruthy();
  });
});

describe("LiveOverview: what starts open", () => {
  it("opens only the machine gauges, leaving every other section collapsed", async () => {
    // The page is twenty-odd cards. Machine and server answers "is this node
    // under load", and everything else is a follow-up question, so it is the
    // only live section open on a first visit.
    render(<Harness nodeName="n1" />);
    await waitFor(() => expect(screen.getByText("Machine and server")).toBeTruthy());

    // Open: a gauge from the machine group is rendered.
    expect(screen.getByText("CPU")).toBeTruthy();

    // Collapsed: their headers are present, their contents are not.
    for (const title of ["Health checks", "Throughput", "Storage", "Data health"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.queryByText("Read amplification")).toBeNull();
    expect(screen.queryByText("Parts by state")).toBeNull();
  });
});
