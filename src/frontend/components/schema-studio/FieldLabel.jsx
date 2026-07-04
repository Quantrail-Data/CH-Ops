// FieldLabel.jsx - A form label with an info tooltip
//
// Many Schema Studio fields map to ClickHouse internals a user may not know.
// This renders the label text next to a small info icon; hovering or focusing
// the icon reveals a short explanation. The tooltip is CSS-driven (no
// positioning library) and is reachable by keyboard.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import Icon from "../common/Icon.jsx";

export default function FieldLabel({ text, tip, htmlFor }) {
  return (
    <label className="studio-flabel" htmlFor={htmlFor}>
      <span>{text}</span>
      {tip && (
        <span className="studio-tip" tabIndex={0} role="note" aria-label={tip}>
          <Icon className="ti ti-info-circle" />
          <span className="studio-tip-bubble">{tip}</span>
        </span>
      )}
    </label>
  );
}
