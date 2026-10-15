// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", () => ({ useParams: () => ({ tab: "unknown" }), useNavigate: () => navigateMock }));
vi.mock("../../src/frontend/App.jsx", () => ({ useConnection: () => ({ unavailable: false }) }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));

import CrashLog from "../../src/frontend/components/logs/CrashLog.jsx";

describe("CrashLog", () => {
    beforeEach(() => vi.clearAllMocks());

    it("renders the crash-log view selector and navigates to search", () => {
        render(<CrashLog />);

        expect(screen.getByRole("heading", { name: "Crash Log" })).toBeInTheDocument();
        fireEvent.click(screen.getByText("Search"));
        expect(navigateMock).toHaveBeenCalledWith("/logs/crash/search", { replace: true });
        fireEvent.click(screen.getByText("Overview"));
        expect(navigateMock).toHaveBeenCalledWith("/logs/crash/overview", { replace: true });
    });
});
