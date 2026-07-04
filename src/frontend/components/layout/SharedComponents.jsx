// SharedComponents - Reusable UI primitives used across multiple features
//
// Contains small, stateless utility components that don't belong to any
// specific feature. SqlPreview renders formatted SQL in a code block for
// review before execution. StatCard displays key metrics in a consistent
// card format with an optional icon and color accent.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from 'react';
import Icon from "../common/Icon.jsx";

export function SqlPreview({ sql }) {
  if (!sql) return null;
  return (
    <div style={{ marginTop: '16px' }}>
      <label className="form-label"><Icon className="ti ti-code"></Icon> Generated SQL</label>
      <pre style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '12px', fontSize: '13px', fontFamily: 'var(--font-code)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-primary)', margin: 0 }}>{sql}</pre>
    </div>
  );
}

export function StatCard({ icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">
        {icon && <Icon className={`ti ${icon}`} style={color ? { color } : {}}></Icon>}
        {label}
      </div>
      <div className="stat-card-value">{value ?? '-'}</div>
    </div>
  );
}
