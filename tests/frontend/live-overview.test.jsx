// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunQuery = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({ runQuery: (...args) => mockRunQuery(...args) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));
vi.mock("../../src/frontend/components/common/Select.jsx", () => ({ default: ({ children, ...props }) => <select {...props}>{children}</select> }));
vi.mock("../../src/frontend/components/dashboards/chartTypes.js", () => ({ buildChartOption: vi.fn(() => ({})) }));
vi.mock("../../src/frontend/components/overview/OverviewCards.jsx", () => ({
    ChartCard: ({ children }) => <div>{children}</div>,
    KpiStrip: () => <div>KPI strip</div>,
    HealthStrip: () => <div>Health strip</div>,
    GaugeGroup: () => <div>Gauge group</div>,
    Section: ({ children }) => <section>{children}</section>,
    MetricDescriptions: ({ children }) => <div><span>Metric descriptions</span>{children}</div>,
}));

import LiveOverview from "../../src/frontend/components/overview/LiveOverview.jsx";

describe("LiveOverview", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("renders the loading state while the live model is not populated", () => {
        render(<LiveOverview live={{ loaded: false, descriptions: {} }} />);

        expect(screen.getByText("Reading system tables...")).toBeInTheDocument();
        expect(screen.getByText("Metric descriptions")).toBeInTheDocument();
    });
});
