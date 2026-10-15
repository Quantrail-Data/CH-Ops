// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, executeMock, queryState } = vi.hoisted(() => {
    const executeMock = vi.fn();
    return {
        navigateMock: vi.fn(),
        executeMock,
        queryState: { data: [], loading: false, execute: executeMock },
    };
});

vi.mock("react-router-dom", () => ({ useParams: () => ({ tab: "list" }), useNavigate: () => navigateMock }));
vi.mock("../../src/frontend/hooks/useQuery.js", () => ({ useQuery: () => queryState }));
vi.mock("../../src/frontend/utils/api.js", () => ({ runQuery: vi.fn() }));
vi.mock("../../src/frontend/App.jsx", () => ({ useAuth: () => ({ auth: { role: "admin" } }) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));
vi.mock("../../src/frontend/components/layout/DataTable.jsx", () => ({ default: ({ emptyMessage }) => <div>{emptyMessage}</div> }));
vi.mock("../../src/frontend/components/layout/AlertBanner.jsx", () => ({ default: () => null }));
vi.mock("../../src/frontend/components/rbac/OnClusterBanner.jsx", () => ({
    default: () => null,
    useRbacContext: () => ({}),
}));

import RbacUsers from "../../src/frontend/components/rbac/RbacUsers.jsx";

describe("RbacUsers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryState.data = [];
        queryState.loading = false;
    });

    it("shows the empty user list and routes an admin to user creation", () => {
        render(<RbacUsers />);

        expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
        expect(screen.getByText("No users.")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Create"));
        expect(navigateMock).toHaveBeenCalledWith("/rbac/users/create", { replace: true });
    });
});
