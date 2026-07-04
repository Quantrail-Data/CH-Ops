// ModeSelect - Regular / Comparison dropdown for the SQL Editor
//
// Rendered inside each mode's toolbar, right next to the connect button, so the
// control sits in the same place regardless of which mode is active. The value
// and change handler are owned by SqlEditorPage; selecting an option swaps the
// rendered page. Defaults to Regular.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React from "react";
import Select from "../common/Select.jsx";

export default function ModeSelect({ mode = "regular", onChange }) {
  return (
    <Select
      className="form-select mode-select cui-sm"
      value={mode}
      onChange={(e) => onChange && onChange(e.target.value)}
      title="Editor mode"
      aria-label="Editor mode"
      style={{ width: "auto" }}
    >
      <option value="regular">Regular</option>
      <option value="comparison">Comparison</option>
    </Select>
  );
}
