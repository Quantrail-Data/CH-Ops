// ForceChangePassword - Mandatory first-login password change gate
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useState } from "react";
import Icon from "../common/Icon.jsx";
import { useAuth, useTheme } from "../../App.jsx";
import { apiFetch } from "../../utils/api.js";

export default function ForceChangePassword() {
  const { auth, login, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword.length > 256) {
      setError("New password must not exceed 256 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // Backend already cleared must_change_password; mirror that locally so
      // this screen unmounts and MainLayout renders without a fresh login.
      login({ ...auth, mustChangePassword: false });
    } catch (err) {
      setError(err.message || "Failed to change password.");
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-page)",
      }}
    >
      <button
        className="btn btn-ghost btn-sm"
        onClick={toggleTheme}
        style={{ position: "absolute", top: "16px", right: "16px", zIndex: 9999 }}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        <Icon className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"}`} style={{ fontSize: "20px" }}></Icon>
      </button>

      <div className="card" style={{ padding: 32, width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Icon className="ti ti-shield-lock" style={{ fontSize: 32, color: "var(--accent)" }}></Icon>
          <h4 style={{ margin: "12px 0 4px" }}>Change Your Password</h4>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Your account requires a password change before you can continue
            (first login, or a password reset by an administrator).
          </p>
        </div>

        {error && (
          <div className="alert-banner danger" style={{ marginBottom: 16 }}>
            <Icon className="ti ti-alert-circle"></Icon> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Current Password</label>
            <div style={{ width: "100%", position: "relative" }}>
              <input
                className="form-input"
                style={{ width: "100%", paddingRight: 35 }}
                type={showCurrentPw ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
              />
              <div
                className="password-eye"
                style={{ position: "absolute", right: 15, top: "22%", cursor: "pointer" }}
                title={showCurrentPw ? "hide" : "show"}
                onClick={() => setShowCurrentPw(!showCurrentPw)}
              >
                {showCurrentPw ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
              </div>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">New Password</label>
            <div style={{ width: "100%", position: "relative" }}>
              <input
                className="form-input"
                style={{ width: "100%", paddingRight: 35 }}
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <div
                className="password-eye"
                style={{ position: "absolute", right: 15, top: "22%", cursor: "pointer" }}
                title={showNewPw ? "hide" : "show"}
                onClick={() => setShowNewPw(!showNewPw)}
              >
                {showNewPw ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
              </div>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Confirm New Password</label>
            <div style={{ width: "100%", position: "relative" }}>
              <input
                className="form-input"
                style={{ width: "100%", paddingRight: 35 }}
                type={showConfirmPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <div
                className="password-eye"
                style={{ position: "absolute", right: 15, top: "22%", cursor: "pointer" }}
                title={showConfirmPw ? "hide" : "show"}
                onClick={() => setShowConfirmPw(!showConfirmPw)}
              >
                {showConfirmPw ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", height: 42, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {loading ? "Changing..." : "Change Password & Continue"}
          </button>
        </form>

        <button
          className="btn btn-ghost btn-sm"
          onClick={logout}
          style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          Log out instead
        </button>
      </div>
    </div>
  );
}
