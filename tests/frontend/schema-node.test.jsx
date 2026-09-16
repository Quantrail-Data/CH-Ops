// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
    Handle: ({ type, position }) => <span data-testid={`handle-${type}`} data-position={position} />,
    Position: { Top: "top", Bottom: "bottom" },
}));

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" className={className} />,
}));

import SchemaNode from "../../src/frontend/components/schema/SchemaNode.jsx";

const baseData = {
    node: {
        kind: "mt",
        engine: "MergeTree",
        displayName: "events",
        w: 260,
        totalRows: 2048,
        totalBytes: 4096,
        columns: [
            { name: "id", type: "UInt64", is_key: 1 },
            { name: "created_at", type: "DateTime", has_default: true },
        ],
    },
    p: { bg: "#fff", text: "#111" },
    showColumns: true,
    searchLc: "created",
    isDimmed: false,
    isSelected: true,
    isHighlighted: false,
    hasIncoming: true,
    hasOutgoing: true,
};

describe("SchemaNode", () => {
    it("renders the node header, metadata, columns, and handles", () => {
        render(<SchemaNode data={baseData} />);

        expect(screen.getByText("events")).toBeInTheDocument();
        expect(screen.getByText("MergeTree")).toBeInTheDocument();
        expect(screen.getByText("2.0K")).toBeInTheDocument();
        expect(screen.getByText("id")).toBeInTheDocument();
        expect(screen.getByText("created_at")).toBeInTheDocument();
        expect(screen.getByTestId("handle-target")).toHaveAttribute("data-position", "top");
        expect(screen.getByTestId("handle-source")).toHaveAttribute("data-position", "bottom");
    });

    it("uses kind-specific labels and hides columns when requested", () => {
        const data = {
            ...baseData,
            node: { ...baseData.node, kind: "rmv", engine: "ReplacingMergeTree" },
            showColumns: false,
            hasIncoming: false,
            hasOutgoing: false,
        };
        const { container } = render(<SchemaNode data={data} />);

        expect(screen.getByText("RMV")).toBeInTheDocument();
        expect(container.querySelector("[data-testid='handle-target']")).not.toBeInTheDocument();
        expect(screen.queryByText("created_at")).not.toBeInTheDocument();
    });

    it("shows the overflow count and dimmed opacity for large nodes", () => {
        const columns = Array.from({ length: 15 }, (_, index) => ({
            name: `column_${index}`,
            type: "String",
        }));
        const { container } = render(
            <SchemaNode data={{ ...baseData, node: { ...baseData.node, columns }, isDimmed: true }} />,
        );

        expect(screen.getByText("... 1 more")).toBeInTheDocument();
        expect(container.firstChild).toHaveStyle({ opacity: "0.2" });
    });
});