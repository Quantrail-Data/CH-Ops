// ParamInput.jsx - one input for one {name:Type} query parameter.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React from "react";
import Select from "./Select.jsx";
import { isTemporal, isNumeric, enumMembers } from "../../../shared/sqlParams.js";

// Nullable(T) / LowCardinality(T) behave as T for input purposes.
function unwrap(type) {
  return String(type || "").replace(
    /^(Nullable|LowCardinality)\((.*)\)$/i,
    "$2",
  );
}

function invalidStyle(invalid) {
  return invalid
    ? {
        borderColor: "var(--color-warning, #d98324)",
        outline: "1px solid var(--color-warning, #d98324)",
      }
    : undefined;
}

// `fullWidth` lets a grid cell own the sizing. The default widths below suit an
// inline strip; in a fixed grid they leave ragged gaps.
export default function ParamInput({ param, value, onChange, invalid = false, fullWidth = false }) {
  const members = enumMembers(param.type);
  const title = invalid
    ? `${param.name} is required and is currently empty`
    : param.type;

  if (members.length) {
    // .cui-select is width:100%, so it fills whatever it is dropped into. An
    // enum with long member names (Enum8('ExceptionBeforeStart'=3,...)) then
    // pushed past its label. Bounded here so the control stays a sane size and
    // the value ellipsises instead of overlapping.
    return (
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", minWidth: fullWidth ? 0 : 140, maxWidth: fullWidth ? "100%" : 240, ...invalidStyle(invalid) }}
        title={title}
        aria-invalid={invalid || undefined}
      >
        <option value="">(none)</option>
        {members.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </Select>
    );
  }

  if (isTemporal(param.type)) {
    const dateOnly = /^Date(32)?$/i.test(unwrap(param.type));
    return (
      <input
        className="form-input"
        type={dateOnly ? "date" : "datetime-local"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        aria-invalid={invalid || undefined}
        style={{ width: fullWidth ? "100%" : 200, boxSizing: "border-box", ...invalidStyle(invalid) }}
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
        title={title}
        aria-invalid={invalid || undefined}
        style={{ width: fullWidth ? "100%" : 120, boxSizing: "border-box", ...invalidStyle(invalid) }}
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
      placeholder={
        isCollection ? (/^Array/i.test(param.type) ? "[1,2,3]" : "{'a':1}") : ""
      }
      title={title}
      aria-invalid={invalid || undefined}
      style={{ width: fullWidth ? "100%" : (isCollection ? 200 : 160), boxSizing: "border-box", ...invalidStyle(invalid) }}
    />
  );
}
