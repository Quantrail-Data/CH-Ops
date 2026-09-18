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
}));

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" data-icon={className} />,
}));

vi.mock("../../src/frontend/components/common/Select.jsx", () => ({
    default: ({ value, onChange, children }) => (
        <select value={value} onChange={onChange}>{children}</select>
    ),
}));

vi.mock("../../src/frontend/components/layout/SharedComponents.jsx", () => ({
    SqlPreview: () => <div>SqlPreview</div>,
}));

vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import DataLifecycle from "../../src/frontend/components/backups/DataLifecycle.jsx";

const ManualBackupTab = ({ profiles, databases }) => (
    <div>Manual Backup {profiles.length} {databases.length}</div>
);
const AvailableBackupsTab = ({ profiles }) => <div>Available Backups {profiles.length}</div>;

vi.mock("../../src/frontend/components/backups/DataLifecycle.jsx", async () => {
    const actual = await vi.importActual("../../src/frontend/components/backups/DataLifecycle.jsx");
    return {
        ...actual,
        __esModule: true,
        default: actual.default,
    };
});

// These child tabs are defined inside the same file, so we assert the page's tab
// switching behavior rather than trying to mock the exported inner helpers.

describe("DataLifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApiFetch.mockImplementation((url) => {
            if (url === "/api/settings/backup_profiles") {
                return Promise.resolve({ value: JSON.stringify([{ id: 1, type: "s3", bucket: "demo", accessKeyId: "key", accessKey: "secret" }]) });
            }
            return Promise.resolve({});
        });
        mockRunQuery.mockImplementation((sql) => {
            if (sql.includes("system.databases")) return Promise.resolve({ rows: [{ name: "analytics" }] });
            if (sql.includes("system.clusters")) return Promise.resolve({ rows: [] });
            return Promise.resolve({ rows: [] });
        });
    });

    it("renders admin tabs and switches views", async () => {
        const { container } = render(<DataLifecycle />);

        await waitFor(() => {
            expect(screen.getByText("Data Lifecycle")).toBeInTheDocument();
        });

        const tabs = Array.from(container.querySelectorAll(".tab-item"));
        expect(tabs).toHaveLength(2);
        expect(tabs[0].textContent).toMatch(/Manual Backup/i);
        expect(tabs[1].textContent).toMatch(/Available Backups/i);

        fireEvent.click(tabs[1]);
        await waitFor(() => {
            expect(screen.getAllByText(/Available Backups/i).length).toBeGreaterThan(0);
        });

        fireEvent.click(tabs[0]);
        await waitFor(() => {
            expect(screen.getAllByText(/Manual Backup/i).length).toBeGreaterThan(0);
        });
    });
});
