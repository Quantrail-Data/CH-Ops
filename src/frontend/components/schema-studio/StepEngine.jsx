// StepEngine.jsx - Step 3: the engine and table clauses
//
// Pick the MergeTree variant, then fill the table clauses that the deterministic
// composer turns into the CREATE TABLE: ORDER BY, PRIMARY KEY, PARTITION BY,
// SAMPLE BY, TTL, and SETTINGS. Replicated and Distributed are revealed by their
// toggles. Every field has a tooltip explaining the ClickHouse concept. Macros
// and cluster names are read from the app's current connection for prefill.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useEffect, useState } from "react";
import { runQuery } from "../../utils/api.js";
import Icon from "../common/Icon.jsx";
import { BEHAVIORS, defaultZkPath, SHARDING_PRESETS } from "../../utils/engineModel.js";
import { SKIP_INDEX_TYPES } from "../../utils/ddlCompose.js";
import FieldLabel from "./FieldLabel.jsx";
import Select from "../common/Select.jsx";
import MultiSelect from "../common/MultiSelect.jsx";
import KeyInput from "./KeyInput.jsx";

export default function StepEngine({ columns, form, setForm, onBack, onNext }) {
  const [macros, setMacros] = useState({});
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    runQuery("SELECT macro, substitution FROM system.macros")
      .then((r) => {
        const m = {};
        (r.rows || []).forEach((row) => { m[row.macro] = row.substitution; });
        setMacros(m);
      })
      .catch(() => {});
    runQuery("SELECT DISTINCT cluster FROM system.clusters ORDER BY cluster")
      .then((r) => setClusters((r.rows || []).map((x) => x.cluster)))
      .catch(() => {});
  }, []);

  const set = (patch) => setForm({ ...form, ...patch });
  const setParam = (key, val) =>
    setForm({ ...form, behaviorParams: { ...form.behaviorParams, [key]: val } });
  const setPref = (key, val) =>
    setForm({ ...form, preferences: { ...form.preferences, [key]: val } });

  // Repeatable data skipping indexes.
  const addIndex = () =>
    setForm({ ...form, indexes: [...form.indexes, { name: "", expr: "", type: "minmax", params: "", granularity: "" }] });
  const updateIndex = (i, patch) =>
    setForm({ ...form, indexes: form.indexes.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const removeIndex = (i) =>
    setForm({ ...form, indexes: form.indexes.filter((_, idx) => idx !== i) });

  // Repeatable projections.
  const addProjection = () =>
    setForm({ ...form, projections: [...form.projections, { name: "", select: "" }] });
  const updateProjection = (i, patch) =>
    setForm({ ...form, projections: form.projections.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const removeProjection = (i) =>
    setForm({ ...form, projections: form.projections.filter((_, idx) => idx !== i) });

  function toggleReplicated(on) {
    const patch = { replicated: on };
    if (on && !form.zk_path) {
      const hasMacros = macros.shard != null && macros.replica != null;
      patch.zk_path = hasMacros
        ? defaultZkPath(form.target.database, form.target.table || "TABLE")
        : "";
      patch.replica = hasMacros ? "{replica}" : "";
    }
    set(patch);
  }

  const def = BEHAVIORS[form.behavior];
  const colNames = columns.map((c) => c.name);
  const int8Cols = columns.filter((c) => /\bInt8\b/.test(c.type)).map((c) => c.name);

  return (
    <div className="studio-step-pane">
      <h2 className="studio-step-title">Choose the engine and table clauses</h2>

      <div className="studio-field-row">
        <FieldLabel text="Database" tip="The database the table is created in." />
        <input className="form-input" value={form.target.database}
          onChange={(e) => set({ target: { ...form.target, database: e.target.value } })} />
        <FieldLabel text="Table name" tip="Name of the new table." />
        <input className="form-input" value={form.target.table}
          onChange={(e) => set({ target: { ...form.target, table: e.target.value } })} />
      </div>

      <div className="studio-field">
        <FieldLabel text="ON CLUSTER (optional)"
          tip="Run the CREATE on every node of this ClickHouse cluster. Leave empty for a single node." />
        <input className="form-input" value={form.onCluster}
          placeholder="cluster name"
          onChange={(e) => set({ onCluster: e.target.value })} />
      </div>

      <div className="studio-field">
        <FieldLabel text="Merge behavior"
          tip="The MergeTree variant. It controls what happens to rows with the same sorting key when parts merge, for example deduplicate or sum." />
        <Select className="form-select" value={form.behavior}
          onChange={(e) => set({ behavior: e.target.value, behaviorParams: {} })}>
          {Object.entries(BEHAVIORS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <span className="studio-hint">{def.hint}</span>
      </div>

      {def.params.map((p) => (
        <div key={p.key} className="studio-field">
          <label>{p.label}</label>
          {p.kind === "cols" ? (
            <MultiSelect options={colNames}
              value={form.behaviorParams[p.key] || []}
              onChange={(arr) => setParam(p.key, arr)} />
          ) : p.kind === "text" ? (
            <input className="form-input" value={form.behaviorParams[p.key] || ""}
              onChange={(e) => setParam(p.key, e.target.value)} />
          ) : (
            <Select className="form-select" value={form.behaviorParams[p.key] || ""}
              onChange={(e) => setParam(p.key, e.target.value)}>
              <option value="">(none)</option>
              {(p.colFilter === "int8" ? int8Cols : colNames).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          )}
        </div>
      ))}

      <div className="studio-clauses">
        <h3 className="studio-subhead">Keys and clauses</h3>

        <div className="studio-field">
          <FieldLabel htmlFor="studio-orderby" text="ORDER BY (sorting key)"
            tip="How rows are ordered within each part. It is also the primary key unless you set a separate one. Add columns in the order you want them; ordinal position matters. Put low-cardinality, frequently filtered columns first. Leave empty for no sorting (tuple())." />
          <KeyInput id="studio-orderby" value={form.orderBy} columns={colNames}
            placeholder="add columns in order, or type an expression"
            onChange={(v) => set({ orderBy: v })} />
        </div>

        <div className="studio-field">
          <FieldLabel htmlFor="studio-primarykey" text="PRIMARY KEY (optional)"
            tip="The index key. It must be a prefix of ORDER BY. Set this only when you want a shorter index than the sorting key, common with Summing and Aggregating engines." />
          <KeyInput id="studio-primarykey" value={form.primaryKey} columns={colNames}
            placeholder="leave empty to use ORDER BY"
            onChange={(v) => set({ primaryKey: v })} />
        </div>

        <div className="studio-field">
          <FieldLabel text="PARTITION BY (optional)"
            tip="Splits data into parts on disk, usually by month with toYYYYMM(date). Use coarse partitions only and never partition by a high-cardinality column." />
          <input className="form-input mono" value={form.partitionBy}
            placeholder="toYYYYMM(event_date)"
            onChange={(e) => set({ partitionBy: e.target.value })} />
        </div>

        <div className="studio-field">
          <FieldLabel text="SAMPLE BY (optional)"
            tip="Enables SAMPLE queries. Must be an expression contained in the primary key that returns an unsigned integer, for example intHash32(user_id)." />
          <input className="form-input mono" value={form.sampleBy}
            placeholder="intHash32(user_id)"
            onChange={(e) => set({ sampleBy: e.target.value })} />
        </div>

        <div className="studio-field">
          <FieldLabel text="Table TTL (optional)"
            tip="Automatically deletes or moves rows after a time. Example: event_date + INTERVAL 90 DAY." />
          <input className="form-input mono" value={form.tableTtl}
            placeholder="event_date + INTERVAL 90 DAY"
            onChange={(e) => set({ tableTtl: e.target.value })} />
        </div>

        <div className="studio-field">
          <FieldLabel text="SETTINGS (optional)"
            tip="Engine settings as name = value, comma separated. Example: index_granularity = 8192." />
          <input className="form-input mono" value={form.tableSettings}
            placeholder="index_granularity = 8192"
            onChange={(e) => set({ tableSettings: e.target.value })} />
        </div>
      </div>

      <div className="studio-clauses">
        <h3 className="studio-subhead">
          <FieldLabel text="Data skipping indexes"
            tip="Skip indexes store a small summary per block of granules so queries can skip blocks that cannot match the WHERE filter. Match the type to how you filter the column." />
        </h3>
        {form.indexes.map((idx, i) => {
          const typeDef = SKIP_INDEX_TYPES.find((t) => t.value === idx.type);
          return (
            <div key={i} className="studio-builder-item">
              <div className="studio-builder-head">
                <span>Index {i + 1}</span>
                <button className="studio-icon-btn" onClick={() => removeIndex(i)}
                  aria-label="Remove index" title="Remove index">
                  <Icon className="ti ti-trash" />
                </button>
              </div>
              <div className="studio-builder-grid3">
                <div className="form-group">
                  <FieldLabel text="Name" tip="A unique name for this index." />
                  <input className="form-input mono" value={idx.name}
                    placeholder="idx_name" onChange={(e) => updateIndex(i, { name: e.target.value })} />
                </div>
                <div className="form-group">
                  <FieldLabel text="Type"
                    tip="minmax: value ranges. set(N): up to N distinct values. bloom_filter: membership for = and IN. tokenbf_v1 / ngrambf_v1: substring search. text: full-text. vector_similarity: nearest neighbour." />
                  <Select className="form-select" value={idx.type}
                    onChange={(e) => updateIndex(i, { type: e.target.value })}>
                    {SKIP_INDEX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </div>
                <div className="form-group">
                  <FieldLabel text="Granularity"
                    tip="How many index granules each index block covers. Higher is smaller but coarser. Default 1." />
                  <input className="form-input mono" value={idx.granularity}
                    placeholder="1" onChange={(e) => updateIndex(i, { granularity: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <FieldLabel text="Expression"
                  tip="The column or expression the index summarizes, for example a column name or u64 * length(s)." />
                <input className="form-input mono" value={idx.expr}
                  placeholder="column or expression" onChange={(e) => updateIndex(i, { expr: e.target.value })} />
              </div>
              <div className="form-group">
                <FieldLabel text="Params"
                  tip="Parameters for the chosen type, for example 0.01 for bloom_filter or 100 for set. Leave empty when the type takes none." />
                <input className="form-input mono" value={idx.params}
                  placeholder={typeDef && typeDef.paramHint ? typeDef.paramHint : "(none)"}
                  onChange={(e) => updateIndex(i, { params: e.target.value })} />
              </div>
            </div>
          );
        })}
        <button className="btn btn-secondary btn-sm" onClick={addIndex}>
          <Icon className="ti ti-plus" /> Add index
        </button>
      </div>

      <div className="studio-clauses">
        <h3 className="studio-subhead">
          <FieldLabel text="Projections"
            tip="A projection is an alternate physical ordering or pre-aggregation of the table that ClickHouse uses automatically when it answers a query faster. Define it as a SELECT." />
        </h3>
        {form.projections.map((proj, i) => (
          <div key={i} className="studio-builder-item">
            <div className="studio-builder-head">
              <span>Projection {i + 1}</span>
              <button className="studio-icon-btn" onClick={() => removeProjection(i)}
                aria-label="Remove projection" title="Remove projection">
                <Icon className="ti ti-trash" />
              </button>
            </div>
            <div className="form-group">
              <FieldLabel text="Name" tip="A unique name for this projection." />
              <input className="form-input mono" value={proj.name}
                placeholder="proj_name" onChange={(e) => updateProjection(i, { name: e.target.value })} />
            </div>
            <div className="form-group">
              <FieldLabel text="SELECT"
                tip="The projection query body, for example: SELECT country, count() GROUP BY country. ClickHouse wraps it in PROJECTION name (...)." />
              <textarea className="form-textarea mono" rows={3} value={proj.select}
                placeholder="SELECT country, count() GROUP BY country"
                onChange={(e) => updateProjection(i, { select: e.target.value })} />
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={addProjection}>
          <Icon className="ti ti-plus" /> Add projection
        </button>
      </div>

      <label className="studio-toggle">
        <input type="checkbox" checked={form.replicated}
          onChange={(e) => toggleReplicated(e.target.checked)} />
        Replicated (ReplicatedMergeTree)
        <span className="studio-tip" tabIndex={0} role="note" aria-label="Keeps the table in sync across replicas via ClickHouse Keeper.">
          <span className="studio-tip-bubble">Keeps the table in sync across replicas via ClickHouse Keeper.</span>
        </span>
      </label>
      {form.replicated && (
        <div className="studio-subfields">
          <div className="studio-field">
            <FieldLabel text="Keeper path"
              tip="The Keeper path that identifies this table's replicas. Use macros like {shard} when the server provides them." />
            <input className="form-input mono" value={form.zk_path}
              placeholder="/clickhouse/tables/{shard}/db/table"
              onChange={(e) => set({ zk_path: e.target.value })} />
            {(macros.shard == null || macros.replica == null) && (
              <span className="studio-hint">
                No shard/replica macros found on this server. Enter an explicit path and replica.
              </span>
            )}
          </div>
          <div className="studio-field">
            <FieldLabel text="Replica name"
              tip="This replica's name, usually the {replica} macro." />
            <input className="form-input mono" value={form.replica}
              placeholder="{replica}"
              onChange={(e) => set({ replica: e.target.value })} />
          </div>
        </div>
      )}

      <label className="studio-toggle">
        <input type="checkbox" checked={form.distributed}
          onChange={(e) => set({ distributed: e.target.checked })} />
        Distributed (a local table plus a Distributed table)
        <span className="studio-tip" tabIndex={0} role="note" aria-label="Also create a Distributed table that fans queries and inserts out to a per-shard local table.">
          <span className="studio-tip-bubble">Also create a Distributed table that fans queries and inserts out to a per-shard local table.</span>
        </span>
      </label>
      {form.distributed && (
        <div className="studio-subfields">
          <div className="studio-field">
            <FieldLabel text="Cluster"
              tip="The cluster the Distributed table spreads data across, read from system.clusters." />
            <Select className="form-select" value={form.cluster}
              onChange={(e) => set({ cluster: e.target.value })}>
              <option value="">Select a cluster...</option>
              {clusters.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="studio-field">
            <FieldLabel text="Local table name"
              tip="Name of the underlying per-shard table. Defaults to <table>_local." />
            <input className="form-input mono" value={form.localTableName}
              placeholder={(form.target.table || "table") + "_local"}
              onChange={(e) => set({ localTableName: e.target.value })} />
          </div>
          <div className="studio-field">
            <FieldLabel text="Sharding key"
              tip="Decides which shard a row goes to. rand() spreads evenly; cityHash64(id) keeps rows with the same id together." />
            <Select className="form-select" value=""
              onChange={(e) => e.target.value && set({ shardingKey: e.target.value })}>
              <option value="">Choose a preset or type below...</option>
              {SHARDING_PRESETS.map((p) => (
                <option key={p.label} value={p.value}>{p.label}</option>
              ))}
            </Select>
            <input className="form-input mono" value={form.shardingKey}
              placeholder="cityHash64(user_id)"
              onChange={(e) => set({ shardingKey: e.target.value })} />
            <span className="studio-hint">
              Replace __COL__ with a column name if you picked a column-based preset.
            </span>
          </div>
        </div>
      )}

      <div className="studio-field">
        <FieldLabel text="Frequently filtered columns (optional)"
          tip="Columns you often filter on. Putting these early in ORDER BY lets queries skip data. This also informs the AI review." />
        <MultiSelect options={colNames}
          value={form.preferences.frequently_filtered}
          onChange={(arr) => setPref("frequently_filtered", arr)} />
      </div>

      <div className="studio-actions">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={!form.target.table}>
          Next: generate
        </button>
      </div>
    </div>
  );
}
