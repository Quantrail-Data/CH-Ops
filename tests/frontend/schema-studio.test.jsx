// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.fn();
const mockConnectionStatus = vi.fn();
const mockDisconnect = vi.fn();
const mockGetGlobalConnection = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({
    getGlobalConnection: (...args) => mockGetGlobalConnection(...args),
}));

vi.mock("../../src/frontend/utils/studioApi.js", () => ({
    connect: (...args) => mockConnect(...args),
    connectionStatus: (...args) => mockConnectionStatus(...args),
    disconnect: (...args) => mockDisconnect(...args),
}));

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" data-icon={className} />,
}));

vi.mock("../../src/frontend/components/schema-studio/StepSource.jsx", () => ({
    default: () => <div>StepSource</div>,
}));

vi.mock("../../src/frontend/components/schema-studio/StepSchema.jsx", () => ({
    default: () => <div>StepSchema</div>,
}));

vi.mock("../../src/frontend/components/schema-studio/StepEngine.jsx", () => ({
    default: () => <div>StepEngine</div>,
}));

vi.mock("../../src/frontend/components/schema-studio/StepGenerate.jsx", () => ({
    default: () => <div>StepGenerate</div>,
}));

import SchemaStudio from "../../src/frontend/components/schema-studio/SchemaStudio.jsx";

describe("SchemaStudio", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockConnectionStatus.mockResolvedValue({ connected: false });
        mockConnect.mockResolvedValue({ connected: true, chUser: "analytics", node: "node1", port: 8123 });
        mockGetGlobalConnection.mockReturnValue({ clusterId: "c1", node: "node1", port: 8123, user: "default" });
    });

    it("renders the connection panel and connects with the selected node", async () => {
        render(<SchemaStudio />);

        await waitFor(() => expect(screen.getByText("Connect to ClickHouse")).toBeInTheDocument());
        expect(screen.getByText("node1:8123")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("default"), { target: { value: "analytics" } });
        fireEvent.click(screen.getByRole("button", { name: /connect/i }));

        await waitFor(() => {
            expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
                clusterId: "c1",
                node: "node1",
                port: 8123,
                user: "analytics",
            }));
        });
    });
});
