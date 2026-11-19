// modal.jsx - The CHOps modal and drawer, on the Base UI Dialog that shadcn/ui uses.
//
// The look is the Midnight .modal-overlay, .modal-box and .drawer classes in
// global.css, so modals look as before. The behavior comes from the dialog:
// focus moves into the modal and stays there, Escape and a click on the
// backdrop close it (only when onClose is given), and focus goes back to
// the opener when it closes. Screen readers announce it as a dialog.
//
//   {open && (
//     <Modal onClose={() => setOpen(false)} label="Add a certificate authority" style={{ maxWidth: 640 }}>
//       ...
//     </Modal>
//   )}
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";

export function Modal({
  onClose,
  closeOnBackdrop = true,
  boxRef,
  label,
  kind = "modal",
  className,
  style,
  overlayClassName,
  overlayStyle,
  children,
}) {
  // Without onClose the modal is not dismissable: the page closes it itself,
  // as the old modals without an overlay click did. closeOnBackdrop={false}
  // keeps Escape but ignores a click on the backdrop (long forms).
  function onOpenChange(nextOpen) {
    if (!nextOpen && onClose) onClose();
  }

  const isDrawer = kind === "drawer";
  return (
    <DialogPrimitive.Root open onOpenChange={onOpenChange} disablePointerDismissal={!onClose || !closeOnBackdrop}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn("modal-overlay", isDrawer && "drawer-overlay", overlayClassName)}
          style={overlayStyle}
        />
        <DialogPrimitive.Popup
          ref={boxRef}
          aria-label={label}
          className={cn(
            isDrawer
              ? "drawer"
              : "modal-box tw:fixed tw:top-1/2 tw:left-1/2 tw:max-h-[90vh] tw:-translate-x-1/2 tw:-translate-y-1/2 tw:overflow-auto",
            "tw:outline-none",
            className,
          )}
          style={{ zIndex: (overlayStyle?.zIndex ?? 10000) + 1, ...style }}
        >
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
