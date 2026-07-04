// SqlEditorPage - Hosts the SQL Editor with a Regular / Comparison mode toggle
//
// The mode itself is owned here, but the selector is rendered by each child in
// its own toolbar (next to the connect button) via the mode / onModeChange
// props, so the control stays in a consistent place across both modes. Regular
// renders the existing QueryEditor (all props forwarded, unchanged behavior);
// Comparison renders the side-by-side ComparisonView. Defaults to Regular.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState } from "react";
import QueryEditor from "./QueryEditor.jsx";
import ComparisonView from "./ComparisonView.jsx";
import "./comparison.css";

export default function SqlEditorPage(props) {
  const [mode, setMode] = useState("regular"); // 'regular' | 'comparison'

  return mode === "regular" ? (
    <QueryEditor {...props} mode={mode} onModeChange={setMode} />
  ) : (
    <ComparisonView mode={mode} onModeChange={setMode} />
  );
}
