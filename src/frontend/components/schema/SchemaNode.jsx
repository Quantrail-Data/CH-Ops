// Copyright (C) 2026 Quantrail™ Data Private Limited
// @author: Sanjeev Kumar G
// Represents a single structural element within a hierarchical database schema tree viewer.

import React from 'react';
import Icon from "../common/Icon.jsx";
import { Handle, Position } from '@xyflow/react';
import { fmtRows, fmtBytes, formatLoadValue, loadIntensity, loadColour, loadBadgeTextColor } from '../../utils/schemaParser.js';

const ENGINE_ICONS = {
  mt: 'ti-table', mv: 'ti-eye', rmv: 'ti-refresh',
  dict: 'ti-book', distributed: 'ti-topology-ring',
  view: 'ti-eye', other: 'ti-file',
};

function engineLabel(node) {
  if (node.kind === 'rmv') return 'RMV';
  if (node.kind === 'mv') return 'MV';
  return node.engine || '';
}

function SchemaNode({ data }) {
  const { node, p, showColumns, searchLc, isDimmed, isSelected, isHighlighted, mvLoad, loadDays, loadMetric, heatmapMvMax, hasIncoming, hasOutgoing } = data;

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', fontSize: '12px',
      border: '1px solid ' + (isSelected || isHighlighted ? 'var(--accent)' : 'var(--border-default)'),
      boxShadow: isSelected ? '0 0 0 3px var(--accent-soft), var(--shadow-md)' : 'var(--shadow-sm)',
      opacity: isDimmed ? 0.2 : 1, width: node.w,
      transition: 'opacity 0.2s, box-shadow 0.2s',
      position: 'relative',
    }}>
      {hasIncoming && (
        <Handle type="target" position={Position.Top}
          style={{ width: 6, height: 6, background: 'var(--text-muted)', border: 'none', opacity: 0.4 }} />
      )}
      {hasOutgoing && (
        <Handle type="source" position={Position.Bottom}
          style={{ width: 6, height: 6, background: 'var(--text-muted)', border: 'none', opacity: 0.4, bottom: -3 }} />
      )}

      {/* Header */}
      <div style={{
        padding: '6px 10px', borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        fontWeight: 600, background: p.bg, color: p.text,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Icon className={`ti ${ENGINE_ICONS[node.kind] || 'ti-file'}`} style={{ fontSize: 13, opacity: 0.85, flexShrink: 0 ,color:p?.text}} />
        <span style={{ fontFamily: 'var(--font-code)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          title={node.displayName}>{node.displayName}</span>
        <span style={{ fontSize: '10px', opacity: 0.75, whiteSpace: 'nowrap', fontFamily: 'var(--font-code)', flexShrink: 0 }}>{engineLabel(node)}</span>
        {node.totalRows && Number(node.totalRows) > 0 && (
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-chart)', padding: '1px 5px', borderRadius: 10, background: 'rgba(0,0,0,0.12)', whiteSpace: 'nowrap', flexShrink: 0 }}
            title={`${fmtRows(node.totalRows)} rows, ${fmtBytes(node.totalBytes)}`}>{fmtRows(node.totalRows)}</span>
        )}
        {mvLoad && loadDays > 0 && (() => {
          const val = mvLoad[loadMetric] || 0;
          if (val <= 0) return null;
          const intensity = loadIntensity(val, heatmapMvMax || 0);
          return <span style={{ padding: '1px 5px', fontSize: '9px', fontFamily: 'var(--font-chart)', borderRadius: 2, flexShrink: 0,
            background: loadColour(intensity), color: loadBadgeTextColor(intensity) }}
            title={`${loadMetric} over ${loadDays}d`}>{formatLoadValue(loadMetric, val)}</span>;
        })()}
      </div>

      {/* Columns */}
      {showColumns && node.columns.length > 0 && (
        <div style={{ padding: '4px 10px', maxHeight: 220, overflowY: 'auto' }}>
          {node.columns.slice(0, 14).map((c, ci) => (
            <div key={ci} style={{
              display: 'flex', justifyContent: 'space-between', gap: 6,
              fontFamily: 'var(--font-code)', fontSize: '12px', lineHeight: 1.5,
              padding: '1px 4px', borderRadius: 2,
              background: searchLc && c.name.toLowerCase().includes(searchLc) ? 'var(--accent-soft)' : ci % 2 === 0 ? 'transparent' : 'var(--bg-sunken)',
            }}>
              <span style={{ color: (c.is_key === 1 || c.is_key === true) ? 'var(--color-danger)' : (c.has_default === 1 || c.has_default === true) ? 'var(--color-success)' : 'var(--text-primary)', fontWeight: (c.is_key === 1 || c.is_key === true) ? 600 : 400 }}>{c.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }} title={c.type}>{c.type}</span>
            </div>
          ))}
          {node.columns.length > 14 && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px', padding: '2px 4px' }}>... {node.columns.length - 14} more</div>}
        </div>
      )}
    </div>
  );
}

export default React.memo(SchemaNode);
