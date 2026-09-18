// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchSchemaData = vi.fn();

vi.mock("@xyflow/react", () => ({
    ReactFlow: ({ children }) => <div data-testid="react-flow">{children}</div>,
    ReactFlowProvider: ({ children }) => <>{children}</>,
    Controls: () => <div>Controls</div>,
    useReactFlow: () => ({ fitView: vi.fn() }),
    useNodesState: () => [[], vi.fn(), vi.fn()],
    useEdgesState: () => [[], vi.fn(), vi.fn()],
    MarkerType: {},
}));
vi.mock("../../src/frontend/utils/schemaParser.js", () => ({
    fetchSchemaData: (...args) => mockFetchSchemaData(...args),
    fetchViewsLoad: vi.fn().mockResolvedValue({ loadByMv: new Map(), loadByEdge: new Map(), loadMax: { byMv: {}, byEdge: {} } }),
    getEnginePalette: vi.fn(), getEdgeColors: vi.fn(), fmtBytes: vi.fn(), fmtRows: vi.fn(), loadIntensity: vi.fn(), loadColour: vi.fn(),
}));
vi.mock("../../src/frontend/utils/schemaLayout.js", () => ({ layoutGraph: vi.fn() }));
vi.mock("../../src/frontend/App.jsx", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));
vi.mock("../../src/frontend/components/common/Select.jsx", () => ({ default: ({ children, ...props }) => <select {...props}>{children}</select> }));
vi.mock("../../src/frontend/components/schema/SchemaNode.jsx", () => ({ default: () => <div>Schema node</div> }));

import SchemaVisualizer from "../../src/frontend/components/schema/SchemaVisualizer.jsx";

describe("SchemaVisualizer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchSchemaData.mockResolvedValue({
            tables: [],
            nodes: new Map(),
            nodesByDb: new Map(),
            edges: [],
        });
    });

    it("loads the schema controls and prompts for a database and table", async () => {
        render(<SchemaVisualizer />);

        await waitFor(() => expect(mockFetchSchemaData).toHaveBeenCalledTimes(1));
        expect(screen.getByText("0 tables loaded. Select a database and table.")).toBeInTheDocument();
        expect(screen.getByText("Select a database to begin")).toBeInTheDocument();
        expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
    });
});
