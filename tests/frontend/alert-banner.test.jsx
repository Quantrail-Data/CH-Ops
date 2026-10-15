// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" className={className} />,
}));

vi.mock("motion/react", () => ({
    AnimatePresence: ({ children }) => children,
    motion: {
        div: ({ children, ...props }) => <div {...props}>{children}</div>,
    },
}));

import AlertBanner from "../../src/frontend/components/layout/AlertBanner.jsx";

describe("AlertBanner", () => {
    it("renders a success result with the check icon", () => {
        render(<AlertBanner result={{ ok: true, msg: "Saved" }} setResult={vi.fn()} />);

        expect(screen.getByText("Saved")).toBeInTheDocument();
        expect(screen.getByText("Saved").closest(".alert-banner")).toHaveClass("success");
        expect(screen.getAllByTestId("icon")[0]).toHaveClass("ti-check");
    });

    it("renders an error result with the alert icon", () => {
        render(<AlertBanner result={{ ok: false, msg: "Failed" }} setResult={vi.fn()} />);

        expect(screen.getByText("Failed").closest(".alert-banner")).toHaveClass("danger");
        expect(screen.getAllByTestId("icon")[0]).toHaveClass("ti-alert-circle");
    });

    it("clears the result from the close button", () => {
        const setResult = vi.fn();
        render(<AlertBanner result={{ ok: true, msg: "Saved" }} setResult={setResult} />);

        fireEvent.click(screen.getByRole("button"));

        expect(setResult).toHaveBeenCalledWith(null);
    });

    it("renders nothing without a result", () => {
        const { container } = render(<AlertBanner result={null} setResult={vi.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });
});