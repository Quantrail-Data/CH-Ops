// Select.jsx - Themed single-select dropdown, a true drop-in for native <select>.
//
// It renders two layers that share the same value and onChange:
//   1. A real, accessible <select> kept visually hidden (screen-reader only). It
//      is the form control, the keyboard control, and what tests drive. This is
//      why getByRole('combobox'), fireEvent.change, and querySelectorAll('select')
//      keep working, and why HTML form `required` still validates.
//   2. A custom, themed, opaque menu shown to mouse users so the open list is no
//      longer the unstyled browser dropdown.
//
// Pass `value`, `onChange`, and <option> children exactly like the native
// element; onChange receives the native event (or a synthetic { target: { value } }
// from the custom menu), so handlers reading e.target.value are unaffected.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icon.jsx";
import SelectMenu from "./SelectMenu.jsx";
import "./select.css";

// Flatten <option> children into { value, label, disabled }.
function readOptions(children) {
  const out = [];
  React.Children.forEach(children, (child) => {
    if (!child || typeof child !== "object") return;
    if (child.type === "option") {
      const p = child.props || {};
      const value = p.value !== undefined ? p.value : p.children;
      out.push({ value: value == null ? "" : String(value), label: p.children, disabled: !!p.disabled });
    } else if (child.type === React.Fragment && child.props) {
      out.push(...readOptions(child.props.children));
    }
  });
  return out;
}

export default function Select({
  value, onChange, children, className = "", disabled = false, required = false,
  id, name, style, placeholder, "aria-label": ariaLabel, ...rest
}) {
  const options = readOptions(children);
  const current = options.find((o) => o.value === String(value ?? ""));
  const isEmpty = value == null || value === "";

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback(() => { setOpen(false); setActive(-1); }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (rootRef.current && rootRef.current.contains(e.target)) return;
      // The menu is portalled outside rootRef; clicks inside it are not "outside".
      if (e.target.closest && e.target.closest(".cui-select-menu")) return;
      close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  function openMenu() {
    if (disabled) return;
    const sel = options.findIndex((o) => o.value === String(value ?? ""));
    setActive(sel >= 0 ? sel : 0);
    setOpen(true);
  }

  function pick(opt) {
    if (opt.disabled) return;
    close();
    if (opt.value !== String(value ?? "")) onChange?.({ target: { value: opt.value, name } });
  }

  function moveActive(delta) {
    setActive((a) => {
      let i = a;
      for (let n = 0; n < options.length; n++) {
        i = (i + delta + options.length) % options.length;
        if (!options[i].disabled) return i;
      }
      return a;
    });
  }
  function onMenuKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
    else if (e.key === "Enter" && active >= 0 && options[active]) { e.preventDefault(); pick(options[active]); }
  }

  useEffect(() => {
    if (open && menuRef.current) {
      const el = menuRef.current.querySelector(`[data-i="${active}"]`);
      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
    }
  }, [active, open]);

  return (
    <div ref={rootRef} className={`cui-select ${open ? "is-open" : ""} ${className}`} style={style}>
      {/* Real control: accessible, keyboard-operable, form-validated, test-driven. */}
      <select
        className="cui-select-native-real"
        id={id}
        name={name}
        value={value ?? ""}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange?.(e)}
        {...rest}
      >
        {children}
      </select>

      {/* Visual layer for mouse users (decorative; the native select is the source of truth). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="cui-select-control"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onMenuKeyDown}
      >
        <span className={`cui-select-value ${isEmpty && placeholder ? "is-placeholder" : ""}`}>
          {current ? current.label : (placeholder || (current?.label ?? ""))}
        </span>
        <Icon className="ti ti-chevron-down cui-select-caret" />
      </button>

      <SelectMenu
        anchorRef={rootRef}
        open={open}
        onRequestClose={close}
        listRef={menuRef}
        role="listbox"
        aria-hidden="true"
      >
        {options.length === 0 && <li className="cui-select-empty">No options</li>}
        {options.map((o, i) => (
          <li
            key={i}
            data-i={i}
            className={`cui-select-opt ${i === active ? "is-active" : ""} ${o.value === String(value ?? "") ? "is-selected" : ""} ${o.disabled ? "is-disabled" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => { e.preventDefault(); pick(o); }}
          >
            <span>{o.label}</span>
            {o.value === String(value ?? "") && <Icon className="ti ti-check cui-opt-check" />}
          </li>
        ))}
      </SelectMenu>
    </div>
  );
}
