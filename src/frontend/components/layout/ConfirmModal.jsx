// ConfirmModal - Reusable confirmation dialog with keyboard support
//
// A modal dialog that asks the user to confirm destructive or important
// actions before proceeding. Supports danger mode (red confirm button),
// disabled state, and auto-focus on the confirm button.
// Used across the app for delete operations, role changes, and other irreversible actions.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useEffect, useRef } from "react";

export default function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  danger = false,
  confirmDisabled = false,
}) {
  const confirmBtn = useRef(null);

  useEffect(() => {
    confirmBtn.current?.focus();
    function handleKey(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3
          id="modal-title"
          style={{ marginBottom: "12px", fontSize: "18px" }}
        >
          {title}
        </h3>
        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: "20px",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
        <div
          style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
        >
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmBtn}
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
