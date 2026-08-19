// User management page with 4-tier RBAC.
// Shows all users with role badges, allows role changes (within hierarchy),
// password resets, user creation, and deletion.
// Admin and superadmin can manage users. Editor and readonly can only view.

import React, { useState, useEffect } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch } from '../../utils/api.js';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import { useToast } from '../layout/Toast.jsx';
import { useAuth } from '../../App.jsx';

const ROLES = ['superadmin', 'admin', 'editor', 'readonly'];
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };
const ROLE_BADGE = { superadmin: 'badge-amber', admin: 'badge-purple', editor: 'badge-blue', readonly: 'badge-gray' };

export default function UserManagement() {
  const toast = useToast();
  const authContext = useAuth();
  const auth = authContext?.auth;
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
  // The System Email tab. Superadmin only, because these settings hold a
  // password.
  const [tab, setTab] = useState('users');
  const [smtp, setSmtp] = useState(null);
  const [smtpForm, setSmtpForm] = useState(null);
  const [smtpBusy, setSmtpBusy] = useState(false);
  const [smtpResult, setSmtpResult] = useState(null);
  const [testTo, setTestTo] = useState('');

  async function loadSmtp() {
    try {
      const r = await apiFetch('/api/system-smtp');
      setSmtp(r);
      setSmtpForm({
        host: r.host,
        port: r.port,
        secure: r.secure,
        user: r.user,
        from: r.from,
        // Never prefilled. Blank on save means unchanged.
        password: '',
      });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function testConnection() {
    setSmtpBusy(true);
    setSmtpResult(null);
    try {
      const r = await apiFetch('/api/system-smtp/test-connection', {
        method: 'POST',
        body: JSON.stringify(smtpForm),
      });
      setSmtpResult(r.ok
        ? { ok: true, message: 'Connected and authenticated.' }
        : { ok: false, message: r.message || 'Could not connect.' });
    } catch (err) {
      setSmtpResult({ ok: false, message: err.message });
    } finally {
      setSmtpBusy(false);
    }
  }

  async function sendTestEmail() {
    if (!testTo.trim()) { toast.warning('Enter an address to send to.'); return; }
    setSmtpBusy(true);
    setSmtpResult(null);
    try {
      const r = await apiFetch('/api/system-smtp/test-email', {
        method: 'POST',
        body: JSON.stringify({ ...smtpForm, to: testTo.trim() }),
      });
      setSmtpResult(r.ok
        ? { ok: true, message: `Sent to ${testTo.trim()}. Check the inbox.` }
        : { ok: false, message: r.message || 'Could not send.' });
    } catch (err) {
      setSmtpResult({ ok: false, message: err.message });
    } finally {
      setSmtpBusy(false);
    }
  }

  async function saveSmtp() {
    setSmtpBusy(true);
    setSmtpResult(null);
    try {
      // The server tests before saving and refuses on failure, so a broken
      // configuration cannot be stored.
      const r = await apiFetch('/api/system-smtp', {
        method: 'PUT',
        body: JSON.stringify(smtpForm),
      });
      setSmtp(r);
      setSmtpForm(p => ({ ...p, password: '' }));
      toast.success('System email settings saved.');
    } catch (err) {
      setSmtpResult({ ok: false, message: err.message });
    } finally {
      setSmtpBusy(false);
    }
  }

  async function deleteSmtp() {
    setSmtpBusy(true);
    try {
      const r = await apiFetch('/api/system-smtp', { method: 'DELETE' });
      setSmtp(r);
      setSmtpForm({ host: '', port: '587', secure: false, user: '', from: '', password: '' });
      toast.success('Deleted. Falling back to the server environment.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSmtpBusy(false);
    }
  }

  function smtpFormReady() {
    if (!smtpForm) return false;
    if (!smtpForm.host?.trim()) return false;
    if (!smtpForm.from?.trim()) return false;

    const port = parseInt(smtpForm.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;

    // A relay with no authentication needs neither, which is valid. A username
    // without a password is not, unless one is already stored and the blank
    // field means "unchanged".
    if (smtpForm.user?.trim() && !smtpForm.password && !smtp?.hasPassword) return false;

    return true;
  }

  async function load() {
    try { setUsers(await apiFetch('/api/users')); } catch (e) { toast.error('Failed to load users: ' + e.message); }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  function creatableRoles() {
    if (myRole === 'superadmin') return ['superadmin', 'admin', 'editor', 'readonly'];
    if (myRole === 'admin') return ['editor', 'readonly'];
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
    try { await apiFetch(`/api/users/${id}`, { method: 'DELETE', body: {} }); toast.success('User deleted.'); load(); }
    catch (err) { toast.error(err.message); }
    setDel(null);
  }

  async function selfChangePassword(e) {
    e.preventDefault();
    if (changePw.newPw.value !== changePw.confirm.value) {
      toast.error('Passwords do not match.');
      return;
    }
    if (changePw.newPw.value.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (changePw.newPw.value.length > 256) {
      toast.warning('Password must not exceed 256 characters.');
      return;
    }
    if (changePw.newPw.value === changePw.current.value) {
      toast.error('New password must be different from current password.');
      return;
    }
    try {
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: changePw.current.value, newPassword: changePw.newPw.value }) });
      toast.success('Password changed successfully. Please login again.');
      localStorage.removeItem('chops_session');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err) {
      toast.error(err.message);
    }
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

      {myRole === 'superadmin' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          <button
            className={tab === 'users' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setTab('users')}
          >
            Users
          </button>
          <button
            className={tab === 'smtp' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => { setTab('smtp'); setSmtpResult(null); if (!smtp) loadSmtp(); }}
          >
            System Email
          </button>
        </div>
      )}

      {tab === 'users' && (<>
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
              {changePw.newPw.value && changePw.confirm.value && changePw.newPw.value === changePw.confirm.value && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: '13px' }}>
                  <Icon className="ti ti-check" style={{ fontSize: '18px', color: 'var(--success)' }} />
                  <span>Passwords match</span>
                </div>
              )}
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
            <div className="form-group"><label className="form-label">Email *</label><input className="form-input" type="email" required value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="For password email" /></div>
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
      </>)}

      {tab === 'smtp' && smtpForm && (
        <div className="card" style={{ padding: 20, maxWidth: 560, margin: '0 auto' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            <Icon className="ti ti-mail" style={{ color: 'var(--accent)', marginRight: 6 }} />
            System email
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Used for new account credentials and password reset codes. Separate
            from the SMTP on alert channels.
          </p>

          <div style={{ fontSize: 12, marginBottom: 16 }}>
            Currently using:{' '}
            <strong>
              {smtp?.source === 'database'
                ? 'the configuration below'
                : smtp?.source === 'environment'
                  ? 'SMTP_HOST from the server environment'
                  : 'nothing. Password reset and credential emails are unavailable.'}
            </strong>
          </div>

          <div className="form-group">
            <label className="form-label">SMTP host</label>
            <input className="form-input" style={{ width: '100%' }}
              value={smtpForm.host}
              onChange={e => { setSmtpForm(p => ({ ...p, host: e.target.value })); setSmtpResult(null); }} />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '0 0 120px', marginBottom: 0 }}>
              <label className="form-label">Port</label>
              <input className="form-input" type="number" style={{ width: '100%' }}
                value={smtpForm.port}
                onChange={e => { setSmtpForm(p => ({ ...p, port: e.target.value })); setSmtpResult(null); }} />
            </div>
            {/* Sits in the row rather than in its own form-group, so it lines up
                with the input beside it rather than with a label that is not there. */}
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, height: 38, cursor: 'pointer',
            }}>
              <input type="checkbox" checked={smtpForm.secure}
                onChange={e => { setSmtpForm(p => ({ ...p, secure: e.target.checked })); setSmtpResult(null); }} />
              Use TLS
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" style={{ width: '100%' }}
              value={smtpForm.user}
              onChange={e => { setSmtpForm(p => ({ ...p, user: e.target.value })); setSmtpResult(null); }} />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" style={{ width: '100%' }}
              value={smtpForm.password}
              placeholder={smtp?.hasPassword ? 'Leave blank to keep the current password' : 'No password set'}
              onChange={e => { setSmtpForm(p => ({ ...p, password: e.target.value })); setSmtpResult(null); }} />
          </div>

          <div className="form-group">
            <label className="form-label">From address</label>
            <input className="form-input" style={{ width: '100%' }}
              value={smtpForm.from}
              placeholder="CHOps &lt;noreply@example.com&gt;"
              onChange={e => { setSmtpForm(p => ({ ...p, from: e.target.value })); setSmtpResult(null); }} />
          </div>

          {!smtpFormReady() && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {!smtpForm.host?.trim()
                ? 'Enter an SMTP host to continue.'
                : !smtpForm.from?.trim()
                  ? 'Enter a from address to continue.'
                  : smtpForm.user?.trim() && !smtpForm.password && !smtp?.hasPassword
                    ? 'Enter the password for this username, or clear the username if the server needs no authentication.'
                    : 'Enter a port between 1 and 65535.'}
            </div>
          )}

          {smtpResult && (
            <div className={smtpResult.ok ? 'alert-banner info' : 'alert-banner danger'}
              style={{ marginBottom: 12, fontSize: 12 }}>
              <Icon className={smtpResult.ok ? 'ti ti-check' : 'ti ti-alert-triangle'} />
              <span>{smtpResult.message}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Send a test email to</label>
              <input className="form-input" style={{ width: '100%' }}
                value={testTo} onChange={e => setTestTo(e.target.value)} />
            </div>
            <button className="btn btn-secondary btn-sm"
              disabled={smtpBusy || !smtpFormReady() || !testTo.trim()}
              onClick={() => sendTestEmail()}>Send test email</button>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" disabled={smtpBusy || !smtpFormReady()}
              onClick={() => testConnection()}>Test connection</button>
            {smtp?.configured && (
              <button className="btn btn-danger btn-sm" disabled={smtpBusy}
                onClick={() => deleteSmtp()}>Delete configuration</button>
            )}
            <button className="btn btn-primary btn-sm" disabled={smtpBusy || !smtpFormReady()}
              onClick={() => saveSmtp()}>{smtpBusy ? 'Working...' : 'Save'}</button>
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-muted)' }}>
            <strong>If email stops working</strong>
            <p>
              Delete the configuration above to fall back to the SMTP_* values in
              the server environment. This takes effect immediately, with no
              restart.
            </p>
            <p>
              With nothing configured here, CHOps uses SMTP_HOST, SMTP_PORT,
              SMTP_USER, SMTP_PASS and SMTP_FROM from the environment. Set
              DISABLE_ENV_SMTP=true to stop that once this page is configured.
            </p>
            <p>
              If you cannot sign in at all, the super admin credentials in the
              server environment still work. See DISABLE_ENV_LOGIN.
            </p>
          </div>
        </div>
      )}

      {del && <ConfirmModal title="Delete User" message="Delete this user?" onConfirm={() => deleteUser(del)} onCancel={() => setDel(null)} danger />}
      {roleChange && <ConfirmModal title="Change Role" message={`Change "${roleChange.username}" from ${roleChange.fromRole} to ${roleChange.toRole}?`} onConfirm={confirmRoleChange} onCancel={cancelRoleChange} />}
    </div>
  );
}
