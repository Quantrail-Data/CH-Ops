// button.test.jsx - components/ui/Button.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Button from "../../src/frontend/components/ui/Button.jsx";

describe("Button", () => {
  it("renders btn btn-primary by default", () => {
    const { container } = render(<Button>Save</Button>);
    const btn = container.querySelector("button");
    expect(btn.className).toBe("btn btn-primary");
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("applies the requested variant class", () => {
    const { container } = render(<Button variant="danger">Delete</Button>);
    expect(container.querySelector("button").className).toBe("btn btn-danger");
  });

  it("appends btn-sm for size='sm'", () => {
    const { container } = render(<Button size="sm">Small</Button>);
    expect(container.querySelector("button").className).toBe("btn btn-primary btn-sm");
  });

  it("calls onClick", () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>Go</Button>);
    fireEvent.click(screen.getByText("Go"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows a spinner when loading", () => {
    const { container } = render(<Button loading>Save</Button>);
    const btn = container.querySelector("button");
    expect(btn.disabled).toBe(true);
    expect(container.querySelector(".loading-spinner")).toBeTruthy();
  });

  it("forwards a ref to the underlying button element", () => {
    const ref = React.createRef();
    render(<Button ref={ref}>Focus me</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("omits the variant class entirely when variant is null", () => {
    const { container } = render(<Button variant={null}>Custom</Button>);
    expect(container.querySelector("button").className).toBe("btn");
  });
});
