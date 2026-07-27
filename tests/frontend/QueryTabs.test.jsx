// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import QueryTabs, { needsCloseConfirm } from "../../src/frontend/components/editor/QueryTabs.jsx";

const TABS = [
  { id: "a", name: "Query 1", sql: "SELECT 1" },
  { id: "b", name: "Query 2", sql: "" },
  { id: "c", name: "errors by hour", sql: "SELECT 3" },
];

function mount(props = {}) {
  const handlers = {
    onSelect: vi.fn(), onAdd: vi.fn(), onClose: vi.fn(), onRename: vi.fn(),
  };
  const utils = render(
    <QueryTabs tabs={TABS} activeId="a" {...handlers} {...props} />,
  );
  return { ...handlers, ...utils };
}

beforeEach(() => vi.restoreAllMocks());

describe("rendering", () => {
  it("renders one tab per record", () => {
    mount();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
  it("marks the active tab", () => {
    mount();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
  });
  it("shows the keyboard shortcut in the title for the first nine", () => {
    mount();
    expect(screen.getAllByRole("tab")[0].getAttribute("title")).toContain("Ctrl+1");
  });
  it("carries the hint that used to sit under the editor", () => {
    mount();
    expect(screen.getByText(/Ctrl\+Enter to run/)).toBeTruthy();
  });
});

describe("selecting", () => {
  it("selects on click", () => {
    const { onSelect } = mount();
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
  });
  it("selects on Enter, for keyboard users", () => {
    const { onSelect } = mount();
    fireEvent.keyDown(screen.getAllByRole("tab")[2], { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("c");
  });
});

describe("Ctrl+number", () => {
  it("switches to the nth tab", () => {
    const { onSelect } = mount();
    fireEvent.keyDown(document, { key: "2", ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith("b");
  });
  it("accepts Cmd on a Mac", () => {
    const { onSelect } = mount();
    fireEvent.keyDown(document, { key: "3", metaKey: true });
    expect(onSelect).toHaveBeenCalledWith("c");
  });
  it("ignores a number with no tab behind it", () => {
    const { onSelect } = mount();
    fireEvent.keyDown(document, { key: "9", ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("ignores the key without a modifier", () => {
    const { onSelect } = mount();
    fireEvent.keyDown(document, { key: "2" });
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("does not fire while a rename is being typed", () => {
    // The rename input stops propagation itself, so this passes with or without
    // the guard in the listener.
    const { onSelect } = mount();
    fireEvent.doubleClick(screen.getAllByRole("tab")[0]);
    const input = screen.getByLabelText("Rename tab");
    fireEvent.keyDown(input, { key: "2", ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not fire while typing in ANY input on the page", () => {
    // This is the case the guard exists for.
    const onSelect = vi.fn();
    render(
      <>
        <input aria-label="Bookmark name" />
        <QueryTabs tabs={TABS} activeId="a" onSelect={onSelect} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("Bookmark name"), {
      key: "2",
      ctrlKey: true,
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("adding", () => {
  it("adds", () => {
    const { onAdd } = mount();
    fireEvent.click(screen.getByLabelText("New query tab"));
    expect(onAdd).toHaveBeenCalled();
  });
  it("disables at the cap and says why", () => {
    const { onAdd } = mount({ canAdd: false });
    const btn = screen.getByLabelText("New query tab");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toMatch(/Maximum/);
    fireEvent.click(btn);
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("closing", () => {
  it("closes an empty tab with no confirmation", () => {
    const confirmClose = vi.fn(() => true);
    const { onClose } = mount({ confirmClose });
    fireEvent.click(screen.getByLabelText("Close Query 2"));
    expect(confirmClose).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith("b");
  });

  it("confirms for text that has never been run", () => {
    const confirmClose = vi.fn(() => true);
    const { onClose } = mount({ confirmClose });
    fireEvent.click(screen.getByLabelText("Close Query 1"));
    // The owner is handed the tab and takes it from there, so nothing closes
    // until it says so.
    expect(confirmClose).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes immediately when no owner wants to be asked", () => {
    const { onClose } = mount({ confirmClose: null });
    fireEvent.click(screen.getByLabelText("Close Query 1"));
    expect(onClose).toHaveBeenCalledWith("a");
  });

  it("does NOT confirm for a tab that has been run", () => {
    // It is recoverable from history, so the question is not worth asking.
    const confirmClose = vi.fn(() => true);
    const { onClose } = mount({
      confirmClose,
      runtime: { a: { lastQueryId: "q-1" } },
    });
    fireEvent.click(screen.getByLabelText("Close Query 1"));
    expect(confirmClose).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith("a");
  });

  it("does not also select the tab it is closing", () => {
    const { onSelect, onClose } = mount({ confirmClose: () => true });
    fireEvent.click(screen.getByLabelText("Close Query 2"));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("renaming", () => {
  it("opens an input on double click, seeded with the current name", () => {
    mount();
    fireEvent.doubleClick(screen.getAllByRole("tab")[0]);
    expect(screen.getByLabelText("Rename tab").value).toBe("Query 1");
  });
  it("commits on Enter", () => {
    const { onRename } = mount();
    fireEvent.doubleClick(screen.getAllByRole("tab")[0]);
    const input = screen.getByLabelText("Rename tab");
    fireEvent.change(input, { target: { value: "slow joins" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("a", "slow joins");
  });
  it("commits on blur, so clicking away does not lose the edit", () => {
    const { onRename } = mount();
    fireEvent.doubleClick(screen.getAllByRole("tab")[0]);
    const input = screen.getByLabelText("Rename tab");
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith("a", "x");
  });
  it("abandons on Escape", () => {
    const { onRename } = mount();
    fireEvent.doubleClick(screen.getAllByRole("tab")[0]);
    const input = screen.getByLabelText("Rename tab");
    fireEvent.change(input, { target: { value: "discard me" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Rename tab")).toBeNull();
  });
});

describe("busy indicator", () => {
  it("marks only the running tab", () => {
    mount({ runtime: { b: { running: true } } });
    const spinners = screen.getAllByTestId("icon").filter(
      (n) => (n.getAttribute("data-icon") || "").includes("loader"),
    );
    expect(spinners).toHaveLength(1);
  });
  it("shows nothing when nothing is running", () => {
    mount();
    const spinners = screen.getAllByTestId("icon").filter(
      (n) => (n.getAttribute("data-icon") || "").includes("loader"),
    );
    expect(spinners).toHaveLength(0);
  });
});

describe("needsCloseConfirm", () => {
  it("is false for an empty tab", () => {
    expect(needsCloseConfirm({ sql: "   " }, undefined)).toBe(false);
  });
  it("is true for unsaved text never run", () => {
    expect(needsCloseConfirm({ sql: "SELECT 1" }, undefined)).toBe(true);
  });
  it("is false once the tab has produced anything", () => {
    expect(needsCloseConfirm({ sql: "SELECT 1" }, { result: [] })).toBe(false);
    expect(needsCloseConfirm({ sql: "SELECT 1" }, { error: "x" })).toBe(false);
  });
});

describe("keyboardEnabled", () => {
  it("ignores Ctrl+N when the pane is mounted but hidden", () => {
    // Both editor modes stay mounted so tabs survive a mode switch.
    const onSelect = vi.fn();
    render(<QueryTabs tabs={TABS} activeId="a" onSelect={onSelect} keyboardEnabled={false} />);
    fireEvent.keyDown(document, { key: "2", ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
