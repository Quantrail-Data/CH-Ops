// SelectMenu.jsx - Portal-based popup shared by Select and MultiSelect.
//
// The option list is rendered into document.body so it escapes every ancestor
// stacking context and overflow:hidden/auto clip. An in-flow, absolutely
// positioned list cannot guarantee it floats above all page chrome (toolbars,
// sticky headers, sibling form fields), which is exactly the bug this fixes.
//
// Position is fixed and computed from the anchor's rect when the menu opens. A
// page scroll or a window resize closes the menu, since a fixed-position panel
// would otherwise drift away from its anchor; scrolling within the menu's own
// list is ignored so long option lists stay usable.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Anchor the panel to the control, flipping above it when there is little room
// below and more above.
function computeStyle(anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  const flipUp = window.innerHeight - r.bottom < 260 && r.top > 260;
  const style = {
    position: "fixed",
    left: Math.round(r.left),
    minWidth: Math.round(r.width),
    zIndex: 4000,
  };
  if (flipUp) style.bottom = Math.round(window.innerHeight - r.top + 4);
  else style.top = Math.round(r.bottom + 4);
  return style;
}

export default function SelectMenu({
  anchorRef, open, onRequestClose, listRef, className = "", children, ...rest
}) {
  const elRef = useRef(null);
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return undefined;
    }
    const el = anchorRef.current;
    if (!el) return undefined;
    setStyle(computeStyle(el));

    // A page scroll or resize detaches a fixed menu from its anchor, so close.
    // Scrolling inside the menu's own list (elRef) must NOT close it.
    const onScroll = (e) => {
      if (elRef.current && elRef.current.contains(e.target)) return;
      onRequestClose?.();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, anchorRef, onRequestClose]);

  if (!open || !style) return null;

  return createPortal(
    <ul
      ref={(node) => {
        elRef.current = node;
        if (listRef) listRef.current = node;
      }}
      className={`cui-select-menu ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </ul>,
    document.body,
  );
}
