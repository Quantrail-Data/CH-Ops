// SqlEditorPage - Hosts the SQL Editor with a Regular / Comparison mode toggle
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState } from "react";
import QueryEditor from "./QueryEditor.jsx";
import ComparisonView from "./ComparisonView.jsx";
import "./comparison.css";

const hidden = {
  visibility: "hidden",
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: -1,
  // CLIPS THE HIDDEN PANE.
  overflow: "hidden",
};

export default function SqlEditorPage(props) {
  const [mode, setMode] = useState("regular"); // 'regular' | 'comparison'
  const regular = mode === "regular";

  // BOTH WRAPPERS CARRY A HEIGHT.
  const shown = { height: "100%" };

  return (
    // flex: 1, NOT height: 100%.
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div
        style={regular ? shown : hidden}
        aria-hidden={!regular}
        // A real boolean. An empty string is treated as false by React 19 and
        // warns about it, which is how this file came up for review at all.
        inert={!regular}
      >
        <QueryEditor {...props} mode={mode} onModeChange={setMode} active={regular} />
      </div>
      <div style={regular ? hidden : shown} aria-hidden={regular} inert={regular}>
        <ComparisonView mode={mode} onModeChange={setMode} active={!regular} />
      </div>
    </div>
  );
}
