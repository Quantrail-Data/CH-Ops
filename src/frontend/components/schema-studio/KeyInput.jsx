// KeyInput.jsx - Ordered key builder for ORDER BY and PRIMARY KEY
//
// The user types and the matching columns are suggested; choosing one appends it
// as an ordered token (ordinal position matters and is shown). Free expressions
// (for example toYYYYMM(d) or cityHash64(id)) are also allowed by typing them and
// pressing Enter. The tokens are serialized into a key expression string that the
// deterministic composer parses later: one token is bare, several become a tuple,
// none is empty.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useState } from "react";
import Icon from "../common/Icon.jsx";
import { keyList, joinKey } from "../../utils/ddlCompose.js";

export default function KeyInput({ value, onChange, columns = [], placeholder, id }) {
  const tokens = keyList(value);
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState(false);

  const used = new Set(tokens);
  const q = draft.trim().toLowerCase();
  const suggestions = columns
    .filter((c) => !used.has(c) && c.toLowerCase().includes(q))
    .slice(0, 8);

  const commit = (parts) => onChange(joinKey(parts));
  function addToken(t) {
    const v = String(t).trim();
    if (!v) return;
    commit([...tokens, v]);
    setDraft("");
  }
  const removeToken = (i) => commit(tokens.filter((_, idx) => idx !== i));
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= tokens.length) return;
    const next = tokens.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }
  function onKeyDown(e) {
    if (e.key === "Enter") { e.preventDefault(); addToken(draft); }
    else if (e.key === "Backspace" && !draft && tokens.length) { removeToken(tokens.length - 1); }
  }

  const exprAddable = q && !columns.some((c) => c.toLowerCase() === q);

  return (
    <div className="studio-keyinput">
      <div className="studio-key-tokens">
        {tokens.map((t, i) => (
          <span key={i} className="studio-key-chip">
            <button type="button" className="studio-key-move" onClick={() => move(i, -1)}
              disabled={i === 0} aria-label="Move earlier" title="Move earlier">
              <Icon className="ti ti-chevron-left" />
            </button>
            <span className="studio-key-pos">{i + 1}</span>
            <span className="studio-key-label mono">{t}</span>
            <button type="button" className="studio-key-move" onClick={() => move(i, 1)}
              disabled={i === tokens.length - 1} aria-label="Move later" title="Move later">
              <Icon className="ti ti-chevron-right" />
            </button>
            <button type="button" className="studio-key-x" onClick={() => removeToken(i)}
              aria-label="Remove" title="Remove">
              <Icon className="ti ti-x" />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="studio-key-text mono"
          value={draft}
          placeholder={tokens.length ? "add another..." : (placeholder || "type a column or expression")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          autoComplete="off"
        />
      </div>
      {focus && (suggestions.length > 0 || exprAddable) && (
        <div className="studio-key-menu">
          {suggestions.map((c) => (
            <button key={c} type="button" className="studio-key-opt"
              onMouseDown={(e) => { e.preventDefault(); addToken(c); }}>
              <span className="mono">{c}</span>
            </button>
          ))}
          {exprAddable && (
            <button type="button" className="studio-key-opt studio-key-opt-expr"
              onMouseDown={(e) => { e.preventDefault(); addToken(draft); }}>
              Use expression: <span className="mono">{draft.trim()}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
