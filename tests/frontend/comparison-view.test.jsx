import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ComparisonView from "../../src/frontend/components/editor/ComparisonView.jsx";

describe("ComparisonView", () => {
  it("renders the comparison panes and action buttons", () => {
    render(<ComparisonView mode="estimate" onModeChange={() => {}} active={true} />);

    const estimateButtons = screen.getAllByRole("button", { name: /Estimate/i });
    const executeButtons = screen.getAllByRole("button", { name: /Execute/i });

    expect(estimateButtons.length).toBeGreaterThan(0);
    expect(executeButtons.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paste your current query here.../i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Write your rewritten query here.../i).length).toBeGreaterThan(0);
  });
});
