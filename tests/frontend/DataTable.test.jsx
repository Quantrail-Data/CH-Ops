// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Unit tests verifying data table rendering, pagination, column sorting, and cell formatting behaviors.

import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DataTable from "../../src/frontend/components/layout/DataTable.jsx";
import { ThemeContext } from "../../src/frontend/App.jsx";

describe("DataTable", () => {
  it("renders column headers from columns prop", () => {
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable
          rows={[{ name: "Alice", age: 30 }]}
          columns={["name", "age"]}
        />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
  });

  it("infers columns from row keys when columns not provided", () => {
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable rows={[{ x: 1, y: 2 }]} />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(screen.getByText("y")).toBeInTheDocument();
  });

  it("renders row data correctly", () => {
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable
          rows={[{ name: "Bob", age: 25 }]}
          columns={["name", "age"]}
        />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("shows custom empty message when no rows", () => {
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable rows={[]} columns={["x"]} emptyMessage="Nothing here" />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("shows default empty message", () => {
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable rows={[]} columns={["x"]} />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("No data found.")).toBeInTheDocument();
  });

  it("fires onCellDoubleClick with cell value", () => {
    const fn = vi.fn();
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable rows={[{ x: "clickme" }]} columns={["x"]} onCellClick={fn} />
        );
      </ThemeContext.Provider>,
    );
    fireEvent.doubleClick(screen.getByText("clickme"));
    expect(fn).toHaveBeenCalledWith("clickme");
  });

  it("renders actions column with header", () => {
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable
          rows={[{ x: 1 }]}
          columns={["x"]}
          actions={(row) => <button>Del {row.x}</button>}
        />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("Del 1")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("respects maxRows limit and shows count", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ i }));
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable rows={rows} columns={["i"]} maxRows={5} />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("Showing 5 of 50 rows")).toBeInTheDocument();
  });

  it("handles null and undefined cell values", () => {
    render(
      <ThemeContext.Provider value={{ theme: "dark" }}>
        <DataTable rows={[{ x: null, y: undefined }]} columns={["x", "y"]} />
      </ThemeContext.Provider>,
    );
    expect(screen.getAllByRole("row").length).toBeGreaterThan(0);
  });

  it("displays complex data", async () => {
    const rows = [{ i: { test: '123' } }]
    render(<DataTable rows={rows} columns={['i']} />)

    const complexObjectRow = await screen.findByText((content) =>
      content.includes('test') &&
      content.includes('123')
    )
    expect(complexObjectRow).toBeInTheDocument()

    cleanup()

    rows.test = ['test']
    render(<DataTable rows={rows} columns={['i']} />)

    const complexRow = await screen.findByText((content) =>
      content.includes('test')
    )
    expect(complexRow).toBeInTheDocument()

    cleanup()

    const original = globalThis.JSON

    const mockJSON = { ...original, stringify: () => { throw new Error('wtf') } }
    vi.stubGlobal('JSON', mockJSON)

    render(<DataTable rows={rows} columns={['i']} />)

    const stringRow = await screen.findByText((content) =>
      content.includes('[object Object]')
    )

    expect(stringRow).toBeInTheDocument()
    cleanup()

    const originalString = globalThis.String

    const mockString = function () {
      throw new Error("Test")
    }
    vi.stubGlobal('String', mockString)
    render(<DataTable rows={rows} columns={['i']} />)

    const row = screen.queryByText((content) =>
      content.includes('[object Object]') ||
      (content.includes('test') && content.includes('123'))
    )

    expect(row).not.toBeInTheDocument()

    vi.stubGlobal('String', originalString)
    vi.stubGlobal('JSON', original)
    vi.clearAllMocks()
    cleanup()


  })

});