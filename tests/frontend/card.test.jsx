// card.test.jsx - components/ui/Card.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Card from "../../src/frontend/components/ui/Card.jsx";

describe("Card", () => {
  it("renders a div.card by default", () => {
    const { container } = render(<Card>content</Card>);
    const el = container.querySelector("div.card");
    expect(el).toBeTruthy();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("renders as a different element via the `as` prop", () => {
    const { container } = render(<Card as="section">content</Card>);
    expect(container.querySelector("section.card")).toBeTruthy();
  });

  it("merges extra className", () => {
    const { container } = render(<Card className="extra">content</Card>);
    expect(container.querySelector("div").className).toBe("card extra");
  });

  it("forwards a ref to the underlying element", () => {
    const ref = React.createRef();
    render(<Card ref={ref}>content</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
