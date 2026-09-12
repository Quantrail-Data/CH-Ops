// tooltip.test.jsx - components/ui/Tooltip.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Tooltip from "../../src/frontend/components/ui/Tooltip.jsx";

describe("Tooltip", () => {
  it("renders children without a bubble until hovered", () => {
    render(
      <Tooltip content="Explains the thing">
        <span>Trigger</span>
      </Tooltip>,
    );
    expect(screen.getByText("Trigger")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the bubble on mouse enter and hides it on mouse leave", () => {
    render(
      <Tooltip content="Explains the thing">
        <span>Trigger</span>
      </Tooltip>,
    );
    const trigger = screen.getByText("Trigger").parentElement;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Explains the thing");
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on Escape while focused", () => {
    render(
      <Tooltip content="Explains the thing">
        <span>Trigger</span>
      </Tooltip>,
    );
    const trigger = screen.getByText("Trigger").parentElement;
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders bare children when content is empty", () => {
    const { container } = render(
      <Tooltip content="">
        <span>Trigger</span>
      </Tooltip>,
    );
    expect(container.querySelector(".tooltip-trigger")).toBeNull();
    expect(screen.getByText("Trigger")).toBeInTheDocument();
  });
});
