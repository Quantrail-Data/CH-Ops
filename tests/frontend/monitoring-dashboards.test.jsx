// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunQuery = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
    useParams: () => ({ tab: "queries" }),
    useNavigate: () => mockNavigate,
}));
vi.mock("../../src/frontend/utils/api.js", () => ({ runQuery: (...args) => mockRunQuery(...args) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" className={className} />,
}));
vi.mock("../../src/frontend/components/layout/ChartCard.jsx", () => ({
    default: ({ title }) => <div data-testid="chart-card">{title}</div>,
}));
vi.mock("../../src/frontend/components/layout/DateTimePicker.jsx", () => ({
    DateTimePicker: ({ label, value }) => <label>{label}<input aria-label={label} value={value} readOnly /></label>,
}));
vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
    useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));
vi.mock("../../src/frontend/utils/echarts.js", () => ({ baseChartOption: () => ({}) }));

import MonitoringDashboards from "../../src/frontend/components/monitoring/MonitoringDashboards.jsx";

describe("MonitoringDashboards", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRunQuery.mockResolvedValue({ rows: [] });
    });

    it("renders filters and switches between collapsed and expanded views", () => {
        render(<MonitoringDashboards />);

        expect(screen.getByText("Monitoring")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Load Charts" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
        expect(screen.queryByText("Rounding (s)")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Expand" }));
        expect(screen.getByText("Rounding (s)")).toBeInTheDocument();
    });

    it("changes quick duration, loads the active tab, and navigates tabs", async () => {
        render(<MonitoringDashboards />);

        fireEvent.click(screen.getByRole("button", { name: "1h" }));
        expect(screen.getByRole("button", { name: "1h" })).toHaveClass("btn-primary");
        fireEvent.click(screen.getByRole("button", { name: "Load Charts" }));
        await waitFor(() => expect(mockRunQuery).toHaveBeenCalled());

        fireEvent.click(screen.getByText(/Storage\s*\(/));
        expect(mockNavigate).toHaveBeenCalledWith("/monitoring/dashboards/storage", { replace: true });
    });

    it("toggles section fullscreen and exits with Escape", () => {
        const { container } = render(<MonitoringDashboards />);
        fireEvent.click(screen.getByRole("button", { name: /fullscreen/i }));
        expect(container.firstChild).toHaveStyle({ position: "fixed" });
        fireEvent.keyDown(window, { key: "Escape" });
        expect(container.firstChild).not.toHaveStyle({ position: "fixed" });
    });
});