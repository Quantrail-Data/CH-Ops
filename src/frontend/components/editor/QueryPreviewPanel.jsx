// QueryPreviewPanel.jsx - shows exactly what will be sent to ClickHouse.
//
// Uses the same shared materialize() the server uses, so it cannot disagree
// with what actually runs. Note the SQL still contains {name:Type}: only which
// TEXT is present is decided on our side, never what the values are.
//
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useMemo } from "react";
import { materialize } from "../../../shared/sqlParams.js";
import { highlightSQL } from "../../utils/sqlHighlight.js";

export default function QueryPreviewPanel({ sql, values }) {
  const { text, params, error } = useMemo(() => {
    try {
      const m = materialize(sql, values || {});
      return { text: m.sql, params: m.params, error: null };
    } catch (e) {
      return { text: "", params: {}, error: e.message };
    }
  }, [sql, values]);

  const names = Object.keys(params);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 8 }}>
        This is what will be sent to ClickHouse
      </div>

      {error ? (
        <div className="alert-banner danger">{error}</div>
      ) : (
        <>
          <pre
            style={{
              fontFamily: "var(--font-code)",
              fontSize: "0.8125rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              padding: 12,
              background: "var(--bg-sunken)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              maxHeight: 300,
              overflow: "auto",
            }}
            dangerouslySetInnerHTML={{ __html: highlightSQL(text) }}
          />

          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "12px 0 6px" }}>
            Parameters sent ({names.length})
          </div>
          {names.length === 0 ? (
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              None. Any optional filters left blank have been removed from the query above.
            </div>
          ) : (
            <ul style={{ fontFamily: "var(--font-code)", fontSize: "0.8125rem", margin: 0, paddingLeft: 18 }}>
              {names.map((n) => (
                <li key={n}>param_{n} = {String(params[n])}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
