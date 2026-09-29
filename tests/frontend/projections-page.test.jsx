// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", () => ({
    useParams: () => ({ tab: "unknown" }),
    useNavigate: () => navigateMock,
}));
vi.mock("../../src/frontend/App.jsx", () => ({ useAuth: () => ({ auth: { role: "readonly" } }) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));

import Projections from "../../src/frontend/components/indexes/Projections.jsx";

describe("Projections", () => {
    beforeEach(() => vi.clearAllMocks());

    it("renders the projection navigation and restricts write tabs for readonly users", () => {
        render(<Projections />);

        expect(screen.getByRole("heading", { name: "Projections" })).toBeInTheDocument();
        fireEvent.click(screen.getByText("View Projections"));
        expect(navigateMock).toHaveBeenCalledWith("/indexes/projections/view", { replace: true });

        fireEvent.click(screen.getByText("Add Projection"));
        expect(navigateMock).toHaveBeenCalledTimes(1);
    });
});
