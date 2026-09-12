// Modal - base dialog, promoted out of ConfirmModal.jsx so every hand-rolled
// modal has a real primitive to migrate onto.
//
// Reuses the exact .modal-overlay/.modal-box classes and focus/escape/
// overlay-click mechanics ConfirmModal already proved out - this is a
// behavior-preserving extraction, not a redesign. `style` is an escape hatch
// for a box that needs sizing beyond the four presets (e.g. a wide grid that
// scrolls instead of growing past the viewport) - it merges over the size's
// maxWidth rather than replacing the mechanics.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useEffect } from "react";

const SIZE_PX = { sm: 440, md: 560, lg: 720, xl: 940 };

export default function Modal({
  open = true,
  title,
  onClose,
  size = "sm",
  footer,
  closeOnOverlayClick = true,
  zIndex,
  style,
  children,
  ...rest
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      style={zIndex ? { zIndex } : undefined}
      onClick={closeOnOverlayClick ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div
        className="modal-box"
        style={{ maxWidth: SIZE_PX[size], ...style }}
        onClick={(e) => e.stopPropagation()}
        {...rest}
      >
        {title && (
          <h3 id="modal-title" style={{ marginBottom: 12, fontSize: 18 }}>
            {title}
          </h3>
        )}
        {children}
        {footer && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
