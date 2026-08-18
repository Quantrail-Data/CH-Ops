// SortableDataTable.jsx - virtualised table with sortable headers and row selection
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Separate from DataTable, which twenty pages use. Same CSS classes, so they match.

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Icon from "../common/Icon.jsx";

const VIRTUALIZE_ABOVE = 100;
const ESTIMATED_ROW_HEIGHT = 34;
// The virtualiser reports nothing until it has measured. Show a slice meanwhile.
const FALLBACK_ROWS = 60;

// Chevrons: the sort-* glyphs are not in the sprite and would draw a placeholder.
function SortIcon({ state }) {
  if (state === "asc") return <Icon className="ti ti-chevron-up" />;
  if (state === "desc") return <Icon className="ti ti-chevron-down" />;
  return <Icon className="ti ti-chevron-down" style={{ opacity: 0.45 }} />;
}

// cellRenderers is { [key]: (value, row) => node }, so rows keep raw sortable values.
export default function SortableDataTable({
  rows = [],
  columns = [],
  rowKey = "id",
  cellRenderers,
  actions,
  emptyMessage,
  variant = "single",
  maxHeight,
  // Parent owns the sort so the charts can reuse the sorted array.
  sort,
  onSortChange,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  onClickSetData,
  activeKey,
}) {
  const scrollRef = useRef(null);
  const [hoverKey, setHoverKey] = useState(null);

  const keyOf = useCallback(
    (row) => (typeof rowKey === "function" ? rowKey(row) : row[rowKey]),
    [rowKey],
  );

  const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);

  const virtualize = rows.length > VIRTUALIZE_ABOVE;

  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    measureElement: (el) => el?.getBoundingClientRect().height ?? ESTIMATED_ROW_HEIGHT,
    overscan: 12,
  });

  const virtualRows = virtualize ? virtualizer.getVirtualItems() : [];
  const unmeasured = virtualize && virtualRows.length === 0 && rows.length > 0;
  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const renderedRows = useMemo(() => {
    if (!virtualize) return rows.map((r, i) => [r, i]);
    if (unmeasured) return rows.slice(0, FALLBACK_ROWS).map((r, i) => [r, i]);
    return virtualRows.map((v) => [rows[v.index], v.index]);
  }, [rows, virtualize, unmeasured, virtualRows]);

  // Select-all covers the filtered rows, not the snapshot. Tooltip says how many.
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(keyOf(r)));
  const someVisibleSelected = !allVisibleSelected && rows.some((r) => selected.has(keyOf(r)));

  function toggleAll() {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (allVisibleSelected) rows.forEach((r) => next.delete(keyOf(r)));
    else rows.forEach((r) => next.add(keyOf(r)));
    onSelectionChange(next);
  }

  function toggleOne(key) {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  }

  function headerClick(col) {
    if (!col.sortable || !onSortChange) return;
    const isCurrent = sort?.key === col.key;
    // Numeric columns open descending. Nobody wants the smallest elapsed first.
    if (!isCurrent) onSortChange({ key: col.key, dir: col.numeric ? "desc" : "asc" });
    else onSortChange({ key: col.key, dir: sort.dir === "asc" ? "desc" : "asc" });
  }

  const wrapClass = `data-table-wrap${variant === "single" ? " dt-single" : variant === "fixed" ? " dt-fixed" : ""}`;
  const colSpan = columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0);

  const header = (
    <thead>
      <tr>
        {selectable && (
          <th style={{ width: 36, paddingRight: 0 }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected;
              }}
              onChange={toggleAll}
              aria-label={allVisibleSelected ? "Clear selection" : "Select all listed queries"}
              title={allVisibleSelected ? "Clear selection" : `Select all ${rows.length} listed`}
              style={{ cursor: "pointer" }}
            />
          </th>
        )}
        {columns.map((col) => {
          const state = sort?.key === col.key ? sort.dir : null;
          return (
            <th
              key={col.key}
              onClick={() => headerClick(col)}
              style={{
                width: col.width,
                cursor: col.sortable ? "pointer" : "default",
                textAlign: col.numeric ? "right" : "left",
                userSelect: "none",
                whiteSpace: "nowrap",
                color: state ? "var(--accent)" : undefined 
              }}
              title={col.sortable ? `Sort by ${col.label.toLowerCase()}` : undefined}
              aria-sort={state === "asc" ? "ascending" : state === "desc" ? "descending" : undefined}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: col.numeric ? "flex-end" : "flex-start",
                  gap: 4,
                  width: "100%",
                }}
              >
                {col.label}
                {col.sortable && <SortIcon state={state} />}
              </span>
            </th>
          );
        })}
        {actions && <th style={{ whiteSpace: "nowrap" }}>Actions</th>}
      </tr>
    </thead>
  );

  if (!rows.length) {
    return (
      <div className={wrapClass} style={{ minHeight: 80 }}>
        <table className="data-table" >
          {header}
          <tbody></tbody>
        </table>
        <div className="empty-state" style={{ padding: "32px 16px" }}>
          <Icon className="ti ti-inbox"></Icon>
          <p>{emptyMessage || "No data found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={wrapClass}
      ref={scrollRef}
      style={{
        maxHeight: maxHeight ?? (virtualize ? "60vh" : undefined),
        ...(maxHeight || virtualize ? { overflow: "auto" } : null),
        position: "relative",
      }}
    >
      <table className="data-table">
        {header}
        <tbody>
          {virtualize && padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          )}

          {renderedRows.map(([row, index]) => {
            const key = keyOf(row);
            const isActive = activeKey != null && key === activeKey;
            const isSelected = selected.has(key);
            return (
              <tr
                key={key ?? index}
                data-index={index}
                ref={virtualize && !unmeasured ? virtualizer.measureElement : undefined}
                onClick={() => {
                  if(onRowClick) onRowClick(row); 
                  if(onClickSetData) onClickSetData(row)}}
                onMouseEnter={() => setHoverKey(key)}
                onMouseLeave={() => setHoverKey(null)}
                style={{
                  cursor: onRowClick ? "pointer" : undefined,
                  background: isActive
                    ? "var(--accent-subtle, rgba(99,102,241,0.14))"
                    : isSelected
                      ? "var(--accent-subtle, rgba(99,102,241,0.07))"
                      : undefined,
                }}
              >
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()} style={{ paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(key)}
                      aria-label={`Select query ${key}`}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                )}

                {columns.map((col) => {
                  const raw = row[col.key];
                  const renderer = cellRenderers && cellRenderers[col.key];
                  return (
                    <td
                      key={col.key}
                      style={{
                        textAlign: col.numeric ? "right" : "left",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: col.numeric ? "tabular-nums" : undefined,
                      }}
                    >
                      {renderer ? renderer(raw, row, { hovered: hoverKey === key }) : (raw ?? "")}
                    </td>
                  );
                })}

                {actions && (
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            );
          })}

          {virtualize && padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
