// Toast - Notification system with context provider and auto-dismiss
//
// Displays temporary messages for user actions (success, error, warning,
// info) through the shadcn/ui Sonner toaster. Components get the toast
// functions with the useToast() hook. Each toast closes on its own after a set
// time and has a close button. Used throughout the app for feedback on saves,
// deletes, query runs and API errors.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { createContext, useContext } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Toaster } from '../ui/sonner.jsx';

// The default is a working no-op rather than null.
//
// useToast() returning null meant any component rendered outside ToastProvider
// crashed on its first `toast.error(...)` - and that call is almost always in a
// catch block, so the crash replaced the error the user was meant to see. It
// also turned every such render into an unhandled promise rejection rather than
// a visible failure, which is a slow way to find out a provider is missing.
//
// A notification that quietly does nothing is the right degradation for a
// component mounted without its provider: the surrounding feature still works.
const NO_TOAST = Object.freeze({
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
});

const ToastContext = createContext(NO_TOAST);
export function useToast() { return useContext(ToastContext) ?? NO_TOAST; }

// Style guide: confirmations close after 4 s. Errors and warnings stay 5 s,
// since they usually need reading before they go.
const toast = Object.freeze({
  success: (message) => sonnerToast.success(message, { duration: 4000 }),
  error: (message) => sonnerToast.error(message, { duration: 5000 }),
  info: (message) => sonnerToast.info(message, { duration: 4000 }),
  warning: (message) => sonnerToast.warning(message, { duration: 5000 }),
});

export function ToastProvider({ children }) {
  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Top right, below the navbar, where the old toasts were. */}
      <Toaster
        position="top-right"
        closeButton
        offset={{ top: "calc(var(--navbar-height) + 12px)", right: "16px" }}
        toastOptions={{
          classNames: {
            toast: "tw:font-sans tw:text-[length:var(--text-sm)]",
            // The icon shows the status color, as before.
            success: "tw:[&_[data-icon]]:text-[var(--color-success)]",
            error: "tw:[&_[data-icon]]:text-[var(--color-danger)]",
            warning: "tw:[&_[data-icon]]:text-[var(--color-warning)]",
            info: "tw:[&_[data-icon]]:text-[var(--color-info)]",
          },
        }}
      />
    </ToastContext.Provider>
  );
}
