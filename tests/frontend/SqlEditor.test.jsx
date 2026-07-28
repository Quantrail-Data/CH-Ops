// SqlEditor.test.jsx - the shared SQL editing surface.
//Copyright (C) 2026 Quantrail Data Private Limited
// Contributors - Praveen kumar, Kathir Moorthy, Kathirdhasan

import { describe, it, expect, vi } from "vitest";
import React, { createRef } from "react";
import { render, act, cleanup } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import SqlEditor from "../../src/frontend/components/editor/SqlEditor.jsx";

function mount(props = {}) {
  const ref = createRef();
  const utils = render(
    <SqlEditor ref={ref} value="SELECT 1" onChange={() => {}} {...props} />,
  );
  return { ref, ...utils };
}

const text = () => document.querySelector(".cm-content")?.textContent ?? "";

describe("rendering", () => {
  it("mounts a CodeMirror editor", () => {
    mount();
    expect(document.querySelector(".cm-editor")).toBeTruthy();
  });

  it("shows the SQL it was given", () => {
    mount({ value: "SELECT version()" });
    expect(text()).toContain("SELECT version()");
  });

  it("draws a gutter for the full variant", () => {
    mount({ variant: "full" });
    expect(document.querySelector(".cm-lineNumbers")).toBeTruthy();
  });

  it("draws no gutter for an expression field", () => {
    mount({ variant: "expression" });
    expect(document.querySelector(".cm-lineNumbers")).toBeNull();
  });

  it("is not editable in viewer mode", () => {
    mount({ variant: "viewer" });
    expect(document.querySelector(".cm-content").getAttribute("contenteditable")).toBe(
      "false",
    );
  });

  it("is not editable when readOnly is set", () => {
    mount({ readOnly: true });
    expect(document.querySelector(".cm-content").getAttribute("contenteditable")).toBe(
      "false",
    );
  });

  it("renders its own flex container, so it does not rely on its host", () => {
    // Every surface drops this into a different kind of box. One of them being
    // display:flex with a non-stretch alignment is enough to collapse the
    // editor to its text width, which looks almost right and is not.
    const { container } = mount();
    const outer = container.firstChild;
    expect(outer.style.display).toBe("flex");
    expect(outer.style.width).toBe("100%");
  });
});

describe("the imperative handle", () => {
  it("inserts at the caret, wherever the caret happens to be", () => {
    const onChange = vi.fn();
    const { ref } = mount({ value: "SELECT  FROM t", onChange });
    const view = ref.current.getView();
    act(() => view.dispatch({ selection: { anchor: 7 } }));
    act(() => ref.current.insertAtCursor("db.events"));
    expect(view.state.doc.toString()).toBe("SELECT db.events FROM t");
  });

  it("inserts at the start on an editor that has never been focused", () => {
    // Parity with the old textarea, whose selectionStart was also 0 until the
    // user put a caret in it. Worth pinning so a future change here is a
    // deliberate one rather than a surprise.
    const { ref } = mount({ value: "SELECT " });
    act(() => ref.current.insertAtCursor("x"));
    expect(ref.current.getView().state.doc.toString()).toBe("xSELECT ");
  });

  it("inserts as ONE undoable transaction", () => {
    // The reason this component exists. The old editor wrote through setSql,
    // which replaced the document and discarded the browser's undo stack, so a
    // single Ctrl+Z after accepting a completion lost everything typed before.
    const { ref } = mount({ value: "SELECT " });
    const view = ref.current.getView();
    act(() => view.dispatch({ selection: { anchor: 7 } }));
    act(() => ref.current.insertAtCursor("events"));
    expect(view.state.doc.toString()).toBe("SELECT events");

    act(() => {
      undo(view);
    });
    // One undo, and the insertion is gone in full. Not one undo per character,
    // and not the whole document.
    expect(view.state.doc.toString()).toBe("SELECT ");
  });

  it("leaves the caret after the inserted text", () => {
    const { ref } = mount({ value: "SELECT " });
    const view = ref.current.getView();
    act(() => view.dispatch({ selection: { anchor: 7 } }));
    act(() => ref.current.insertAtCursor("abc"));
    expect(view.state.selection.main.head).toBe("SELECT abc".length);
  });

  it("exposes focus and the view", () => {
    const { ref } = mount();
    expect(typeof ref.current.focus).toBe("function");
    expect(ref.current.getView()).toBeInstanceOf(EditorView);
  });

  it("does nothing rather than throwing when the view is gone", () => {
    const { ref, unmount } = mount();
    const handle = ref.current;
    unmount();
    expect(() => handle.insertAtCursor("x")).not.toThrow();
    expect(() => handle.focus()).not.toThrow();
  });
});

describe("changes", () => {
  it("reports the new text, not an event", () => {
    // SqlInput and the Qurioz editor both handed over an event. Callers were
    // updated; this pins the contract.
    const onChange = vi.fn();
    const { ref } = mount({ value: "A", onChange });
    act(() =>
      ref.current.getView().dispatch({ changes: { from: 1, insert: "B" } }),
    );
    expect(typeof onChange.mock.calls.at(-1)[0]).toBe("string");
    expect(onChange.mock.calls.at(-1)[0]).toBe("AB");
  });

  it("does not fire on mount", () => {
    const onChange = vi.fn();
    mount({ onChange });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("stability", () => {
  it("keeps the same view when the completion list changes", () => {
    // The list arrives on connect and again on every node switch. Rebuilding
    // the editor for it would lose undo history and move the caret, which is
    // precisely the behaviour this phase set out to remove.
    const ref = createRef();
    const { rerender } = render(
      <SqlEditor ref={ref} value="SELECT 1" onChange={() => {}} completions={[]} />,
    );
    const first = ref.current.getView();
    rerender(
      <SqlEditor
        ref={ref}
        value="SELECT 1"
        onChange={() => {}}
        completions={[{ label: "events", type: "class" }]}
      />,
    );
    expect(ref.current.getView()).toBe(first);
  });

  it("keeps the same view when the dialect changes", () => {
    const ref = createRef();
    const { rerender } = render(
      <SqlEditor ref={ref} value="SELECT 1" onChange={() => {}} dialectData={null} />,
    );
    const first = ref.current.getView();
    rerender(
      <SqlEditor
        ref={ref}
        value="SELECT 1"
        onChange={() => {}}
        dialectData={{ keywords: ["select"], functions: ["count"] }}
      />,
    );
    expect(ref.current.getView()).toBe(first);
  });

  it("keeps the document and the caret across a dialect swap", () => {
    const ref = createRef();
    const { rerender } = render(
      <SqlEditor ref={ref} value="SELECT abc" onChange={() => {}} dialectData={null} />,
    );
    const view = ref.current.getView();
    act(() => view.dispatch({ selection: { anchor: 6 } }));
    rerender(
      <SqlEditor
        ref={ref}
        value="SELECT abc"
        onChange={() => {}}
        dialectData={{ keywords: ["select"] }}
      />,
    );
    expect(view.state.doc.toString()).toBe("SELECT abc");
    expect(view.state.selection.main.head).toBe(6);
  });

  it("keeps the same view when the callbacks are redefined each render", () => {
    // A parent that inlines onRun would otherwise cost the undo history on
    // every single render.
    const ref = createRef();
    const { rerender } = render(
      <SqlEditor ref={ref} value="SELECT 1" onChange={() => {}} onRun={() => {}} />,
    );
    const first = ref.current.getView();
    rerender(
      <SqlEditor ref={ref} value="SELECT 1" onChange={() => {}} onRun={() => {}} />,
    );
    expect(ref.current.getView()).toBe(first);
  });
});

describe("theme", () => {
  it("follows the application theme without being told", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { ref } = mount();
    expect(ref.current.getView().state.facet(EditorView.darkTheme)).toBe(true);
    cleanup();

    document.documentElement.setAttribute("data-theme", "light");
    const { ref: ref2 } = mount();
    expect(ref2.current.getView().state.facet(EditorView.darkTheme)).toBe(false);
    document.documentElement.setAttribute("data-theme", "dark");
  });
});
