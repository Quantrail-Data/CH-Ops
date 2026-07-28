// Copyright (C) 2026 Quantrail™ Data Private Limited
// DataTable-virtual.test.jsx - row virtualisation, scrolling and full screen in the results table
// Contributors - Kathirdhasan, Praveen kumar

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
// DataTable reads the theme from App's context. Rendered bare it crashes on
// `const { theme } = useTheme()` because the context default is null, which is
// what took all 17 tests in this file down at once.
vi.mock("../../src/frontend/App.jsx", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: () => {} }),
  useAuth: () => ({ auth: { username: "test", role: "admin" } }),
  useConnection: () => ({}),
}));

import DataTable from "../../src/frontend/components/layout/DataTable.jsx";

const make = (n, cols = 4) =>
  Array.from({ length: n }, (_, i) =>
    Object.fromEntries(Array.from({ length: cols }, (_, c) => [`c${c}`, `r${i}c${c}`])),
  );
const cols = (n) => Array.from({ length: n }, (_, c) => `c${c}`);
const dataRows = () =>
  [...document.querySelectorAll(".data-table tbody tr")].filter(
    (r) => r.getAttribute("aria-hidden") !== "true",
  );

const VIEWPORT = 600;
const ROW_H = 34;

beforeEach(() => {
  // jsdom does no layout: every box is zero, there is no ResizeObserver, and a
  // virtualiser given a zero-height viewport correctly renders nothing.
  global.ResizeObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ target: el, contentRect: { height: VIEWPORT, width: 800 } }]); }
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = function () {
    const h = this.tagName === "TR" ? ROW_H : VIEWPORT;
    return { height: h, width: 800, top: 0, bottom: h, left: 0, right: 800, x: 0, y: 0 };
  };
  for (const [prop, val] of [["clientHeight", VIEWPORT], ["offsetHeight", VIEWPORT], ["scrollTop", 0]]) {
    Object.defineProperty(Element.prototype, prop, { configurable: true, get: () => val, set: () => {} });
  }
});

describe("small results are untouched", () => {
  it("renders every row below the threshold", () => {
    render(<DataTable rows={make(20)} columns={cols(4)} />);
    expect(dataRows()).toHaveLength(20);
  });

  it("adds no spacer rows", () => {
    render(<DataTable rows={make(20)} columns={cols(4)} />);
    expect(document.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(0);
  });

  it("does not force a height on a table that did not have one", () => {
    const { container } = render(<DataTable rows={make(20)} columns={cols(4)} />);
    expect(container.firstChild.style.maxHeight).toBe("");
  });
});

describe("large results are virtualised", () => {
  it("draws far fewer rows than it was given", async () => {
    render(<DataTable rows={make(5000)} columns={cols(4)} />);
    await act(async () => {});
    const n = dataRows().length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(200);
  });

  it("costs the same for 1,000 rows as for 100,000", async () => {
    // The property that makes this "fast" rather than "less slow".
    const { unmount } = render(<DataTable rows={make(1000)} columns={cols(4)} />);
    await act(async () => {});
    const small = dataRows().length;
    expect(small, "nothing rendered; the harness is not giving a viewport").toBeGreaterThan(0);
    unmount();
    render(<DataTable rows={make(100000)} columns={cols(4)} />);
    await act(async () => {});
    const huge = dataRows().length;
    expect(Math.abs(huge - small)).toBeLessThanOrEqual(4);
  });

  it("stays cheap on a wide result, which is the case that broke", async () => {
    // 72 columns is system.query_log. Before virtualising this drew 72,000
    // cells; the budget now is however many rows fit on screen.
    render(<DataTable rows={make(4000, 72)} columns={cols(72)} />);
    await act(async () => {});
    expect(dataRows().length * 72).toBeLessThan(20000);
  });

  it("renders a first slice rather than nothing before it has measured", async () => {
    // Not a test convenience: a virtualiser with no viewport returns no items,
    // and rendering none of them means a blank table.
    render(<DataTable rows={make(5000)} columns={cols(4)} />);
    await act(async () => {});
    const n = dataRows().length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(60);
  });

  // NOT TESTED HERE: the spacer rows, and the row window changing as you
  // scroll. Both need real layout, and jsdom has none. They want a browser.

  it("scrolls rather than growing the page", () => {
    const { container } = render(<DataTable rows={make(5000)} columns={cols(4)} />);
    expect(container.firstChild.style.overflow).toBe("auto");
    expect(container.firstChild.style.maxHeight).toBeTruthy();
  });

  it("no longer truncates: every fetched row can be scrolled to", () => {
    // The cell budget showed 166 of 4,000. Virtualising shows all 4,000.
    render(<DataTable rows={make(4000, 72)} columns={cols(72)} />);
    expect(screen.queryByText(/Showing .* of /)).toBeNull();
  });

  it("respects a maxHeight the caller already set", () => {
    const { container } = render(
      <DataTable rows={make(5000)} columns={cols(4)} maxHeight="200px" />,
    );
    expect(container.firstChild.style.maxHeight).toBe("200px");
  });
});

describe("fullscreen", () => {
  it("offers it when there are rows", () => {
    render(<DataTable rows={make(5)} columns={cols(4)} />);
    expect(screen.getByLabelText("Fullscreen")).toBeTruthy();
  });

  it("does not offer it on an empty table", () => {
    render(<DataTable rows={[]} columns={cols(4)} />);
    expect(screen.queryByLabelText("Fullscreen")).toBeNull();
  });

  it("can be turned off by the caller", () => {
    render(<DataTable rows={make(5)} columns={cols(4)} allowFullscreen={false} />);
    expect(screen.queryByLabelText("Fullscreen")).toBeNull();
  });

  // PORTALLED, so it is no longer inside the container it was rendered from.
  // jsdom does not normalise the `inset` shorthand to pixels: React writes
  // `inset: 0` and cssstyle reports it back as "0", not "0px". Matching only
  // "0px" therefore never found the portal.
  const overlay = () =>
    [...document.body.children].find(
      (el) =>
        el.style &&
        el.style.position === "fixed" &&
        ["0", "0px"].includes(el.style.inset),
    );

  it("escapes its container entirely", () => {
    const { container } = render(<DataTable rows={make(5)} columns={cols(4)} />);
    fireEvent.click(screen.getByLabelText("Fullscreen"));
    // Nothing left behind where it used to be.
    expect(container.firstChild).toBeNull();
    const o = overlay();
    expect(o).toBeTruthy();
    expect(o.parentElement).toBe(document.body);
  });

  it("comes back into its container", () => {
    const { container } = render(<DataTable rows={make(5)} columns={cols(4)} />);
    fireEvent.click(screen.getByLabelText("Fullscreen"));
    fireEvent.click(screen.getByLabelText("Exit fullscreen"));
    expect(container.firstChild).toBeTruthy();
    expect(container.firstChild.style.position).toBe("relative");
    expect(overlay()).toBeFalsy();
  });

  it("Escape leaves it", () => {
    const { container } = render(<DataTable rows={make(5)} columns={cols(4)} />);
    fireEvent.click(screen.getByLabelText("Fullscreen"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.firstChild.style.position).toBe("relative");
  });

  it("does not listen for Escape while closed", () => {
    // Otherwise every table on the page swallows Escape from whatever else
    // wanted it.
    const spy = vi.spyOn(document, "addEventListener");
    render(<DataTable rows={make(5)} columns={cols(4)} />);
    expect(spy.mock.calls.filter((c) => c[0] === "keydown")).toHaveLength(0);
    spy.mockRestore();
  });
});
