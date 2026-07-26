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
import Select from "../common/Select.jsx";
import { isTemporal, isNumeric, enumMembers, hasValue }
  from "../../../shared/sqlParams.js";

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
        alignItems: "center",
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
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8125rem" }}
        >
          <span style={{ color: "var(--text-secondary)" }}>
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

function ParamInput({ param, value, onChange }) {
  const members = enumMembers(param.type);

  if (members.length) {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">(none)</option>
        {members.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </Select>
    );
  }

  if (isTemporal(param.type)) {
    const dateOnly = /^Date(32)?$/i.test(param.type.replace(/^(Nullable|LowCardinality)\((.*)\)$/i, "$2"));
    return (
      <input
        className="form-input"
        type={dateOnly ? "date" : "datetime-local"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 200 }}
      />
    );
  }

  if (isNumeric(param.type)) {
    return (
      <input
        className="form-input"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 120 }}
      />
    );
  }

  const isCollection = /^(Array|Map)/i.test(param.type);
  return (
    <input
      className="form-input"
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={isCollection ? (/^Array/i.test(param.type) ? "[1,2,3]" : "{'a':1}") : ""}
      title={param.type}
      style={{ width: isCollection ? 200 : 160 }}
    />
  );
}
