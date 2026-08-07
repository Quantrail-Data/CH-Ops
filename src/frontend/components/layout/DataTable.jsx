// DataTable - Tabular data renderer with complex cell expansion
// The primary table component for displaying query results and tabular data
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited


import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import Icon from "../common/Icon.jsx";

import darkLogo from "../../assets/chops-dark.svg"
import lightLogo from "../../assets/chops-light.svg"
import { useTheme } from "../../App.jsx";

function isComplexValue(v) {
  return v !== null && typeof v === "object"; // arrays included
}

// Safe JSON stringify that never throws and tolerates BigInt.
function safeStringify(v, pretty = false) {
  try {
    return JSON.stringify(
      v,
      (_k, val) => (typeof val === "bigint" ? val.toString() : val),
      pretty ? 2 : undefined,
    );
  } catch {
    // Should be unreachable for JSON.parse output (no cycles), but stay safe.
    try {
      return String(v);
    } catch {
      return "";
    }
  }
}

// Text shown for a primitive cell.
function formatPrimitive(v) {
  if (v === null || v === undefined) return ""; // Nullable -> blank
  if (typeof v === "boolean") return v ? "true" : "false";
  // string, number, bigint -> as-is (String() is precision-safe for these)
  return String(v);
}

// Compact one-line preview for a complex cell (collapsed state).
function complexPreview(v) {
  if (Array.isArray(v)) {
    if (v.length === 0) return "[ ]";
    return safeStringify(v);
  }
  // plain object / Map
  const keys = Object.keys(v);
  if (keys.length === 0) return "{ }";
  return safeStringify(v);
}

// Short human label describing the shape, used in the modal title.
function shapeLabel(v) {
  if (Array.isArray(v)) {
    const n = v.length;
    return `${n} item${n === 1 ? "" : "s"}`;
  }
  const n = Object.keys(v).length;
  return `${n} field${n === 1 ? "" : "s"}`;
}

// Render a value INSIDE the inner table (depth 1). Nested arrays/objects are
// shown as compact JSON rather than recursing.
function innerCellText(v) {
  if (isComplexValue(v)) return safeStringify(v);
  return formatPrimitive(v);
}

/* Inner views for the modal (tiered by the value's actual shape) */

// Array of plain objects -> table with the UNION of keys across all elements
// (so heterogeneous objects, e.g.
function ArrayOfObjectsTable({ arr }) {
  const keys = [];
  const seen = new Set();
  for (const obj of arr) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj)) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
  }

  return (
    <table className="data-subtable">
      <thead>
        <tr>
          <th className="dst-idx">#</th>
          {keys.map((k) => (
            <th key={k}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {arr.map((obj, i) => (
          <tr key={i}>
            <td className="dst-idx">{i}</td>
            {keys.map((k) => (
              <td key={k}>
                {obj && typeof obj === "object" && !Array.isArray(obj)
                  ? innerCellText(obj[k])
                  : ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Array of primitives (or mixed / array-of-arrays) -> index + value list.
function ArrayList({ arr }) {
  return (
    <table className="data-subtable">
      <thead>
        <tr>
          <th className="dst-idx">#</th>
          <th>value</th>
        </tr>
      </thead>
      <tbody>
        {arr.map((v, i) => (
          <tr key={i}>
            <td className="dst-idx">{i}</td>
            <td>{innerCellText(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Object / Map -> two-column key/value table.
function KeyValueTable({ obj }) {
  const keys = Object.keys(obj);
  return (
    <table className="data-subtable">
      <thead>
        <tr>
          <th>key</th>
          <th>value</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td className="dst-key">{k}</td>
            <td>{innerCellText(obj[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Decide which inner view a complex value should use.
function ComplexBody({ value }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <div className="dst-empty">(empty array)</div>;
    }
    // Every element a plain (non-array) object -> object table.
    const allPlainObjects = value.every(
      (el) => el && typeof el === "object" && !Array.isArray(el),
    );
    if (allPlainObjects) return <ArrayOfObjectsTable arr={value} />;
    // Otherwise (primitives, arrays, or mixed) -> index/value list.
    return <ArrayList arr={value} />;
  }

  // Plain object / Map
  if (Object.keys(value).length === 0) {
    return <div className="dst-empty">(empty object)</div>;
  }
  return <KeyValueTable obj={value} />;
}

/* Modal for an expanded complex cell */

function ComplexCellModal({ columnName, value, onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copyJson() {
    const text = safeStringify(value, true);
    try {
      navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable - ignore */
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 1000 }}
    >
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 900, width: "95%" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
            gap: 8,
          }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <Icon className="ti ti-braces" style={{ color: "var(--accent)" }}></Icon>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {columnName}
            </span>
            <span
              style={{
                color: "var(--text-muted)",
                fontWeight: 500,
                fontSize: "13px",
                flexShrink: 0,
              }}
            >
              · {shapeLabel(value)}
            </span>
          </h3>

          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={copyJson}
              title="Copy as JSON"
            >
              <Icon
                className={`ti ${copied ? "ti-check" : "ti-copy"}`}
                style={
                  copied ? { color: "var(--color-success)" } : undefined
                }
              ></Icon>{" "}
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              title="Close"
            >
              <Icon className="ti ti-x"></Icon>
            </button>
          </div>
        </div>

        <div
          className="data-subtable-wrap"
          style={{ maxHeight: "60vh", overflow: "auto" }}
        >
          <ComplexBody value={value} />
        </div>
      </div>
    </div>
  );
}

/* DataTable @param {string} variant - 'single' = full remaining height, one scrollbar pair. 'fixed'  = max 720px (≈20 rows), own scrollbar pair. default  = auto (no constrained height). @param {object} cellRenderers - optional { [columnName]: (value, row) => ReactNode }. When a column has a renderer, its cell is rendered by that function instead of the default primitive/complex handling. Backward compatible: undefined leaves all existing behavior unchanged. */

export default function DataTable({
  rows = [],
  columns = [],
  actions,
  cellRenderers,
  maxRows = 1000,
  // Above this many rows the table renders only what is on screen.
  virtualizeAbove = 100,
  // A row is measured after it renders, so this only has to be close enough to
  // put the scrollbar roughly the right size before the first paint.
  estimatedRowHeight = 34,
  allowFullscreen = true,
  maxHeight,
  emptyMessage,
  onCellClick,
  variant,
  s_no = false,
  QuriozFlag = false,
  overView = false,
  whiteSpaceFlag = false,
  isShowLogo = false,
  minHeight = null
}) {
  const [expandedCells, setExpandedCells] = useState(new Set());
  const [selectedCell, setSelectedCell] = useState(null);
  // Which complex cell (if any) is open in the modal.
  const [modalCell, setModalCell] = useState(null); // { columnName, value } | null

  const { theme } = useTheme();

  const cols = columns.length
    ? columns
    : rows.length
      ? Object.keys(rows[0])
      : [];

  // Only the rows on screen are rendered, so the cost follows the window
  // rather than the size of the result.
  const scrollRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);

  const virtualize = rows.length > virtualizeAbove;

  // Without virtualisation the old ceiling still applies, because a short table
  // renders every row it is given.
  const shownRows = virtualize
    ? rows.length
    : Math.max(1, Math.min(maxRows, rows.length));
  const truncated = rows.length > shownRows;

  const visibleRows = useMemo(
    () => (virtualize ? rows : rows.slice(0, shownRows)),
    [rows, virtualize, shownRows],
  );

  const virtualizer = useVirtualizer({
    count: virtualize ? visibleRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    // Rows are not a fixed height: a cell can be expanded, and text can wrap.
    // Measuring after render keeps the scrollbar honest instead of guessing.
    measureElement: (el) => el?.getBoundingClientRect().height ?? estimatedRowHeight,
    overscan: 12,
  });

  const virtualRows = virtualize ? virtualizer.getVirtualItems() : [];

  // A virtualiser that has not measured a viewport yet returns nothing, and
  // rendering nothing means a blank table.
  const unmeasured = virtualize && virtualRows.length === 0 && rows.length > 0;
  const FALLBACK_ROWS = 60;
  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  // Escape leaves fullscreen. Registered only while it is open, so it cannot
  // swallow Escape from anything else on the page.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);


  // Primitive cell click: preserve existing behavior (toggle wrap + copy/toast).
  function handlePrimitiveClick(cellKey, value) {
    setExpandedCells((prev) => {
      const n = new Set(prev);
      n.has(cellKey) ? n.delete(cellKey) : n.add(cellKey);
      return n;
    });
    setSelectedCell(cellKey);
    // if (onCellClick) onCellClick(value);
  }

  // Complex cell click: open the modal. Do NOT fire onCellClick, so the
  // parent's copy-to-clipboard + toast does not collide with the expand action.
  function handleComplexClick(cellKey, columnName, value) {
    setSelectedCell(cellKey);
    setModalCell({ columnName, value });
  }

  const wrapClass = `data-table-wrap${variant === "single" ? " dt-single" : variant === "fixed" ? " dt-fixed" : ""
    }`;

  if (!rows.length) {
    return (
      <div className={wrapClass} style={{ minHeight: "80px" }}>
        <table className="data-table">
          <thead style={{ zIndex: QuriozFlag && 0 }}>
            <tr>
              {s_no && !QuriozFlag && <th>S.No</th>}

              {overView ? cols?.map((c) => {
                return <th key={c}>{c?.includes("fmt") ? c?.split("_")[0] : c}</th>
              }) : cols.map((c) => (
                <th key={c}>{c.replace(/_/g, " ")}</th>
              ))}


              {actions && <th>Actions</th>}
            </tr>
          </thead>

          <tbody></tbody>
        </table>

        {isShowLogo ? <div style={{ padding: "32px 16px", width: "", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "20rem" }}>
          <img style={{ width: "13rem", opacity: 0.3 }} src={theme === "dark" ? lightLogo : darkLogo} alt="" />
        </div>
          :
          <div className="empty-state" style={{ padding: "32px 16px" }}>
            <Icon className="ti ti-inbox"></Icon>
            <p>{emptyMessage || "No data found."}</p>
          </div>
        }
      </div>
    );
  }

  const table = (
    <div
      className={wrapClass + (fullscreen ? " data-table-fullscreen" : "")}
      ref={scrollRef}
      style={
        fullscreen
          ? {
            // Sized by the portal host below, not by the viewport directly.
            height: "100%",
            maxHeight: "none",
            overflow: "auto",
            background: "var(--bg-page)",
            border: 0,
            borderRadius: 0,
          }
          : {
            // A virtualised table cannot be sized by its content: it has to
            // scroll for there to be anything to virtualise.
            maxHeight:
              maxHeight ?? (virtualize ? "60vh" : QuriozFlag ? "15rem" : undefined),
            ...(maxHeight || virtualize ? { overflow: "auto" } : null),
            position: "relative",
            minHeight: minHeight ?? ""
          }
      }
    >
      <table className="data-table">
        <thead style={{ zIndex: QuriozFlag && 0 }}>
          <tr>
            {s_no && !QuriozFlag && <th>S.No</th>}

            {overView ? cols?.map((c) => {
              return <th key={c}>{c?.includes("fmt") ? c?.split("_")[0] : c}</th>
            }) : cols.map((c) => (
              <th key={c}>{c.replace(/_/g, " ")}</th>
            ))}

            {actions && <th>Actions</th>}

            {/* The fullscreen control lives in the header's rightmost cell
                rather than floating over the table. A floating button is inside
                the scroll container and slides away the moment you scroll; the
                header is sticky, so this one does not. */}
            {allowFullscreen && rows.length > 0 && (
              <th className="dt-fs-col" aria-label="">
                <button
                  type="button"
                  className="data-table-fs-btn"
                  onClick={() => setFullscreen((f) => !f)}
                  title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
                  aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  <Icon className={`ti ${fullscreen ? "ti-minimize" : "ti-maximize"}`} />
                </button>
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {/* Spacer above. Two empty rows stand in for everything scrolled
              past, which keeps the scrollbar and the row positions honest
              without those rows existing. */}
          {virtualize && padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={cols.length + (s_no ? 1 : 0) + (actions ? 1 : 0) + (allowFullscreen && rows.length > 0 ? 1 : 0)} style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          )}

          {(virtualize && !unmeasured
            ? virtualRows.map((v) => [visibleRows[v.index], v.index])
            : (unmeasured ? rows.slice(0, FALLBACK_ROWS) : visibleRows).map((r, i) => [r, i])
          ).map(([row, ri]) => (
            <tr
              key={ri}
              data-index={ri}
              ref={virtualize ? virtualizer.measureElement : undefined}
            >
              {s_no && <td>{ri + 1}</td>}

              {cols.map((c, ci) => {
                const key = `${ri}-${ci}`;
                const raw = row[c];

                // Custom per-column renderer (opt-in). Takes precedence over the
                // default primitive/complex handling and carries no click state.
                if (cellRenderers && cellRenderers[c]) {
                  return (
                    <td key={c} style={{ whiteSpace: "nowrap" }}>
                      {cellRenderers[c](raw, row)}
                    </td>
                  );
                }

                const complex = isComplexValue(raw);

                if (complex) {
                  return (
                    <td
                      key={c}
                      className={`dt-complex${selectedCell === key ? " cell-selected" : ""
                        }`}
                      onClick={() => handleComplexClick(key, c, raw)}
                      title="Click to expand"
                      style={{ whiteSpace: "nowrap", cursor: "pointer" }}
                    >
                      <span className="dt-complex-caret">▸</span>
                      <span className="dt-complex-preview">
                        {complexPreview(raw)}
                      </span>
                    </td>
                  );
                }

                // Primitive cell (unchanged behavior)
                const val = raw ?? "";
                return (
                  <td
                    key={c}
                    className={`${expandedCells.has(key) ? "expanded" : ""} ${selectedCell === key ? "cell-selected" : ""
                      }`}
                    onClick={() => handlePrimitiveClick(key, val)}
                    onDoubleClick={() => { typeof onCellClick === "function" && onCellClick(val) }}
                    style={{
                      whiteSpace: whiteSpaceFlag ? "pre" : (expandedCells.has(key) ? "normal" : "nowrap"),
                      wordWrap: "break-word",
                    }}
                  >
                    {formatPrimitive(raw)}
                  </td>
                );
              })}

              {actions && (
                <td
                  onClick={(e) => e.stopPropagation()}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {actions(row)}
                </td>
              )}
              {allowFullscreen && rows.length > 0 && <td className="dt-fs-col" />}
            </tr>
          ))}

          {virtualize && padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={cols.length + (s_no ? 1 : 0) + (actions ? 1 : 0) + (allowFullscreen && rows.length > 0 ? 1 : 0)} style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>

      {truncated && (
        <div
          style={{
            padding: "8px 14px",
            fontSize: "13px",
            color: "var(--text-muted)",
          }}
        >
          Showing {shownRows.toLocaleString()} of {rows.length.toLocaleString()} rows
        </div>
      )}

      {modalCell && (
        <ComplexCellModal
          columnName={modalCell.columnName}
          value={modalCell.value}
          onClose={() => setModalCell(null)}
        />
      )}
    </div>
  );

  // PORTALLED WHEN FULLSCREEN.
  if (!fullscreen) return table;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: "var(--bg-page)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {table}
    </div>,
    document.body,
  );
}
