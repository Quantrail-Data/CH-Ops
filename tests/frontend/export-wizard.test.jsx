// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { api, toast, idle } = vi.hoisted(() => ({
  api: {
    estimateExport: vi.fn(),
    startExport: vi.fn(),
    exportProgress: vi.fn(),
    cancelExport: vi.fn(),
    downloadExport: vi.fn(),
    formatBytes: (n) => `${n} B`,
    formatRows: (n) => String(n),
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  idle: { beginBusy: vi.fn(), endBusy: vi.fn() },
}));

vi.mock("../../src/frontend/utils/exportApi.js", () => api);
vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({ useToast: () => toast }));
vi.mock("../../src/frontend/hooks/useIdleTimeout.js", () => idle);
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
  default: ({ className }) => <span data-icon={className} />,
}));

import ExportWizard from "../../src/frontend/components/editor/ExportWizard.jsx";

const SQL = "SELECT id, name FROM sales.orders";

function open(sql = SQL) {
  return render(<ExportWizard sql={sql} username="kathir" onClose={vi.fn()} />);
}

async function toFormatStep() {
  fireEvent.click(screen.getByText(/Estimate rows/i));
  await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
  fireEvent.click(screen.getByText("Next"));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.estimateExport.mockResolvedValue({
    selectLike: true, rows: 1000, bytes: 50000, exact: false, warnBytes: 1024 ** 3,
  });
  api.startExport.mockResolvedValue({ jobId: "job-1", fileName: "kathir-export.csv.zip" });
  api.exportProgress.mockResolvedValue({ state: "running", bytesRead: 100, percent: 10 });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(cleanup);

describe("Step 1: checking the query", () => {
  it("shows the SQL that will be exported", () => {
    open();
    expect(screen.getByText(SQL)).toBeTruthy();
  });

  it("blocks Next until an estimate has been attempted", () => {
    open();
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("unblocks Next once the estimate succeeds, and shows the numbers", async () => {
    open();
    fireEvent.click(screen.getByText(/Estimate rows/i));
    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    expect(api.estimateExport).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1000")).toBeTruthy();
  });


  it("unblocks Next even when the estimate fails", async () => {
    api.estimateExport.mockRejectedValue(new Error("cannot estimate"));
    open();
    fireEvent.click(screen.getByText(/Estimate rows/i));
    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    expect(toast.error).toHaveBeenCalled();
  });

  it("warns about a non-SELECT statement without blocking it", () => {
    open("SHOW TABLES");
    expect(screen.getByText(/does not look like a SELECT/i)).toBeTruthy();
  });

  it("warns when the editor holds more than one statement", () => {
    open("SELECT 1; SELECT 2");
    expect(screen.getByText(/more than one statement/i)).toBeTruthy();
  });

  it("asks for confirmation before continuing with a large export", async () => {
    api.estimateExport.mockResolvedValue({
      selectLike: true, rows: 9e9, bytes: 5 * 1024 ** 3, exact: false, warnBytes: 1024 ** 3,
    });
    open();
    await toFormatStep();
    expect(window.confirm).toHaveBeenCalled();
  });

  it("stays on step 1 if the large-export warning is declined", async () => {
    api.estimateExport.mockResolvedValue({
      selectLike: true, rows: 9e9, bytes: 5 * 1024 ** 3, exact: false, warnBytes: 1024 ** 3,
    });
    window.confirm.mockReturnValue(false);
    open();
    fireEvent.click(screen.getByText(/Estimate rows/i));
    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText(SQL)).toBeTruthy();
  });
});

describe("Step 2: choosing the file", () => {
  it("defaults to CSV and zip, and shows the extension it will add", async () => {
    open();
    await toFormatStep();
    expect(screen.getByText(".csv.zip")).toBeTruthy();
  });

  it("puts the username and a timestamp in the suggested filename", async () => {
    open();
    await toFormatStep();
    const input = screen.getByDisplayValue(/^kathir-export-\d{8}-\d{6}$/);
    expect(input).toBeTruthy();
  });

  it("offers the byte order mark for CSV", async () => {
    open();
    await toFormatStep();
    expect(screen.getByText(/byte order mark/i)).toBeTruthy();
  });

  it("hides the byte order mark for a binary format", async () => {
    open();
    await toFormatStep();
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "Parquet" } });
    expect(screen.queryByText(/byte order mark/i)).toBeNull();
  });

  it("notes that compressing an already-compressed format gains little", async () => {
    open();
    await toFormatStep();
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "Parquet" } });
    expect(screen.getByText(/already compress their own contents/i)).toBeTruthy();
  });

  it("shows advanced options that belong to the chosen format only", async () => {
    open();
    await toFormatStep();
    fireEvent.click(screen.getByText(/Advanced options/i));
    expect(screen.getByText("Column separator")).toBeTruthy();
    expect(screen.queryByText("Parquet compression")).toBeNull();

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "Parquet" } });
    expect(screen.getByText("Parquet compression")).toBeTruthy();
    expect(screen.queryByText("Column separator")).toBeNull();
  });

  it("Back returns to step 1", async () => {
    open();
    await toFormatStep();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText(SQL)).toBeTruthy();
  });


  it("submits no settings when nothing was changed", async () => {
    open();
    await toFormatStep();
    fireEvent.click(screen.getByText(/Start export/i));
    await waitFor(() => expect(api.startExport).toHaveBeenCalled());
    expect(api.startExport.mock.calls[0][0].settings).toEqual({});
  });

  it("submits the estimate so the server can check its disk budget", async () => {
    open();
    await toFormatStep();
    fireEvent.click(screen.getByText(/Start export/i));
    await waitFor(() => expect(api.startExport).toHaveBeenCalled());
    expect(api.startExport.mock.calls[0][0].estimatedBytes).toBe(50000);
  });
});

describe("Step 3: preparing and downloading", () => {
  async function toProgressStep() {
    open();
    await toFormatStep();
    fireEvent.click(screen.getByText(/Start export/i));
    await waitFor(() => expect(api.startExport).toHaveBeenCalled());
  }

  it("suspends the idle logout while the job runs", async () => {
    await toProgressStep();
    expect(idle.beginBusy).toHaveBeenCalled();
  });

  it("offers background running while it is still working", async () => {
    await toProgressStep();
    await waitFor(() => expect(screen.getByText(/Starting/i)).toBeTruthy());
  });

  it("shows a Download button once the file is ready", async () => {
    api.exportProgress.mockResolvedValue({
      state: "ready", bytesRead: 500, bytesWritten: 400, percent: 100, fileName: "kathir-export.csv.zip",
    });
    await toProgressStep();
    await waitFor(() => expect(screen.getByText("Download")).toBeTruthy());
  });

  it("releases the idle suspension when the job finishes", async () => {
    api.exportProgress.mockResolvedValue({ state: "ready", bytesRead: 1, bytesWritten: 1, percent: 100 });
    await toProgressStep();
    await waitFor(() => expect(idle.endBusy).toHaveBeenCalled());
  });

  it("shows the reason when a job fails", async () => {
    api.exportProgress.mockResolvedValue({ state: "failed", error: "Not enough export space left." });
    await toProgressStep();
    await waitFor(() => expect(screen.getByText(/Not enough export space left/i)).toBeTruthy());
  });

  it("reports a refused start rather than moving on silently", async () => {
    api.startExport.mockRejectedValue(new Error("You already have 2 exports running."));
    open();
    await toFormatStep();
    fireEvent.click(screen.getByText(/Start export/i));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You already have 2 exports running."));
  });
});
