// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect } from "vitest";
import React, { createRef, useState } from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { undo, isolateHistory } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import SqlEditor from "../../src/frontend/components/editor/SqlEditor.jsx";

// A minimal host that switches keys, the way QueryEditor will.
function Host({ initial = { a: "SELECT a", b: "SELECT b" } }) {
  const [key, setKey] = useState("a");
  const [docs, setDocs] = useState(initial);
  const ref = createRef();
  Host.ref = ref;
  Host.setKey = setKey;
  Host.docs = () => docs;
  return (
    <>
      <button onClick={() => setKey("a")}>a</button>
      <button onClick={() => setKey("b")}>b</button>
      <SqlEditor
        ref={ref}
        docKey={key}
        docKeys={Object.keys(docs)}
        value={docs[key]}
        onChange={(v) => setDocs((d) => ({ ...d, [key]: v }))}
      />
    </>
  );
}

const view = () => Host.ref.current.getView();
const doc = () => view().state.doc.toString();

describe("tab mode", () => {
  it("shows the first document", () => {
    render(<Host />);
    expect(doc()).toBe("SELECT a");
  });

  it("swaps documents when the key changes", () => {
    const { getByText } = render(<Host />);
    fireEvent.click(getByText("b"));
    expect(doc()).toBe("SELECT b");
    fireEvent.click(getByText("a"));
    expect(doc()).toBe("SELECT a");
  });

  it("keeps edits made in a tab you left", () => {
    const { getByText } = render(<Host />);
    act(() => view().dispatch({ changes: { from: 8, insert: " EXTRA" } }));
    expect(doc()).toBe("SELECT a EXTRA");
    fireEvent.click(getByText("b"));
    fireEvent.click(getByText("a"));
    expect(doc()).toBe("SELECT a EXTRA");
  });

  it("CARRIES UNDO HISTORY across a switch", () => {
    // The property that justifies the whole feature.
    const { getByText } = render(<Host />);
    act(() =>
      view().dispatch({
        changes: { from: 8, insert: " ONE" },
        annotations: isolateHistory.of("full"),
      }),
    );
    act(() =>
      view().dispatch({
        changes: { from: 12, insert: " TWO" },
        annotations: isolateHistory.of("full"),
      }),
    );
    expect(doc()).toBe("SELECT a ONE TWO");

    fireEvent.click(getByText("b"));
    fireEvent.click(getByText("a"));

    act(() => { undo(view()); });
    expect(doc()).toBe("SELECT a ONE");
    act(() => { undo(view()); });
    expect(doc()).toBe("SELECT a");
  });

  it("undoes back to the original after a switch, in one step or several", () => {
    // The weaker claim, stated separately: whatever the grouping, the history
    // is still there after the switch and can walk back to where it started.
    const { getByText } = render(<Host />);
    act(() => view().dispatch({ changes: { from: 8, insert: " EDIT" } }));
    fireEvent.click(getByText("b"));
    fireEvent.click(getByText("a"));
    act(() => { undo(view()); });
    expect(doc()).toBe("SELECT a");
  });

  it("does not leak one tab's undo into another", () => {
    const { getByText } = render(<Host />);
    act(() => view().dispatch({ changes: { from: 8, insert: " ONE" } }));
    fireEvent.click(getByText("b"));
    // b has its own, empty, history: undo must not touch b's text
    act(() => { undo(view()); });
    expect(doc()).toBe("SELECT b");
  });

  it("keeps the extensions after a swap", () => {
    // A state created without the full array loses theme, keymap, completions.
    const { getByText } = render(<Host />);
    expect(view().state.facet(EditorView.darkTheme)).toBe(true);
    fireEvent.click(getByText("b"));
    expect(view().state.facet(EditorView.darkTheme)).toBe(true);
  });

  it("keeps the caret per tab", () => {
    const { getByText } = render(<Host />);
    act(() => view().dispatch({ selection: { anchor: 3 } }));
    fireEvent.click(getByText("b"));
    fireEvent.click(getByText("a"));
    expect(view().state.selection.main.head).toBe(3);
  });

  it("drops states for keys that no longer exist", () => {
    // Not directly observable; assert the editor survives a shrinking key list.
    const ref = createRef();
    const { rerender } = render(
      <SqlEditor ref={ref} docKey="a" docKeys={["a", "b"]} value="X" onChange={() => { }} />,
    );
    rerender(<SqlEditor ref={ref} docKey="a" docKeys={["a"]} value="X" onChange={() => { }} />);
    expect(ref.current.getView().state.doc.toString()).toBe("X");
  });
});

describe("non-tab mode is unchanged", () => {
  it("stays controlled when docKey is absent", () => {
    const ref = createRef();
    const { rerender } = render(<SqlEditor ref={ref} value="AAA" onChange={() => { }} />);
    rerender(<SqlEditor ref={ref} value="BBB" onChange={() => { }} />);
    expect(ref.current.getView().state.doc.toString()).toBe("BBB");
  });
});

describe("change reporting survives a state swap", () => {
  it("reports edits made in a tab OTHER than the first", () => {
    // REGRESSION.
    const { getByText } = render(<Host />);
    fireEvent.click(getByText("b"));
    act(() => view().dispatch({ changes: { from: 0, to: 8, insert: "SELECT NEW" } }));
    expect(Host.docs().b).toBe("SELECT NEW");
  });

  it("still reports edits in the first tab", () => {
    const { getByText } = render(<Host />);
    act(() => view().dispatch({ changes: { from: 8, insert: "!" } }));
    expect(Host.docs().a).toBe("SELECT a!");
    fireEvent.click(getByText("b"));
    fireEvent.click(getByText("a"));
    act(() => view().dispatch({ changes: { from: 9, insert: "?" } }));
    expect(Host.docs().a).toBe("SELECT a!?");
  });
});
