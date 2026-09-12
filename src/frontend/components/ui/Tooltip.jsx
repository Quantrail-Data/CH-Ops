// Tooltip - generic hover/focus tooltip, generalizing InfoTip.jsx's
// portal-based positioning to wrap arbitrary children instead of a hardcoded
// info icon. InfoTip itself is left as-is for its specific multi-part
// (what/read/formula/serverNotes) content shape; use Tooltip for a plain
// label or short piece of text on anything.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ui.css";

const BUBBLE_WIDTH = 280;
const GAP = 8;
const EDGE = 8;

export default function Tooltip({ content, children, placement = "auto" }) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, above: false });

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const left = Math.min(
      Math.max(EDGE, rect.left + rect.width / 2 - BUBBLE_WIDTH / 2),
      Math.max(EDGE, window.innerWidth - BUBBLE_WIDTH - EDGE),
    );

    const roomBelow = window.innerHeight - rect.bottom;
    const above = placement === "top" || (placement === "auto" && roomBelow < 120 && rect.top > roomBelow);

    setPos({ top: above ? rect.top - GAP : rect.bottom + GAP, left, above });
  }, [placement]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!content) return children;

  return (
    <>
      <span
        ref={triggerRef}
        className="tooltip-trigger"
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            role="tooltip"
            className="tooltip-bubble"
            style={{
              top: pos.top,
              left: pos.left,
              width: BUBBLE_WIDTH,
              transform: pos.above ? "translateY(-100%)" : "none",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
