// Pagination - new primitive, no prior usage pattern existed in the codebase
// (DataTable.jsx uses virtualization, not page-based pagination). Built from
// the same visual weight as .btn-ghost/.btn-sm; see ui.css for its classes.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import Icon from "../common/Icon.jsx";
import "./ui.css";

function pageRange(page, totalPages, siblingCount) {
  const range = [];
  const start = Math.max(1, page - siblingCount);
  const end = Math.min(totalPages, page + siblingCount);

  if (start > 1) {
    range.push(1);
    if (start > 2) range.push("…");
  }
  for (let p = start; p <= end; p++) range.push(p);
  if (end < totalPages) {
    if (end < totalPages - 1) range.push("…");
    range.push(totalPages);
  }
  return range;
}

export default function Pagination({ page, totalPages, onChange, siblingCount = 1 }) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button
        className="page-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <Icon name="chevron-left" />
      </button>

      {pageRange(page, totalPages, siblingCount).map((p, idx) =>
        p === "…" ? (
          <span key={`ellipsis-${idx}`} className="page-btn" style={{ cursor: "default" }}>
            …
          </span>
        ) : (
          <button
            key={p}
            className={`page-btn ${p === page ? "active" : ""}`}
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ),
      )}

      <button
        className="page-btn"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <Icon name="chevron-right" />
      </button>
    </div>
  );
}
