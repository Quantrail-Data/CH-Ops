// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const progress = vi.fn();
const cancel = vi.fn(async () => {});
vi.mock("../../src/frontend/utils/exportApi.js", () => ({
  estimateExport: vi.fn(async () => ({ rows: 1, bytes: 1, warnBytes: 1e9, selectLike: true })),
  startExport: vi.fn(async () => ({ jobId: "j1", fileName: "f.csv" })),
  exportProgress: (...a) => progress(...a),
  cancelExport: (...a) => cancel(...a),
  downloadExport: vi.fn(),
  formatBytes: (n) => String(n),
  formatRows: (n) => String(n),
}));
vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
  useToast: () => ({ error() {}, success() {}, warning() {}, info() {} }),
}));
vi.mock("../../src/frontend/hooks/useIdleTimeout.js", () => ({ beginBusy() {}, endBusy() {} }));

import ExportWizard from "../../src/frontend/components/editor/ExportWizard.jsx";

const KEY = "chops_active_export";
const remember = (jobId = "j1") =>
  localStorage.setItem(KEY, JSON.stringify({ jobId, fileName: "f.csv", startedAt: Date.now() }));

beforeEach(() => {
  localStorage.clear();
  progress.mockReset();
  cancel.mockReset();
});

describe("resuming", () => {
  it("reopens into the progress view for a job left running", async () => {
    remember();
    progress.mockResolvedValue({ state: "running", bytesWritten: 10 });
    render(<ExportWizard sql="SELECT 1" username="u" onClose={() => {}} />);
    await waitFor(() => expect(progress).toHaveBeenCalledWith("j1"));
  });

  it("reopens for a job that finished while the tab was closed", async () => {
    remember();
    progress.mockResolvedValue({ state: "ready", bytesWritten: 99 });
    render(<ExportWizard sql="SELECT 1" username="u" onClose={() => {}} />);
    await waitFor(() => expect(progress).toHaveBeenCalled());
    // Still remembered: the file is there to collect.
    expect(localStorage.getItem(KEY)).toBeTruthy();
  });

  it("clears the pointer when the job is gone, and starts clean", async () => {
    // A CHOps restart wipes the registry AND the export directory, so a stored
    // id can outlive the thing it points at.
    remember();
    progress.mockRejectedValue(new Error("404"));
    render(<ExportWizard sql="SELECT 1" username="u" onClose={() => {}} />);
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it("clears the pointer for a failed job", async () => {
    remember();
    progress.mockResolvedValue({ state: "failed", error: "boom" });
    render(<ExportWizard sql="SELECT 1" username="u" onClose={() => {}} />);
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it("does nothing when there is no stored job", async () => {
    progress.mockResolvedValue({ state: "running" });
    render(<ExportWizard sql="SELECT 1" username="u" onClose={() => {}} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(progress).not.toHaveBeenCalled();
  });

  it("ignores a corrupt pointer rather than breaking the dialog", async () => {
    localStorage.setItem(KEY, "{not json");
    render(<ExportWizard sql="SELECT 1" username="u" onClose={() => {}} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(progress).not.toHaveBeenCalled();
  });
});

describe("remembering", () => {
  it("writes the pointer when an export starts", async () => {
    // Without this the whole feature is inert: the dialog would still offer to
    // leave the export running and still have no way back to it.
    progress.mockResolvedValue({ state: "running", bytesWritten: 1 });
    const { container } = render(
      <ExportWizard sql="SELECT 1" username="u" onClose={() => {}} />,
    );
    // Step 1 gates Next on having run the estimate, so the walk is:
    // Estimate rows -> Next -> Start export.
    const btn = (re) =>
      [...container.querySelectorAll("button")].find((b) => re.test(b.textContent));
    fireEvent.click(btn(/Estimate rows/));
    await waitFor(() => expect(btn(/^Next$/).disabled).toBe(false));
    fireEvent.click(btn(/^Next$/));
    await waitFor(() => expect(btn(/Start export/)).toBeTruthy());
    fireEvent.click(btn(/Start export/));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      expect(saved?.jobId).toBe("j1");
    });
  });
});
