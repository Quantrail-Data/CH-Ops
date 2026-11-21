// ui-components.test.jsx - Every shadcn/ui component file loads, and a few
// render with the "tw" class prefix.
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../../src/frontend/components/ui/button.jsx";
import { Badge } from "../../src/frontend/components/ui/badge.jsx";
import { Input } from "../../src/frontend/components/ui/input.jsx";

const UI_FOLDER = path.resolve(__dirname, "../../src/frontend/components/ui");
const componentFiles = fs.readdirSync(UI_FOLDER).filter((name) => name.endsWith(".jsx"));

describe("shadcn/ui components", () => {
  it.each(componentFiles)("%s loads", async (fileName) => {
    const loaded = await import(path.join(UI_FOLDER, fileName));
    expect(Object.keys(loaded).length).toBeGreaterThan(0);
  });

  it("Button renders with prefixed classes", () => {
    render(<Button>Run</Button>);
    const button = screen.getByRole("button", { name: "Run" });
    expect(button.className).toContain("tw:bg-primary");
    expect(button.className).not.toMatch(/(^| )bg-primary/);
  });

  it("Badge and Input render", () => {
    render(<><Badge>OK</Badge><Input placeholder="Host" /></>);
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Host")).toBeInTheDocument();
  });
});
