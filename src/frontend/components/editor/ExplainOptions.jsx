// ExplainOptions.jsx - checkbox row under the EXPLAIN dropdown.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
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
        // Right aligned, so the options sit under the actions they modify
        // rather than starting at the far left of an otherwise empty row.
        justifyContent: "flex-end",
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
