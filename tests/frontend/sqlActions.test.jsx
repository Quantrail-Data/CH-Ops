// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import QueryEditor from "../../src/frontend/components/editor/QueryEditor.jsx";
import { __calls } from "../../src/frontend/utils/api.js";

async function ready(container) {
  await waitFor(() => expect(container.querySelector(".qtabs")).toBeTruthy());
  const v = EditorView.findFromDOM(container.querySelector(".cm-editor"));
  await act(async () => {
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "SELECT 1" } });
  });
}
const btn = (c, re) => [...c.querySelectorAll("button")].find((b) => re.test(b.textContent));

describe("labels", () => {
  it("calls the run button Go, the estimate Cost, and the plain mode Execute SQL", async () => {
    const { container } = render(<QueryEditor />);
    await ready(container);
    expect(btn(container, /^\s*Go\s*$/)).toBeTruthy();
    expect(btn(container, /Cost/)).toBeTruthy();
    expect(container.querySelector('option[value="GENERAL RUN"]').textContent).toBe("Execute SQL");
  });
});

describe("only Go runs", () => {
  it("choosing a mode does NOT run", async () => {
    const { container } = render(<QueryEditor />);
    await ready(container);
    const before = __calls.length;
    fireEvent.change(container.querySelector("select"), { target: { value: "EXPLAIN PLAN" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(__calls.length).toBe(before);
  });

  it("Go then runs whatever the mode says, without resetting it", async () => {
    const { container } = render(<QueryEditor />);
    await ready(container);
    fireEvent.change(container.querySelector("select"), { target: { value: "EXPLAIN PLAN" } });
    const before = __calls.length;
    fireEvent.click(btn(container, /^\s*Go\s*$/));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(__calls.length).toBe(before + 1);
    expect(__calls.at(-1)).toContain("EXPLAIN PLAN");
    // The mode survives the run; forcing it back would discard the choice.
    expect(container.querySelector("select").value).toBe("EXPLAIN PLAN");
  });

  it("can go BACK to a plain run", async () => {
    // The old guard skipped the update for "GENERAL RUN", so this was a one-way
    // door: pick an EXPLAIN and every later Go was still an EXPLAIN.
    const { container } = render(<QueryEditor />);
    await ready(container);
    const sel = container.querySelector("select");
    fireEvent.change(sel, { target: { value: "EXPLAIN PLAN" } });
    fireEvent.change(sel, { target: { value: "GENERAL RUN" } });
    expect(sel.value).toBe("GENERAL RUN");
    const before = __calls.length;
    fireEvent.click(btn(container, /^\s*Go\s*$/));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(__calls.at(-1)).not.toContain("EXPLAIN");
  });
});
