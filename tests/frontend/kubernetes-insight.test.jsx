// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, toast } = vi.hoisted(() => ({
    apiFetchMock: vi.fn(),
    toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("../../src/frontend/utils/api.js", () => ({ apiFetch: apiFetchMock }));
vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({ useToast: () => toast }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));
vi.mock("../../src/frontend/components/common/Select.jsx", () => ({ default: ({ children, ...props }) => <select {...props}>{children}</select> }));

import KubernetesInsight from "../../src/frontend/components/kubernetes/KubernetesInsight.jsx";

describe("KubernetesInsight", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiFetchMock.mockResolvedValue({
            checks: [{ name: "Operator reachable", ok: true, detail: "Responding" }],
            passing: 1,
            total: 1,
            unknown: 0,
            unavailable: [],
        });
    });

    it("loads health checks and requests the selected insight tab", async () => {
        render(<KubernetesInsight cluster={{ id: "cluster-7" }} />);

        expect(await screen.findByText("Operator reachable")).toBeInTheDocument();
        expect(apiFetchMock).toHaveBeenCalledWith("/api/k8s/insight/cluster-7/health");

        fireEvent.click(screen.getByRole("button", { name: "Topology" }));
        await waitFor(() => {
            expect(apiFetchMock).toHaveBeenCalledWith("/api/k8s/insight/cluster-7/topology");
        });
    });
});
