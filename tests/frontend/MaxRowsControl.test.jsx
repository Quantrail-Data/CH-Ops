// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MaxRowsControl, {
  clampMaxRows, readMaxRows, MAX_ROWS_KEY, MAX_ROWS_DEFAULT,
  MAX_ROWS_MIN, MAX_ROWS_MAX, MAX_ROWS_WARN, MAX_ROWS_STEP,
} from "../../src/frontend/components/editor/MaxRowsControl.jsx";

beforeEach(() => localStorage.clear());

describe("clampMaxRows", () => {
  it("keeps a sensible number", () => expect(clampMaxRows(20000)).toBe(20000));
  it("clamps below the floor", () => expect(clampMaxRows(1)).toBe(MAX_ROWS_MIN));
  it("clamps above the ceiling", () => expect(clampMaxRows(9e9)).toBe(MAX_ROWS_MAX));
  it("survives nonsense", () => {
    expect(clampMaxRows("abc")).toBe(MAX_ROWS_MIN);
    expect(clampMaxRows(null)).toBe(MAX_ROWS_MIN);
  });
  it("rounds a fraction", () => expect(clampMaxRows(1500.7)).toBe(1501));
});

describe("readMaxRows", () => {
  it("defaults when nothing is stored", () => expect(readMaxRows()).toBe(MAX_ROWS_DEFAULT));
  it("reads a stored value", () => {
    localStorage.setItem(MAX_ROWS_KEY, "12000");
    expect(readMaxRows()).toBe(12000);
  });
  it("ignores a stored value out of range, rather than trusting it", () => {
    localStorage.setItem(MAX_ROWS_KEY, "99999999");
    expect(readMaxRows()).toBe(MAX_ROWS_DEFAULT);
  });
  it("ignores rubbish", () => {
    localStorage.setItem(MAX_ROWS_KEY, "not a number");
    expect(readMaxRows()).toBe(MAX_ROWS_DEFAULT);
  });
});

describe("the stepper", () => {
  const mount = (value = 5000) => {
    const onChange = vi.fn();
    render(<MaxRowsControl value={value} onChange={onChange} />);
    return onChange;
  };

  it("steps up and down by the step size", () => {
    const onChange = mount(5000);
    fireEvent.click(screen.getByLabelText("More rows"));
    expect(onChange).toHaveBeenCalledWith(5000 + MAX_ROWS_STEP);
    expect(MAX_ROWS_STEP).toBe(100);
    fireEvent.click(screen.getByLabelText("Fewer rows"));
    expect(onChange).toHaveBeenLastCalledWith(5000 - MAX_ROWS_STEP);
  });

  it("cannot step below the floor or above the ceiling", () => {
    mount(MAX_ROWS_MIN);
    expect(screen.getByLabelText("Fewer rows").disabled).toBe(true);
    render(<MaxRowsControl value={MAX_ROWS_MAX} onChange={() => {}} />);
    expect(screen.getAllByLabelText("More rows").at(-1).disabled).toBe(true);
  });

  it("steps by 100", () => {
    const onChange = mount(5000);
    fireEvent.click(screen.getByLabelText("More rows"));
    expect(onChange).toHaveBeenCalledWith(5100);
  });

  it("commits a typed value on blur, not on every keystroke", () => {
    // Typing 20000 passes through 2, 20, 200 and 2000 on the way. Reacting to
    // each would fire the warning at a number nobody asked for.
    const onChange = mount(5000);
    const input = screen.getByLabelText("Maximum rows to return");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.change(input, { target: { value: "20000" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input, { target: { value: "20000" } });
    expect(onChange).toHaveBeenCalledWith(20000);
  });

  it("clamps a typed value", () => {
    const onChange = mount(5000);
    fireEvent.blur(screen.getByLabelText("Maximum rows to return"), {
      target: { value: "999999999" },
    });
    expect(onChange).toHaveBeenCalledWith(MAX_ROWS_MAX);
  });

  it("is disabled while a query runs", () => {
    render(<MaxRowsControl value={5000} onChange={() => {}} disabled />);
    expect(screen.getAllByLabelText("More rows").at(-1).disabled).toBe(true);
  });

  it("warns well above ordinary use and well below the ceiling", () => {
    expect(MAX_ROWS_WARN).toBeGreaterThan(MAX_ROWS_DEFAULT);
    expect(MAX_ROWS_WARN).toBeLessThan(MAX_ROWS_MAX);
  });
});
