// OpenInMenu.jsx - per-row "Open in..." menu for a query_id
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Moved out of QueriesSection.jsx unchanged. Importing it back would be a cycle.

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../common/Icon.jsx";

// All three pages read ?qid= from the URL, so each link is /<route>?qid=<id>.
export const OPEN_IN_DESTINATIONS = [
  { key: "profiler", label: "Query Profiler", icon: "ti-flame", route: "tools/profiler" },
  { key: "pipeline", label: "Processors Profile", icon: "ti-hierarchy-2", route: "tools/pipeline" },
  { key: "metrics", label: "Query Metrics", icon: "ti-chart-line", route: "tools/metrics" },
];

// Popover is fixed-position so the table's overflow does not clip it.
export default function OpenInMenu({ queryId }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", close);
    };
  }, [open]);

  function toggle(e) {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) });
    setOpen((v) => !v);
  }

  function go(route) {
    navigate(`/${route}?qid=${encodeURIComponent(queryId)}`);
    setOpen(false);
  }

  return (
    <>
      <button ref={btnRef} className="btn btn-secondary btn-sm" onClick={toggle}>
        <Icon className="ti ti-external-link"></Icon> Open in...
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 1200,
            width: 210,
            height: "auto",
            maxHeight: "none",
            display: "flex",
            flexDirection: "column",
            padding: 4,
            background: "var(--glass-bg, rgba(24,28,38,0.85))",
            backdropFilter: "blur(12px) saturate(140%)",
            WebkitBackdropFilter: "blur(12px) saturate(140%)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.14))",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            overflow: "visible",
          }}
        >
          {OPEN_IN_DESTINATIONS.map((d) => (
            <button
              key={d.key}
              className="btn btn-ghost btn-sm"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                justifyContent: "flex-start",
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
              onClick={() => go(d.route)}
            >
              <Icon className={`ti ${d.icon}`}></Icon> {d.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
