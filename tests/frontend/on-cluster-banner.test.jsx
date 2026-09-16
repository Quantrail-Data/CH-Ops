// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUseConnection = vi.fn();
const mockApiFetch = vi.fn();

vi.mock("../../src/frontend/App.jsx", () => ({
    useConnection: () => mockUseConnection(),
}));

vi.mock("../../src/frontend/utils/api.js", () => ({
    apiFetch: (...args) => mockApiFetch(...args),
}));

import OnClusterBanner, {
    SessionAffinityWarning,
    useRbacContext,
} from "../../src/frontend/components/rbac/OnClusterBanner.jsx";

function ContextProbe() {
    const context = useRbacContext();
    return <output data-testid="context">{context ? context.replicaCount : "none"}</output>;
}

describe("OnClusterBanner", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseConnection.mockReturnValue({ selectedClusterId: "cluster-1" });
    });

    it("shows the ON CLUSTER warning only when enabled and no value is selected", () => {
        render(<OnClusterBanner rbac={{ warnAboutOnCluster: true, replicaCount: 3 }} />);

        expect(screen.getByText(/3 replicas/)).toBeInTheDocument();
    });

    it("suppresses the warning when it is disabled or a value exists", () => {
        const { rerender } = render(
            <OnClusterBanner rbac={{ warnAboutOnCluster: false, replicaCount: 3 }} />,
        );
        expect(screen.queryByText(/replicas/)).not.toBeInTheDocument();

        rerender(<OnClusterBanner rbac={{ warnAboutOnCluster: true, replicaCount: 3 }} value="cluster" />);
        expect(screen.queryByText(/replicas/)).not.toBeInTheDocument();
    });

    it("shows only the non-sticky session warning", () => {
        const { rerender } = render(
            <SessionAffinityWarning rbac={{ sessionAffinity: { checked: true, sticky: false } }} />,
        );
        expect(screen.getByText(/different replicas/)).toBeInTheDocument();

        rerender(<SessionAffinityWarning rbac={{ sessionAffinity: { checked: true, sticky: true } }} />);
        expect(screen.queryByText(/different replicas/)).not.toBeInTheDocument();
    });

    it("loads context for a selected cluster and ignores failures", async () => {
        mockApiFetch.mockResolvedValueOnce({ replicaCount: 4 });
        const { rerender } = render(<ContextProbe />);

        await waitFor(() => expect(screen.getByTestId("context")).toHaveTextContent("4"));
        expect(mockApiFetch).toHaveBeenCalledWith("/api/k8s/insight/cluster-1/rbac-context");

        mockApiFetch.mockRejectedValueOnce(new Error("unavailable"));
        mockUseConnection.mockReturnValue({ selectedClusterId: "cluster-2" });
        rerender(<ContextProbe />);
        await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    });
});