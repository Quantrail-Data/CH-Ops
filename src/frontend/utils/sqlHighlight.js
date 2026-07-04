// sqlHighlight.js - Shared SQL syntax-highlighting helper for the editor surfaces
//
// Holds the keyword and function word lists plus the highlightSQL function that
// turns a SQL string into highlighted HTML (keywords, functions, strings,
// numbers, and line comments). Extracted verbatim from QueryEditor.jsx so the
// main editor and the reusable SqlInput component share one implementation
// instead of keeping duplicate copies.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

export const SQL_KW = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "ON",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "FULL",
  "CROSS",
  "GROUP",
  "BY",
  "ORDER",
  "ASC",
  "DESC",
  "LIMIT",
  "OFFSET",
  "AS",
  "DISTINCT",
  "HAVING",
  "UNION",
  "ALL",
  "INSERT",
  "INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "TABLE",
  "DATABASE",
  "INDEX",
  "VIEW",
  "IF",
  "EXISTS",
  "BETWEEN",
  "LIKE",
  "IS",
  "NULL",
  "TRUE",
  "FALSE",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "WITH",
  "USING",
  "FORMAT",
  "ENGINE",
  "PARTITION",
  "SETTINGS",
  "FINAL",
  "PREWHERE",
  "GLOBAL",
  "ARRAY",
  "MATERIALIZED",
  "SYSTEM",
  "SHOW",
  "DESCRIBE",
  "EXPLAIN",
  "GRANT",
  "REVOKE",
  "KILL",
  "OPTIMIZE",
  "TRUNCATE",
  "RENAME",
  "ATTACH",
  "DETACH",
  "ILIKE",
  "ANY",
  "SOME",
  "EXCEPT",
  "INTERSECT",
  "TOP",
  "SAMPLE",
  "TOTALS",
]);

export const SQL_FN = new Set([
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "any",
  "argMin",
  "argMax",
  "groupArray",
  "uniq",
  "uniqExact",
  "toDate",
  "toDateTime",
  "toString",
  "toUInt32",
  "toInt32",
  "toFloat64",
  "formatReadableSize",
  "now",
  "today",
  "yesterday",
  "dateDiff",
  "toStartOfDay",
  "toStartOfHour",
  "toStartOfMinute",
  "toStartOfMonth",
  "toStartOfWeek",
  "substring",
  "concat",
  "length",
  "lower",
  "upper",
  "trim",
  "replace",
  "if",
  "multiIf",
  "coalesce",
  "nullIf",
  "arrayJoin",
  "tuple",
  "map",
  "JSONExtract",
  "formatReadableTimeDelta",
]);

export function highlightSQL(code) {
  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/(--[^\n]*)/g, '<span class="sql-comment">$1</span>');
  html = html.replace(
    /('(?:[^'\\]|\\.)*')/g,
    '<span class="sql-string">$1</span>',
  );
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="sql-number">$1</span>');
  html = html.replace(/\b([A-Za-z_]\w*)\b/g, (m) => {
    if (SQL_KW.has(m.toUpperCase()))
      return `<span class="sql-keyword">${m}</span>`;
    if (SQL_FN.has(m)) return `<span class="sql-function">${m}</span>`;
    return m;
  });
  return html;
}
