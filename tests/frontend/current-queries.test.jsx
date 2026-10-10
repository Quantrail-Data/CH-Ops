import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runQuery } = vi.hoisted(() => ({
  runQuery: vi.fn(async (sql) => {
    if (sql.includes("groupUniqArray")) {
      return {
        rows: [{ users: ["alice"], kinds: ["SELECT"] }],
      };
    }

    return {
      rows: [
        {
          query_id: "q-100",
          user: "alice",
          query_kind: "SELECT",
          elapsed: 12,
          memory_usage: 2048,
          peak_memory_usage: 4096,
          read_rows: 100,
          read_bytes: 1024,
          written_rows: 0,
          written_bytes: 0,
          total_rows_approx: 200,
          peak_threads_usage: 2,
          query: "SELECT 1",
          query_preview: "SELECT 1",
          is_cancelled: 0,
          is_initial_query: 1,
          is_internal: 0,
          total_running: 1,
        },
      ],
    };
  }),
}));

vi.mock("../../src/frontend/utils/api.js", () => ({
  runQuery,
}));

vi.mock("../../src/frontend/components/queries/QueryDetailModal.jsx", () => ({
  default: () => <div>Query detail</div>,
}));

vi.mock("../../src/frontend/components/queries/KillQueriesModal.jsx", () => ({
  default: () => <div>Kill queries</div>,
}));

import CurrentQueries from "../../src/frontend/components/queries/CurrentQueries.jsx";

describe("CurrentQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runQuery.mockImplementation(async (sql) => {
      if (sql.includes("groupUniqArray")) {
        return {
          rows: [{ users: ["alice"], kinds: ["SELECT"] }],
        };
      }

      return {
        rows: [
          {
            query_id: "q-100",
            user: "alice",
            query_kind: "SELECT",
            elapsed: 12,
            memory_usage: 2048,
            peak_memory_usage: 4096,
            read_rows: 100,
            read_bytes: 1024,
            written_rows: 0,
            written_bytes: 0,
            total_rows_approx: 200,
            peak_threads_usage: 2,
            query: "SELECT 1",
            query_preview: "SELECT 1",
            is_cancelled: 0,
            is_initial_query: 1,
            is_internal: 0,
            total_running: 1,
          },
        ],
      };
    });
  });

  it("renders the current query controls and metrics after loading", async () => {
    render(<CurrentQueries />);

    await waitFor(() => {
      expect(screen.getByText("Running")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Filter by user")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by query kind")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });
});
