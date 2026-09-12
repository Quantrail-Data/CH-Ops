// badge.test.jsx - components/ui/Badge.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Badge from "../../src/frontend/components/ui/Badge.jsx";

describe("Badge", () => {
  it("defaults to badge-gray", () => {
    const { container } = render(<Badge>Idle</Badge>);
    expect(container.querySelector("span").className).toBe("badge badge-gray");
  });

  it.each(["green", "red", "amber", "blue", "gray", "purple"])(
    "renders badge-%s for that color",
    (color) => {
      const { container } = render(<Badge color={color}>x</Badge>);
      expect(container.querySelector("span").className).toBe(`badge badge-${color}`);
    },
  );

  it("renders children text", () => {
    render(<Badge color="green">Healthy</Badge>);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("forwards extra props like title", () => {
    render(<Badge title="This rule will not notify anyone">NO CHANNELS</Badge>);
    expect(screen.getByText("NO CHANNELS")).toHaveAttribute("title", "This rule will not notify anyone");
  });
});
