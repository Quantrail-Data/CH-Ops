// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockExecute = vi.fn();

vi.mock("react-router-dom", () => ({
    useParams: () => ({ tab: "list" }),
    useNavigate: () => mockNavigate,
}));

vi.mock("../../src/frontend/hooks/useQuery.js", () => ({
    useQuery: () => ({ execute: mockExecute, loading: false, data: [], error: null }),
}));

vi.mock("../../src/frontend/components/layout/AlertBanner.jsx", () => ({
    default: ({ result }) => <div>{result ? "alert" : "banner"}</div>,
}));

vi.mock("../../src/frontend/components/rbac/OnClusterBanner.jsx", () => ({
    default: () => <div>On Cluster</div>,
    useRbacContext: () => ({ cluster: "local" }),
}));

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-icon={className} />,
}));

vi.mock("../../src/frontend/components/common/Select.jsx", () => ({
    default: ({ value, onChange, children }) => (
        <select value={value} onChange={onChange}>{children}</select>
    ),
}));

vi.mock("../../src/frontend/App.jsx", () => ({
    useAuth: () => ({ auth: { role: "admin" } }),
    useTheme: () => ({ theme: "light" }),
}));

vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import RbacProfiles from "../../src/frontend/components/rbac/RbacProfiles.jsx";

describe("RbacProfiles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders the settings profile page and navigation tabs", () => {
        render(<RbacProfiles />);

        expect(screen.getByText("Settings Profiles")).toBeInTheDocument();
        expect(screen.getAllByText("Profiles").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Create").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Alter").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Drop").length).toBeGreaterThan(0);
    });

    it("allows admin users to navigate to create mode", () => {
        render(<RbacProfiles />);

        fireEvent.click(screen.getAllByText("Create")[0]);
        expect(mockNavigate).toHaveBeenCalledWith("/rbac/profiles/create", { replace: true });
    });
});
