// User management page with 4-tier RBAC.
// Shows all users with role badges, allows role changes (within hierarchy),
// password resets, user creation, and deletion.
// Admin and superadmin can manage users. Editor and readonly can only view.

import React, { useState, useEffect } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch } from '../../utils/api.js';
import DataTable from '../layout/DataTable.jsx';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import { useToast } from '../layout/Toast.jsx';
import { useAuth } from '../../App.jsx';

const ROLES = ['superadmin', 'admin', 'editor', 'readonly'];
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };
const ROLE_BADGE = { superadmin: 'badge-amber', admin: 'badge-purple', editor: 'badge-blue', readonly: 'badge-gray' };

export default function UserManagement() {
  const toast = useToast();
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', role: 'readonly' });
  const [generatedPw, setGeneratedPw] = useState(null);
  const [del, setDel] = useState(null);
  const [changePw, setChangePw] = useState({ show: false, current: { value: '', isView: false }, newPw: { value: '', isView: false }, confirm: { value: '', isView: false } });
  const [roleChange, setRoleChange] = useState(null);

  async function load() {
    try { setUsers(await apiFetch('/api/users')); } catch (e) { toast.error('Failed to load users: ' + e.message); }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  function creatableRoles() {
    if (myRole === 'superadmin') return ['superadmin', 'admin', 'editor', 'readonly'];
    if (myRole === 'admin') return ['admin', 'editor', 'readonly'];
    return [];
  }

  function assignableRoles(targetRole) {
    const targetLevel = ROLE_LEVEL[targetRole] || 0;
    if (targetLevel >= myLevel) return [];
    return ROLES.filter(r => {
      const newLevel = ROLE_LEVEL[r] || 0;
      return newLevel < myLevel;
    });
  }

  async function createUser(e) {
    e.preventDefault();
    try {
      if (form.username.trim().length > 128) {
        toast.warning('Username must not exceed 128 characters.');
        return;
      }
      const r = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(form) });
      toast.success(`User "${form.username}" created.`);
      setGeneratedPw(r.generatedPassword);
      setForm({ username: '', email: '', role: 'readonly' }); setShowCreate(false); load();
    } catch (err) { toast.error(err.message); }
  }

  async function confirmRoleChange() {
    if (!roleChange) return;
    try {
      await apiFetch(`/api/users/${roleChange.userId}`, { method: 'PUT', body: JSON.stringify({ role: roleChange.toRole }) });
      toast.success(`Role changed from ${roleChange.fromRole} to ${roleChange.toRole}.`);
      load();
    } catch (err) { toast.error(err.message); }
    setRoleChange(null);
  }

  function cancelRoleChange() {
    setRoleChange(null);
  }

  async function resetPassword(id) {
    try {
      const r = await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify({ resetPassword: true }) });
      toast.success(`New password: ${r.generatedPassword}`);
    } catch (err) { toast.error(err.message); }
  }

  async function deleteUser(id) {
    try { await apiFetch(`/api/users/${id}`, { method: 'DELETE',body:{} }); toast.success('User deleted.'); load(); }
    catch (err) { toast.error(err.message); }
    setDel(null);
  }

  async function selfChangePassword(e) {
    e.preventDefault();
    if (changePw.newPw.length < 8) { toast.error('Password must be at least 8 characters.'); return; }

    if (changePw.newPw.length > 256) {
      toast.warning('Password must not exceed 256 characters.');
      return;
    }
    if (changePw.newPw?.value !== changePw.confirm?.value) { toast.error('Passwords do not match.'); return; }
    if (changePw.newPw?.value.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    try {
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: changePw.current?.value, newPassword: changePw.newPw?.value }) });
      toast.success('Password changed successfully.');
      setChangePw({ show: false, current: { value: '', isView: false }, newPw: { value: '', isView: false }, confirm: { value: '', isView: false } });
    } catch (err) { toast.error(err.message); }
  }

  if (!loaded) return <div className="page-content"><div className="empty-state" style={{ padding: 40 }}><div className="loading-spinner"></div> Loading...</div></div>;

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title"><Icon className="ti ti-users"></Icon> User Management</h2>
        </div>
        <div className="alert-banner info" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-lock"></Icon>
          <span>User management is only available for administrators.</span>
        </div>
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>User management is only available for administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title"><Icon className="ti ti-users"></Icon> User Management</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setChangePw(p => ({ ...p, show: !p.show })); if (!changePw.show) setShowCreate(false); }}><Icon className="ti ti-key"></Icon> Change My Password</button>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => { setShowCreate(!showCreate); if (!showCreate) setChangePw(p => ({ ...p, show: false })); }}><Icon className={`ti ${showCreate ? 'ti-x' : 'ti-plus'}`}></Icon> {showCreate ? 'Cancel' : 'New User'}</button>}
        </div>
      </div>

      {changePw.show && (
        <div className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 480 }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 16 }}><Icon className="ti ti-key" style={{ color: 'var(--accent)', marginRight: 6 }}></Icon> Change Password</h3>
          <form onSubmit={selfChangePassword}>
            <div className="form-group" style={{ marginBottom: 12 }}><label className="form-label">Current Password *</label>
              <div className='' style={{ width: "100%", position: "relative" }}>
                <input
                  className="form-input"

                  required
                  value={changePw.current?.value}
                  type={changePw?.current?.isView ? 'text' : 'password'}
                  style={{ width: "100%", paddingRight: "35px" }}
                  onChange={e => setChangePw(p => ({ ...p, current: { ...p?.confirm, value: e.target?.value } }))}
                />
                <div
                  className='password-eye'
                  style={{ position: "absolute", right: "15px", top: "22%", cursor: "pointer" }}
                  title={changePw?.current?.isView ? 'hide' : 'show'}
                  onClick={() => setChangePw({ ...changePw, current: { ...changePw?.current, isView: !changePw?.current?.isView } })}
                >
                  {changePw?.current?.isView ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
                </div>
              </div>

            </div>
            <div className="form-group" style={{ marginBottom: 12 }}><label className="form-label">New Password *</label>
              <div className='' style={{ width: "100%", position: "relative" }}>
                <input
                  className="form-input"

                  required
                  minLength={8}
                  value={changePw.newPw?.value}
                  type={changePw?.newPw?.isView ? 'text' : 'password'}
                  style={{ width: "100%", paddingRight: "35px" }}
                  onChange={e =>
                    setChangePw(p => ({ ...p, newPw: { ...p?.newPw, value: e.target?.value } }))}
                />
                <div
                  className='password-eye'
                  style={{ position: "absolute", right: "15px", top: "22%", cursor: "pointer" }}
                  title={changePw?.newPw?.isView ? 'hide' : 'show'}
                  onClick={() => setChangePw({ ...changePw, newPw: { ...changePw?.newPw, isView: !changePw?.newPw?.isView } })}
                >
                  {changePw?.newPw?.isView ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
                </div>

              </div>

            </div>
            <div className="form-group" style={{ marginBottom: 16 }}><label className="form-label">Confirm New Password *</label>
              <div className='' style={{ width: "100%", position: "relative" }}>
                <input
                  className="form-input"

                  required
                  value={changePw.confirm?.value}
                  type={changePw?.confirm?.isView ? 'text' : 'password'}
                  style={{ width: "100%", paddingRight: "35px" }}
                  onChange={e => setChangePw(p => ({ ...p, confirm: { ...p?.confirm, value: e.target?.value } }))}
                />
                <div
                  className='password-eye'
                  style={{ position: "absolute", right: "15px", top: "22%", cursor: "pointer" }}
                  title={changePw?.confirm?.isView ? 'hide' : 'show'}
                  onClick={() => setChangePw({ ...changePw, confirm: { ...changePw?.confirm, isView: !changePw?.confirm?.isView } })}
                >
                  {changePw?.confirm?.isView ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
                </div>
              </div>

            </div>
            <button className="btn btn-primary" type="submit"><Icon className="ti ti-check"></Icon> Update Password</button>
          </form>
        </div>
      )}

      {generatedPw && <div className="alert-banner success" style={{ marginBottom: 14 }}><Icon className="ti ti-key"></Icon> Generated password: <strong style={{ fontFamily: 'var(--font-code)', marginLeft: 8 }}>{generatedPw}</strong> - share securely with the user.<button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setGeneratedPw(null)}><Icon className="ti ti-x"></Icon></button></div>}

      {showCreate && isAdmin && (
        <form onSubmit={createUser} className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
            <div className="form-group"><label className="form-label">Username *</label><input className="form-input" required value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="For password email" /></div>
            <div className="form-group"><label className="form-label">Role</label>
              <Select className="form-select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                {creatableRoles().map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 12 }}>A random password will be generated for first login. If email is provided and SMTP is configured in .env, the password will be emailed.</p>
          <button className="btn btn-primary" type="submit"><Icon className="ti ti-plus"></Icon> Create User</button>
        </form>
      )}

      <div className="data-table-wrap dt-single">
        <table className="data-table">
          <thead><tr><th>Username</th><th>Role</th><th>Email</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map(u => {
              const targetLevel = ROLE_LEVEL[u.role] || 0;
              const canManage = isAdmin && targetLevel < myLevel;
              const rolesForTarget = assignableRoles(u.role);
              return (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td>
                    {canManage && rolesForTarget.length > 0 ? (
                      <Select
                        className="form-select"
                        value={u.role}
                        onChange={e => { if (e.target.value !== u.role) setRoleChange({ userId: u.id, username: u.username, fromRole: u.role, toRole: e.target.value }); }}
                        style={{ padding: '2px 6px', fontSize: '12px', minWidth: 100 }}
                      >
                        <option value={u.role}>{u.role}</option>
                        {rolesForTarget.filter(r => r !== u.role).map(r => <option key={r} value={r}>{r}</option>)}
                      </Select>
                    ) : (
                      <span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`}>{u.role}</span>
                    )}
                  </td>
                  <td>{u.email || '-'}</td>
                  <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '-'}</td>
                  <td style={{ verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => resetPassword(u.id)} title="Reset Password" disabled={!canManage} style={!canManage ? { opacity: 0.35, cursor: 'not-allowed' } : {}}><Icon className="ti ti-key"></Icon></button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDel(u.id)} title="Delete" disabled={!canManage} style={!canManage ? { opacity: 0.35, cursor: 'not-allowed' } : {}}><Icon className="ti ti-trash"></Icon></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No users.</td></tr>}
          </tbody>
        </table>
      </div>
      {del && <ConfirmModal title="Delete User" message="Delete this user?" onConfirm={() => deleteUser(del)} onCancel={() => setDel(null)} danger />}
      {roleChange && <ConfirmModal title="Change Role" message={`Change "${roleChange.username}" from ${roleChange.fromRole} to ${roleChange.toRole}?`} onConfirm={confirmRoleChange} onCancel={cancelRoleChange} />}
    </div>
  );
}
