// Copyright (C) 2026 Quantrail™ Data Private Limited
// ConfirmDialog.jsx - a confirmation that looks like the rest of the app.
// Built on the shadcn/ui AlertDialog (see ui/confirm-alert.jsx). Escape
// cancels and Enter confirms.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { ConfirmAlert } from "../ui/confirm-alert.jsx";

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
  // Enter confirms, as before. The AlertDialog handles Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onConfirm]);

  if (!open) return null;

  const isDanger = tone === "danger";
  const titleIcon = (
    <Icon
      className={isDanger ? "ti ti-alert-triangle" : "ti ti-help-circle"}
      style={{ color: isDanger ? "var(--color-danger)" : "var(--accent)" }}
    />
  );

  return (
    <ConfirmAlert
      title={title}
      titleIcon={titleIcon}
      message={message}
      confirmText={confirmLabel}
      cancelText={cancelLabel}
      danger={isDanger}
      size="sm"
      className="tw:w-[92%] tw:max-w-[460px] tw:data-[size=default]:max-w-[460px] tw:data-[size=default]:sm:max-w-[460px]"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {detail && (
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "8px 0 0" }}>
          {detail}
        </p>
      )}

      {sql && (
        <pre
          style={{
            marginTop: "1rem",
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
      )}
    </ConfirmAlert>
  );
}
