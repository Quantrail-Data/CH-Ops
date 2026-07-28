// ParamStrip.jsx - inputs for {name:Type} placeholders found in the SQL.
//
// Appears only when the SQL contains a placeholder, so it costs no permanent
// vertical height. Required parameters are marked; optional ones (those that
// appear only inside /*[ ]*/ blocks) can be left blank, which removes their
// block from the query.
//
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import Icon from "../common/Icon.jsx";
// The per-type control now lives in common/ so the dashboard filter bar can
// use exactly the same inputs.
import ParamInput from "../common/ParamInput.jsx";

export default function ParamStrip({
  params, values, onChange, previewOpen, onPreviewToggle,
}) {
  if (!params.length) return null;

  return (
    <div
      className="param-strip"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        flexWrap: "wrap",
        padding: "6px 16px",
        borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-sunken)",
        flexShrink: 0,
      }}
    >
      {params.map((p) => (
        <label
          key={p.name}
          // Column, not a row: a long name next to a control on one line
          // overflowed and sat on top of the input. Stacked and wrapped, the
          // strip grows a line instead of overlapping.
          style={{
            display: "inline-flex", flexDirection: "column", gap: 2,
            fontSize: "0.8125rem", maxWidth: 260, minWidth: 0,
          }}
        >
          <span
            style={{
              color: "var(--text-secondary)",
              overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.3,
            }}
            title={`${p.name}:${p.type}`}
          >
            {p.name}
            {p.required && (
              <span style={{ color: "var(--color-danger)" }} title="Required"> *</span>
            )}
          </span>
          <ParamInput
            param={p}
            value={values[p.name] ?? ""}
            onChange={(v) => onChange(p.name, v)}
          />
        </label>
      ))}

      <button
        className={"btn btn-ghost btn-sm" + (previewOpen ? " active" : "")}
        onClick={onPreviewToggle}
        style={{ marginLeft: "auto" }}
        title="Show the SQL that will actually be sent"
      >
        <Icon className="ti ti-eye" /> Preview
      </button>
    </div>
  );
}
