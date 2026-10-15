// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiFetch = vi.fn();
const mockRunQuery = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({
    apiFetch: (...args) => mockApiFetch(...args),
    runQuery: (...args) => mockRunQuery(...args),
}));
vi.mock("../../src/frontend/App.jsx", () => ({
    useAuth: () => ({ auth: { role: "admin" } }),
    useConnection: () => ({ clusters: [] }),
}));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({ default: ({ className }) => <span data-icon={className} /> }));
vi.mock("../../src/frontend/components/common/Select.jsx", () => ({ default: ({ children, ...props }) => <select {...props}>{children}</select> }));
vi.mock("../../src/frontend/components/layout/ConfirmModal.jsx", () => ({ default: () => null }));
vi.mock("../../src/frontend/components/editor/SqlEditor.jsx", () => ({ default: () => <div>SQL editor</div> }));

import AlertRules from "../../src/frontend/components/alerting/AlertRules.jsx";

describe("AlertRules", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApiFetch.mockResolvedValue([]);
        mockRunQuery.mockResolvedValue({ rows: [] });
    });

    it("renders the admin empty-state and the new-rule action", async () => {
        render(<AlertRules />);

        expect(await screen.findByRole("heading", { name: /alert rules/i })).toBeInTheDocument();
        expect(await screen.findByText(/No rules yet/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /new rule/i })).toBeInTheDocument();
    });
});
