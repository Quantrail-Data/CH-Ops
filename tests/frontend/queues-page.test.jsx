// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/frontend/App.jsx", () => ({
    useConnection: () => ({ unavailable: false }),
}));

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-icon={className} />,
}));

vi.mock("../../src/frontend/components/layout/ErrorBoundary.jsx", () => ({
    default: ({ children }) => <>{children}</>,
}));

vi.mock("../../src/frontend/components/queues/IngestionTab.jsx", () => ({
    default: ({ source }) => <div>{source} ingestion tab</div>,
}));

vi.mock("../../src/frontend/components/queues/DistReplTab.jsx", () => ({
    default: ({ view, unavailable }) => <div>{view} dist tab {unavailable ? "unavailable" : "active"}</div>,
}));

import QueuesPage from "../../src/frontend/components/queues/QueuesPage.jsx";

describe("QueuesPage", () => {
    it("renders the queue tabs and switches between views", () => {
        render(<QueuesPage />);

        expect(screen.getByText("Queues")).toBeInTheDocument();
        expect(screen.getByText("S3 Queue")).toBeInTheDocument();
        expect(screen.getByText("Azure Queue")).toBeInTheDocument();

        fireEvent.click(screen.getByText("Azure Queue"));
        expect(screen.getByText("azure ingestion tab")).toBeInTheDocument();

        fireEvent.click(screen.getByText("Distribution Queue"));
        expect(screen.getByText("distribution dist tab active")).toBeInTheDocument();
    });
});
