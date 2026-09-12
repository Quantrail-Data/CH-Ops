// tabs.test.jsx - components/ui/Tabs.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Tabs from "../../src/frontend/components/ui/Tabs.jsx";

const items = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
];

describe("Tabs", () => {
  it("renders one .tab-item per item inside a .tab-bar", () => {
    const { container } = render(<Tabs items={items} active="users" onChange={() => {}} />);
    expect(container.querySelector(".tab-bar")).toBeTruthy();
    expect(container.querySelectorAll(".tab-item").length).toBe(2);
  });

  it("marks the active tab", () => {
    const { container } = render(<Tabs items={items} active="roles" onChange={() => {}} />);
    const tabs = container.querySelectorAll(".tab-item");
    expect(tabs[0].className).toBe("tab-item ");
    expect(tabs[1].className).toBe("tab-item active");
  });

  it("calls onChange with the clicked tab's key", () => {
    const fn = vi.fn();
    render(<Tabs items={items} active="users" onChange={fn} />);
    fireEvent.click(screen.getByText("Roles"));
    expect(fn).toHaveBeenCalledWith("roles");
  });

  it("applies a per-item style for a dimmed/disabled-looking tab", () => {
    const dimmed = [...items, { key: "profiles", label: "Profiles", style: { opacity: 0.35, cursor: "not-allowed" } }];
    render(<Tabs items={dimmed} active="users" onChange={() => {}} />);
    expect(screen.getByText("Profiles")).toHaveStyle({ opacity: "0.35", cursor: "not-allowed" });
  });
});
