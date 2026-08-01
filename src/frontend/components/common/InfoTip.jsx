// Copyright (C) 2026 Quantrail™ Data Private Limited
// Hover and focus tooltip for a single number or chart.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan


import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";

const BUBBLE_WIDTH = 320;
const GAP = 8;
const EDGE = 8;

/**
 * @param {string} what     one sentence saying what the number is
 * @param {string} read     how to interpret it, the part that teaches
 * @param {string} formula  rendered in monospace so the value is checkable
 * @param {string} unit     shown after the formula
 * @param {Array}  serverNotes  [{ name, text }] - ClickHouse's own description
 *                 of each raw metric the formula is built from. Ours explains
 *                 what to do about the number; the server's says what it counts,
 *                 and the two disagree often enough to be worth showing both.
 */
export default function InfoTip({ what, read, formula, unit, serverNotes = [] }) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, above: false });

  const spoken = [what, read].filter(Boolean).join(" ");
  const hasContent = Boolean(what || read || formula || serverNotes.length);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    // Clamp horizontally, so a tip in the right-hand column of a six-wide grid
    // does not run off the viewport.
    const left = Math.min(
      Math.max(EDGE, rect.left + rect.width / 2 - BUBBLE_WIDTH / 2),
      Math.max(EDGE, window.innerWidth - BUBBLE_WIDTH - EDGE),
    );


    const roomBelow = window.innerHeight - rect.bottom;
    const above = roomBelow < 220 && rect.top > roomBelow;

    setPos({ top: above ? rect.top - GAP : rect.bottom + GAP, left, above });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // A fixed bubble would visually detach from its trigger if the page moved
  // under it, so close rather than trying to follow.
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

  if (!hasContent) return null;

  return (
    <>
      <span
        ref={triggerRef}
        role="note"
        tabIndex={0}
        aria-label={spoken}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          cursor: "help",
          color: "var(--text-muted)",
          outline: "none",
          lineHeight: 1,
        }}
      >
        <Icon className="ti ti-info-circle" style={{ fontSize: 14 }} />
      </span>

      {open &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: BUBBLE_WIDTH,
              transform: pos.above ? "translateY(-100%)" : "none",
              zIndex: 10000,
              padding: "10px 12px",
              background: "var(--bg-page)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
              fontSize: "0.75rem",
              fontWeight: 400,
              lineHeight: 1.45,
              textAlign: "left",
              whiteSpace: "normal",
              pointerEvents: "none",
            }}
          >
            {what && <div style={{ marginBottom: read || formula ? 6 : 0 }}>{what}</div>}
            {read && <div style={{ marginBottom: formula ? 6 : 0, opacity: 0.85 }}>{read}</div>}
            {serverNotes.length > 0 && (
              <div
                style={{
                  marginBottom: formula ? 6 : 0,
                  paddingTop: 6,
                  borderTop: "1px solid var(--border-default)",
                  opacity: 0.8,
                }}
              >
                {serverNotes.map((note) => (
                  <div key={note.name} style={{ marginBottom: 3 }}>
                    <span style={{ fontFamily: "var(--font-code)", fontSize: "0.6875rem" }}>
                      {note.name}
                    </span>
                    {" - "}
                    {note.text}
                  </div>
                ))}
              </div>
            )}
            {formula && (
              <div
                style={{
                  fontFamily: "var(--font-code)",
                  fontSize: "0.6875rem",
                  opacity: 0.7,
                  wordBreak: "break-word",
                  paddingTop: 6,
                  borderTop: "1px solid var(--border-default)",
                }}
              >
                {formula}
                {unit ? `  [${unit}]` : ""}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
