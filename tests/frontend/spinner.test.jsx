// spinner.test.jsx - components/ui/Spinner.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Spinner from "../../src/frontend/components/ui/Spinner.jsx";

describe("Spinner", () => {
  it("renders .loading-spinner with no inline size override at the default md size", () => {
    const { container } = render(<Spinner />);
    const el = container.querySelector(".loading-spinner");
    expect(el).toBeTruthy();
    expect(el.getAttribute("style")).toBeNull();
  });

  it("applies an inline width/height for size='sm'", () => {
    const { container } = render(<Spinner size="sm" />);
    const el = container.querySelector(".loading-spinner");
    expect(el.style.width).toBe("14px");
    expect(el.style.height).toBe("14px");
  });

  it("applies an inline width/height for size='lg'", () => {
    const { container } = render(<Spinner size="lg" />);
    const el = container.querySelector(".loading-spinner");
    expect(el.style.width).toBe("24px");
    expect(el.style.height).toBe("24px");
  });
});
