// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useQueryTabs } from "../../src/frontend/components/editor/useQueryTabs.js";
import QueryTabs from "../../src/frontend/components/editor/QueryTabs.jsx";
import SqlEditor from "../../src/frontend/components/editor/SqlEditor.jsx";

// The three pieces wired the way QueryEditor wires them, without dragging in
// QueryEditor's forty imports.
function Harness() {
  const t = useQueryTabs();
  return (
    <>
      <QueryTabs
        tabs={t.tabs}
        activeId={t.activeId}
        runtime={t.runtime}
        canAdd={t.canAddTab}
        onSelect={t.selectTab}
        onAdd={t.addTab}
        onClose={t.closeTab}
        onRename={t.renameTab}
        confirmClose={() => true}
      />
      <SqlEditor
        docKey={t.activeId}
        docKeys={t.tabs.map((x) => x.id)}
        value={t.activeTab.sql}
        onChange={(sql) => t.updateTab(t.activeId, { sql })}
      />
      <button onClick={() => t.setRuntime(t.activeId, { running: true })}>busy</button>
    </>
  );
}

const doc = () => document.querySelector(".cm-content").textContent;

beforeEach(() => localStorage.clear());

describe("tabs, the strip and the editor together", () => {
  it("starts with one tab holding the default query", () => {
    render(<Harness />);
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(doc()).toContain("SELECT version()");
  });

  it("a new tab is empty and does not carry the first tab's text", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New query tab"));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(doc()).not.toContain("SELECT version()");
  });

  it("switching back restores the first tab's document", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New query tab"));
    fireEvent.click(screen.getAllByRole("tab")[0]);
    expect(doc()).toContain("SELECT version()");
  });

  it("keeps edits made in each tab separate", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New query tab"));
    const view = document.querySelector(".cm-editor").cmView?.view;
    // Type into the second tab through the DOM-independent path.
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[0]);
    expect(doc()).toContain("SELECT version()");
    fireEvent.click(tabs[1]);
    expect(doc()).not.toContain("SELECT version()");
  });

  it("shows the busy marker on the running tab only", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New query tab"));
    fireEvent.click(screen.getByText("busy"));
    const spinners = screen
      .getAllByTestId("icon")
      .filter((n) => (n.getAttribute("data-icon") || "").includes("loader"));
    expect(spinners).toHaveLength(1);
  });

  it("closing a tab leaves the other showing its own text", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New query tab"));
    fireEvent.click(screen.getByLabelText("Close Query 2"));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(doc()).toContain("SELECT version()");
  });

  it("survives a reload: tabs and their SQL come back", async () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByLabelText("New query tab"));
    fireEvent.dblClick(screen.getAllByRole("tab")[1]);
    const input = screen.getByLabelText("Rename tab");
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 600));
    unmount();

    render(<Harness />);
    expect(screen.getAllByRole("tab").map((n) => n.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("second")]),
    );
  });
});
