// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockOrderFilters = vi.fn((filters) => filters);

vi.mock("../../src/frontend/utils/dashboardParams.js", () => ({
    orderFilters: (...args) => mockOrderFilters(...args),
}));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-icon={className} />,
}));
vi.mock("../../src/frontend/components/common/ParamInput.jsx", () => ({
    default: ({ value, onChange }) => (
        <input aria-label="Default value" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

import DashboardSettings from "../../src/frontend/components/dashboards/DashboardSettings.jsx";

describe("DashboardSettings", () => {
    it("edits a filter and persists only configured values", () => {
        const onSave = vi.fn();
        const onClose = vi.fn();
        const filters = [{ name: "region", type: "String", requiredBy: [] }];

        render(<DashboardSettings filters={filters} settings={{}} onSave={onSave} onClose={onClose} />);

        expect(screen.getByRole("dialog", { name: "Filter settings" })).toBeInTheDocument();
        expect(screen.getByText("region:String")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Label for region"), { target: { value: "Region" } });
        fireEvent.change(screen.getByLabelText("Order for region"), { target: { value: "2" } });
        fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

        expect(onSave).toHaveBeenCalledWith({ region: { label: "Region", order: 2 } });

        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
