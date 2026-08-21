// ExplainOptions.jsx - checkbox row under the EXPLAIN dropdown.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useState } from "react";
import { basicOptionsFor, advancedOptionsFor } from "./explainOptions.js";

function Checkbox({ option, ticked, onToggle }) {
  return (
    <label
      title={option.help}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
    >
      <input
        type="checkbox"
        checked={!!ticked[option.key]}
        onChange={() => onToggle(option.key)}
      />
      {option.label}
    </label>
  );
}

export default function ExplainOptions({ explainType, ticked, onToggle }) {

  const [showAdvanced, setShowAdvanced] = useState(false);

  const basic = basicOptionsFor(explainType);
  const advanced = advancedOptionsFor(explainType);
  if (!basic.length && !advanced.length) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",

        justifyContent: "flex-end",
        padding: "4px 16px",
        borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-sunken)",
        fontSize: "0.75rem",
        flexShrink: 0,
      }}
    >
      {basic.map((o) => (
        <Checkbox key={o.key} option={o} ticked={ticked} onToggle={onToggle} />
      ))}

      {showAdvanced &&
        advanced.map((o) => (
          <Checkbox key={o.key} option={o} ticked={ticked} onToggle={onToggle} />
        ))}

      {advanced.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-accent)",
            cursor: "pointer",
            fontSize: "0.75rem",
            padding: 0,
          }}
        >
          {showAdvanced ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}