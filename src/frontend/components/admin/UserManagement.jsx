// User management page with 4-tier RBAC.
// Shows all users with role badges, allows role changes (within hierarchy),
// password resets, user creation, and deletion.
// Admin and superadmin can manage users. Editor and readonly can only view.

import { useState, useEffect } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import { useToast } from "../layout/Toast.jsx";
import { useAuth } from "../../App.jsx";
import ToggleSwitch from "../common/ToggleSwitch.jsx";
import { SegmentedControl, Badge, RowMenu, Button, Input, FormField, PasswordInput, Notice } from "../ui/index.jsx";
import { roleTone } from "../../utils/roles.js";

const ROLES = ["superadmin", "admin", "editor", "readonly"];
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

export default function UserManagement() {
  const toast = useToast();
  const authContext = useAuth();
  const auth = authContext?.auth;
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    username: "",
    email: "",
    role: "readonly",
  });
  const [del, setDel] = useState(null);
  const [changePw, setChangePw] = useState({
    show: false,
    current: { value: "", isView: false },
    newPw: { value: "", isView: false },
    confirm: { value: "", isView: false },
  });
  const [roleChange, setRoleChange] = useState(null);
  // The System Email tab. Superadmin only, because these settings hold a
  // password.
  const [tab, setTab] = useState("users");
  const [smtp, setSmtp] = useState(null);
  const [smtpForm, setSmtpForm] = useState(null);
  const [smtpBusy, setSmtpBusy] = useState(false);
  const [smtpResult, setSmtpResult] = useState(null);
  const [testTo, setTestTo] = useState("");
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(false);
  const [setupURL, setSetupURL] = useState(null);

  async function loadSmtp() {
    try {
      const r = await apiFetch("/api/system-smtp", { cache: "no-store" });
      setSmtp(r);
      setSmtpForm({
        host: r.host,
        port: r.port,
        secure: r.secure,
        user: r.user,
        from: r.from,
        // Never prefilled. Blank on save means unchanged.
        password: "",
      });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function checkSmtpconfigured() {
    try {
      const r = await apiFetch("/api/system-smtp", { cache: "no-store" });
      setIsSmtpConfigured(r.configured);
    } catch {
      setIsSmtpConfigured(false);
    }
  }

  useEffect(() => {
    // Only a superadmin may read the SMTP settings, and only a superadmin sees the result.
    if (myLevel !== ROLE_LEVEL.superadmin) return;
    checkSmtpconfigured();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Run only when the listed values change, as before.
  }, [tab]);

  async function testConnection() {
    setSmtpBusy(true);
    setSmtpResult(null);
    try {
      const r = await apiFetch("/api/system-smtp/test-connection", {
        method: "POST",
        body: JSON.stringify(smtpForm),
      });
      setSmtpResult(
        r.ok
          ? { ok: true, message: "Connected and authenticated." }
          : { ok: false, message: r.message || "Could not connect." },
      );
    } catch (err) {
      setSmtpResult({ ok: false, message: err.message });
    } finally {
      setSmtpBusy(false);
    }
  }

  async function sendTestEmail() {
    if (!testTo.trim()) {
      toast.warning("Enter an address to send to.");
      return;
    }
    setSmtpBusy(true);
    setSmtpResult(null);
    try {
      const r = await apiFetch("/api/system-smtp/test-email", {
        method: "POST",
        body: JSON.stringify({ ...smtpForm, to: testTo.trim() }),
      });
      setSmtpResult(
        r.ok
          ? { ok: true, message: `Sent to ${testTo.trim()}. Check the inbox.` }
          : { ok: false, message: r.message || "Could not send." },
      );
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
      const r = await apiFetch("/api/system-smtp", {
        method: "PUT",
        body: JSON.stringify(smtpForm),
      });
      setSmtp(r);
      setSmtpForm((p) => ({ ...p, password: "" }));
      toast.success("System email settings saved.");
    } catch (err) {
      setSmtpResult({ ok: false, message: err.message });
    } finally {
      setSmtpBusy(false);
    }
  }

  async function deleteSmtp() {
    setSmtpBusy(true);
    try {
      const r = await apiFetch("/api/system-smtp", { method: "DELETE" });
      setSmtp(r);
      setSmtpForm({
        host: "",
        port: "587",
        secure: false,
        user: "",
        from: "",
        password: "",
      });
      toast.success("Deleted. Falling back to the server environment.");
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
    if (smtpForm.user?.trim() && !smtpForm.password && !smtp?.hasPassword)
      return false;

    return true;
  }

  async function load() {
    try {
      setUsers(await apiFetch("/api/users"));
    } catch (e) {
      toast.error("Failed to load users: " + e.message);
    }
    setLoaded(true);
  }
  useEffect(() => {
    if(isAdmin) {
      load();
    }else{
      setLoaded(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once on mount, as before. The missing values would run it again.
  }, []);

  function creatableRoles() {
    if (myRole === "superadmin")
      return ["superadmin", "admin", "editor", "readonly"];
    if (myRole === "admin") return ["editor", "readonly"];
    return [];
  }

  function assignableRoles(targetRole) {
    const targetLevel = ROLE_LEVEL[targetRole] || 0;
    if (targetLevel >= myLevel) return [];
    return ROLES.filter((r) => {
      const newLevel = ROLE_LEVEL[r] || 0;
      return newLevel < myLevel;
    });
  }

  function resetCreateForm() {
    setForm({ username: "", email: "", role: "readonly" });
  }

  async function createUser(e) {
    e.preventDefault();
    try {
      if (form.username.trim().length > 128) {
        toast.warning("Username must not exceed 128 characters.");
        return;
      }
      const r = await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast.success(`User "${form.username}" created.`);
      setSetupURL(r?.setPasswordUrl);
      resetCreateForm();
      setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function confirmRoleChange() {
    if (!roleChange) return;
    try {
      await apiFetch(`/api/users/${roleChange.userId}`, {
        method: "PUT",
        body: JSON.stringify({ role: roleChange.toRole }),
      });
      toast.success(
        `Role changed from ${roleChange.fromRole} to ${roleChange.toRole}.`,
      );
      load();
    } catch (err) {
      toast.error(err.message);
    }
    setRoleChange(null);
  }

  function cancelRoleChange() {
    setRoleChange(null);
  }

async function resetPassword(id,initUser) {
    if (initUser) {
      toast.error("Cannot reset the password of the default user.");
      return;
    }
    try {
      const response = await apiFetch(`/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify({ resetPassword: true }),
      });
      setSetupURL(response.setPasswordUrl);
      toast.success("Password reset. Send the setup link to the user.");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteUser(id) {
    try {
      await apiFetch(`/api/users/${id}`, { method: "DELETE", body: {} });
      toast.success("User deleted.");
      load();
    } catch (err) {
      toast.error(err.message);
    }
    setDel(null);
  }

  async function selfChangePassword(e) {
    e.preventDefault();
    if (changePw.newPw.value !== changePw.confirm.value) {
      toast.error("Passwords do not match.");
      return;
    }
    if (changePw.newPw.value.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (changePw.newPw.value.length > 256) {
      toast.warning("Password must not exceed 256 characters.");
      return;
    }
    if (changePw.newPw.value === changePw.current.value) {
      toast.error("New password must be different from current password.");
      return;
    }
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: changePw.current.value,
          newPassword: changePw.newPw.value,
        }),
      });
      toast.success("Password changed successfully. Please login again.");
      localStorage.removeItem("chops_session");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      toast.error(err.message);
    }
  }

   async function reGenerateSetupURL(userId) {
    try {
      if (userId == null || userId === "") {
        throw new Error("A valid user ID is required.");
      }
      const res = await apiFetch(`/api/users/regenerate?userId=${userId}`, {
        method: "GET",
      });

      if (res?.setPasswordUrl) {
        setSetupURL(res.setPasswordUrl);
      } else {
        throw new Error(res?.error || "Setup URL not found in the response.");
      }
    } catch (error) {
      toast.error(error.message || "Failed to generate setup URL.");
    }
  }

  const [setupURLCopied, setSetupURLCopied] = useState(false);

  const handleCopySetupURL = async () => {
    try {
      await navigator.clipboard.writeText(setupURL);
      setSetupURLCopied(true);
      toast.success("Setup URL copied to clipboard");
    } catch {
      toast.error("Unable to copy URL. Please copy it manually.");
    }
  };

  const handleCloseSetupURL = () => {
    setSetupURL(null);
    setSetupURLCopied(false);
  };

  if (!loaded)
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner"></div> Loading...
        </div>
      </div>
    );

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
            <Icon className="ti ti-users"></Icon> User Management
          </h2>
        </div>
        <Notice tone="info" icon="ti-lock" style={{ marginBottom: 14 }}>
          User management is only available for administrators.
        </Notice>
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>User management is only available for administrators.</p>
        </div>
      </div>
    );
  }

  const tableWrapStyle =
    users && users.length > 0 ? { minHeight: 0, paddingBottom: 0 } : {};

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-users"></Icon> User Management
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          {tab !== "smtp" && <Button
            variant="secondary" size="sm"
            onClick={() => {
              setChangePw((p) => ({ ...p, show: !p.show }));
              if (!changePw.show) setShowCreate(false);
            }}
          >
            <Icon className="ti ti-key"></Icon> Change My Password
          </Button>}
          {(isAdmin && tab !== "smtp") &&  (
            <Button
              variant="primary" size="sm"
              onClick={() => {
                if (!showCreate) resetCreateForm();
                setShowCreate(!showCreate);
                if (!showCreate) setChangePw((p) => ({ ...p, show: false }));
              }}
            >
              <Icon className={`ti ${showCreate ? "ti-x" : "ti-plus"}`}></Icon>{" "}
              {showCreate ? "Cancel" : "New User"}
            </Button>
          )}
        </div>
      </div>

      {myRole === "superadmin" && (
        <SegmentedControl
          ariaLabel="User management sections"
          style={{ marginBottom: 20 }}
          value={tab}
          options={[
            { value: "users", label: "Users" },
            { value: "smtp", label: "System Email" },
          ]}
          onChange={(next) => {
            setTab(next);
            if (next === "smtp") {
              setSmtpResult(null);
              if (!smtp) loadSmtp();
            }
          }}
        />
      )}

      {tab === "users" && (
        <>
          {changePw.show && (
            <div
              className="card"
              style={{ padding: 20, marginBottom: 16, maxWidth: 480 }}
            >
              <h3
                style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: 16 }}
              >
                <Icon
                  className="ti ti-key"
                  style={{ color: "var(--accent)", marginRight: 6 }}
                ></Icon>{" "}
                Change Password
              </h3>
              <form onSubmit={selfChangePassword}>
                <FormField label="Current Password *" style={{ marginBottom: 12 }}>
                  <PasswordInput
                    required
                    autoComplete="current-password"
                    value={changePw.current?.value}
                    onChange={(e) =>
                      setChangePw((p) => ({
                        ...p,
                        current: { ...p?.current, value: e.target?.value },
                      }))
                    }
                  />
                </FormField>
                <FormField label="New Password *" style={{ marginBottom: 12 }}>
                  <PasswordInput
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={changePw.newPw?.value}
                    onChange={(e) =>
                      setChangePw((p) => ({
                        ...p,
                        newPw: { ...p?.newPw, value: e.target?.value },
                      }))
                    }
                  />
                </FormField>
                <FormField label="Confirm New Password *" style={{ marginBottom: 16 }}>
                  <PasswordInput
                    required
                    autoComplete="new-password"
                    value={changePw.confirm?.value}
                    onChange={(e) =>
                      setChangePw((p) => ({
                        ...p,
                        confirm: { ...p?.confirm, value: e.target?.value },
                      }))
                    }
                  />
                </FormField>
                {changePw.newPw.value &&
                  changePw.confirm.value &&
                  changePw.newPw.value === changePw.confirm.value && (
                    <div
                      role="status"
                      style={{
                        marginTop: -8,
                        marginBottom: 16,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--success)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <Icon
                        className="ti ti-check"
                        style={{ fontSize: "1.125rem", color: "var(--success)" }}
                      />
                      <span>Passwords match</span>
                    </div>
                  )}
                <Button variant="primary" type="submit">
                  <Icon className="ti ti-check"></Icon> Update Password
                </Button>
              </form>
            </div>
          )}
          {/* {isSmtpConfigured &&  <div className="alert-banner info" style={{ marginBottom: 14 }}><Icon className="ti ti-info-circle"></Icon> DDL queue not available. This is normal for single-node setups without distributed_ddl_queue.</div>} */}

          {!isSmtpConfigured && myLevel === ROLE_LEVEL["superadmin"]&&(
            <Notice tone="info" icon="ti-info-circle" style={{ marginBottom: 14 }}>
              SMTP is not configured. Email notifications are disabled. Copy
              the setup link from this page and send it to the user.
            </Notice>
          )}
          {setupURL && (
            <div
              className="setup-url-card"
              style={{
                marginBottom: 20,
                padding: 20,
                border: "1px solid var(--border-default)",
                borderRadius: 12,
                background: "var(--bg-surface)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      flexShrink: 0,
                    }}
                  >
                    <Icon className="ti ti-link" style={{ fontSize: "1.375rem" }} />
                  </div>

                  <div>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: "1rem",
                        fontWeight: 650,
                        color: "var(--text-primary)",
                      }}
                    >
                      Password Setup Link
                    </h4>

                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      Share this secure link with the user to set their
                      password.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary" size="sm"
                  onClick={handleCloseSetupURL}
                  aria-label="Close setup URL"
                  title="Close"
                  style={{ flexShrink: 0 }}
                >
                  <Icon className="ti ti-x" />
                </Button>
              </div>

              <label
                htmlFor="setup-password-url"
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  marginBottom: 7,
                  color: "var(--text-primary)",
                }}
              >
                Setup URL
              </label>

              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Input
                  id="setup-password-url"
                  type="text"
                  readOnly
                  value={setupURL}
                  onFocus={(e) => e.target.select()}
                  aria-label="Password setup URL"
                  style={{
                    flex: "1 1 280px",
                    minWidth: 0,
                    height: 40,
                    fontSize: "0.8125rem",
                    borderRadius: 8,
                    background: "var(--input-bg)",
                    fontFamily: "var(--font-code)",
                  }}
                />

                <Button
                  variant="primary" size="sm"
                  type="button"
                  onClick={handleCopySetupURL}
                  style={{ borderRadius: 8 }}
                >
                  <Icon
                    className={setupURLCopied ? "ti ti-check" : "ti ti-copy"}
                  />
                  {setupURLCopied ? "Copied" : "Copy URL"}
                </Button>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--color-info-bg)",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  lineHeight: 1.6,
                }}
              >
                <Icon
                  className="ti ti-shield-lock"
                  style={{
                    fontSize: "1rem",
                    color: "var(--color-info)",
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                />
                <span>
                  This link grants access to password setup. Share it securely
                  with the intended user and avoid posting it in public
                  channels.
                </span>
              </div>
            </div>
          )}

          {showCreate && isAdmin && (
            <form
              onSubmit={createUser}
              className="card"
              style={{ padding: 20, marginBottom: 16 }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <FormField label="Username *">
                  <Input
                    required
                    value={form.username}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, username: e.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Email *">
                  <Input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                    placeholder="For password email"
                  />
                </FormField>
                <FormField label="Role">
                  <Select
                    className="form-select"
                    value={form.role}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, role: e.target.value }))
                    }
                  >
                    {creatableRoles().map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  marginBottom: 12,
                }}
              >
                A random password will be generated for first login. If email is
                provided and SMTP is configured in .env, the password will be
                emailed.
              </p>
              <Button variant="primary" type="submit">
                <Icon className="ti ti-plus"></Icon> Create User
              </Button>
            </form>
          )}

          <div className="data-table-wrap dt-single" style={tableWrapStyle}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Last Login</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const targetLevel = ROLE_LEVEL[u.role] || 0;
                  // These are the same rules as on the server. Role changes and deletes are only for
                  // users below your own level. A superadmin can also reset another superadmin.
                  const canManage = isAdmin && targetLevel < myLevel;
                  // No user resets their own password here. "Change My Password" does that.
                  const isOwnRow = u.username === auth?.username;
                  const canResetPassword =
                    !isOwnRow && (canManage || myRole === "superadmin");
                  const rolesForTarget = assignableRoles(u.role);
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className="user-cell">
                          <span className="avatar" aria-hidden="true">
                            {String(u.username || "?").slice(0, 2).toUpperCase()}
                          </span>
                          <span className="user-cell-name">{u.username}</span>
                          {isOwnRow && <span className="user-cell-you">(you)</span>}
                        </span>
                      </td>
                      <td>
                        {canManage && rolesForTarget.length > 0 ? (
                          <Select
                            className="form-select"
                            value={u.role}
                            onChange={(e) => {
                              if (e.target.value !== u.role)
                                setRoleChange({
                                  userId: u.id,
                                  username: u.username,
                                  fromRole: u.role,
                                  toRole: e.target.value,
                                });
                            }}
                            style={{
                              padding: "2px 6px",
                              fontSize: "0.75rem",
                              minWidth: 100,
                            }}
                          >
                            <option value={u.role}>{u.role}</option>
                            {rolesForTarget
                              .filter((r) => r !== u.role)
                              .map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                          </Select>
                        ) : (
                          <Badge tone={roleTone(u.role)}>{u.role}</Badge>
                        )}
                      </td>
                      <td>{u.email || "-"}</td>
                      <td>
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString()
                          : "-"}
                      </td>
                      <td style={{ verticalAlign: "middle", textAlign: "right" }}>
                        <RowMenu
                          label={u.username}
                          items={[
                            {
                              label: "Reset Password",
                              icon: "ti-key",
                              disabled: !canResetPassword || u.initUser,
                              onClick: () => resetPassword(u.id, u.initUser),
                            },
                            {
                              label: "Copy setup URL",
                              icon: "ti-link",
                              disabled: !canResetPassword || u.initUser,
                              onClick: () => reGenerateSetupURL(u?.id),
                            },
                            { divider: true },
                            {
                              label: "Delete",
                              icon: "ti-trash",
                              danger: true,
                              disabled: !canManage || u.initUser,
                              onClick: () => setDel(u.id),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: "center",
                        color: "var(--text-muted)",
                        padding: 24,
                      }}
                    >
                      No users.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "smtp" && smtpForm && (
        <div
          className="card"
          style={{
            padding: 24,
            margin: "0 auto",
            maxWidth: 900,
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon className="ti ti-mail" style={{ color: "var(--accent)" }} />
              System email
            </h3>

            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                margin: "6px 0 0",
              }}
            >
              Used for new account credentials and password reset codes.
              Separate from the SMTP on alert channels.
            </p>
          </div>

          <div
            style={{
              padding: "10px 12px",
              marginBottom: 20,
              borderRadius: 6,
              background: "var(--bg-subtle)",
              fontSize: "0.75rem",
            }}
          >
            Currently using:{" "}
            <strong>
              {smtp?.source === "database"
                ? "the configuration below"
                : "nothing. Password reset and credential emails are unavailable."}
            </strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "16px 20px",
            }}
          >
            <FormField label="SMTP host">
              <Input
                style={{ width: "100%" }}
                value={smtpForm.host}
                placeholder="smtp.example.com"
                onChange={(e) => {
                  setSmtpForm((p) => ({
                    ...p,
                    host: e.target.value,
                  }));
                  setSmtpResult(null);
                }}
              />
            </FormField>

            <FormField label="Port">
              <Input
                type="number"
                min="1"
                max="65535"
                style={{ width: "100%" }}
                value={smtpForm.port}
                placeholder="587"
                onChange={(e) => {
                  setSmtpForm((p) => ({
                    ...p,
                    port: e.target.value,
                  }));
                  setSmtpResult(null);
                }}
              />
            </FormField>

            <FormField label="Username">
              <Input
                style={{ width: "100%" }}
                value={smtpForm.user}
                placeholder="username@example.com"
                onChange={(e) => {
                  setSmtpForm((p) => ({
                    ...p,
                    user: e.target.value,
                  }));
                  setSmtpResult(null);
                }}
              />
            </FormField>

            <FormField label="Password">
              <PasswordInput
                autoComplete="new-password"
                value={smtpForm.password}
                placeholder={
                  smtp?.hasPassword
                    ? "Leave blank to keep current password"
                    : "Enter SMTP password"
                }
                onChange={(e) => {
                  setSmtpForm((p) => ({
                    ...p,
                    password: e.target.value,
                  }));
                  setSmtpResult(null);
                }}
              />
            </FormField>

            <FormField label="From address">
              <Input
                style={{ width: "100%" }}
                value={smtpForm.from}
                placeholder="CHOps <noreply@example.com>"
                onChange={(e) => {
                  setSmtpForm((p) => ({
                    ...p,
                    from: e.target.value,
                  }));
                  setSmtpResult(null);
                }}
              />
            </FormField>
            <ToggleSwitch  checked={smtpForm.secure}
                  onChange={(e) => {
                    setSmtpForm((p) => ({
                      ...p,
                      secure: e.target.checked,
                    }));
                    setSmtpResult(null);
                  }} label="Use TLS" info="( Recommended for secure SMTP connections)"/>
          </div>

          {!smtpFormReady() && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: 6,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                background: "var(--bg-subtle)",
              }}
            >
              {!smtpForm.host?.trim()
                ? "Enter an SMTP host to continue."
                : !smtpForm.from?.trim()
                  ? "Enter a from address to continue."
                  : smtpForm.user?.trim() &&
                      !smtpForm.password &&
                      !smtp?.hasPassword
                    ? "Enter the password for this username, or clear the username if the server needs no authentication."
                    : "Enter a port between 1 and 65535."}
            </div>
          )}

          {smtpResult && (
            <Notice
              tone={smtpResult.ok ? "info" : "danger"}
              icon={smtpResult.ok ? "ti-check" : "ti-alert-triangle"}
              style={{ marginTop: 16, fontSize: "0.75rem" }}
            >
              {smtpResult.message}
            </Notice>
          )}

          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: "1px solid var(--border-default)",
            }}
          >
            <div
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Test email
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-end",
              }}
            >
              <FormField label="Send a test email to" style={{
                  flex: 1,
                  marginBottom: 0,
                }}>
                <Input
                  style={{ width: "100%" }}
                  value={testTo}
                  placeholder="test@example.com"
                  onChange={(e) => setTestTo(e.target.value)}
                />
              </FormField>

              <Button
                variant="secondary" size="sm"
                disabled={smtpBusy || !smtpFormReady() || !testTo.trim()}
                onClick={() => sendTestEmail()}
              >
                <Icon className="ti ti-send" />
                Send test email
              </Button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <Button
              variant="secondary" size="sm"
              disabled={smtpBusy || !smtpFormReady()}
              onClick={() => testConnection()}
            >
              <Icon className="ti ti-plug-connected" />
              Test connection
            </Button>

            {smtp?.configured && (
              <Button
                variant="danger" size="sm"
                disabled={smtpBusy}
                onClick={() => deleteSmtp()}
              >
                <Icon className="ti ti-trash" />
                Delete configuration
              </Button>
            )}

            <Button
              variant="primary" size="sm"
              disabled={smtpBusy || !smtpFormReady()}
              onClick={() => saveSmtp()}
            >
              <Icon className="ti ti-device-floppy" />
              {smtpBusy ? "Working..." : "Save"}
            </Button>
          </div>

          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: "1px solid var(--border-default)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <strong
              style={{
                color: "var(--text-primary)",
                display: "block",
                marginBottom: 8,
              }}
            >
              If email stops working
            </strong>

            <p style={{ margin: "0 0 8px" }}>
              Delete the configuration above to stop the system email. CHOps
              then sends no setup links or reset codes. This takes effect at
              once, with no restart.
            </p>

            <p style={{ margin: 0 }}>
              If you cannot sign in at all, the super admin credentials in the
              server environment still work. See DISABLE_ENV_LOGIN.
            </p>
          </div>
        </div>
      )}

      {del && (
        <ConfirmModal
          title="Delete User"
          message="Delete this user?"
          onConfirm={() => deleteUser(del)}
          onCancel={() => setDel(null)}
          danger
        />
      )}
      {roleChange && (
        <ConfirmModal
          title="Change Role"
          message={`Change "${roleChange.username}" from ${roleChange.fromRole} to ${roleChange.toRole}?`}
          onConfirm={confirmRoleChange}
          onCancel={cancelRoleChange}
        />
      )}
    </div>
  );
}
