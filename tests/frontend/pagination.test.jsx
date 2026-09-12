// pagination.test.jsx - components/ui/Pagination.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Pagination from "../../src/frontend/components/ui/Pagination.jsx";

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} totalPages={1} onChange={() => {}} />);
    expect(container.querySelector(".pagination")).toBeNull();
  });

  it("renders page numbers with the current page marked active", () => {
    const { container } = render(<Pagination page={2} totalPages={3} onChange={() => {}} />);
    const active = container.querySelector(".page-btn.active");
    expect(active).toBeTruthy();
    expect(active.textContent).toBe("2");
  });

  it("disables Previous on the first page and Next on the last page", () => {
    const { container } = render(<Pagination page={1} totalPages={3} onChange={() => {}} />);
    expect(screen.getByLabelText("Previous page").disabled).toBe(true);
    expect(screen.getByLabelText("Next page").disabled).toBe(false);
  });

  it("calls onChange with the target page when a page button is clicked", () => {
    const fn = vi.fn();
    render(<Pagination page={2} totalPages={5} onChange={fn} />);
    fireEvent.click(screen.getByText("3"));
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("collapses distant pages behind an ellipsis", () => {
    render(<Pagination page={1} totalPages={10} onChange={() => {}} siblingCount={1} />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
