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

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" data-icon={className} />,
}));

vi.mock("../../src/frontend/components/common/Select.jsx", () => ({
    default: ({ value, onChange, children }) => (
        <select value={value} onChange={onChange}>{children}</select>
    ),
}));

import StorageProfiles from "../../src/frontend/components/backups/StorageProfiles.jsx";

describe("StorageProfiles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApiFetch.mockResolvedValue({ value: "[]" });
        mockRunQuery.mockResolvedValue({ rows: [] });
    });

    it("opens the create form and saves a new storage profile", async () => {
        const { container } = render(<StorageProfiles />);

        expect(screen.getByText("Storage Profiles")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /new profile/i }));

        const inputs = Array.from(container.querySelectorAll("input.form-input"));
        fireEvent.change(inputs[0], { target: { value: "Primary" } });
        fireEvent.change(inputs[1], { target: { value: "analytics-backups" } });
        fireEvent.change(inputs[4], { target: { value: "AKIA-123" } });
        fireEvent.change(inputs[5], { target: { value: "super-secret" } });

        fireEvent.click(screen.getByRole("button", { name: /save/i }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith(
                "/api/settings/backup_profiles",
                expect.objectContaining({
                    method: "PUT",
                    body: expect.stringContaining("Primary"),
                }),
            );
        });
    });
});
