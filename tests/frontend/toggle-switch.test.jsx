// toggle-switch.test.jsx - The switch has its label as its name, a click on the
// label toggles it, and onChange gets { target: { checked } } as before.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ToggleSwitch from "../../src/frontend/components/common/ToggleSwitch.jsx";

describe("ToggleSwitch", () => {
  it("is a switch named by its label", () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} label="Auto reload" />);
    const control = screen.getByRole("switch", { name: "Auto reload" });
    expect(control).toHaveAttribute("aria-checked", "false");
  });

  it("a click on the switch reports the new value", () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} label="Auto reload" />);
    fireEvent.click(screen.getByRole("switch", { name: "Auto reload" }));
    expect(onChange).toHaveBeenCalledWith({ target: { checked: true } });
  });

  it("a click on the label toggles the switch", () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={true} onChange={onChange} label="Auto reload" />);
    fireEvent.click(screen.getByText("Auto reload"));
    expect(onChange).toHaveBeenCalledWith({ target: { checked: false } });
  });
});
