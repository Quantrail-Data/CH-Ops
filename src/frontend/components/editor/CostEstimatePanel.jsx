// Copyright (C) 2026 Quantrail™ Data Private Limited
// @ author: Sanjeev Kumar G
// Renders the interactive cost estimation dashboard for projecting infrastructure and storage expenses.

import React from 'react';
import Icon from "../common/Icon.jsx";
import { fmtBytes, fmtRows } from '../../utils/costEstimator.js';

export default function CostEstimatePanel({ estimate, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--text-muted)' }}>
        <span className="loading-spinner" style={{ marginRight: 8 }} /> Analyzing query...
      </div>
    );
  }

  if (!estimate) return null;

  if (!estimate.supported) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
        <Icon className="ti ti-info-circle" style={{ fontSize: 20, marginRight: 8 }} />
        {estimate.reason}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, overflow: 'auto', fontSize: '13px' }}>

      {/* Section 1: Cost Estimate */}
      {estimate.estimateError ? (
        <div className="alert-banner warning" style={{ marginBottom: 16 }}>
          <Icon className="ti ti-alert-triangle" />
          <span>Estimate unavailable: {estimate.estimateError}</span>
        </div>
      ) : estimate.tables.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Cost Estimate
          </div>
          <table className="data-table" style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th>Database</th>
                <th>Table</th>
                <th style={{ textAlign: 'right' }}>Parts</th>
                <th style={{ textAlign: 'right' }}>Est. Rows</th>
                <th style={{ textAlign: 'right' }}>Marks</th>
              </tr>
            </thead>
            <tbody>
              {estimate.tables.map((t, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-code)' }}>{t.database}</td>
                  <td style={{ fontFamily: 'var(--font-code)' }}>{t.table}</td>
                  <td style={{ textAlign: 'right' }}>{t.parts.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-warning)' }}>{fmtRows(t.rows)}</td>
                  <td style={{ textAlign: 'right' }}>{t.marks.toLocaleString()}</td>
                </tr>
              ))}
              {estimate.tables.length > 1 && (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-default)' }}>
                  <td colSpan={2}>Total</td>
                  <td style={{ textAlign: 'right' }}>{estimate.totalParts.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-warning)' }}>{fmtRows(estimate.totalRows)}</td>
                  <td style={{ textAlign: 'right' }}>{estimate.totalMarks.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 2: Existing Indexes */}
      {estimate.indexes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Existing Indexes
          </div>
          {estimate.indexes.map((idx, i) => (
            <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-code)', fontWeight: 600 }}>
                  {idx.database}.{idx.table}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {idx.engine}{idx.totalRows > 0 ? ` | ${fmtRows(idx.totalRows)} rows | ${fmtBytes(idx.totalBytes)}` : ''}
                </span>
              </div>

              {idx.sortingKey && (
                <div style={{ fontSize: '12px', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>ORDER BY:</span>
                  <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-success)' }}>{idx.sortingKey}</span>
                </div>
              )}
              {idx.primaryKey && idx.primaryKey !== idx.sortingKey && (
                <div style={{ fontSize: '12px', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>PRIMARY KEY:</span>
                  <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-success)' }}>{idx.primaryKey}</span>
                </div>
              )}

              {idx.skippingIndexes.length > 0 ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 4 }}>Data Skipping Indexes:</div>
                  <table className="data-table" style={{ width: '100%', fontSize: '0.75rem' }}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Expression</th>
                        <th style={{ textAlign: 'right' }}>Granularity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {idx.skippingIndexes.map((si, j) => (
                        <tr key={j}>
                          <td style={{ fontFamily: 'var(--font-code)' }}>{si.name}</td>
                          <td style={{ fontFamily: 'var(--font-code)' }}>{si.type}</td>
                          <td style={{ fontFamily: 'var(--font-code)' }}>{si.expression}</td>
                          <td style={{ textAlign: 'right' }}>{si.granularity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 4 }}>
                  No data skipping indexes
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Section 3: Execution Plan */}
      {estimate.planError ? (
        <div className="alert-banner warning" style={{ marginBottom: 16 }}>
          <Icon className="ti ti-alert-triangle" />
          <span>Plan unavailable: {estimate.planError}</span>
        </div>
      ) : estimate.plan && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Execution Plan
          </div>
          <pre style={{
            fontFamily: 'var(--font-code)', fontSize: '12px', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)', color: 'var(--text-primary)',
            maxHeight: 300, overflow: 'auto',
          }}>
            {estimate.plan}
          </pre>
        </div>
      )}

      {/* Empty state */}
      {!estimate.estimateError && estimate.tables.length === 0 && !estimate.plan && (
        <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
          No estimation data returned. The query may not access any tables.
        </div>
      )}
    </div>
  );
}