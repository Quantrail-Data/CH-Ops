// Contributors - Kathirdhasan, Praveen kumar, Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BookmarkExport from "../../src/frontend/components/editor/BookmarkExport.jsx";
import { toJson } from "../../src/frontend/utils/bookmarkExport.js";

const A = { name: "errors", sql: "SELECT 1" };
const B = { name: "tables", sql: "SELECT 2" };

// jsdom has no real file input; hand the component a File it can read.
function choose(file) {
  const input = screen.getByLabelText("Import bookmarks");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}
const jsonFile = (obj) =>
  new File([typeof obj === "string" ? obj : toJson(obj)], "x.json", { type: "application/json" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

describe("export", () => {
  it("offers all three formats", () => {
    render(<BookmarkExport bookmarks={[A]} onImport={vi.fn()} />);
    for (const l of ["JSON", "Markdown", "SQL"]) expect(screen.getByText(l)).toBeTruthy();
  });

  it("disables them with nothing to export", () => {
    render(<BookmarkExport bookmarks={[]} onImport={vi.fn()} />);
    expect(screen.getByText("JSON").closest("button").disabled).toBe(true);
  });

  it("says which format can come back", () => {
    render(<BookmarkExport bookmarks={[A]} onImport={vi.fn()} />);
    expect(screen.getByText(/Only the JSON export can be imported/)).toBeTruthy();
  });
});

describe("import with nothing to decide", () => {
  it("applies straight away when there are no collisions", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(jsonFile([B]));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(onImport.mock.calls[0][0].map((b) => b.name)).toEqual(["errors", "tables"]);
    // No review with no questions on it.
    expect(screen.queryByText(/already exist/)).toBeNull();
  });

  it("does not ask about a byte-identical query", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(jsonFile([A]));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(screen.queryByText(/already exist/)).toBeNull();
  });
});

describe("import with a collision", () => {
  const clash = jsonFile([{ name: "errors", sql: "SELECT 99" }]);

  it("shows a review and changes NOTHING yet", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(clash);
    await screen.findByText(/already exist/);
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing has changed yet/)).toBeTruthy();
  });

  it("offers three distinct choices", async () => {
    render(<BookmarkExport bookmarks={[A]} onImport={vi.fn()} />);
    choose(clash);
    await screen.findByText(/already exist/);
    for (const l of ["Keep mine", "Take theirs", "Keep both"]) {
      expect(screen.getByText(l)).toBeTruthy();
    }
  });

  it("keeps mine by default", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(clash);
    await screen.findByText(/already exist/);
    fireEvent.click(screen.getByText("Apply import"));
    expect(onImport.mock.calls[0][0]).toEqual([A]);
  });

  it("replaces when told to", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(clash);
    await screen.findByText(/already exist/);
    fireEvent.click(screen.getByText("Take theirs"));
    fireEvent.click(screen.getByText("Apply import"));
    expect(onImport.mock.calls[0][0][0].sql).toBe("SELECT 99");
  });

  it("keeps both when told to", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(clash);
    await screen.findByText(/already exist/);
    fireEvent.click(screen.getByText("Keep both"));
    fireEvent.click(screen.getByText("Apply import"));
    expect(onImport.mock.calls[0][0].map((b) => b.name)).toEqual(["errors", "errors (2)"]);
  });

  it("changes nothing when cancelled", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(clash);
    await screen.findByText(/already exist/);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onImport).not.toHaveBeenCalled();
  });

  it("summarises what will happen", async () => {
    render(<BookmarkExport bookmarks={[A]} onImport={vi.fn()} />);
    choose(clash);
    await screen.findByText(/already exist/);
    expect(screen.getByText(/0 added, 0 replaced, 1 left alone/)).toBeTruthy();
  });
});

describe("bad files", () => {
  it("rejects non-JSON with a message and changes nothing", async () => {
    const onImport = vi.fn();
    render(<BookmarkExport bookmarks={[A]} onImport={onImport} />);
    choose(jsonFile("-- just sql\nSELECT 1;"));
    await screen.findByText(/not a JSON file/);
    expect(onImport).not.toHaveBeenCalled();
  });

  it("rejects JSON that is not an export", async () => {
    render(<BookmarkExport bookmarks={[A]} onImport={vi.fn()} />);
    choose(jsonFile('{"hello":"world"}'));
    await screen.findByText(/No bookmarks found/);
  });

  it("rejects an empty export", async () => {
    render(<BookmarkExport bookmarks={[A]} onImport={vi.fn()} />);
    choose(jsonFile([]));
    await screen.findByText(/no usable queries/);
  });
});
