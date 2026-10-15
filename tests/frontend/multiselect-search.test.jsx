// multiselect-search.test.jsx - Tests for the searchable MultiSelect menu.
// No network and no vi.mock, so it also runs when Vitest is launched by Bun.
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MultiSelect from "../../src/frontend/components/common/MultiSelect.jsx";
const OPTIONS = [
  { value: "event_time", label: "event_time", hint: "DateTime" },
  { value: "thread_id", label: "thread_id", hint: "UInt64" },
  { value: "thread_name", label: "thread_name", hint: "String" },
  { value: "message", label: "message", hint: "String" },
];
function Harness({ searchable }) {
  const [picked, setPicked] = useState([]);
  return (
    <MultiSelect
      searchable={searchable}
      options={OPTIONS}
      value={picked}
      onChange={setPicked}
      placeholder="Pick columns..."
    />
  );
}
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Pick columns/ }));
}
describe("MultiSelect with searchable", () => {
  it("shows the filter input only when searchable is on", () => {
    const { unmount } = render(<Harness searchable />);
    openMenu();
    expect(
      screen.getByPlaceholderText("Type to filter..."),
    ).toBeInTheDocument();
    unmount();
    render(<Harness searchable={false} />);
    openMenu();
    expect(screen.queryByPlaceholderText("Type to filter...")).toBeNull();
  });
  it("filters the options by substring", () => {
    render(<Harness searchable />);
    openMenu();
    fireEvent.change(screen.getByPlaceholderText("Type to filter..."), {
      target: { value: "thread" },
    });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText("thread_id")).toBeInTheDocument();
    expect(screen.queryByText("message")).toBeNull();
  });
  it("shows No options when nothing matches", () => {
    render(<Harness searchable />);
    openMenu();
    fireEvent.change(screen.getByPlaceholderText("Type to filter..."), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No options")).toBeInTheDocument();
  });
  it("picks a filtered option and shows it as a chip", () => {
    render(<Harness searchable />);
    openMenu();
    fireEvent.change(screen.getByPlaceholderText("Type to filter..."), {
      target: { value: "thread_id" },
    });
    fireEvent.mouseDown(screen.getByText("thread_id"));
    expect(screen.getByLabelText("Remove thread_id")).toBeInTheDocument();
  });
  it("shows the type hint next to the option", () => {
    render(<Harness searchable />);
    openMenu();
    expect(screen.getByText("UInt64")).toBeInTheDocument();
  });
});
