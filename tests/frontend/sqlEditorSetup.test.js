// sqlEditorSetup.test.js - the CodeMirror configuration every SQL surface shares.
// Copyright (C) 2026 Quantrail Data Private Limited
// Contributors - Praveen kumar, Kathir Moorthy, Kathirdhasan
 
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  buildCompletionOptions,
  buildDialect,
  basicSetupFor,
  makeEditorTheme,
  makeLanguageCompartment,
  makeThemeCompartment,
  makeCompletionSource,
  extraExtensions,
  COMPLETION_CAP,
} from "../../src/frontend/components/editor/sqlEditorSetup.js";

describe("buildCompletionOptions", () => {
  const built = () =>
    buildCompletionOptions({
      keywords: ["select", "from"],
      functions: ["count", "groupArray"],
      tables: [
        { database: "db", name: "events" },
        { database: "db", name: "users" },
      ],
    });

  it("tags every candidate by kind", () => {
    // The old loader flattened everything to strings, so by the time a candidate
    // reached the popup its kind was gone. Keeping it buys a distinct icon per
    // kind and a detail line, at no cost.
    const by = Object.fromEntries(built().map((o) => [o.label, o]));
    expect(by.SELECT.type).toBe("keyword");
    expect(by.count.type).toBe("function");
    expect(by.events.type).toBe("class");
    expect(by["db.events"].type).toBe("class");
    expect(by.db.type).toBe("namespace");
  });

  it("upper-cases keywords and leaves function names alone", () => {
    const labels = built().map((o) => o.label);
    expect(labels).toContain("SELECT");
    expect(labels).toContain("groupArray");
    expect(labels).not.toContain("select");
  });

  it("inserts a function with its parentheses", () => {
    const count = built().find((o) => o.label === "count");
    expect(count.apply).toBe("count()");
  });

  it("offers both the bare table and the qualified name", () => {
    const labels = built().map((o) => o.label);
    expect(labels).toContain("events");
    expect(labels).toContain("db.events");
  });

  it("lists each database once, however many tables it has", () => {
    expect(built().filter((o) => o.label === "db")).toHaveLength(1);
  });

  it("de-duplicates an identical label", () => {
    const out = buildCompletionOptions({
      keywords: [],
      functions: ["count", "count"],
      tables: [],
    });
    expect(out.filter((o) => o.label === "count")).toHaveLength(1);
  });

  it("keeps COUNT the keyword and count the function as separate candidates", () => {
    // Deliberate, not an oversight. They are different things: one completes to
    // the word, the other to count() with the caret inside the parentheses.
    const out = buildCompletionOptions({
      keywords: ["count"],
      functions: ["count"],
      tables: [],
    });
    const labels = out.map((o) => o.label);
    expect(labels).toContain("COUNT");
    expect(labels).toContain("count");
  });

  it("survives empty input, which is what a failed query returns", () => {
    expect(buildCompletionOptions({})).toEqual([]);
    expect(buildCompletionOptions({ keywords: [], functions: [], tables: [] })).toEqual([]);
  });

  it("sorts, so the popup order does not depend on query order", () => {
    const labels = built().map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("buildDialect", () => {
  it("falls back to the built-in dialect when the server gave nothing", () => {
    // loadAutocomplete swallows a failed query with .catch(() => ({rows: []})),
    // so an empty list is a real possibility on an older or restricted server.
    // Defining a dialect with no keywords would silently turn highlighting off.
    expect(buildDialect(null)).toBeTruthy();
    expect(buildDialect({})).toBeTruthy();
    expect(buildDialect({ keywords: [] })).toBeTruthy();
  });

  it("builds a dialect from the server's own lists", () => {
    const ext = buildDialect({ keywords: ["select"], functions: ["count"] });
    expect(ext).toBeTruthy();
    // It must be usable as an extension, not merely truthy.
    const state = EditorState.create({ doc: "select 1", extensions: [ext] });
    expect(state.doc.toString()).toBe("select 1");
  });

  it("does not throw on a malformed list", () => {
    expect(() => buildDialect({ keywords: [null, undefined, 1] })).not.toThrow();
  });
});

describe("basicSetupFor", () => {
  it("gives the full editor a gutter, folding and history", () => {
    const f = basicSetupFor("full");
    expect(f.lineNumbers).toBe(true);
    expect(f.foldGutter).toBe(true);
    expect(f.history).toBe(true);
  });

  it("drops the gutter for an expression field", () => {
    // An alert threshold is one line. A line-number gutter on it is noise.
    const e = basicSetupFor("expression");
    expect(e.lineNumbers).toBe(false);
    expect(e.foldGutter).toBe(false);
  });

  it("makes the viewer read-only in substance, not just appearance", () => {
    const v = basicSetupFor("viewer");
    expect(v.history).toBe(false);
    expect(v.closeBrackets).toBe(false);
    expect(v.indentOnInput).toBe(false);
  });

  it("never uses the built-in autocompletion or search keymap", () => {
    // Both are supplied by extraExtensions so the completion source and the
    // Ctrl+F binding are ours. Turning one off here without supplying it there
    // is how Ctrl+F fell through to the browser's own find bar.
    for (const v of ["full", "compact", "expression", "viewer"]) {
      expect(basicSetupFor(v).autocompletion).toBe(false);
      expect(basicSetupFor(v).searchKeymap).toBe(false);
    }
  });
});

describe("makeEditorTheme", () => {
  const cssOf = (dark) => {
    // The theme is an extension; put it in a state and read the generated rules
    // off the document, which is what the browser will actually apply.
    const view = new EditorView({
      state: EditorState.create({ doc: "", extensions: [makeEditorTheme(dark)] }),
    });
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    view.destroy();
    return css;
  };

  it("declares the dark flag, which selects CodeMirror's base defaults", () => {
    // Without it CodeMirror applies its LIGHT base theme, whose selection is
    // #d9d9d9 and whose focused selection is #d7d4f0. Under the dark theme that
    // is a pale block behind pale text and is unreadable. This was shipped.
    const state = EditorState.create({ extensions: [makeEditorTheme(true)] });
    expect(state.facet(EditorView.darkTheme)).toBe(true);
    const light = EditorState.create({ extensions: [makeEditorTheme(false)] });
    expect(light.facet(EditorView.darkTheme)).toBe(false);
  });

  it("puts the I-beam on the scroller, not only on the text", () => {
    // Otherwise the pointer reverts to an arrow the moment it leaves the
    // characters, which reads as "this part is not editable".
    const rules = cssOf(true).split("}");
    const scroller = rules.filter((r) => /\.cm-scroller\s*\{/.test(r));
    expect(scroller.some((r) => /cursor:\s*text/.test(r))).toBe(true);
  });

  it("makes the content border-box, so min-height does not overflow", () => {
    // min-height:100% with the default content-box means the content box is the
    // full viewport and the padding is added on top, so the scroller overflows
    // by the padding and shows a scrollbar on a one-line document, permanently.
    const rules = cssOf(true).split("}");
    const content = rules.filter((r) => /\.cm-content\s*\{/.test(r));
    expect(content.some((r) => /box-sizing:\s*border-box/.test(r))).toBe(true);
    expect(content.some((r) => /min-height:\s*100%/.test(r))).toBe(true);
  });

  it("forces width at every level rather than trusting flex to chain it", () => {
    // One container above with a non-stretch alignment collapses the editor to
    // its text width. The symptom is subtle: the editor looks right but its
    // clickable area, active-line highlight and scrollbar all stop at the text.
    const css = cssOf(true);
    expect(css).toMatch(/width:\s*100%/);
    expect(css).toMatch(/flex:\s*1 1 auto/);
  });

  it("uses CSS variables for syntax colour, so both themes come from the sheet", () => {
    // CodeMirror renders to DOM, so var() resolves. Charts are the opposite
    // case: canvas cannot resolve a variable at all.
    const css = cssOf(true);
    expect(css).toMatch(/var\(--sql-keyword\)|var\(--text-primary\)/);
  });
});

describe("makeCompletionSource", () => {
  const source = (options, text, pos) => {
    const ref = { current: options };
    const fn = makeCompletionSource(ref);
    const state = EditorState.create({ doc: text });
    return fn({
      state,
      pos,
      explicit: false,
      matchBefore(re) {
        const line = state.doc.lineAt(pos);
        const before = line.text.slice(0, pos - line.from);
        const m = before.match(new RegExp(re.source + "$"));
        return m ? { from: pos - m[0].length, to: pos, text: m[0] } : null;
      },
    });
  };

  const OPTS = [{ label: "events", type: "class" }];

  it("returns candidates for a word", () => {
    const r = source(OPTS, "SELECT ev", 9);
    expect(r).not.toBeNull();
    expect(r.options).toBe(OPTS);
  });

  it("matches a qualified name across the dot", () => {
    const r = source(OPTS, "SELECT db.ev", 12);
    expect(r).not.toBeNull();
    expect(r.from).toBe(7);
  });

  it("returns nothing when there are no candidates yet", () => {
    // Before the first connection acWords is empty; offering an empty popup is
    // worse than offering none.
    expect(source([], "SELECT ev", 9)).toBeNull();
  });

  it("declares validFor, so it is not re-run on every keystroke", () => {
    // This is what keeps completion off the network and off the main thread.
    const r = source(OPTS, "SELECT ev", 9);
    expect(r.validFor).toBeInstanceOf(RegExp);
    expect(r.validFor.test("event")).toBe(true);
    expect(r.validFor.test("db.events")).toBe(true);
  });
});

describe("extraExtensions", () => {
  const build = (variant, extra = {}) =>
    extraExtensions({
      variant,
      optionsRef: { current: [] },
      languageCompartment: makeLanguageCompartment(),
      themeCompartment: makeThemeCompartment(),
      language: buildDialect(null),
      dark: true,
      ...extra,
    });

  const keysOf = (exts) => {
    const state = EditorState.create({ doc: "", extensions: exts });
    return state
      .facet(keymap)
      .flat()
      .map((b) => b.key)
      .filter(Boolean);
  };

  it("binds Ctrl+F on the full editor", () => {
    // basicSetupFor turns searchKeymap off so the binding is ours to place.
    // Forgetting to place it here is how Ctrl+F opened the browser's find bar.
    expect(keysOf(build("full"))).toContain("Mod-f");
  });

  it("does not bind Ctrl+F on a one-line expression field", () => {
    expect(keysOf(build("expression"))).not.toContain("Mod-f");
  });

  it("binds Ctrl+Enter only when a run handler is given", () => {
    expect(keysOf(build("full", { onRun: () => {} }))).toContain("Mod-Enter");
    expect(keysOf(build("full"))).not.toContain("Mod-Enter");
  });

  it("binds Ctrl+B only when a bookmarks handler is given", () => {
    expect(keysOf(build("full", { onBookmarks: () => {} }))).toContain("Mod-b");
    expect(keysOf(build("full"))).not.toContain("Mod-b");
  });

  it("caps the completion list at the shared constant", () => {
    expect(COMPLETION_CAP).toBeGreaterThan(0);
  });

  it("produces a usable extension set for every variant", () => {
    for (const v of ["full", "compact", "expression", "viewer"]) {
      const state = EditorState.create({ doc: "SELECT 1", extensions: build(v) });
      expect(state.doc.toString()).toBe("SELECT 1");
    }
  });
});
