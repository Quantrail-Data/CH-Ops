// Copyright (C) 2026 Quantrail™ Data Private Limited
// SqlEditor.jsx - the single SQL editing surface, used everywhere.
// Contributors - Praveen kumar, Kathir Moorthy, Kathirdhasan


import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import CodeMirror from "@uiw/react-codemirror";
import {
  basicSetupFor,
  buildDialect,
  extraExtensions,
  makeEditorTheme,
  makeLanguageCompartment,
  makeThemeCompartment,
  useIsDarkTheme,
} from "./sqlEditorSetup.js";

/**
 * @param {string}   value          the SQL
 * @param {function} onChange       receives the new string, not an event
 * @param {string}   variant        'full' | 'compact' | 'expression' | 'viewer'
 * @param {function} onRun          Ctrl+Enter
 * @param {function} onBookmarks    Ctrl+B
 * @param {function} onEscape       Escape, after CodeMirror has had its chance
 * @param {Array}    completions    tagged options from buildCompletionOptions()
 * @param {object}   dialectData    { keywords, functions } from the server
 * @param {boolean}  readOnly
 * @param {string}   height         any CSS length; '100%' fills its container
 * @param {string}   placeholder
 *
 * Exposes an imperative handle with insertAtCursor(text) and focus(), used by
 * the schema explorer and, later, by drag and drop.
 */
const SqlEditor = forwardRef(function SqlEditor(
  {
    value = "",
    onChange,
    variant = "full",
    onRun,
    onBookmarks,
    onEscape,
    completions = [],
    dialectData = null,
    readOnly = false,
    height = "100%",
    placeholder = "",
    autoFocus = false,
  },
  ref,
) {
  const viewRef = useRef(null);

  // Completions change on every connection. 
  const optionsRef = useRef(completions);
  useEffect(() => {
    optionsRef.current = completions;
  }, [completions]);

  // Callbacks are held in refs for the same reason
  const runRef = useRef(onRun);
  const bookmarksRef = useRef(onBookmarks);
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    runRef.current = onRun;
    bookmarksRef.current = onBookmarks;
    escapeRef.current = onEscape;
  }, [onRun, onBookmarks, onEscape]);

  const languageCompartment = useMemo(() => makeLanguageCompartment(), []);
  const themeCompartment = useMemo(() => makeThemeCompartment(), []);
  const dark = useIsDarkTheme();

  const extensions = useMemo(
    () =>
      extraExtensions({
        variant,
        optionsRef,
        languageCompartment,
        themeCompartment,
        // Only the INITIAL value. Later changes go through the compartment
        // below, so switching theme does not rebuild the view.
        dark,
        language: buildDialect(dialectData),
        onRun: onRun ? () => runRef.current?.() : undefined,
        onBookmarks: onBookmarks ? () => bookmarksRef.current?.() : undefined,
        onEscape: onEscape ? () => escapeRef.current?.() : undefined,
      }),
    // Deliberately excludes completions, dialectData and the callbacks. 
    [variant, languageCompartment, themeCompartment],
  );

  const basicSetup = useMemo(() => basicSetupFor(variant), [variant]);

  // Swap the dialect when the connection changes, without rebuilding the view.

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartment.reconfigure(buildDialect(dialectData)),
    });
  }, [dialectData, languageCompartment]);

  // Swap the theme the same way.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(makeEditorTheme(dark)),
    });
  }, [dark, themeCompartment]);

  useImperativeHandle(
    ref,
    () => ({
      /** Insert at the caret as ONE undoable transaction. */
      insertAtCursor(text) {
        const view = viewRef.current;
        if (!view) return;
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: text },
          selection: { anchor: pos + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
      getView() {
        return viewRef.current;
      },
    }),
    [],
  );

  const handleCreate = useCallback((view) => {
    viewRef.current = view;
  }, []);

  const handleChange = useCallback(
    (next) => {
      onChange?.(next);
    },
    [onChange],
  );

  // Own flex container, so the editor does not depend on whatever it is dropped into being laid out sensibly. 
  
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        minWidth: 0,
        minHeight: 0,
        position: "relative",
      }}
    >
    <CodeMirror
      value={value}
      onChange={handleChange}
      onCreateEditor={handleCreate}
      extensions={extensions}
      basicSetup={basicSetup}
      // 'none' rather than 'light'/'dark': the look comes entirely from
      // chopsEditorTheme, which reads CSS variables and therefore follows the
      // application theme with no branching here.
      theme="none"
      editable={!readOnly && variant !== "viewer"}
      readOnly={readOnly || variant === "viewer"}
      placeholder={placeholder}
      height={height}
      // The wrapper's own Tab handling, which replaces the old manual
      // two-space insert. Off for viewer so Tab still moves focus.
      indentWithTab={variant !== "viewer"}
      autoFocus={autoFocus}
      // The wrapper renders one div around the editor. It needs the same
      // treatment for the same reason: in a flex container it would otherwise
      // shrink to its content.
      style={{ height: "100%", width: "100%", flex: "1 1 auto", minWidth: 0 }}
    />
    </div>
  );
});

export default SqlEditor;
