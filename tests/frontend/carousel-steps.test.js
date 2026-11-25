// Tests for stepsBetween (utils/carouselSteps.js): the Login page moves the
// feature text by the same steps as the screenshot carousel.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect } from "vitest";
import { stepsBetween } from "../../src/frontend/utils/carouselSteps.js";

describe("stepsBetween", () => {
  it("gives 1 for the next slide and -1 for the previous slide", () => {
    expect(stepsBetween(3, 4, 10)).toBe(1);
    expect(stepsBetween(4, 3, 10)).toBe(-1);
  });

  it("goes the short way around the loop", () => {
    expect(stepsBetween(9, 0, 10)).toBe(1);
    expect(stepsBetween(0, 9, 10)).toBe(-1);
  });

  it("gives the real distance for a jump with a dot", () => {
    expect(stepsBetween(0, 3, 10)).toBe(3);
    expect(stepsBetween(8, 2, 10)).toBe(4);
  });

  it("gives 0 when the slide does not change", () => {
    expect(stepsBetween(5, 5, 10)).toBe(0);
  });
});
