// ConfirmModal - Reusable confirmation dialog with keyboard support
//
// A modal dialog that asks the user to confirm destructive or important
// actions before proceeding. Supports danger mode (red confirm button),
// disabled state, and auto-focus on the confirm button.
// Used across the app for delete operations, role changes, and other irreversible actions.
//
// A thin wrapper over ui/Modal + ui/Button - the overlay/box/focus/escape
// mechanics live in Modal now, so every other hand-rolled modal in the app
// has the same primitive to migrate onto.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useEffect, useRef } from "react";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";

export default function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  danger = false,
  confirmDisabled = false,
  cancelHide=false
}) {
  const confirmBtn = useRef(null);

  useEffect(() => {
    confirmBtn.current?.focus();
  }, []);

  return (
    <Modal
      open
      title={title}
      onClose={onCancel}
      footer={
        <>
          {!cancelHide && (
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            ref={confirmBtn}
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmText}
          </Button>
        </>
      }
    >
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
    </Modal>
  );
}
