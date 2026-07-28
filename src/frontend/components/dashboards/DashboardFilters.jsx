// DashboardFilters.jsx - the "Chart filters" bar above a dashboard.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import ParamInput from "../common/ParamInput.jsx";
import { labelFor, isHidden, orderFilters, hasValue }
  from "../../utils/dashboardParams.js";

export default function DashboardFilters({
  filters,
  settings,
  draft,
  applied,
  onChange,
  onApply,
  onReset,
  onHoverFilter,
  hoveredFilter,
  conflicts = [],
  canEdit = false,
  onOpenSettings,
}) {
  const [open, setOpen] = useState(true);

  const visible = useMemo(
    () => orderFilters(filters, settings).filter((f) => !isHidden(f.name, settings)),
    [filters, settings],
  );

  // Compared against the applied values, not against the defaults: the question
  // is whether what is on screen still matches what is shown.
  const dirty = useMemo(
    () => visible.some((f) => (draft[f.name] ?? "") !== (applied[f.name] ?? "")),
    [visible, draft, applied],
  );

  const needingValue = useMemo(
    () => visible.filter((f) => f.requiredBy.length > 0 && !hasValue(draft[f.name])).length,
    [visible, draft],
  );

  if (conflicts.length) {
    return (
      <div className="alert-banner danger" style={{ marginBottom: 12 }}>
        <Icon className="ti ti-alert-circle" />
        <div>
          <strong>This dashboard's filters cannot be built.</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {conflicts.map((c, i) => (
              <li key={i} style={{ fontSize: "13px" }}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (!visible.length) return null;

  // Enter applies from any control. Reaching for a button after typing is the
  // thing people dislike about Apply buttons.
  function onKeyDown(e) {
    if (e.key === "Enter" && dirty) {
      e.preventDefault();
      onApply();
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderBottom: open ? "1px solid var(--border-default)" : "none",
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((v) => !v)}
          title={open ? "Hide filters" : "Show filters"}
          aria-expanded={open}
          style={{ padding: "2px 6px" }}
        >
          <Icon className={`ti ti-chevron-${open ? "down" : "right"}`} style={{ fontSize: 16 }} />
        </button>

        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: "14px" }}>
          <Icon className="ti ti-filter" style={{ fontSize: 16 }} />
          Chart filters
        </span>

        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {visible.length}
          {needingValue > 0 && (
            <span style={{ color: "var(--color-warning, #d98324)" }}>
              {` \u00b7 ${needingValue} needs a value`}
            </span>
          )}
        </span>

        {dirty && (
          <span
            style={{ fontSize: "12px", color: "var(--color-warning, #d98324)" }}
            title="The charts below still show the previously applied filters"
          >
            <Icon className="ti ti-alert-triangle" style={{ fontSize: 13 }} /> Out of date
          </span>
        )}

        {canEdit && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onOpenSettings}
            title="Filter settings: labels, order, defaults, visibility"
            style={{ marginLeft: "auto" }}
          >
            <Icon className="ti ti-adjustments" /> Filter settings
          </button>
        )}
      </div>

      {open && (
        <div style={{ padding: "12px 14px" }} onKeyDown={onKeyDown}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
              alignItems: "end",
            }}
          >
            {visible.map((f) => {
              // Required by at least one chart, and currently blank. A warning
              // rather than an error: nothing is broken, a value is missing.
              const needed = f.requiredBy.length > 0 && !hasValue(draft[f.name]);
              const isHovered = hoveredFilter === f.name;
              return (
                <label
                  key={f.name}
                  onMouseEnter={() => onHoverFilter?.(f.name)}
                  onMouseLeave={() => onHoverFilter?.(null)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minWidth: 0,
                    padding: 6,
                    borderRadius: 6,
                    background: isHovered ? "var(--bg-sunken)" : "transparent",
                    transition: "background 0.12s var(--ease, ease)",
                  }}
                  title={
                    f.requiredBy.length
                      ? `${f.name}:${f.type} - required by ${f.requiredBy.length} chart${f.requiredBy.length > 1 ? "s" : ""}`
                      : `${f.name}:${f.type} - used by ${f.charts.length} chart${f.charts.length > 1 ? "s" : ""}`
                  }
                >
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      lineHeight: 1.3,
                    }}
                  >
                    {labelFor(f.name, settings)}
                    {f.requiredBy.length > 0 && (
                      <span
                        style={{ color: needed ? "var(--color-warning, #d98324)" : "var(--text-muted)" }}
                        title="Required"
                      >
                        {" *"}
                      </span>
                    )}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <ParamInput
                      param={f}
                      value={draft[f.name] ?? ""}
                      onChange={(v) => onChange(f.name, v)}
                      invalid={needed}
                      fullWidth
                    />
                  </div>
                </label>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            <button
              className="btn btn-secondary btn-sm"
              onClick={onReset}
              title="Return every filter to its default"
            >
              <Icon className="ti ti-refresh" /> Reset
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={onApply}
              disabled={!dirty}
              title={dirty ? "Re-run the affected charts" : "Nothing has changed"}
            >
              <Icon className="ti ti-check" /> Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
