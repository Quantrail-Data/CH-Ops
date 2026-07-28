// DashboardFilters.test.jsx - the Apply/Reset behaviour of the filter bar.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
  default: ({ className }) => <span data-icon={className} />,
}));

import DashboardFilters from "../../src/frontend/components/dashboards/DashboardFilters.jsx";

const FILTERS = [
  { name: "region", type: "String", charts: [1, 2], requiredBy: [1] },
  { name: "env", type: "String", charts: [1], requiredBy: [] },
];

// Drives the bar the way DashboardView does: draft is local, applied only
// moves when Apply fires.
function Harness({ filters = FILTERS, settings = {}, initial = {}, onApply, onReset }) {
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  return (
    <DashboardFilters
      filters={filters}
      settings={settings}
      draft={draft}
      applied={applied}
      onChange={(n, v) => setDraft((p) => ({ ...p, [n]: v }))}
      onApply={() => { setApplied(draft); onApply?.(draft); }}
      onReset={() => { setDraft(initial); setApplied(initial); onReset?.(); }}
      onHoverFilter={() => {}}
      hoveredFilter={null}
    />
  );
}

const applyBtn = () => screen.getByText("Apply").closest("button");
const input = (n) => document.querySelectorAll("input.form-input")[n];

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("discovery drives the controls", () => {
  it("renders one control per discovered filter", () => {
    render(<Harness />);
    expect(screen.getByText(/region/)).toBeTruthy();
    expect(screen.getByText(/env/)).toBeTruthy();
  });

  it("renders nothing when there are no filters", () => {
    const { container } = render(<Harness filters={[]} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("uses the configured label instead of the parameter name", () => {
    render(<Harness settings={{ region: { label: "Region" } }} />);
    expect(screen.getByText(/Region/)).toBeTruthy();
  });

  it("omits a hidden filter", () => {
    render(<Harness settings={{ env: { hidden: true } }} />);
    expect(screen.queryByText(/env/)).toBeNull();
    expect(screen.getByText(/region/)).toBeTruthy();
  });
});

describe("Apply gates every re-run", () => {
  it("is disabled when nothing has changed", () => {
    render(<Harness initial={{ region: "eu", env: "prod" }} />);
    expect(applyBtn()).toBeDisabled();
  });

  it("enables once a control changes, and does not re-run before then", () => {
    const onApply = vi.fn();
    render(<Harness initial={{ region: "eu", env: "prod" }} onApply={onApply} />);
    fireEvent.change(input(0), { target: { value: "us" } });
    expect(applyBtn()).not.toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("re-runs only when Apply is pressed", () => {
    const onApply = vi.fn();
    render(<Harness initial={{ region: "eu", env: "prod" }} onApply={onApply} />);
    fireEvent.change(input(0), { target: { value: "us" } });
    fireEvent.click(applyBtn());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].region).toBe("us");
  });

  it("goes back to disabled after applying", () => {
    render(<Harness initial={{ region: "eu", env: "prod" }} />);
    fireEvent.change(input(0), { target: { value: "us" } });
    fireEvent.click(applyBtn());
    expect(applyBtn()).toBeDisabled();
  });

  it("applies on Enter from a control", () => {
    const onApply = vi.fn();
    render(<Harness initial={{ region: "eu", env: "prod" }} onApply={onApply} />);
    fireEvent.change(input(0), { target: { value: "us" } });
    fireEvent.keyDown(input(0), { key: "Enter" });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter when nothing has changed", () => {
    const onApply = vi.fn();
    render(<Harness initial={{ region: "eu" }} onApply={onApply} />);
    fireEvent.keyDown(input(0), { key: "Enter" });
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe("the bar says when the view is stale", () => {
  it("shows nothing while the draft matches what is applied", () => {
    render(<Harness initial={{ region: "eu", env: "prod" }} />);
    expect(screen.queryByText(/Out of date/i)).toBeNull();
  });

  it("marks itself out of date once a control changes", () => {
    render(<Harness initial={{ region: "eu", env: "prod" }} />);
    fireEvent.change(input(0), { target: { value: "us" } });
    // Charts keep their previous results; the marker is what makes that honest.
    expect(screen.getByText(/Out of date/i)).toBeTruthy();
  });

  it("clears the marker after Apply", () => {
    render(<Harness initial={{ region: "eu", env: "prod" }} />);
    fireEvent.change(input(0), { target: { value: "us" } });
    fireEvent.click(applyBtn());
    expect(screen.queryByText(/Out of date/i)).toBeNull();
  });
});

describe("Reset", () => {
  it("returns every control to its starting value", () => {
    const onReset = vi.fn();
    render(<Harness initial={{ region: "eu", env: "prod" }} onReset={onReset} />);
    fireEvent.change(input(0), { target: { value: "us" } });
    fireEvent.click(screen.getByText("Reset").closest("button"));
    expect(onReset).toHaveBeenCalled();
    expect(input(0).value).toBe("eu");
  });

  it("is always available, unlike Apply", () => {
    render(<Harness initial={{ region: "eu" }} />);
    expect(screen.getByText("Reset").closest("button")).not.toBeDisabled();
  });
});

describe("required and empty", () => {
  it("marks the control invalid when a required filter is blank", () => {
    render(<Harness initial={{ region: "", env: "prod" }} />);
    expect(input(0).getAttribute("aria-invalid")).toBe("true");
  });

  it("does not mark it once a value is present", () => {
    render(<Harness initial={{ region: "eu", env: "prod" }} />);
    expect(input(0).getAttribute("aria-invalid")).toBeNull();
  });

  it("never marks a filter that no chart requires", () => {
    render(<Harness initial={{ region: "eu", env: "" }} />);
    expect(input(1).getAttribute("aria-invalid")).toBeNull();
  });

  it("does not block Apply - the chart explains itself instead", () => {
    render(<Harness initial={{ region: "eu" }} />);
    fireEvent.change(input(0), { target: { value: "" } });
    expect(applyBtn()).not.toBeDisabled();
  });
});

describe("type conflicts replace the bar", () => {
  it("reports the conflict and renders no controls", () => {
    render(
      <DashboardFilters
        filters={FILTERS}
        settings={{}}
        draft={{}}
        applied={{}}
        onChange={() => {}}
        onApply={() => {}}
        onReset={() => {}}
        conflicts={[
          "Filter 'region' is declared as String in \"A\" and as UInt8 in \"B\". One name must have one type.",
        ]}
      />,
    );
    expect(screen.getByText(/cannot be built/i)).toBeTruthy();
    expect(screen.getByText(/declared as String/)).toBeTruthy();
    expect(screen.queryByText("Apply")).toBeNull();
  });
});
