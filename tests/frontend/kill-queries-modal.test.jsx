// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runQueryMock } = vi.hoisted(() => ({ runQueryMock: vi.fn() }));

vi.mock("../../src/frontend/utils/api.js", () => ({ runQuery: runQueryMock }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span aria-hidden="true" className={className} />,
}));

import KillQueriesModal from "../../src/frontend/components/queries/KillQueriesModal.jsx";

describe("KillQueriesModal", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        runQueryMock.mockResolvedValue({ rows: [] });
    });

    it("skips unsafe ids, sends a bounded kill for the safe id, then verifies the result", async () => {
        const onVerify = vi.fn().mockResolvedValue([]);
        const onClose = vi.fn();
        const onFinished = vi.fn();

        render(
            <KillQueriesModal
                targets={[
                    { query_id: "safe-id", user: "analyst" },
                    { query_id: "unsafe'; DROP TABLE x", user: "attacker" },
                ]}
                scopeLabel="selected queries"
                onVerify={onVerify}
                onClose={onClose}
                onFinished={onFinished}
            />,
        );

        expect(screen.getByText(/1 query was skipped/i)).toBeInTheDocument();
        const killButton = screen.getByRole("button", { name: /Kill 1 \(ASYNC\)/i });
        expect(killButton).toBeEnabled();
        fireEvent.click(killButton);

        expect(await screen.findByText("Kill result")).toBeInTheDocument();
        expect(runQueryMock).toHaveBeenCalledTimes(1);
        expect(runQueryMock).toHaveBeenCalledWith(
            expect.stringContaining("KILL QUERY WHERE query_id = 'safe-id' ASYNC"),
        );
        expect(onVerify).toHaveBeenCalledTimes(1);
        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Gone")).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });
});