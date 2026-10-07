// AdvancedFilters.jsx - Extra columns and custom SQL filters for log search.
// Copyright (C) 2026 Quantrail Data Private Limited
import React, { useEffect, useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import MultiSelect from "../common/MultiSelect.jsx";
import SqlEditor from "../editor/SqlEditor.jsx";
import { runQuery } from "../../utils/api.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";
import {
  buildCompletionOptions,
  loadFunctionRows,
} from "../editor/sqlEditorSetup.js";
import {
  MAX_FILTERS,
  normalizeFilters,
  saveAdvState,
} from "../../utils/advancedFilters.js";
// Autocomplete words. Loaded once per session, shared by all five screens.
let keywordsAndFunctionsPromise = null;
function loadKeywordsAndFunctions() {
  if (!keywordsAndFunctionsPromise) {
    keywordsAndFunctionsPromise = Promise.all([
      runQuery("SELECT keyword FROM system.keywords", { readOnly: true }).catch(
        () => ({ rows: [] }),
      ),
      loadFunctionRows((sql) => runQuery(sql, { readOnly: true })),
    ])
      .then(([keywordResult, functionRows]) => ({
        keywords: (keywordResult.rows || [])
          .map((row) => row.keyword)
          .filter(Boolean),
        functions: (functionRows || []).filter((row) => row && row.name),
      }))
      .catch(() => ({ keywords: [], functions: [] }));
  }
  return keywordsAndFunctionsPromise;
}
export default function AdvancedFilters({ table, value, onChange }) {
  const { columns, loading, absent } = useTableColumns(table);
  const [dialect, setDialect] = useState({ keywords: [], functions: [] });
  useEffect(() => {
    let mounted = true;
    loadKeywordsAndFunctions().then((loaded) => {
      if (mounted) setDialect(loaded);
    });
    return () => {
      mounted = false;
    };
  }, []);
  function saveAndNotify(nextValue) {
    saveAdvState(table, nextValue);
    onChange(nextValue);
  }
  // Drop saved columns that this server's table does not have.
  useEffect(() => {
    if (loading || columns.length === 0) return;
    const existingNames = new Set(columns.map((column) => column.name));
    const keptColumns = (value.columns || []).filter((name) =>
      existingNames.has(name),
    );
    if (keptColumns.length !== (value.columns || []).length) {
      saveAndNotify({ ...value, columns: keptColumns });
    }
  }, [loading, columns]); // eslint-disable-line react-hooks/exhaustivedeps
  if (absent) return null;
  if (loading) {
    return (
      <div
        style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}
      >
        Loading columns...
      </div>
    );
  }
  return (
    <AdvancedFiltersView
      columns={columns}
      dialect={dialect}
      value={value}
      onChange={saveAndNotify}
    />
  );
}
// The view alone, no network. The test renders this export.
export function AdvancedFiltersView({ columns, dialect, value, onChange }) {
  const filters = normalizeFilters(value.filters);
  const completions = useMemo(
    () =>
      buildCompletionOptions({
        keywords: dialect.keywords,
        functions: dialect.functions,
        columns,
      }),
    [columns, dialect],
  );
  const dialectData = useMemo(
    () => ({
      keywords: dialect.keywords,
      functions: (dialect.functions || []).map((row) => row.name),
    }),
    [dialect],
  );
  const columnOptions = useMemo(
    () =>
      columns.map((column) => ({
        value: column.name,
        label: column.name,
        hint: column.type,
      })),
    [columns],
  );
  function changeFilterOp(rowIndex, newOp) {
    const nextFilters = filters.map((row, i) =>
      i === rowIndex ? { ...row, op: newOp } : row,
    );
    onChange({ ...value, filters: nextFilters });
  }
  function changeFilterText(rowIndex, newText) {
    const nextFilters = filters.map((row, i) =>
      i === rowIndex ? { ...row, expr: newText } : row,
    );
    onChange({ ...value, filters: nextFilters });
  }
  function addFilterRow() {
    if (filters.length >= MAX_FILTERS) return;
    onChange({ ...value, filters: [...filters, { op: "AND", expr: "" }] });
  }
  function removeFilterRow(rowIndex) {
    onChange({ ...value, filters: filters.filter((_, i) => i !== rowIndex) });
  }
  return (
    <div
      style={{
        borderTop: "1px solid var(--border-default)",
        paddingTop: 14,
        marginBottom: 14,
      }}
    >
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Additional Result Columns</label>
        <MultiSelect
          searchable
          options={columnOptions}
          value={value.columns || []}
          onChange={(pickedColumns) =>
            onChange({ ...value, columns: pickedColumns })
          }
          placeholder="Add columns to the result..."
        />
      </div>
      <div className="form-group">
        <label className="form-label">
          Custom SQL Filters{" "}
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
            (added to the WHERE clause, {MAX_FILTERS} max)
          </span>
        </label>
        {filters.map((filterRow, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            {rowIndex === 0 ? (
              <span
                className="form-label"
                style={{
                  width: 70,
                  textAlign: "center",
                  paddingTop: 8,
                  marginBottom: 0,
                }}
              >
                AND
              </span>
            ) : (
              <select
                className="form-input"
                style={{ width: 70, flexShrink: 0 }}
                value={filterRow.op}
                onChange={(e) => changeFilterOp(rowIndex, e.target.value)}
                aria-label={`Connector for filter ${rowIndex + 1}`}
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}
            <div
              style={{
                flex: 1,
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                background: "var(--input-bg)",
                overflow: "hidden",
              }}
            >
              <SqlEditor
                value={filterRow.expr}
                onChange={(newText) => changeFilterText(rowIndex, newText)}
                variant="expression"
                height="36px"
                placeholder="e.g. thread_id = 12345"
                completions={completions}
                dialectData={dialectData}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={`Remove filter ${rowIndex + 1}`}
              onClick={() => removeFilterRow(rowIndex)}
              style={{ flexShrink: 0 }}
            >
              <Icon className="ti ti-x" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={addFilterRow}
          disabled={filters.length >= MAX_FILTERS}
          title={
            filters.length >= MAX_FILTERS
              ? `Maximum ${MAX_FILTERS}
filters`
              : undefined
          }
        >
          <Icon className="ti ti-plus" /> Add filter
        </button>
      </div>
    </div>
  );
}
