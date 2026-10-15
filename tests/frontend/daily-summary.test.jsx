// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunQuery = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({ runQuery: (...args) => mockRunQuery(...args) }));
vi.mock("../../src/frontend/App.jsx", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" className={className} />,
}));
vi.mock("../../src/frontend/components/common/ChartToolbar.jsx", () => ({
    savePng: vi.fn(),
    useChartTools: () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), zoomReset: vi.fn() }),
    default: ({ children }) => <div>{children}</div>,
}));
vi.mock("../../src/frontend/components/layout/DataTable.jsx", () => ({
    default: ({ rows }) => <div data-testid="summary-table">{rows.length} rows</div>,
}));
vi.mock("../../src/frontend/utils/echarts.js", () => ({
    initChart: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
    disposeChart: vi.fn(),
    baseChartOption: () => ({}),
    withZoomable: (option) => option,
}));

import DailySummary from "../../src/frontend/components/overview/DailySummary.jsx";

describe("DailySummary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRunQuery.mockResolvedValue({ rows: [] });
    });

    it("loads all summary queries and shows the empty health report state", async () => {
        render(<DailySummary />);

        expect(screen.getByText("Loading daily summary...")).toBeInTheDocument();
        await waitFor(() => expect(mockRunQuery).toHaveBeenCalledTimes(12));
        expect(screen.getByText("Daily Summary")).toBeInTheDocument();
        expect(screen.getByText("No errors recorded for this date")).toBeInTheDocument();
    });

    it("allows changing the report date and manually refreshing", async () => {
        render(<DailySummary />);
        await waitFor(() => expect(mockRunQuery).toHaveBeenCalledTimes(12));

        const date = screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/);
        fireEvent.change(date, { target: { value: "2026-09-10" } });
        await waitFor(() => expect(mockRunQuery).toHaveBeenCalledTimes(24));

        fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
        await waitFor(() => expect(mockRunQuery).toHaveBeenCalledTimes(36));
    });
});