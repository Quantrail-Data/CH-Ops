// QueryPreviewPanel.jsx - shows exactly what will be sent to ClickHouse.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useMemo } from "react";
import { materialize } from "../../../shared/sqlParams.js";
import SqlEditor from "./SqlEditor.jsx";

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
    <div style={{ padding: 5 }}>
      <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 8 }}>
        This is what will be sent to ClickHouse
      </div>

      {error ? (
        <div className="alert-banner danger">{error}</div>
      ) : (
        <>
          <div
            style={{
              background: "var(--bg-sunken)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            <SqlEditor value={text} variant="viewer" height="auto" />
          </div>

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
                <li key={n}>
                  param_{n} = {String(params[n])}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
