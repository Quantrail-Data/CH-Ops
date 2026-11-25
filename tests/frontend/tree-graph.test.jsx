// tree-graph.test.jsx - TreeGraph: empty message, nodes, open and close, and
// the beam on the path of a clicked node.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TreeGraph from "../../src/frontend/components/common/TreeGraph.jsx";

const TREE = {
  name: "analyst",
  kind: "user",
  tone: "accent",
  children: [
    {
      name: "reporting",
      kind: "role",
      tone: "warning",
      children: [{ name: "Grants", tone: "neutral", children: [{ name: "SELECT.sales", kind: "grant", tone: "success" }] }],
    },
  ],
};

describe("TreeGraph", () => {
  it("shows the empty message without a tree", () => {
    render(<TreeGraph tree={null} fileName="x.png" emptyMessage="Select a user." />);
    expect(screen.getByText("Select a user.")).toBeInTheDocument();
  });

  it("shows the nodes with their kind and the download button", () => {
    render(<TreeGraph tree={TREE} fileName="x.png" emptyMessage="" />);
    expect(screen.getByText("analyst")).toBeInTheDocument();
    expect(screen.getByText("role")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeInTheDocument();
  });

  it("closes and opens a node with its button", () => {
    render(<TreeGraph tree={TREE} fileName="x.png" emptyMessage="" />);
    expect(screen.getByText("SELECT.sales")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close reporting" }));
    expect(screen.queryByText("SELECT.sales")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open reporting (1)" }));
    expect(screen.getByText("SELECT.sales")).toBeInTheDocument();
  });

  it("marks the path from the root to a clicked node", () => {
    const { container } = render(<TreeGraph tree={TREE} fileName="x.png" emptyMessage="" />);
    fireEvent.click(screen.getByText("Grants"));
    const onPath = [...container.querySelectorAll(".tree-node.is-on-path")].map((node) => node.textContent);
    expect(onPath.some((text) => text.includes("analyst"))).toBe(true);
    expect(onPath.some((text) => text.includes("Grants"))).toBe(true);
    expect(onPath.some((text) => text.includes("SELECT.sales"))).toBe(false);
  });
});
