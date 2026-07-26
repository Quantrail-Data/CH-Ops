// Copyright (C) 2026 Quantrail™ Data Private Limited
// sqlEditorSetup.js - the CodeMirror configuration every SQL surface shares.
// Contributors - Praveen kumar, Kathir Moorthy, Kathirdhasan


import { useEffect, useState } from "react";
import { Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { sql, SQLDialect } from "@codemirror/lang-sql";
import { autocompletion } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// The completion list cap.
 
export const COMPLETION_CAP = 12;

/** Fresh compartments per editor instance. Created by the component. */
export function makeLanguageCompartment() {
  return new Compartment();
}

export function makeThemeCompartment() {
  return new Compartment();
}

// Track the application theme.

export function useIsDarkTheme() {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") !== "light",
  );
  useEffect(() => {
    const read = () =>
      setDark(document.documentElement.getAttribute("data-theme") !== "light");
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    read();
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Build a SQL dialect from the connected server's own keyword and function lists, so highlighting matches the version actually in use.

export function buildDialect(dialectData) {
  if (!dialectData?.keywords?.length) return sql();
  try {
    const dialect = SQLDialect.define({
      keywords: dialectData.keywords.join(" ").toLowerCase(),
      builtin: (dialectData.functions || []).join(" "),
    });
    return sql({ dialect, upperCaseKeywords: true });
  } catch {
    // A malformed keyword list should degrade to plain SQL, never break the page.
    return sql();
  }
}

// The completion source.

export function makeCompletionSource(optionsRef) {
  return function chopsCompletions(context) {
    // The same token shape the old editor used, including db.table.
    const word = context.matchBefore(/[\w.]+/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    const options = optionsRef.current || [];
    if (!options.length) return null;

    return {
      from: word.from,
      options,
      validFor: /^[\w.]*$/,
    };
  };
}

// Syntax colours.

const chopsHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--sql-keyword)", fontWeight: "600" },
  {
    tag: [t.function(t.variableName), t.standard(t.variableName), t.typeName],
    color: "var(--sql-function)",
  },
  { tag: [t.string, t.special(t.string)], color: "var(--sql-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--sql-number)" },
  {
    tag: [t.lineComment, t.blockComment],
    color: "var(--sql-comment)",
    fontStyle: "italic",
  },
  { tag: t.operator, color: "var(--text-secondary, var(--text-primary))" },
  { tag: t.punctuation, color: "var(--text-muted)" },
  { tag: t.invalid, color: "var(--color-danger)" },
]);

// The visual theme.

export function makeEditorTheme(dark) {
  return EditorView.theme({
  "&": {
    fontSize: "0.8125rem",
    color: "var(--text-primary)",
    backgroundColor: "transparent",
    height: "100%",
    // The editor sizes ITSELF to its container rather than relying on a rule in global.css. 
    width: "100%",
    flex: "1 1 auto",
    minWidth: 0,
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-code)",
    lineHeight: "1.55",
    overflow: "auto",
    // Width is forced at EVERY level rather than left to flex to chain down.

    width: "100%",
    // The I-beam belongs to the whole editing area, not just the run of text.

    cursor: "text",
  },
  ".cm-content": {
    padding: "6px 0",
    caretColor: "var(--text-primary)",
    // Fill the scroller, so clicking in the empty space below the last line
    // puts the caret at the end instead of doing nothing.

    boxSizing: "border-box",
    minHeight: "100%",
    // flex-grow alone is not enough here; see the note on .cm-scroller above.
    width: "100%",
    flexGrow: 1,
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-sunken)",
    color: "var(--text-muted)",
    border: "none",
    borderRight: "1px solid var(--border-default)",
    fontSize: "0.75rem",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--bg-elevated, var(--bg-sunken))",
    color: "var(--text-secondary, var(--text-primary))",
  },
  ".cm-activeLine": { backgroundColor: "rgba(148,163,184,0.07)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text-primary)" },
  // These selectors mirror the ones in CodeMirror's own base theme.
  ".cm-selectionBackground": { backgroundColor: "rgba(139,92,246,0.30)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "rgba(139,92,246,0.38)",
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(139,92,246,0.38)",
  },
  ".cm-selectionMatch": { backgroundColor: "rgba(148,163,184,0.20)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "rgba(139,92,246,0.28)",
    outline: "1px solid var(--accent)",
  },
  ".cm-nonmatchingBracket": { outline: "1px solid var(--color-danger)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--bg-sunken)",
    border: "1px solid var(--border-default)",
    color: "var(--text-muted)",
    padding: "0 6px",
    borderRadius: "3px",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--bg-page)",
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    color: "var(--text-primary)",
    fontSize: "0.75rem",
  },
  ".cm-tooltip-autocomplete ul li": {
    fontFamily: "var(--font-code)",
    padding: "3px 8px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "#fff",
  },
  ".cm-completionIcon": { paddingRight: "12px", opacity: 0.7 },
  ".cm-completionDetail": { color: "var(--text-muted)", fontStyle: "normal", marginLeft: "8px" },
  // The search panel ships unstyled and looks foreign otherwise.
  ".cm-panels": {
    backgroundColor: "var(--bg-sunken)",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border-default)",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": {
    fontFamily: "var(--font-body, inherit)",
    fontSize: "0.75rem",
    backgroundColor: "var(--input-bg, var(--bg-page))",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "3px",
    padding: "2px 6px",
  },
  ".cm-panel.cm-search label": { fontSize: "0.6875rem", color: "var(--text-muted)" },
  ".cm-searchMatch": { backgroundColor: "rgba(251,191,36,0.30)" },
  ".cm-searchMatch-selected": { backgroundColor: "rgba(251,191,36,0.55)" },
  },
  // CodeMirror applies its LIGHT base theme without this flag
  { dark });
}

// Which built-in features each surface gets.


export function basicSetupFor(variant) {
  const gutter = variant !== "expression";
  const editable = variant !== "viewer";

  return {
    lineNumbers: gutter,
    highlightActiveLineGutter: gutter && editable,
    foldGutter: gutter,
    highlightActiveLine: editable && variant !== "expression",
    bracketMatching: true,
    closeBrackets: editable,
    autocompletion: false, // supplied below, so the override is ours
    searchKeymap: false, // supplied below, only for the variants that want it
    history: editable,
    drawSelection: true,
    indentOnInput: editable,
    syntaxHighlighting: false, // ours, via chopsHighlight
    highlightSelectionMatches: variant === "full",
    rectangularSelection: editable,
    crosshairCursor: false,
    allowMultipleSelections: editable,
    dropCursor: editable,
    lintKeymap: false,
  };
}

// The extensions the wrapper's basicSetup does not cover.

export function extraExtensions({
  variant = "full",
  onRun,
  onBookmarks,
  onEscape,
  optionsRef,
  languageCompartment,
  language,
  themeCompartment,
  dark = true,
}) {
  const ext = [
    languageCompartment.of(language),
    // In a compartment for the same reason the dialect is: switching the app
    // theme must not rebuild the view and lose undo history.
    themeCompartment.of(makeEditorTheme(dark)),
    syntaxHighlighting(chopsHighlight),
    EditorView.lineWrapping,
  ];

  // basicSetupFor turns searchKeymap off so the binding is ours to place. 
  if (variant === "full") {
    ext.push(search({ top: true }));
    ext.push(keymap.of(searchKeymap));
  }

  if (variant !== "viewer") {
    ext.push(
      autocompletion({
        override: [makeCompletionSource(optionsRef)],
        maxRenderedOptions: COMPLETION_CAP,
        activateOnTyping: true,
        closeOnBlur: true,
        icons: true,
      }),
    );
  }

  if (variant === "viewer") {
    ext.push(EditorView.editable.of(false));
  }

  // Prec.highest so the editor does not swallow these. 
  const keys = [];
  if (onRun) {
    keys.push({
      key: "Mod-Enter",
      preventDefault: true,
      run: () => {
        onRun();
        return true;
      },
    });
  }
  if (onBookmarks) {
    keys.push({
      key: "Mod-b",
      preventDefault: true,
      run: () => {
        onBookmarks();
        return true;
      },
    });
  }
  if (onEscape) {
    // Returning false lets CodeMirror keep Escape for closing its own panels and completion list
    keys.push({
      key: "Escape",
      run: () => {
        onEscape();
        return false;
      },
    });
  }
  if (keys.length) ext.push(Prec.highest(keymap.of(keys)));

  return ext;
}

// Turn the three system-table queries into tagged completion options.

export function buildCompletionOptions({ keywords = [], functions = [], tables = [] }) {
  const options = [];
  const seen = new Set();
  const add = (o) => {
    if (!o.label || seen.has(o.label)) return;
    seen.add(o.label);
    options.push(o);
  };

  for (const k of keywords) add({ label: String(k).toUpperCase(), type: "keyword" });
  for (const f of functions) {
    add({ label: f, type: "function", apply: `${f}()`, detail: "function" });
  }

  const dbs = new Set();
  for (const row of tables) {
    if (row.database) dbs.add(row.database);
    if (row.name) add({ label: row.name, type: "class", detail: "table" });
    if (row.database && row.name) {
      add({ label: `${row.database}.${row.name}`, type: "class", detail: "table" });
    }
  }
  for (const d of dbs) add({ label: d, type: "namespace", detail: "database" });

  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}
