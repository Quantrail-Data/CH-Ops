// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Creates, modifies, and maps fine-grained permission sets to system-wide RBAC roles.


import React, { useEffect, useState } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery.js';
import { runQuery } from '../../utils/api.js';
import DataTable from '../layout/DataTable.jsx';
import { SqlPreview } from '../layout/SharedComponents.jsx';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import AlertBanner from '../layout/AlertBanner.jsx';

const ACCESS_TYPES = ['SELECT', 'INSERT', 'ALTER', 'CREATE', 'DROP', 'TRUNCATE', 'OPTIMIZE', 'SHOW', 'KILL QUERY', 'ACCESS MANAGEMENT', 'SYSTEM', 'INTROSPECTION', 'SOURCES', 'dictGet', 'ALL', 'NONE'];

function useDbList() { const q = useQuery(); useEffect(() => { q.execute('SELECT name FROM system.databases ORDER BY name'); }, []); return q; }
function useTableList(db) { const q = useQuery(); useEffect(() => { if (db && db !== '*') q.execute(`SELECT name FROM system.tables WHERE database='${db}' ORDER BY name`); }, [db]); return q; }

export default function RbacRoles() {
  const { tab: routeTab = 'list' } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/rbac/roles/${newTab}`, { replace: true });
  };

  const rolesQ = useQuery(), clustersQ = useQuery();
  const [result, setResult] = useState(null);

  function load() { rolesQ.execute('SELECT name FROM system.roles ORDER BY name'); clustersQ.execute("SELECT DISTINCT cluster FROM system.clusters WHERE cluster!='' ORDER BY cluster"); }
  useEffect(load, []);

  const roles = (rolesQ.data || []).map(r => r.name);
  const clusters = (clustersQ.data || []).map(r => r.cluster);
  const tabs = [{ id: 'list', l: 'List', i: 'ti-list' }, { id: 'create', l: 'Create', i: 'ti-plus' }, { id: 'alter', l: 'Alter', i: 'ti-edit' }, { id: 'grant', l: 'Grant/Revoke', i: 'ti-key' }, { id: 'drop', l: 'Drop', i: 'ti-trash' }];

  if (rolesQ.loading && !rolesQ.data) return <div className="page-content"><div className="empty-state" style={{ padding: 40 }}><div className="loading-spinner"></div> Loading...</div></div>;

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-shield"></Icon> Roles</h2></div>
      <AlertBanner result={result} setResult={setResult} />
      {/* {result && <div className={`alert-banner ${result.ok ? 'success' : 'danger'}`} style={{ marginBottom: 14 }}><Icon className={`ti ${result.ok ? 'ti-check' : 'ti-alert-circle'}`}></Icon> {result.msg}<button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResult(null)}><Icon className="ti ti-x"></Icon></button></div>} */}
      <div className="tab-bar">{tabs.map(t => <div key={t.id} className={`tab-item ${routeTab === t.id ? 'active' : ''}`} onClick={() => handleTabChange(t.id)}><Icon className={`ti ${t.i}`}></Icon> {t.l}</div>)}</div>
      {routeTab === 'list' && <DataTable rows={rolesQ.data || []} emptyMessage="No roles." variant="single" />}
      {routeTab === 'create' && <CreateRole clusters={clusters} setResult={setResult} onSuccess={load} />}
      {routeTab === 'alter' && <AlterRole roles={roles} clusters={clusters} setResult={setResult} onSuccess={load} />}
      {routeTab === 'grant' && <GrantRevoke roles={roles} clusters={clusters} setResult={setResult} />}
      {routeTab === 'drop' && <DropRole roles={roles} clusters={clusters} setResult={setResult} onSuccess={load} />}
    </div>
  );
}

function CreateRole({ clusters, setResult, onSuccess }) {
  const [name, setName] = useState('');
  const [onCluster, setOnCluster] = useState('');
  const sql = name.trim() ? `CREATE ROLE IF NOT EXISTS ${name.trim()}${onCluster ? ` ON CLUSTER '${onCluster}'` : ''}` : '';

  async function submit(e) {
    e.preventDefault(); try {
      await runQuery(sql);
      setResult({ ok: true, msg: 'Role created.' });
      setName('');
      onSuccess();
    }
    catch (e) { setResult({ ok: false, msg: e.message }); }
    finally {
      setTimeout(() => {
        setResult(null)
      }, 5000)
    }
  }
  return (<form onSubmit={submit} className="card" style={{ padding: 20 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}><div className="form-group"><label className="form-label">Role Name *</label><input className="form-input" required value={name} onChange={e => setName(e.target.value)} /></div><div className="form-group"><label className="form-label">ON CLUSTER</label><Select className="form-select" value={onCluster} onChange={e => setOnCluster(e.target.value)}><option value="">--</option>{clusters.map(c => <option key={c}>{c}</option>)}</Select></div></div><SqlPreview sql={sql} /><div style={{ marginTop: 16 }}><button className="btn btn-primary" type="submit"><Icon className="ti ti-plus"></Icon> Create</button></div></form>);
}

function AlterRole({ roles, clusters, setResult, onSuccess }) {
  const [sel, setSel] = useState('');
  const [f, setF] = useState({ rename: '', onCluster: '', addSettings: '', dropSettings: '', addProfiles: '', dropProfiles: '', dropAllSettings: false, dropAllProfiles: false });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  function buildSql() {
    if (!sel) return '';
    const p = ['ALTER ROLE', sel];
    if (f.onCluster) p.push(`ON CLUSTER '${f.onCluster}'`);
    if (f.rename.trim()) p.push(`RENAME TO ${f.rename.trim()}`);
    if (f.dropAllProfiles) p.push('DROP ALL PROFILES');
    if (f.dropAllSettings) p.push('DROP ALL SETTINGS');
    if (f.dropSettings.trim()) p.push(`DROP SETTINGS ${f.dropSettings.trim()}`);
    if (f.dropProfiles.trim()) p.push(`DROP PROFILES '${f.dropProfiles.trim()}'`);
    if (f.addSettings.trim()) p.push(`ADD SETTINGS ${f.addSettings.trim()}`);
    if (f.addProfiles.trim()) p.push(`ADD PROFILES '${f.addProfiles.trim()}'`);
    return p.join(' ');
  }


  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql());
      setResult({ ok: true, msg: 'Role altered.' });
      onSuccess();
      setSel('')
      setF({ rename: '', onCluster: '', addSettings: '', dropSettings: '', addProfiles: '', dropProfiles: '', dropAllSettings: false, dropAllProfiles: false })
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    finally {
      setTimeout(() => {
        setResult(null)
      }, 5000)
    }

  }


  return (<form onSubmit={submit} className="card" style={{ padding: 20 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
      <div className="form-group"><label className="form-label">Role *</label><Select className="form-select" required value={sel} onChange={e => setSel(e.target.value)}><option value="">--</option>{roles.map(r => <option key={r}>{r}</option>)}</Select></div>
      <div className="form-group"><label className="form-label">Rename To</label><input className="form-input" value={f.rename} onChange={e => u('rename', e.target.value)} /></div>
      <div className="form-group"><label className="form-label">ON CLUSTER</label><Select className="form-select" value={f.onCluster} onChange={e => u('onCluster', e.target.value)}><option value="">--</option>{clusters.map(c => <option key={c}>{c}</option>)}</Select></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
      <div className="form-group"><label className="form-label">ADD SETTINGS</label><input className="form-input" value={f.addSettings} onChange={e => u('addSettings', e.target.value)} placeholder="var = value, ..." style={{ fontFamily: 'var(--font-code)' }} /></div>
      <div className="form-group"><label className="form-label">DROP SETTINGS</label><input className="form-input" value={f.dropSettings} onChange={e => u('dropSettings', e.target.value)} style={{ fontFamily: 'var(--font-code)' }} /></div>
      <div className="form-group"><label className="form-label">ADD PROFILES</label><input className="form-input" value={f.addProfiles} onChange={e => u('addProfiles', e.target.value)} /></div>
      <div className="form-group"><label className="form-label">DROP PROFILES</label><input className="form-input" value={f.dropProfiles} onChange={e => u('dropProfiles', e.target.value)} /></div>
    </div>
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <label style={{ display: 'flex', gap: 6, cursor: 'pointer', fontSize: '14px' }}><input type="checkbox" checked={f.dropAllSettings} onChange={e => u('dropAllSettings', e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> DROP ALL SETTINGS</label>
      <label style={{ display: 'flex', gap: 6, cursor: 'pointer', fontSize: '14px' }}><input type="checkbox" checked={f.dropAllProfiles} onChange={e => u('dropAllProfiles', e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> DROP ALL PROFILES</label>
    </div>
    <SqlPreview sql={buildSql()} />
    <div style={{ marginTop: 16 }}><button className="btn btn-primary" type="submit" disabled={!sel}><Icon className="ti ti-edit"></Icon> Alter</button></div>
  </form>);
}

function GrantRevoke({ roles, clusters, setResult }) {
  const dbsQ = useDbList();
  const [f, setF] = useState({ role: '', action: 'grant', accessType: 'SELECT', database: '*', table: '*', onCluster: '' });
  const tblsQ = useTableList(f.database);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  function buildSql() { if (!f.role) return ''; const verb = f.action === 'grant' ? 'GRANT' : 'REVOKE'; const dir = f.action === 'grant' ? 'TO' : 'FROM'; return `${verb} ${f.accessType} ON ${f.database}.${f.table} ${dir} ${f.role}${f.onCluster ? ` ON CLUSTER '${f.onCluster}'` : ''}`; }

  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql());
      setResult({ ok: true, msg: 'Executed.' });
      setF({ role: '', action: 'grant', accessType: 'SELECT', database: '*', table: '*', onCluster: '' });

    }
    catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    finally {
      setTimeout(() => {
        setResult(null)
      }, 5000)
    }
  }


  return (<form onSubmit={submit} className="card" style={{ padding: 20 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
      <div className="form-group"><label className="form-label">Role *</label><Select className="form-select" value={f.role} onChange={e => u('role', e.target.value)} required><option value="">--</option>{roles.map(r => <option key={r}>{r}</option>)}</Select></div>
      <div className="form-group"><label className="form-label">Action</label><Select className="form-select" value={f.action} onChange={e => u('action', e.target.value)}><option value="grant">Grant</option><option value="revoke">Revoke</option></Select></div>
      <div className="form-group"><label className="form-label">Privilege</label><Select className="form-select" value={f.accessType} onChange={e => u('accessType', e.target.value)}>{ACCESS_TYPES.map(a => <option key={a}>{a}</option>)}</Select></div>
      <div className="form-group"><label className="form-label">Database</label><Select className="form-select" value={f.database} onChange={e => { u('database', e.target.value); u('table', '*'); }}><option value="*">* (all)</option>{dbsQ.data?.map(r => <option key={r.name}>{r.name}</option>)}</Select></div>
      <div className="form-group"><label className="form-label">Table</label><Select className="form-select" value={f.table} onChange={e => u('table', e.target.value)}><option value="*">* (all)</option>{tblsQ.data?.map(r => <option key={r.name}>{r.name}</option>)}</Select></div>
      <div className="form-group"><label className="form-label">ON CLUSTER</label><Select className="form-select" value={f.onCluster} onChange={e => u('onCluster', e.target.value)}><option value="">--</option>{clusters.map(c => <option key={c}>{c}</option>)}</Select></div>
    </div>
    <SqlPreview sql={buildSql()} />
    <div style={{ marginTop: 16 }}><button className="btn btn-primary" type="submit" disabled={!f.role}><Icon className="ti ti-key"></Icon> Execute</button></div>
  </form>);
}

function DropRole({ roles, clusters, setResult, onSuccess }) {
  const [sel, setSel] = useState('');
  const [onCluster, setOnCluster] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const sql = sel ? `DROP ROLE IF EXISTS ${sel}${onCluster ? ` ON CLUSTER '${onCluster}'` : ''}` : '';

  async function drop() {
    try {
      await runQuery(sql);
      setResult({ ok: true, msg: 'Role dropped.' });
      onSuccess();
      setSel('')
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }

    finally {
      setTimeout(() => {
        setResult(null)
      }, 5000)
      setConfirm(false);
      setConfirmName('');
    }
  }


  return (<div className="card" style={{ padding: 20, height: confirm ? '600px' : 'auto' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}><div className="form-group"><label className="form-label">Role</label><Select className="form-select" value={sel} onChange={e => setSel(e.target.value)}><option value="">--</option>{roles.map(r => <option key={r}>{r}</option>)}</Select></div><div className="form-group"><label className="form-label">ON CLUSTER</label><Select className="form-select" value={onCluster} onChange={e => setOnCluster(e.target.value)}><option value="">--</option>{clusters.map(c => <option key={c}>{c}</option>)}</Select></div></div><SqlPreview sql={sql} /><div style={{ marginTop: 16 }}><button className="btn btn-danger" disabled={!sel} onClick={() => setConfirm(true)}><Icon className="ti ti-trash"></Icon> Drop</button></div>
    {confirm && <ConfirmModal title="Drop Role" message={<div><p>Type the role name <strong>{sel}</strong> to confirm:</p><input className="form-input" style={{ marginTop: 8 }} value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder={sel} autoFocus /></div>} confirmText="Drop Role" onConfirm={drop} onCancel={() => { setConfirm(false); setConfirmName(''); }} danger confirmDisabled={confirmName !== sel} />}
  </div>);
}
