// sidebar-render.test.jsx - The sidebar renders real buttons that work with
// the keyboard and screen readers: sections open and close, the current page
// is marked, and the collapsed sidebar names each icon.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/frontend/App.jsx", () => ({
  useTheme: () => ({ theme: "dark" }),
  useConnection: () => ({ clusters: [], nodes: [] }),
}));

import Sidebar from "../../src/frontend/components/layout/Sidebar.jsx";

function renderSidebar(props = {}) {
  return render(
    <MemoryRouter initialEntries={["/overview/cluster"]}>
      <Sidebar
        currentRoute="overview/cluster"
        onNavigate={props.onNavigate || (() => {})}
        collapsed={props.collapsed || false}
        onToggle={props.onToggle || (() => {})}
        forceCollapsed={false}
      />
    </MemoryRouter>,
  );
}

describe("Sidebar render", () => {
  it("opens the section of the current page and marks the page", () => {
    renderSidebar();
    const current = screen.getByRole("button", { name: "Cluster Overview" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Overview/, expanded: true })).toBeInTheDocument();
  });

  it("a section header opens its section and closes the others", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: /^SQL Tools/ }));
    expect(screen.getByRole("button", { name: "SQL Editor" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cluster Overview" })).toBeNull();
  });

  it("a page button navigates", () => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });
    fireEvent.click(screen.getByRole("button", { name: "Daily Summary" }));
    expect(onNavigate).toHaveBeenCalledWith("overview/summary");
  });

  it("the collapsed sidebar names each icon button", () => {
    const onToggle = vi.fn();
    renderSidebar({ collapsed: true, onToggle });
    fireEvent.click(screen.getByRole("button", { name: "Logs" }));
    expect(onToggle).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});
