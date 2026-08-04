// Copyright (C) 2026 Quantrail™ Data Private Limited
// MaxRowsControl.jsx - how many rows the editor asks the server for.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import React from "react";

export const MAX_ROWS_KEY = "chops_max_rows";
export const MAX_ROWS_DEFAULT = 5000;
export const MAX_ROWS_MIN = 100;
export const MAX_ROWS_MAX = 100000;

// Steps of 100. Small enough to land on a round number from anywhere, and the
// field is there when the jump is large.
export const MAX_ROWS_STEP = 100;

/* Above this, ask first. */
export const MAX_ROWS_WARN = 25000;

export function readMaxRows() {
  const n = Number(localStorage.getItem(MAX_ROWS_KEY));
  return Number.isFinite(n) && n >= MAX_ROWS_MIN && n <= MAX_ROWS_MAX
    ? n
    : MAX_ROWS_DEFAULT;
}

export function clampMaxRows(n) {
  const v = Math.round(Number(n) || 0);
  if (!Number.isFinite(v)) return MAX_ROWS_DEFAULT;
  return Math.min(MAX_ROWS_MAX, Math.max(MAX_ROWS_MIN, v));
}

/* One bordered group: minus, value, plus. */
export default function MaxRowsControl({ value, onChange, disabled = false }) {
  const step = (delta) => onChange(clampMaxRows(value + delta));

  return (
    <span
      className="mx-rows"
      title="How many rows to ask the server for. The rest are not sent, so a large result stays responsive. Use Export to get everything."
    >
      <span className="mx-rows-label">Max rows</span>

      <span className="mx-rows-group">
        <button
          type="button"
          className="mx-rows-btn"
          onClick={() => step(-MAX_ROWS_STEP)}
          disabled={disabled || value <= MAX_ROWS_MIN}
          aria-label="Fewer rows"
        >
          <i>&minus;</i>
        </button>

        <input
          className="mx-rows-input"
          type="number"
          min={MAX_ROWS_MIN}
          max={MAX_ROWS_MAX}
          step={MAX_ROWS_STEP}
          /* Committed on blur and on Enter, not on every keystroke. Typing
             "20000" passes through 2, 20, 200 and 2000 on the way, and reacting
             to each would fire the warning at a number nobody asked for. */
          defaultValue={value}
          key={value}
          onBlur={(e) => onChange(clampMaxRows(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            e.stopPropagation();
          }}
          aria-label="Maximum rows to return"
          disabled={disabled}
        />

        <button
          type="button"
          className="mx-rows-btn"
          onClick={() => step(MAX_ROWS_STEP)}
          disabled={disabled || value >= MAX_ROWS_MAX}
          aria-label="More rows"
        >
          <i>+</i>
        </button>
      </span>
    </span>
  );
}
