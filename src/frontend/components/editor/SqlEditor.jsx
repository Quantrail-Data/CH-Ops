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
import { basicSetup } from "@uiw/codemirror-extensions-basic-setup";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  basicSetupFor,
  buildDialect,
  extraExtensions,
  makeEditorTheme,
  makeLanguageCompartment,
  makeThemeCompartment,
  useIsDarkTheme,
} from "./sqlEditorSetup.js";

/* @param {string} value the SQL @param {function} onChange receives the new
   string, */
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
    // Tab mode.
    docKey = null,
    docKeys = null,
  },
  ref,
) {


  const viewRef = useRef(null);

  // One EditorState per document key.
  const statesRef = useRef(new Map());
  const keyRef = useRef(docKey);

  // The document used to seed a key that has not been seen before.
  const seedRef = useRef(value);
  seedRef.current = value;

  // In tab mode the wrapper must never see the value change.
  const frozenValue = useRef(value);
  const cmValue = docKey ? frozenValue.current : value;

  // The last text handed upward, so an echo from a controlled parent is not
  // reported a second time.
  const lastEmitted = useRef(value);

  // In a ref so the update listener above can stay part of a stable extension
  // array.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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

  // ONE extension array, owned here rather than split between this file and the
  // wrapper's basicSetup.
  const allExtensions = useMemo(
    () => [
      ...basicSetup(basicSetupFor(variant)),
      ...extensions,
      // Saves the live state under the current key, and reports changes.
      EditorView.updateListener.of((u) => {
        if (keyRef.current && (u.docChanged || u.selectionSet)) {
          statesRef.current.set(keyRef.current, u.state);
        }
        if (!u.docChanged) return;
        const text = u.state.doc.toString();
        // Guarded so a controlled parent echoing the value straight back does
        // Skip the echo when a controlled parent hands the same text back.
        if (text === lastEmitted.current) return;
        lastEmitted.current = text;
        onChangeRef.current?.(text);
      }),
    ],
    [variant, extensions],
  );

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
    if (keyRef.current) statesRef.current.set(keyRef.current, view.state);
  }, []);

  // Swap documents when the key changes. The outgoing state is already in the
  // map, put there by the update listener above.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !docKey || keyRef.current === docKey) return;
    keyRef.current = docKey;
    const saved = statesRef.current.get(docKey);
    view.setState(
      saved ||
        EditorState.create({ doc: seedRef.current ?? "", extensions: allExtensions }),
    );
    statesRef.current.set(docKey, view.state);
  }, [docKey, allExtensions]);

  useEffect(() => {
    if (!docKey) return;

    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();

    // Already in sync
    if (current === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [value, docKey]);

  // Drop states for keys that no longer exist, or a long session of opening and
  // closing tabs holds every document it ever showed.
  useEffect(() => {
    if (!docKeys) return;
    const live = new Set(docKeys);
    for (const k of statesRef.current.keys()) {
      if (!live.has(k)) statesRef.current.delete(k);
    }
  }, [docKeys]);


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
      value={cmValue}
      // No onChange here. The update listener in allExtensions does it, so the
      // behaviour is identical before and after a setState.
      onCreateEditor={handleCreate}
      extensions={allExtensions}
      // The wrapper builds nothing: allExtensions above is the complete list.
      basicSetup={false}
      // 'none' rather than 'light'/'dark':
      theme="none"
      editable={!readOnly && variant !== "viewer"}
      readOnly={readOnly || variant === "viewer"}
      placeholder={placeholder}
      height={height}
      // The wrapper's own Tab handling, which replaces the old manual
      // two-space insert. Off for viewer so Tab still moves focus.
      indentWithTab={variant !== "viewer"}
      autoFocus={autoFocus}
      // The wrapper renders one div around the editor.
      style={{ height: "100%", width: "100%", flex: "1 1 auto", minWidth: 0 }}
    />
    </div>
  );
});

export default SqlEditor;
