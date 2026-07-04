// MultiSelect.jsx - Themed multi-select dropdown.
//
// Replaces a native <select multiple>. Takes `options` (strings or
// { value, label }), a `value` array, and `onChange(nextArray)`. Selected items
// show as chips in the control; the menu toggles items with a check. Same opaque,
// themed, keyboard-accessible panel as Select.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icon.jsx";
import SelectMenu from "./SelectMenu.jsx";
import "./select.css";

function normOptions(options) {
  return (options || []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

export default function MultiSelect({
  options, value = [], onChange, className = "", disabled = false, id, placeholder = "Select...",
}) {
  const opts = normOptions(options);
  const selected = new Set(value);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (rootRef.current && rootRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".cui-select-menu")) return;
      close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
  }
  function toggle(v) {
    const next = selected.has(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange?.(next);
  }
  function remove(v, e) { e.stopPropagation(); onChange?.(value.filter((x) => x !== v)); }

  return (
    <div ref={rootRef} className={`cui-select ${open ? "is-open" : ""} ${className}`}>
      <button type="button" id={id} className="cui-select-control" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => { if (["Enter", " ", "ArrowDown"].includes(e.key)) { e.preventDefault(); openMenu(); } else if (e.key === "Escape") close(); }}>
        {value.length === 0 ? (
          <span className="cui-select-value is-placeholder">{placeholder}</span>
        ) : (
          <span className="cui-ms-chips">
            {value.map((v) => {
              const o = opts.find((x) => x.value === v);
              return (
                <span key={v} className="cui-ms-chip">
                  {o ? o.label : v}
                  <button type="button" tabIndex={-1} aria-label={`Remove ${v}`} onClick={(e) => remove(v, e)}>
                    <Icon className="ti ti-x" />
                  </button>
                </span>
              );
            })}
          </span>
        )}
        <Icon className="ti ti-chevron-down cui-select-caret" />
      </button>

      <SelectMenu
        anchorRef={rootRef}
        open={open}
        onRequestClose={close}
        role="listbox"
        aria-multiselectable="true"
      >
        {opts.length === 0 && <li className="cui-select-empty">No options</li>}
        {opts.map((o) => (
          <li key={o.value} role="option" aria-selected={selected.has(o.value)}
            className={`cui-select-opt ${selected.has(o.value) ? "is-selected" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); toggle(o.value); }}>
            <span>{o.label}</span>
            {selected.has(o.value) && <Icon className="ti ti-check cui-opt-check" />}
          </li>
        ))}
      </SelectMenu>
    </div>
  );
}
