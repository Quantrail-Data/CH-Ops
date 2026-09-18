// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiFetch = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({ apiFetch: (...args) => mockApiFetch(...args) }));
vi.mock("../../src/frontend/App.jsx", () => ({
    useAuth: () => ({ auth: { role: "admin" } }),
    useConnection: () => ({ unavailable: false }),
}));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));
vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({ useToast: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }) }));
vi.mock("../../src/frontend/components/admin/KubernetesClusterTab.jsx", () => ({ default: () => <div>Kubernetes clusters</div> }));
vi.mock("../../src/frontend/components/editor/ConfirmDialog.jsx", () => ({ default: () => null }));

afterEach(() => vi.clearAllMocks());

import ClusterManagement from "../../src/frontend/components/admin/ClusterManagement.jsx";

describe("ClusterManagement", () => {
    beforeEach(() => {
        mockApiFetch.mockResolvedValue([]);
    });

    it("loads the empty state and opens the new cluster form", async () => {
        render(<ClusterManagement />);

        expect(await screen.findByText("Cluster Management")).toBeInTheDocument();
        expect(screen.getByText(/No clusters configured/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /new cluster/i }));
        await waitFor(() => expect(screen.getByText("Cluster Name *")).toBeInTheDocument());
        expect(screen.getByPlaceholderText("node-1")).toBeInTheDocument();
    });
});
