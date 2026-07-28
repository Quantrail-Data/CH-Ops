// DashboardSettings.jsx - presentation for a dashboard's discovered filters.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import ParamInput from "../common/ParamInput.jsx";
import { orderFilters } from "../../utils/dashboardParams.js";

export default function DashboardSettings({ filters, settings, onSave, onClose }) {
  const [draft, setDraft] = useState(() => {
    const seed = {};
    for (const f of orderFilters(filters, settings)) {
      const cur = settings?.[f.name] || {};
      seed[f.name] = {
        label: cur.label ?? "",
        order: Number.isFinite(cur.order) ? cur.order : "",
        default: cur.default ?? "",
        hidden: cur.hidden === true,
      };
    }
    return seed;
  });

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch(name, key, value) {
    setDraft((p) => ({ ...p, [name]: { ...p[name], [key]: value } }));
  }

  function save() {
    // Only persist what was actually set. Writing empty strings for every field
    // would turn "unconfigured" into "configured as blank", and the reader would
    // have to tell them apart.
    const out = {};
    for (const [name, v] of Object.entries(draft)) {
      const entry = {};
      if (v.label && v.label.trim()) entry.label = v.label.trim();
      if (v.order !== "" && Number.isFinite(Number(v.order))) entry.order = Number(v.order);
      if (v.default !== "" && v.default !== undefined) entry.default = v.default;
      if (v.hidden) entry.hidden = true;
      if (Object.keys(entry).length) out[name] = entry;
    }
    onSave(out);
  }

  const ordered = orderFilters(filters, settings);

  const cell = { minWidth: 0 };
  const head = {
    fontSize: "12px",
    color: "var(--text-muted)",
    fontWeight: 600,
    paddingBottom: 4,
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Filter settings"
        // Wider than the default confirm dialog: this is a five-column grid,
        // and it scrolls rather than growing past the viewport.
        style={{ maxWidth: 880, width: "94%", maxHeight: "84vh", display: "flex", flexDirection: "column", padding: 0 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <Icon className="ti ti-adjustments" style={{ fontSize: 18 }} />
          <strong style={{ fontSize: "15px" }}>Filter settings</strong>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {ordered.length} filter{ordered.length === 1 ? "" : "s"}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            style={{ marginLeft: "auto" }}
          >
            <Icon className="ti ti-x" />
          </button>
        </div>

        <div style={{ padding: "16px 20px", overflow: "auto", flex: 1, minHeight: 0 }}>
          {!ordered.length && (
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              No filters on this dashboard yet. Add a {"{name:Type}"} placeholder to a
              chart's SQL and it appears here.
            </div>
          )}

          {!!ordered.length && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 1.4fr) minmax(120px, 1fr) 80px minmax(140px, 1fr) 72px",
                gap: "10px 12px",
                alignItems: "start",
              }}
            >
              <div style={head}>Parameter</div>
              <div style={head}>Label</div>
              <div style={head}>Order</div>
              <div style={head}>Default</div>
              <div style={head}>Hidden</div>

              {ordered.map((f) => {
                const warn =
                  f.requiredBy.length > 0 && draft[f.name]?.hidden && !draft[f.name]?.default;
                return (
                  <React.Fragment key={f.name}>
                    <div style={cell}>
                      <code
                        style={{
                          fontSize: "12px",
                          // Names come from SQL; an enum type can be very long.
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          display: "block",
                          lineHeight: 1.35,
                        }}
                      >
                        {f.name}:{f.type}
                      </code>
                      {warn && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--color-warning, #d98324)",
                            marginTop: 4,
                            lineHeight: 1.35,
                          }}
                        >
                          <Icon className="ti ti-alert-triangle" style={{ fontSize: 12 }} /> Hidden
                          and required with no default: its charts will not run.
                        </div>
                      )}
                    </div>

                    <div style={cell}>
                      <input
                        className="form-input"
                        style={{ width: "100%", boxSizing: "border-box" }}
                        placeholder={f.name}
                        value={draft[f.name]?.label ?? ""}
                        onChange={(e) => patch(f.name, "label", e.target.value)}
                        aria-label={`Label for ${f.name}`}
                      />
                    </div>

                    <div style={cell}>
                      <input
                        className="form-input"
                        type="number"
                        style={{ width: "100%", boxSizing: "border-box" }}
                        value={draft[f.name]?.order ?? ""}
                        onChange={(e) => patch(f.name, "order", e.target.value)}
                        aria-label={`Order for ${f.name}`}
                      />
                    </div>

                    <div style={cell}>
                      {/* Typed like the filter itself, so a date default gets a
                          date picker and an enum default gets its members. */}
                      <ParamInput
                        param={f}
                        value={draft[f.name]?.default ?? ""}
                        onChange={(v) => patch(f.name, "default", v)}
                        fullWidth
                      />
                    </div>

                    <div style={{ ...cell, paddingTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={draft[f.name]?.hidden ?? false}
                        onChange={(e) => patch(f.name, "hidden", e.target.checked)}
                        aria-label={`Hide ${f.name}`}
                        title="Keep this filter at its default and hide the control"
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "12px 20px",
            borderTop: "1px solid var(--border-default)",
          }}
        >
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!ordered.length}>
            <Icon className="ti ti-device-floppy" /> Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
