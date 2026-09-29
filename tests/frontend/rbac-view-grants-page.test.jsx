// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", () => ({ useParams: () => ({ tab: "unknown" }), useNavigate: () => navigateMock }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));

import RbacViewGrants from "../../src/frontend/components/rbac/RbacViewGrants.jsx";

describe("RbacViewGrants", () => {
    beforeEach(() => vi.clearAllMocks());

    it("renders grant views and navigates between grant sections", () => {
        render(<RbacViewGrants />);

        expect(screen.getByRole("heading", { name: "View Grants" })).toBeInTheDocument();
        fireEvent.click(screen.getByText("Role Grants"));
        expect(navigateMock).toHaveBeenCalledWith("/rbac/view/roles", { replace: true });
        fireEvent.click(screen.getByText("Full Overview"));
        expect(navigateMock).toHaveBeenCalledWith("/rbac/view/overview", { replace: true });
    });
});
