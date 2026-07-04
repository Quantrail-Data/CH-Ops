// StepGenerate.jsx - Step 4 and 5: build the DDL, edit, validate, create
//
// The CREATE TABLE is composed deterministically from the form, so it is exactly
// what the user configured (no AI authoring). Validation errors are shown
// inline. The user may optionally ask the AI to review the composed DDL given
// the columns, statistics, and intent. Validate runs a server-side EXPLAIN AST
// parse check; Create runs the statements (local table first for distributed),
// with no data loaded.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useState, useEffect, useCallback } from "react";
import Icon from "../common/Icon.jsx";
import SqlInput from "../editor/SqlInput.jsx";
import { useToast } from "../layout/Toast.jsx";
import { composeEngine, composeDistributed } from "../../utils/engineModel.js";
import { composeCreateTable, validateSpec } from "../../utils/ddlCompose.js";
import { evaluate, validateDdl, createTables, aiStatus } from "../../utils/studioApi.js";

function mapColumns(columns) {
  return (columns || []).map((c) => ({
    name: c.name,
    type: c.type,
    nullability: c.nullability,
    defaultKind: c.defaultKind,
    defaultExpr: c.defaultExpr,
    comment: c.comment,
    codec: c.codec,
    statistics: c.statistics,
    ttl: c.ttl,
    primaryKey: c.primaryKey,
    settings: c.settings,
  }));
}

export default function StepGenerate({ columns, stats, sampleRows, form, onBack }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [specErrors, setSpecErrors] = useState([]);

  const [ddl, setDdl] = useState("");
  const [ddlLocal, setDdlLocal] = useState("");
  const [validation, setValidation] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [ai, setAi] = useState(null);
  const [review, setReview] = useState(null);

  useEffect(() => {
    aiStatus().then(setAi).catch(() => setAi({ configured: false, executable: false }));
  }, []);

  // Compose the DDL deterministically from the form.
  const build = useCallback(() => {
    setError(null); setValidation(null); setReview(null);
    try {
      const engine = composeEngine(form);
      const cols = mapColumns(columns);
      const base = {
        ifNotExists: form.ifNotExists,
        database: form.target.database,
        onCluster: form.onCluster || null,
        columns: cols,
        indexes: form.indexes || [],
        projections: form.projections || [],
        orderBy: form.orderBy,
        primaryKey: form.primaryKey,
        partitionBy: form.partitionBy,
        sampleBy: form.sampleBy,
        ttl: form.tableTtl,
        settings: form.tableSettings,
      };

      if (form.distributed) {
        const localName = form.localTableName || `${form.target.table}_local`;
        const localSpec = { ...base, table: localName, engine };
        const distSpec = {
          ifNotExists: form.ifNotExists,
          database: form.target.database,
          onCluster: form.onCluster || null,
          columns: cols,
          indexes: [],
          projections: [],
          engine: composeDistributed({
            cluster: form.cluster,
            database: form.target.database,
            localTable: localName,
            shardingKey: form.shardingKey,
          }),
          table: form.target.table,
        };
        setSpecErrors([...validateSpec(localSpec), ...validateSpec(distSpec)]);
        setDdlLocal(composeCreateTable(localSpec));
        setDdl(composeCreateTable(distSpec));
      } else {
        const mainSpec = { ...base, table: form.target.table, engine };
        setSpecErrors(validateSpec(mainSpec));
        setDdlLocal("");
        setDdl(composeCreateTable(mainSpec));
      }
    } catch (e) {
      // composeEngine throws when a required engine parameter is missing.
      setSpecErrors([e.message]);
      setDdl(""); setDdlLocal("");
    }
  }, [form, columns]);

  useEffect(() => { build(); }, [build]);

  // Manual rebuild from the button: recompose from the form and confirm, since a
  // silent recompose looks like nothing happened when the DDL already matches the
  // form (it discards any hand edits made in the editor below).
  function rebuildFromForm() {
    build();
    toast.success("DDL rebuilt from the form.");
  }

  async function doEvaluate() {
    setBusy(true); setError(null); setReview(null);
    try {
      const res = await evaluate({
        columns: mapColumns(columns),
        stats: stats || {},
        sample_rows: sampleRows,
        intent: {
          behavior: form.behavior,
          replicated: form.replicated,
          distributed: form.distributed,
          frequently_filtered: form.preferences?.frequently_filtered || [],
        },
        ddl,
        ddl_local: ddlLocal || null,
      });
      setReview(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doValidate() {
    setBusy(true); setValidation(null);
    try {
      const targets = form.distributed ? [ddlLocal, ddl] : [ddl];
      for (const t of targets) {
        const r = await validateDdl(t);
        if (!r.ok) { setValidation({ ok: false, error: r.error }); return; }
      }
      setValidation({ ok: true });
    } catch (e) {
      setValidation({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    setBusy(true); setCreateError(null);
    try {
      const statements = form.distributed ? [ddlLocal, ddl] : [ddl];
      await createTables(statements);
      toast.success("Table created successfully.");
      setConfirming(false);
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const blocked = specErrors.length > 0 || !ddl.trim();

  return (
    <div className="studio-step-pane">
      <div className="studio-gen-head">
        <h2 className="studio-step-title">Review the DDL</h2>
        <button className="btn btn-secondary" onClick={rebuildFromForm} disabled={busy}>Rebuild from form</button>
      </div>

      {error && (
        <div className="alert-banner danger"><Icon className="ti ti-alert-circle" /><span>{error}</span></div>
      )}

      {specErrors.length > 0 && (
        <div className="alert-banner danger">
          <Icon className="ti ti-alert-circle" />
          <span>{specErrors.join(" ")}</span>
        </div>
      )}

      {form.distributed && (
        <div className="studio-editor-block">
          <label className="studio-editor-label">Local table (created on each shard)</label>
          <SqlInput value={ddlLocal} onChange={setDdlLocal} acWords={[]} />
        </div>
      )}

      <div className="studio-editor-block">
        <label className="studio-editor-label">
          {form.distributed ? "Distributed table" : "Table DDL"}
        </label>
        <SqlInput value={ddl} onChange={setDdl} acWords={[]} />
      </div>

      {validation && (
        validation.ok ? (
          <div className="studio-valid-ok"><Icon className="ti ti-circle-check" /> Valid. Ready to create.</div>
        ) : (
          <div className="alert-banner danger"><Icon className="ti ti-alert-circle" />
            <span>{validation.error}</span></div>
        )
      )}

      <div className="studio-eval">
        <button className="btn btn-secondary" onClick={doEvaluate}
          disabled={busy || !ddl.trim() || (ai && !ai.executable)}>
          <Icon className="ti ti-bolt" /> Evaluate with AI
        </button>
        {ai && !ai.executable && (
          <span className="studio-hint">
            {ai.configured
              ? `Active AI provider is ${ai.provider}; AI review uses Gemini. Select a Gemini key in Settings.`
              : "No AI provider configured. Add one under Settings > API Management to enable review."}
          </span>
        )}
      </div>

      {review && (
        <div className="studio-ai-notes">
          {review.assessment && <div><strong>Assessment:</strong> {review.assessment}</div>}
          {review.suggestions?.length > 0 && (
            <div><strong>Suggestions:</strong>
              <ul className="studio-ai-list">{review.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {review.warnings?.length > 0 && (
            <div className="studio-ai-warn"><strong>Warnings:</strong>
              <ul className="studio-ai-list">{review.warnings.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {review.suggested_ddl && review.suggested_ddl.trim()
            && review.suggested_ddl.trim() !== ddl.trim() && (
            <div className="studio-ai-ddl">
              <strong>Suggested DDL:</strong>
              <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto', margin: '6px 0', padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)' }}>{review.suggested_ddl}</pre>
              <button className="btn btn-secondary btn-sm"
                onClick={() => { setDdl(review.suggested_ddl); setValidation(null); }}>
                <Icon className="ti ti-arrow-back-up" /> Apply to editor
              </button>
            </div>
          )}
        </div>
      )}

      <div className="studio-actions">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-secondary" onClick={doValidate} disabled={busy || blocked}>
          Validate
        </button>
        <button className="btn btn-primary"
          onClick={() => { setCreateError(null); setConfirming(true); }}
          disabled={busy || blocked || (validation && !validation.ok)}>
          Create table
        </button>
      </div>

      {confirming && (
        <div className="modal-overlay" onClick={() => { setConfirming(false); setCreateError(null); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 12 }}>Create this table?</h3>
            <p className="studio-note">
              This runs the CREATE TABLE statement{form.distributed ? "s" : ""} on your cluster.
              No data is loaded. You can load data separately afterwards.
            </p>
            {createError && (
              <div className="alert-banner danger studio-modal-error">
                <Icon className="ti ti-alert-circle" />
                <span>{createError}</span>
              </div>
            )}
            <div className="studio-actions">
              <button className="btn btn-ghost" onClick={() => { setConfirming(false); setCreateError(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={doCreate} disabled={busy}>
                {busy ? "Creating..." : createError ? "Retry create" : "Confirm create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
