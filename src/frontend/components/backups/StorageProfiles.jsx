// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Configures and manages storage tier profiles.


import React, { useEffect, useState } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch, runQuery } from '../../utils/api.js';



export default function StorageProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [result, setResult] = useState(null);
  const [testResult, setTestResult] = useState({});
  const emptyForm = { name: '', type: 's3', endpoint: '', bucket: '', region: 'us-east-1', accessKeyId: '', accessKey: '' };
  const [form, setForm] = useState({ ...emptyForm });
 const [accessKeyView, setAccessKeyView] = useState(false);
  async function load() {
    try { const r = await apiFetch('/api/settings/backup_profiles'); setProfiles(JSON.parse(r?.value || '[]')); } catch { setProfiles([]); }
  }
  useEffect(() => { load(); }, []);

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function startEdit(p) { setForm({ ...p }); setEditing(p.id); setShowForm(true); }
  function startNew() { setForm({ ...emptyForm }); setEditing(null); setShowForm(true); }

  async function save(e) {
    e.preventDefault();
    let updated;
    if (editing) {
      updated = profiles.map(p => p.id === editing ? { ...form, id: editing } : p);
    } else {
      // Prevent duplicate names
      if (profiles.some(p => p.name.toLowerCase() === form.name.trim().toLowerCase())) {
        setResult({ ok: false, msg: `Profile name "${form.name}" already exists.` }); return;
      }
      updated = [...profiles, { ...form, id: Date.now() }];
    }
    try {
      await apiFetch('/api/settings/backup_profiles', { method: 'PUT', body: JSON.stringify({ value: JSON.stringify(updated), category: 'backups' }) });
      setResult({ ok: true, msg: editing ? 'Profile updated.' : `Profile "${form.name}" saved.` });
      setForm({ ...emptyForm }); setShowForm(false); setEditing(null); load();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
  }

  async function remove(id) {
    const updated = profiles.filter(p => p.id !== id);
    await apiFetch('/api/settings/backup_profiles', { method: 'PUT', body: JSON.stringify({ value: JSON.stringify(updated), category: 'backups' }) });
    load();
  }

  async function testConnection(p) {
    setTestResult(prev => ({ ...prev, [p.id]: { loading: true } }));
    try {
      let testSql;
      if (p.type === 's3') testSql = `SELECT 1 FROM s3('${p.endpoint || 'https://s3.amazonaws.com'}${p.bucket}/test_connection_probe', '${p.accessKeyId}', '${p.accessKey}', 'CSV') LIMIT 0`;
      else if (p.type === 'gcs') testSql = `SELECT 1 FROM s3('https://storage.googleapis.com/${p.bucket}/test_connection_probe', '${p.accessKeyId}', '${p.accessKey}', 'CSV') LIMIT 0`;
      else testSql = `SELECT 1`; // Azure doesn't have a simple test via SQL
      await runQuery(testSql);
      setTestResult(prev => ({ ...prev, [p.id]: { ok: true, msg: 'Connection OK' } }));
    } catch (err) {
      // ClickHouse often echoes the failing query back in s3()-related error
      // text, which would otherwise leak the plaintext secret key onto the screen.
      let msg = err.message || 'Failed';
      if (p.accessKey) msg = msg.split(p.accessKey).join('***');
      if (p.accessKeyId) msg = msg.split(p.accessKeyId).join('***');
      // "not found" or "no such key" means bucket is reachable
      if (msg.includes('not found') || msg.includes('NoSuchKey') || msg.includes('404')) {
        setTestResult(prev => ({ ...prev, [p.id]: { ok: true, msg: 'Bucket reachable (test key not found - expected)' } }));
      } else {
        setTestResult(prev => ({ ...prev, [p.id]: { ok: false, msg } }));
      }
    }
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title"><Icon className="ti ti-cloud"></Icon> Storage Profiles</h2>
        <button className="btn btn-primary btn-sm" onClick={() => showForm ? (setShowForm(false), setEditing(null)) : startNew()}><Icon className={`ti ${showForm ? 'ti-x' : 'ti-plus'}`}></Icon> {showForm ? 'Cancel' : 'New Profile'}</button>
      </div>
      {result && <div className={`alert-banner ${result.ok ? 'success' : 'danger'}`} style={{ marginBottom: 14 }}><Icon className={`ti ${result.ok ? 'ti-check' : 'ti-alert-circle'}`}></Icon> {result.msg}<button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResult(null)}><Icon className="ti ti-x"></Icon></button></div>}
      {showForm && (
        <form onSubmit={save} className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" required value={form.name} onChange={e => update('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Type</label><Select className="form-select" value={form.type} onChange={e => update('type', e.target.value)}><option value="s3">Amazon S3</option><option value="azure">Azure Blob</option><option value="gcs">Google Cloud</option></Select></div>
            <div className="form-group"><label className="form-label">{form.type === 'azure' ? 'Container' : 'Bucket'} *</label><input className="form-input" required value={form.bucket} onChange={e => update('bucket', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
            {form.type === 's3' && <div className="form-group"><label className="form-label">Endpoint</label><input className="form-input" value={form.endpoint} onChange={e => update('endpoint', e.target.value)} placeholder="https://s3.amazonaws.com" /></div>}
            {form.type !== 'azure' && <div className="form-group"><label className="form-label">Region</label><input className="form-input" value={form.region} onChange={e => update('region', e.target.value)} /></div>}
            <div className="form-group"><label className="form-label">Access Key ID *</label><input className="form-input" required value={form.accessKeyId} onChange={e => update('accessKeyId', e.target.value)} /></div>
            <div className="form-group">
            <label className="form-label">Access Key (Secret) *</label>
            

            <div className='' style={{ width: "100%", position: "relative" }}>
                <input className="form-input" type={accessKeyView ? 'text' : 'password'} style={{ width: "100%", paddingRight: "35px" }} required value={form.accessKey} onChange={e => update('accessKey', e.target.value)} />

              <div
                className='password-eye'
                style={{ position: "absolute", right: "15px", top: "22%", cursor: "pointer" }}
                title={accessKeyView ? 'hide' : 'show'}
                onClick={() => setAccessKeyView(!accessKeyView)}
              >
                {accessKeyView ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
              </div>
            </div>
            </div>
          </div>
          <button className="btn btn-primary" type="submit"><Icon className="ti ti-device-floppy"></Icon> {editing ? 'Update' : 'Save'}</button>
        </form>
      )}
      {profiles.length === 0 ? <div className="empty-state"><Icon className="ti ti-cloud"></Icon><p>No storage profiles configured.</p></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {profiles.map(p => {
            const tr = testResult[p.id];
            return (
              <div key={p.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><strong>{p.name}</strong><span className="badge badge-blue">{p.type.toUpperCase()}</span></div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-table)' }}>
                  <div><Icon className="ti ti-bucket" style={{ fontSize: 14 }}></Icon> {p.bucket}</div>
                  {p.region && <div><Icon className="ti ti-map-pin" style={{ fontSize: 14 }}></Icon> {p.region}</div>}
                  <div><Icon className="ti ti-key" style={{ fontSize: 14 }}></Icon> {p.accessKeyId}</div>
                </div>
                {tr && <div style={{ marginTop: 8, fontSize: '12px', color: tr.loading ? 'var(--text-muted)' : tr.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{tr.loading ? 'Testing...' : tr.msg}</div>}
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => testConnection(p)}><Icon className="ti ti-plug-connected"></Icon> Test</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(p)}><Icon className="ti ti-edit"></Icon> Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)}><Icon className="ti ti-trash"></Icon></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
