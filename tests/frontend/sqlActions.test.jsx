// sqlActions.test.jsx - the SQL actions row, where only Go runs the query
// Contributors - Kathirdhasan, Praveen kumar, Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EditorView } from "@codemirror/view";

// QueryEditor is a page, not a leaf: it needs the app contexts, a router and a
// connected editor session before the Go button is even enabled. `__calls`
// records the SQL that reaches runEditorQuery, which is what these tests are
// actually about - that choosing a mode does not run anything, and that Go runs
// whatever the mode says.
// vi.mock is hoisted above every top-level statement, so the array it closes
// over has to be hoisted with it.
const { __calls } = vi.hoisted(() => ({ __calls: [] }));

vi.mock("../../src/frontend/utils/api.js", () => ({
  __calls,
  runEditorQuery: (sql) => {
    __calls.push(sql);
    return Promise.resolve({ rows: [], columns: [], stats: {} });
  },
  runQuery: () => Promise.resolve({ rows: [], columns: [] }),
  apiFetch: () => Promise.resolve({}),
  editorConnect: () => Promise.resolve({ ok: true }),
  editorDisconnect: () => Promise.resolve({ ok: true }),
  // Connected, so the Go button is enabled without a login step.
  editorConnectionStatus: () => Promise.resolve({ connected: true, chUser: "tester" }),
  getGlobalConnection: () => ({}),
  setGlobalConnection: () => { },
}));

vi.mock("../../src/frontend/App.jsx", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: () => { } }),
  useAuth: () => ({ auth: { username: "tester", role: "admin" } }),
  useConnection: () => ({
    selectedClusterId: "c1",
    selectedNode: "node1",
    connected: true,
    port: 8123,
    clusters: [{ id: "c1", name: "Cluster-1", nodes: [{ name: "node1", host: "node1" }] }],
    clusterName: "Cluster-1",
    user: "tester",
    nodeName: "node1",
  }),
}));

vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
  useToast: () => ({ success: () => { }, error: () => { }, warning: () => { }, info: () => { } }),
}));

import QueryEditor from "../../src/frontend/components/editor/QueryEditor.jsx";

async function ready(container) {
  await waitFor(() => expect(container.querySelector(".qtabs")).toBeTruthy());
  const v = EditorView.findFromDOM(container.querySelector(".cm-editor"));
  await act(async () => {
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "SELECT 1" } });
  });
}
const btn = (c, re) => [...c.querySelectorAll("button")].find((b) => re.test(b.textContent));

// There is more than one <select> in the toolbar now - ModeSelect (SQL vs
// Comparison) renders first, so querySelector("select") returned that one and
// the EXPLAIN choice never changed. Pick the select by its contents instead.
const explainSelect = (c) =>
  [...c.querySelectorAll("select")].find((sel) =>
    [...sel.options].some((o) => o.value === "GENERAL RUN"),
  );

describe("labels", () => {
  it("calls the run button Go, the estimate Cost, and the plain mode Execute SQL", async () => {
    const { container } = render(<QueryEditor />, { wrapper: MemoryRouter });
    await ready(container);
    expect(btn(container, /^\s*Go\s*$/)).toBeTruthy();
    expect(btn(container, /Cost/)).toBeTruthy();
    expect(container.querySelector('option[value="GENERAL RUN"]').textContent).toBe("Execute SQL");
  });
});

describe("only Go runs", () => {
  it("choosing a mode does NOT run", async () => {
    const { container } = render(<QueryEditor />, { wrapper: MemoryRouter });
    await ready(container);
    const before = __calls.length;
    fireEvent.change(explainSelect(container), { target: { value: "EXPLAIN PLAN" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(__calls.length).toBe(before);
  });

  it("Go then runs whatever the mode says, without resetting it", async () => {
    const { container } = render(<QueryEditor />, { wrapper: MemoryRouter });
    await ready(container);
    fireEvent.change(explainSelect(container), { target: { value: "EXPLAIN PLAN" } });
    const before = __calls.length;
    fireEvent.click(btn(container, /^\s*Go\s*$/));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(__calls.length).toBe(before + 1);
    expect(__calls.at(-1)).toContain("EXPLAIN PLAN");
    // The mode survives the run; forcing it back would discard the choice.
    expect(explainSelect(container).value).toBe("EXPLAIN PLAN");
  });

  it("can go BACK to a plain run", async () => {
    // The old guard skipped the update for "GENERAL RUN", so this was a one-way
    // door: pick an EXPLAIN and every later Go was still an EXPLAIN.
    const { container } = render(<QueryEditor />, { wrapper: MemoryRouter });
    await ready(container);
    const sel = explainSelect(container);
    fireEvent.change(sel, { target: { value: "EXPLAIN PLAN" } });
    fireEvent.change(sel, { target: { value: "GENERAL RUN" } });
    expect(sel.value).toBe("GENERAL RUN");
    fireEvent.click(btn(container, /^\s*Go\s*$/));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(__calls.at(-1)).not.toContain("EXPLAIN");
  });
});
