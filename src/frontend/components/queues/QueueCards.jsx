//@author: Sanjeev Kumar G
// QueueCards.jsx
// A row of summary cards. Each card: { label, value, sub?, state?, delta? }
// state: 'ok' | 'warn' | 'bad' | 'neutral' (controls the accent color)
// delta: optional "+18" style change-since-refresh string.

import React from "react";

export default function QueueCards({ cards }) {
  return (
    <div className="queue-cards">
      {cards.map((c, i) => (
        <div key={i} className={"queue-card state-" + (c.state || "neutral")}>
          <div className="queue-card-label">{c.label}</div>
          <div className="queue-card-value">
            {c.value}
            {c.delta != null && c.delta !== "" && (
              <span className="queue-card-delta">{c.delta}</span>
            )}
          </div>
          {c.sub && <div className="queue-card-sub">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
