// Tabs - thin wrapper over the existing .tab-bar/.tab-item classes
//
// Controlled component: the caller owns `active` state, matching the
// convention already used by Select.jsx.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import Icon from "../common/Icon.jsx";

// items: [{ key, label, icon?, style? }] - style is an escape hatch for a
// tab that needs to look disabled/dimmed (e.g. a permission-gated tab whose
// onChange guard already blocks the switch, but should still look inert).
export default function Tabs({ items, active, onChange, className = "" }) {
  return (
    <div className={["tab-bar", className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <div
          key={item.key}
          className={`tab-item ${item.key === active ? "active" : ""}`}
          onClick={() => onChange(item.key)}
          style={item.style}
        >
          {item.icon && <Icon name={item.icon} />}
          {item.label}
        </div>
      ))}
    </div>
  );
}
