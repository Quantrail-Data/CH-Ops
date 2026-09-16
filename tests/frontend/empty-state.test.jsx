// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" className={className} />,
}));

import EmptyState from "../../src/frontend/components/queues/EmptyState.jsx";

describe("EmptyState", () => {
    it("renders the default icon, title, and no body when children are absent", () => {
        const { container } = render(<EmptyState title="No queues" />);

        expect(screen.getByText("No queues")).toBeInTheDocument();
        expect(screen.getByTestId("icon")).toHaveClass("ti", "ti-inbox");
        expect(container.querySelector(".queue-empty-body")).not.toBeInTheDocument();
    });

    it("uses a custom icon and renders body content", () => {
        const { container } = render(
            <EmptyState icon="ti-database" title="Unused queue">
                This queue is not configured.
            </EmptyState>,
        );

        expect(screen.getByTestId("icon")).toHaveClass("ti-database");
        expect(container.querySelector(".queue-empty-body")).toHaveTextContent(
            "This queue is not configured.",
        );
    });
});