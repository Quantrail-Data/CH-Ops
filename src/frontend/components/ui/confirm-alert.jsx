// confirm-alert.jsx - The CHOps confirmation dialog, built on the shadcn
// AlertDialog. ConfirmModal and the editor ConfirmDialog both use it.
//
// Focus goes to the confirm button when the dialog opens. Escape cancels.
// A click outside does not close it: a confirmation needs a clear answer.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useRef } from "react";
import { cn } from "cn";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./alert-dialog.jsx";
import { Button } from "./index.jsx";

export function ConfirmAlert({
  open = true,
  title,
  titleIcon,
  message,
  children,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  confirmDisabled = false,
  hideCancel = false,
  size = "md",
  className,
  onConfirm,
  onCancel,
}) {
  const confirmButtonRef = useRef(null);

  function onOpenChange(nextOpen) {
    if (!nextOpen) onCancel?.();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        initialFocus={confirmButtonRef}
        className={cn(
          // The app keeps its own modal layer above the navbar and sidebar.
          "tw:z-[10001] tw:gap-0 tw:rounded-[var(--radius-lg)] tw:border tw:border-[var(--border-strong)] tw:bg-[var(--bg-surface)] tw:p-6 tw:shadow-[var(--shadow-lg)] tw:ring-0",
          "tw:w-[90%] tw:max-w-[440px] tw:data-[size=default]:max-w-[440px] tw:data-[size=default]:sm:max-w-[440px]",
          className,
        )}
      >
        <AlertDialogHeader className="tw:place-items-start tw:gap-0 tw:text-left">
          <AlertDialogTitle className="tw:mb-3 tw:flex tw:items-center tw:gap-2 tw:text-lg tw:font-bold tw:text-[var(--text-primary)]">
            {titleIcon}
            {title}
          </AlertDialogTitle>
          {message && (
            <AlertDialogDescription
              render={<div />}
              className="tw:text-left tw:text-sm tw:leading-relaxed tw:text-[var(--text-secondary)]"
            >
              {message}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <div className="tw:mt-5 tw:flex tw:justify-end tw:gap-2.5">
          {!hideCancel && (
            <Button variant="secondary" size={size} onClick={onCancel}>
              {cancelText}
            </Button>
          )}
          <Button
            ref={confirmButtonRef}
            variant={danger ? "danger" : "primary"}
            size={size}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmText}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
