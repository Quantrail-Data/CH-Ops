// ExplainOptions.jsx - checkbox row under the EXPLAIN dropdown.
//
// Rendered only when an EXPLAIN type is selected, so it costs no permanent
// height. With GENERAL RUN chosen, which is the common case, it is not rendered
// at all.
//
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { optionsFor } from "./explainOptions.js";

export default function ExplainOptions({ explainType, ticked, onToggle }) {
  const opts = optionsFor(explainType);
  if (!opts.length) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "4px 16px",
        borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-sunken)",
        fontSize: "0.75rem",
        flexShrink: 0,
      }}
    >
      {opts.map((o) => (
        <label
          key={o.key}
          title={o.help}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={!!ticked[o.key]}
            onChange={() => onToggle(o.key)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
