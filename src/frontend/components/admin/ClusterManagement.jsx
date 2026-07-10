// Multi-cluster management page.
// Supports up to 3 clusters with a combined max of 18 nodes.
// Each cluster has a name and an array of ClickHouse® nodes.

import React, { useState, useEffect } from 'react';
import Icon from "../common/Icon.jsx";
import { apiFetch } from '../../utils/api.js';
import { useToast } from '../layout/Toast.jsx';
import { useConnection } from '../../App.jsx';
import { useAuth } from '../../App.jsx';

const MAX_CLUSTERS = 3;
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

function NodeClusterComponent({ n, testNode, i, removeNode, updateNode, tr, editing }) {
  const [showPassword, setShowPassword] = useState(false);

  return (<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px 1fr 1fr auto auto auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
    <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={n.name} onChange={e => updateNode(i, 'name', e.target.value)} placeholder="node-1" /></div>
    <div className="form-group"><label className="form-label">Host *</label><input className="form-input" value={n.host} onChange={e => updateNode(i, 'host', e.target.value)} placeholder="192.168.1.10" /></div>
    <div className="form-group"><label className="form-label">Port</label><input className="form-input" type="number" value={n.port} onChange={e => updateNode(i, 'port', parseInt(e.target.value) || 8123)} /></div>
    <div className="form-group"><label className="form-label">User</label><input className="form-input" value={n.user} onChange={e => updateNode(i, 'user', e.target.value)} /></div>
    <div className="form-group">
      <label className="form-label">Password</label>

      <div className='' style={{ width: "100%", position: "relative" }}>

        <input className="form-input" style={{ width: "100%", paddingRight: "35px" }} type={showPassword ? 'text' : 'password'} value={n.password} onChange={e => updateNode(i, 'password', e.target.value)} />
        <div
          className='password-eye'
          style={{ position: "absolute", right: "15px", top: "22%", cursor: "pointer" }}
          title={showPassword ? 'hide' : 'show'}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
        </div>
      </div>
    </div>

    <div className="form-group" style={{ paddingTop: 20 }}><label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}><input type="checkbox" checked={n.secure} onChange={e => updateNode(i, 'secure', e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> HTTPS</label></div>
    <button className="btn btn-secondary btn-sm" onClick={() => testNode(editing, i)} style={{ marginBottom: 2 }}><Icon className="ti ti-plug-connected"></Icon></button>
    <button className="btn btn-danger btn-sm" onClick={() => removeNode(i)} style={{ marginBottom: 2 }}><Icon className="ti ti-trash"></Icon></button>
    {tr && <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: tr.loading ? 'var(--text-muted)' : tr.ok ? 'var(--color-success)' : 'var(--color-danger)', marginTop: -4 }}>{tr.loading ? 'Testing...' : tr.msg}</div>}
  </div>)
}

export default function ClusterManagement() {
  const toast = useToast();
  const { reloadConfig } = useConnection();
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [clusters, setClusters] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', nodes: [] });
  const [showForm, setShowForm] = useState(false);
  const [testResults, setTestResults] = useState({});

  async function load() {
    try { const r = await apiFetch('/api/cluster'); setClusters(Array.isArray(r) ? r : []); } catch (e) { toast.error('Failed to load clusters: ' + e.message); }
  }
  useEffect(() => { load(); }, []);

  function addNode() {
    setForm(p => ({ ...p, nodes: [...p.nodes, { name: '', host: '', port: 8123, user: 'default', password: '', secure: false }] }));
  }

  function updateNode(i, field, value) {
    setForm(p => ({ ...p, nodes: p.nodes.map((n, j) => j === i ? { ...n, [field]: value } : n) }));
  }

  function removeNode(i) { setForm(p => ({ ...p, nodes: p.nodes.filter((_, j) => j !== i) })); }

  async function testNode(clusterId, i) {
    const n = form.nodes[i];
    if (!n.host) { toast.warning('Host is required.'); return; }
    const key = `${clusterId || 'new'}-${i}`;
    setTestResults(p => ({ ...p, [key]: { loading: true } }));
    try {
      const r = await apiFetch('/api/cluster/test', { method: 'POST', body: JSON.stringify(n) });
      setTestResults(p => ({ ...p, [key]: { ok: true, msg: `v${r.version}, uptime ${r.uptime}s` } }));
    } catch (err) { setTestResults(p => ({ ...p, [key]: { ok: false, msg: err.message } })); }
  }

  function startNew() {
    setForm({ name: '', nodes: [{ name: '', host: '', port: 8123, user: 'default', password: '', secure: false }] });
    setEditing(null); setShowForm(true); setTestResults({});
  }

  function startEdit(cluster) {
    setForm({ name: cluster.name, nodes: cluster.nodes.map(n => ({ ...n })) });
    setEditing(cluster.id); setShowForm(true); setTestResults({});
  }

  async function save() {
    const valid = form.nodes.filter(n => n.host);
    const unnamed = valid.find(n => !n.name?.trim());
    if (unnamed) { toast.warning('Node Name is required for all nodes.'); return; }
    if (!form.name?.trim()) { toast.warning('Cluster name is required.'); return; }
    const names = valid.map(n => n.name.trim().toLowerCase());
    const dupes = names.filter((v, i) => names.indexOf(v) !== i);
    if (dupes.length) { toast.warning(`Duplicate node name: "${dupes[0]}".`); return; }

    try {
      if (editing) {
        await apiFetch(`/api/cluster/${editing}`, { method: 'PUT', body: JSON.stringify({ name: form.name, nodes: valid }) });
        toast.success(`Cluster "${form.name}" updated.`);
      } else {
        await apiFetch('/api/cluster', { method: 'POST', body: JSON.stringify({ name: form.name, nodes: valid }) });
        toast.success(`Cluster "${form.name}" created.`);
      }
      setShowForm(false); setEditing(null); load();
      if (reloadConfig) reloadConfig();
    } catch (err) { toast.error(err.message); }
  }

  async function remove(id) {
    try {
      await apiFetch(`/api/cluster/${id}`, { method: 'DELETE', body: {} });
      toast.success('Cluster deleted.');
      load();
      if (reloadConfig) reloadConfig();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title"><Icon className="ti ti-network"></Icon> Cluster Management</h2>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn-secondary btn-sm" onClick={load}><Icon className="ti ti-refresh"></Icon></button>
          {!showForm && clusters.length < MAX_CLUSTERS && (
            <button className="btn btn-primary btn-sm" onClick={startNew} disabled={!isAdmin} style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}><Icon className="ti ti-plus"></Icon> New Cluster</button>
          )}
          {showForm && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditing(null); }}><Icon className="ti ti-x"></Icon> Cancel</button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Cluster Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Production, Staging, Analytics" style={{ maxWidth: 300 }} />
          </div>
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Nodes ({form.nodes.length})</span>
            <button className="btn btn-secondary btn-sm" onClick={addNode}><Icon className="ti ti-plus"></Icon> Add Node</button>
          </div>
          {form.nodes.map((n, i) => {
            const key = `${editing || 'new'}-${i}`;
            const tr = testResults[key];
            return (
              <NodeClusterComponent 
              key={key} 
              i={i} 
              n={n} 
              testNode={testNode}
               updateNode={updateNode} 
               removeNode={removeNode} 
               tr={tr} 
               editing={editing} />
            );
          })}
          <button className="btn btn-primary" onClick={save} style={{ marginTop: 8 }}><Icon className="ti ti-device-floppy"></Icon> {editing ? 'Update Cluster' : 'Create Cluster'}</button>
        </div>
      )}

      {clusters.length === 0 && !showForm ? (
        <div className="empty-state"><Icon className="ti ti-network"></Icon><p>No clusters configured. Click New Cluster to get started.</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {clusters.map(c => (
            <div key={c.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <strong style={{ fontSize: '1rem' }}>{c.name}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: 8 }}>{c.nodes.length} node{c.nodes.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(c)} disabled={!isAdmin} style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}><Icon className="ti ti-edit"></Icon> Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)} disabled={!isAdmin} style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}><Icon className="ti ti-trash"></Icon></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {c.nodes.map(n => (
                  <span key={n.host} className="badge badge-blue" style={{ fontSize: '12px', padding: '3px 10px' }}>
                    <Icon className="ti ti-server" style={{ fontSize: 13, marginRight: 4 }}></Icon>
                    {n.name || n.host} ({n.host}:{n.port})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
