// SharedComponents - Reusable UI primitives used across multiple features
//
// Contains small, stateless utility components that don't belong to any
// specific feature. SqlPreview renders formatted SQL in a code block for
// review before execution. StatCard displays key metrics in a consistent
// card format with an optional icon and color accent.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import Icon from "../common/Icon.jsx";
import { KpiCard } from "../ui/index.jsx";

export function SqlPreview({ sql }) {
  if (!sql) return null;
  return (
    <div style={{ marginTop: '16px' }}>
      <label className="form-label"><Icon className="ti ti-code"></Icon> Generated SQL</label>
      <pre className="code-block" style={{ wordBreak: 'break-all' }}>{sql}</pre>
    </div>
  );
}

// StatCard is kept for its existing callers and renders the shared KpiCard.
// `color` is still honoured as an icon override.
export function StatCard({ icon, label, value, color, ...rest }) {
  const iconEl = icon ? <Icon className={`ti ${icon}`} style={color ? { color } : undefined} /> : undefined;
  return <KpiCard icon={iconEl} label={label} value={value} {...rest} />;
}
