import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import Sidebar from "../../src/frontend/components/layout/Sidebar.jsx";

describe("Sidebar", () => {
  it("lists the main navigation groups and the active route", () => {
    render(
      <MemoryRouter initialEntries={["/overview/cluster"]}>
        <Sidebar
          currentRoute="overview/cluster"
          collapsed={false}
          onNavigate={() => {}}
          onToggle={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Cluster Overview")).toBeInTheDocument();
    expect(screen.getByText("SQL Tools")).toBeInTheDocument();
    expect(screen.getByText("Control panel")).toBeInTheDocument();
  });
});
