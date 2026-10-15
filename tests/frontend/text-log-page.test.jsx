// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", () => ({ useParams: () => ({ tab: "unknown" }), useNavigate: () => navigateMock }));
vi.mock("../../src/frontend/App.jsx", () => ({ useConnection: () => ({ unavailable: false }) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));

import TextLog from "../../src/frontend/components/logs/TextLog.jsx";

describe("TextLog", () => {
    beforeEach(() => vi.clearAllMocks());

    it("renders the log view selector and navigates between overview and search", () => {
        render(<TextLog />);

        expect(screen.getByRole("heading", { name: "Text Log" })).toBeInTheDocument();
        fireEvent.click(screen.getByText("Search"));
        expect(navigateMock).toHaveBeenCalledWith("/logs/text/search", { replace: true });
        fireEvent.click(screen.getByText("Overview"));
        expect(navigateMock).toHaveBeenCalledWith("/logs/text/overview", { replace: true });
    });
});
