// StepSchema.jsx - Step 2: review inferred columns and add derived columns
//
// Inferred columns (from ClickHouse reading the data) are display plus editing:
// name, type, and an expandable panel of modifiers that apply to an existing
// column (nullability, codec, statistics, per-column TTL, comment, settings, and
// an inline primary-key flag).
//
// Derived columns (DEFAULT / MATERIALIZED / ALIAS / EPHEMERAL) are different:
// they are computed from an expression over other columns, so they are added as
// new custom columns with a chosen type, kind, and expression rather than being
// toggled on an inferred column.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useState } from "react";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import FieldLabel from "./FieldLabel.jsx";
import { DEFAULT_KINDS } from "../../utils/ddlCompose.js";

const CODEC_SUGGESTIONS = ["ZSTD(3)", "ZSTD(1)", "LZ4", "Delta, ZSTD(3)", "DoubleDelta, ZSTD(3)", "Gorilla, ZSTD(3)", "T64, ZSTD(3)", "NONE"];
const STAT_SUGGESTIONS = ["TDigest", "Uniq", "TDigest, Uniq", "MinMax", "CountMin"];

export default function StepSchema({ columns, setColumns, stats, sampleRows, onBack, onNext }) {
  const [open, setOpen] = useState(() => new Set());

  function updateCol(i, patch) {
    setColumns(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeCol(i) {
    setColumns(columns.filter((_, idx) => idx !== i));
    setOpen((prev) => {
      const next = new Set();
      prev.forEach((x) => { if (x < i) next.add(x); else if (x > i) next.add(x - 1); });
      return next;
    });
  }
  function addCustom() {
    const at = columns.length;
    setColumns([...columns, { name: "", type: "", defaultKind: "MATERIALIZED", defaultExpr: "", custom: true }]);
    setOpen((prev) => new Set(prev).add(at));
  }
  function toggle(i) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <div className="studio-step-pane">
      <h2 className="studio-step-title">Review the inferred schema</h2>
      <p className="studio-note">
        These columns and types come from ClickHouse reading your data. Adjust anything that
        looks wrong. Statistics are estimated from a sample
        {sampleRows ? ` of ${Number(sampleRows).toLocaleString()} rows` : ""}. Expand a column
        for advanced options like codecs and per-column TTL, or add a derived column computed
        from an expression.
      </p>

      <datalist id="studio-codec-suggestions">
        {CODEC_SUGGESTIONS.map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id="studio-stat-suggestions">
        {STAT_SUGGESTIONS.map((v) => <option key={v} value={v} />)}
      </datalist>

      <div className="studio-schema-table">
        <div className="studio-schema-head">
          <span></span><span>Column</span><span>Type</span>
          <span>Distinct (approx)</span><span>Null %</span>
        </div>
        {columns.map((c, i) => {
          const s = stats?.[c.name];
          const isOpen = open.has(i);
          return (
            <React.Fragment key={i}>
              <div className="studio-schema-row">
                <button
                  className="studio-expand"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? "Hide column options" : "Show column options"}
                  title="Column options"
                >
                  <Icon className={isOpen ? "ti ti-chevron-down" : "ti ti-chevron-right"} />
                </button>
                <input className="form-input" value={c.name}
                  placeholder={c.custom ? "new_column" : ""}
                  onChange={(e) => updateCol(i, { name: e.target.value })} />
                <input className="form-input mono" value={c.type}
                  placeholder={c.custom ? "type (optional)" : ""}
                  onChange={(e) => updateCol(i, { type: e.target.value })} />
                <span className="studio-stat">
                  {c.custom
                    ? <span className="studio-custom-badge">{c.defaultKind || "derived"}</span>
                    : (s ? Number(s.approx_distinct).toLocaleString() : "-")}
                </span>
                <span className="studio-stat">
                  {c.custom ? "-" : (s ? `${(s.null_fraction * 100).toFixed(1)}%` : "-")}
                </span>
              </div>

              {isOpen && (
                <div className="studio-col-detail">
                  {c.custom ? (
                    <div className="studio-col-grid">
                      <div className="studio-field">
                        <FieldLabel text="Value kind"
                          tip="How the column is computed. DEFAULT: value used when none is given (stored). MATERIALIZED: computed on insert, not accepted in INSERT (stored). ALIAS: computed on read, not stored. EPHEMERAL: only feeds other defaults, not stored." />
                        <Select className="form-select" value={c.defaultKind || "MATERIALIZED"}
                          onChange={(e) => updateCol(i, { defaultKind: e.target.value })}>
                          {DEFAULT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </Select>
                      </div>
                      <div className="studio-field studio-col-wide">
                        <FieldLabel text="Expression"
                          tip="An expression over other columns, for example price * quantity or toStartOfDay(event_time). Set the type and name in the row above; leave the type empty to let ClickHouse infer it (allowed for MATERIALIZED and ALIAS)." />
                        <input className="form-input mono" value={c.defaultExpr || ""}
                          placeholder="price * quantity"
                          onChange={(e) => updateCol(i, { defaultExpr: e.target.value })} />
                      </div>
                      <div className="studio-field">
                        <FieldLabel text="Codec"
                          tip="Optional compression for this column, for example ZSTD(3). Applies to DEFAULT and MATERIALIZED columns (stored)." />
                        <input className="form-input mono" list="studio-codec-suggestions"
                          value={c.codec || ""} placeholder="ZSTD(3)"
                          onChange={(e) => updateCol(i, { codec: e.target.value })} />
                      </div>
                      <div className="studio-field">
                        <FieldLabel text="Comment"
                          tip="A description stored with the column." />
                        <input className="form-input" value={c.comment || ""}
                          onChange={(e) => updateCol(i, { comment: e.target.value })} />
                      </div>
                      <div className="studio-col-remove">
                        <button className="btn btn-ghost btn-sm studio-danger-btn" onClick={() => removeCol(i)}>
                          <Icon className="ti ti-trash" /> Remove column
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="studio-col-grid">
                      <div className="studio-field">
                        <FieldLabel text="Nullability"
                          tip="By default the column type controls nullability (for example Nullable(String)). Override only to force NULL or NOT NULL." />
                        <Select className="form-select" value={c.nullability || ""}
                          onChange={(e) => updateCol(i, { nullability: e.target.value })}>
                          <option value="">From type</option>
                          <option value="null">NULL</option>
                          <option value="notnull">NOT NULL</option>
                        </Select>
                      </div>
                      <div className="studio-field">
                        <FieldLabel text="Codec"
                          tip="Compression for this column. Common: ZSTD(3) general; Delta, ZSTD for monotonic integers and timestamps; Gorilla, ZSTD for slowly changing floats; wrap low-cardinality strings as LowCardinality(String) in the type instead." />
                        <input className="form-input mono" list="studio-codec-suggestions"
                          value={c.codec || ""} placeholder="ZSTD(3)"
                          onChange={(e) => updateCol(i, { codec: e.target.value })} />
                      </div>
                      <div className="studio-field">
                        <FieldLabel text="Statistics"
                          tip="Lightweight per-part statistics that help the optimizer, for example TDigest for percentiles or Uniq for distinct-count estimates." />
                        <input className="form-input mono" list="studio-stat-suggestions"
                          value={c.statistics || ""} placeholder="TDigest, Uniq"
                          onChange={(e) => updateCol(i, { statistics: e.target.value })} />
                      </div>
                      <div className="studio-field">
                        <FieldLabel text="Column TTL"
                          tip="Resets this column to its default after the expression's time, for example d + INTERVAL 30 DAY. Cannot be used on key columns." />
                        <input className="form-input mono" value={c.ttl || ""}
                          placeholder="d + INTERVAL 30 DAY"
                          onChange={(e) => updateCol(i, { ttl: e.target.value })} />
                      </div>
                      <div className="studio-field studio-col-wide">
                        <FieldLabel text="Comment"
                          tip="A description stored with the column." />
                        <input className="form-input" value={c.comment || ""}
                          onChange={(e) => updateCol(i, { comment: e.target.value })} />
                      </div>
                      <div className="studio-field studio-col-wide">
                        <FieldLabel text="Column SETTINGS"
                          tip="Per-column settings as name = value, comma separated, for example min_compress_block_size = 16777216." />
                        <input className="form-input mono" value={c.settings || ""}
                          placeholder="min_compress_block_size = 16777216"
                          onChange={(e) => updateCol(i, { settings: e.target.value })} />
                      </div>
                      <label className="studio-col-pk">
                        <input type="checkbox" checked={!!c.primaryKey}
                          onChange={(e) => updateCol(i, { primaryKey: e.target.checked })} />
                        <span className="studio-flabel">
                          <span>Inline PRIMARY KEY</span>
                          <span className="studio-tip" tabIndex={0} role="note" aria-label="Include this column in the table primary key inline. Usually set the key in the engine step instead.">
                            <Icon className="ti ti-info-circle" />
                            <span className="studio-tip-bubble">Include this column in the table primary key inline. Usually set the key in the engine step instead.</span>
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="studio-add-col">
        <button className="btn btn-secondary btn-sm" onClick={addCustom}>
          <Icon className="ti ti-plus" /> Add derived column
        </button>
        <span className="studio-hint">
          A DEFAULT, MATERIALIZED, ALIAS, or EPHEMERAL column computed from an expression over other columns.
        </span>
      </div>

      <div className="studio-actions">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={!columns.length}>
          Next: engine
        </button>
      </div>
    </div>
  );
}
