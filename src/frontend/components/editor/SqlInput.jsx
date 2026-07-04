// SqlInput - Reusable SQL editing surface (line numbers, highlight, autocomplete)
//
// Controlled component that renders the line-number gutter, the syntax-highlight
// overlay, the textarea, an optional hint line, and the keyword/table
// autocomplete dropdown. The parent owns the text via `value` and is notified
// through `onChange`. Extracted from QueryEditor.jsx so it can be reused by the
// side-by-side Query Comparison tool without duplicating the editor internals.
// It reuses the same CSS classes and the shared highlightSQL helper, so the
// editing experience matches the main editor exactly.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useRef, useState, useEffect, useMemo, memo } from "react";
import { highlightSQL } from "../../utils/sqlHighlight.js";

function SqlInput({
  value,
  onChange,
  acWords = [], // autocomplete suggestions (keywords, functions, tables)
  onRun, // optional: called on Ctrl/Cmd+Enter
  hint = "", // optional: hint line shown under the textarea
  placeholder = "",
  minHeight = 160,
  readOnly = false,
}) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const selectedRef = useRef(null);

  const [acVisible, setAcVisible] = useState(false);
  const [acFiltered, setAcFiltered] = useState([]);
  const [acIndex, setAcIndex] = useState(0);
  const [acPos, setAcPos] = useState({ top: 0, left: 0 });

  // Precompute the uppercase form of each autocomplete word once, so filtering
  // on every keystroke is a cheap startsWith instead of an uppercase per word.
  const acUpper = useMemo(
    () => acWords.map((w) => [w, w.toUpperCase()]),
    [acWords],
  );

  // Keep the highlight layer scrolled in lockstep with the textarea.
  function syncScroll() {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  // Keep the active autocomplete row in view.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [acIndex]);

  function handleInput(e) {
    const val = e.target.value;
    onChange(val);

    const pos = e.target.selectionStart;
    let ws = pos;
    while (ws > 0 && /[\w.]/.test(val[ws - 1])) ws--;
    const partial = val.substring(ws, pos);

    if (partial.length >= 2) {
      const up = partial.toUpperCase();
      const filtered = acUpper
        .filter(([, u]) => u.startsWith(up))
        .slice(0, 12)
        .map(([w]) => w);
      // If the only remaining match is exactly what is already typed, there is
      // nothing left to complete, so do not linger with a redundant popup.
      const alreadyComplete =
        filtered.length === 1 && filtered[0].toUpperCase() === up;
      if (filtered.length && !alreadyComplete) {
        setAcFiltered(filtered);
        setAcIndex(0);
        setAcVisible(true);
        const lines = val.substring(0, pos).split("\n");
        setAcPos({
          top: lines.length * 21 + 4 - (textareaRef.current?.scrollTop || 0),
          left:
            lines[lines.length - 1].length * 8.4 +
            50 -
            (textareaRef.current?.scrollLeft || 0),
        });
        return;
      }
    }
    setAcVisible(false);
  }

  function insertAc(word) {
    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    let ws = pos;
    while (ws > 0 && /[\w.]/.test(value[ws - 1])) ws--;
    const next = value.substring(0, ws) + word + " " + value.substring(pos);
    onChange(next);
    setAcVisible(false);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = ws + word.length + 1;
      ta.focus();
    });
  }

  function handleKeyDown(e) {
    // Ctrl/Cmd+Enter runs the query (if the parent gave us onRun).
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
      return;
    }

    // Tab inserts two spaces (unless the autocomplete menu is open).
    if (e.key === "Tab" && !acVisible) {
      e.preventDefault();
      const ta = textareaRef.current;
      const s = ta.selectionStart;
      onChange(value.substring(0, s) + "  " + value.substring(ta.selectionEnd));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
      return;
    }

    if (acVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIndex((i) => Math.min(i + 1, acFiltered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (acFiltered.length) {
          e.preventDefault();
          insertAc(acFiltered[acIndex]);
        }
      } else if (e.key === "Escape") {
        setAcVisible(false);
      }
    }
  }

  const lineNums = Array.from(
    { length: value.split("\n").length },
    (_, i) => i + 1,
  ).join("\n");

  return (
    <div className="sql-editor-wrap" style={{ minHeight }}>
      <pre className="sql-line-numbers">{lineNums}</pre>
      <div className="sql-editor-inner">
        <pre
          ref={highlightRef}
          className="sql-highlight"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightSQL(value) + "\n" }}
        />
        <textarea
          ref={textareaRef}
          className="sql-textarea"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          onBlur={() => setAcVisible(false)}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder={placeholder}
          readOnly={readOnly}
        />
        {hint && <div className="sql-hint">{hint}</div>}
        {acVisible && acFiltered.length > 0 && (
          <div
            className="sql-autocomplete"
            style={{ top: acPos.top, left: acPos.left }}
          >
            {acFiltered.map((w, i) => (
              <div
                key={w}
                ref={i === acIndex ? selectedRef : null}
                className={"sql-ac-item" + (i === acIndex ? " active" : "")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertAc(w);
                }}
              >
                {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(SqlInput);
