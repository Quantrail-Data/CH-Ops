// RankedBar.jsx
// Horizontal ranked bars for snapshot composition (no time axis).
// items: [{ label, value, sub? }]. Sorted by value desc, top `max` shown.

import React from "react";

export default function RankedBar({ items, max = 8, valueFormat }) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, max);
  const top = sorted.length ? sorted[0].value : 0;
  const fmt = valueFormat || ((v) => v);

  if (!sorted.length) {
    return <div className="queue-rankedbar-empty">Nothing pending.</div>;
  }

  return (
    <div className="queue-rankedbar">
      {sorted.map((it, i) => (
        <div key={i} className="queue-rankedbar-row">
          <div className="queue-rankedbar-label" title={it.label}>{it.label}</div>
          <div className="queue-rankedbar-track">
            <div
              className="queue-rankedbar-fill"
              style={{ width: top > 0 ? `${(it.value / top) * 100}%` : "0%" }}
            />
          </div>
          <div className="queue-rankedbar-value">
            {fmt(it.value)}
            {it.sub && <span className="queue-rankedbar-sub"> {it.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}