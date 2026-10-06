// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { runQueryMock, successToast } = vi.hoisted(() => ({
  runQueryMock: vi.fn(),
  successToast: vi.fn(),
}));

vi.mock("../../src/frontend/utils/api.js", () => ({ runQuery: runQueryMock }));
vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
  useToast: () => ({ success: successToast, error: vi.fn(), warning: vi.fn() }),
}));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
  default: ({ className }) => <span aria-hidden="true" className={className} />,
}));
vi.mock("../../src/frontend/components/common/Select.jsx", () => ({
  default: ({ children, ...props }) => <select {...props}>{children}</select>,
}));

import QueryDetailModal from "../../src/frontend/components/queries/QueryDetailModal.jsx";

describe("QueryDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runQueryMock.mockResolvedValue({
      rows: [{
        query: "SELECT full_query_text",
        ProfileEvents: { ReadRows: 42 },
        Settings: { max_threads: 4 },
        thread_ids: [11, 12],
      }],
    });
  });

  it("loads the full query and invokes the async kill action for the selected row", async () => {
    const row = {
      query_id: "query-42",
      query_preview: "SELECT preview",
      progress: null,
      total_rows_approx: 100,
      elapsed: 2,
      read_rows: 42,
      read_bytes: 512,
      memory_usage: 1024,
      peak_memory_usage: 2048,
    };
    const onKill = vi.fn();
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <QueryDetailModal
          row={row}
          rowData={row}
          canKill
          onKill={onKill}
          onClose={onClose}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("SELECT full_query_text")).toBeInTheDocument();
    expect(runQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("system.processes"),
      { readOnly: true },
    );

    fireEvent.click(screen.getByRole("button", { name: /Kill async/i }));
    expect(onKill).toHaveBeenCalledWith(row, { sync: false });
    expect(onClose).not.toHaveBeenCalled();
  });
});