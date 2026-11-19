// ConfirmModal - Reusable confirmation dialog with keyboard support
//
// A modal dialog that asks the user to confirm destructive or important
// actions before proceeding. Supports danger mode (red confirm button),
// disabled state, and focus on the confirm button. Built on the shadcn/ui
// AlertDialog: Escape cancels, and focus stays inside the dialog.
// Used across the app for delete operations, role changes, and other irreversible actions.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { ConfirmAlert } from "../ui/confirm-alert.jsx";

export default function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  danger = false,
  confirmDisabled = false,
  cancelHide = false,
}) {
  return (
    <ConfirmAlert
      title={title}
      message={message}
      confirmText={confirmText}
      danger={danger}
      confirmDisabled={confirmDisabled}
      hideCancel={cancelHide}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
