// Copyright (C) 2026 Quantrail™ Data Private Limited
// ConfirmDialog.jsx - a confirmation that looks like the rest of the app.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import React, { useEffect, useRef } from "react";
import Icon from "../common/Icon.jsx";
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  tone = "default", // 'default' | 'danger'
  onConfirm,
  onCancel,
  sql
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    // No z-index override.
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-box"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, width: "92%" }}
      >
        <h3
          style={{
            fontSize: "0.9375rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <Icon
            className={tone === "danger" ? "ti ti-alert-triangle" : "ti ti-help-circle"}
            style={{ color: tone === "danger" ? "var(--color-danger)" : "var(--accent)" }}
          />
          {title}
        </h3>

        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary, var(--text-primary))", margin: 0 }}>
          {message}
        </p>

        {detail && (
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "8px 0 0" }}>
            {detail}
          </p>
        )}

        {sql && (
          <div style={{marginTop:"1rem"}}>
                          <pre
                            style={{
                              fontFamily: "var(--font-code)",
                              fontSize: "0.75rem",
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                              padding: "12px 6px",
                              background: "var(--bg-sunken)",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-default)",
                              maxHeight: 400,
                              overflow: "auto",
                              color: "var(--text-primary)",
                            }}
                          >
                            {sql.toUpperCase()}
                          </pre>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              marginTop: 12,
                              gap: 8,
                            }}
                          >
                          </div>
                        </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
