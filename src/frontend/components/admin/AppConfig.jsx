// AppConfig.jsx - settings an administrator can change without a restart.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import React, { useState, useEffect } from 'react';
import Icon from '../common/Icon.jsx';
import { apiFetch } from '../../utils/api.js';
import { useToast } from '../layout/Toast.jsx';


const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const MIN = 60 * 1000;

const TABS = [
  { id: 'export',   label: 'Exports' },
  { id: 'query',    label: 'Queries' },
  { id: 'security', label: 'Security' },
  { id: 'k8s',      label: 'Kubernetes' },
];


const FIELDS = {
  'export.maxTotalBytes':  { label: 'Total export storage', unit: 'GB', scale: GB, help: 'All export files together. Bounded by the disk CHOps writes to.' },
  'export.maxJobBytes':    { label: 'Largest single export', unit: 'GB', scale: GB, help: 'One export is stopped when it passes this.' },
  'export.maxConcurrent':  { label: 'Exports running at once', unit: '', scale: 1, help: 'Across all users.' },
  'export.maxPerUser':     { label: 'Exports per user', unit: '', scale: 1, help: 'How many one person may run at the same time.' },
  'export.warnBytes':      { label: 'Warn above', unit: 'GB', scale: GB, help: 'Shown to the user as a warning. Not enforced.' },
  'export.idleTtlMs':      { label: 'Delete idle files after', unit: 'minutes', scale: MIN, help: 'An export nobody downloads is cleaned up after this.' },

  'query.maxResultBytes':  { label: 'Maximum result size', unit: 'MB', scale: MB, help: 'A query returning more than this to CHOps is stopped. Exports are not affected.' },
  'query.statsRowLimit':   { label: 'Schema Studio sample rows', unit: 'rows', scale: 1, help: 'How many rows column statistics are calculated from.' },

  'security.maxFailures':  { label: 'Failed logins before lockout', unit: '', scale: 1, help: 'Counted within the window below.' },
  'security.lockoutMs':    { label: 'Lockout lasts', unit: 'minutes', scale: MIN, help: 'How long an account stays locked, and the window failures are counted in.' },
  'security.sessionTtlMs': { label: 'Session length', unit: 'minutes', scale: MIN, help: 'How long a login lasts. Also how long a saved ClickHouse credential lives, deliberately.' },

  'k8s.syncIntervalMs':    { label: 'Refresh the host list every', unit: 'minutes', scale: MIN, help: 'How often CHOps re-reads pods from the operator.' },
  'k8s.missesBeforeRemoval': { label: 'Missed refreshes before removing a host', unit: '', scale: 1, help: 'Too low and a rolling restart drops nodes. Too high and a scale-down leaves stale entries.' },
  'k8s.timeoutMs':         { label: 'Kubernetes API timeout', unit: 'seconds', scale: 1000, help: 'Per request to the Kubernetes API.' },
  'k8s.probeTimeoutMs':    { label: 'Pod address probe timeout', unit: 'seconds', scale: 1000, help: 'How long CHOps waits when checking whether a pod is reachable on its own address.' },
};

export default function AppConfig() {
  const toast = useToast();
  const [tab, setTab] = useState('export');
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setRows(await apiFetch('/api/app-config'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function save(row) {
    const field = FIELDS[row.key];
    const typed = edits[row.key];
    if (typed === undefined || typed === '') return;

    setBusy(row.key);
    try {
      const raw = Math.round(Number(typed) * field.scale);
      setRows(await apiFetch('/api/app-config', {
        method: 'PUT',
        body: JSON.stringify({ key: row.key, value: raw }),
      }));
      setEdits(p => ({ ...p, [row.key]: undefined }));
      toast.success('Saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function reset(row) {
    setBusy(row.key);
    try {
      setRows(await apiFetch(`/api/app-config/${encodeURIComponent(row.key)}`, { method: 'DELETE' }));
      setEdits(p => ({ ...p, [row.key]: undefined }));
      toast.success('Reset to the default.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  function sourceText(row) {
    if (row.source === 'setting') return 'set here';
    if (row.source === 'environment') return `from ${row.env} in the server environment`;
    return 'the built-in default';
  }

  if (loading) return <div className="page-content"><div className="loading-spinner" /></div>;

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-adjustments-horizontal" /> App Config
        </h2>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, maxWidth: 700 }}>
        Limits on how CHOps behaves. A change takes effect immediately, with no
        restart. Anything not set here falls back to the server environment, and
        then to a built-in default.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id}
            className={tab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.filter(r => r.key.startsWith(`${tab}.`)).map((row, i) => {
          const field = FIELDS[row.key];
          if (!field) return null;
          const shown = edits[row.key] ?? String(row.value / field.scale);
          const dirty = edits[row.key] !== undefined;

          return (
            <div key={row.key} className="appconfig-row"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-default)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{field.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {field.help}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {sourceText(row)}
                  {' \u00b7 '}
                  {Math.round(row.min / field.scale)} to {Math.round(row.max / field.scale)}
                  {field.unit ? ` ${field.unit}` : ''}
                </div>
              </div>

              <div className="appconfig-controls">
                <input
                  className="form-input"
                  type="number"
                  style={{ width: 110, textAlign: 'right' }}
                  value={shown}
                  onChange={e => setEdits(p => ({ ...p, [row.key]: e.target.value }))}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 56 }}>
                  {field.unit}
                </span>
                <button className="btn btn-primary btn-sm"
                  disabled={busy === row.key || !dirty}
                  onClick={() => save(row)}>Save</button>
                <button className="btn btn-secondary btn-sm"
                  disabled={busy === row.key || row.source !== 'setting'}
                  onClick={() => reset(row)}
                  title={row.source === 'setting' ? 'Back to the default' : 'Not set here'}>Reset</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}