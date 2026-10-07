// advanced-filters-ui.test.jsx - View-level test. No network and no vi.mock,
// so it also runs when Vitest is launched by Bun.
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdvancedFiltersView } from "../../src/frontend/components/logs/AdvancedFilters.jsx";
const COLUMNS = [
  { name: "event_time", type: "DateTime" },
  { name: "thread_id", type: "UInt64" },
  { name: "message", type: "String" },
];
const DIALECT = { keywords: ["SELECT", "AND"], functions: [{ name: "lower" }] };
function Harness({ initial }) {
  const [value, setValue] = useState(initial || { columns: [], filters: [] });
  return (
    <AdvancedFiltersView
      columns={COLUMNS}
      dialect={DIALECT}
      value={value}
      onChange={setValue}
    />
  );
}
describe("AdvancedFiltersView", () => {
  it("renders the two blocks", () => {
    render(<Harness />);
    expect(screen.getByText("Additional Result Columns")).toBeInTheDocument();
    expect(screen.getByText(/Custom SQL Filters/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add filter/ }),
    ).toBeInTheDocument();
  });
  it("adds and removes filter rows", () => {
    render(<Harness />);
    const add = screen.getByRole("button", { name: /Add filter/ });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getAllByLabelText(/Remove filter/)).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Remove filter 2"));
    expect(screen.getAllByLabelText(/Remove filter/)).toHaveLength(1);
  });
  it("shows a fixed AND label on the first row and a connector on later rows", () => {
    render(
      <Harness
        initial={{
          columns: [],
          filters: [
            { op: "AND", expr: "a=1" },
            { op: "OR", expr: "b=2" },
          ],
        }}
      />,
    );
    // Row 1 has no connector dropdown. Row 2 has one.
    expect(screen.queryByLabelText("Connector for filter 1")).toBeNull();
    expect(screen.getByLabelText("Connector for filter 2")).toBeInTheDocument();
  });
  it("stops at 10 rows and disables the button", () => {
    render(<Harness />);
    const add = screen.getByRole("button", { name: /Add filter/ });
    for (let i = 0; i < 12; i += 1) fireEvent.click(add);
    expect(screen.getAllByLabelText(/Remove filter/)).toHaveLength(10);
    expect(add).toBeDisabled();
  });
});
