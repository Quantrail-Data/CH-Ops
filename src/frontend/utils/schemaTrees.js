// Builds the trees for Data Skipping Indexes and Projections in the
// TreeGraph format: { name, kind, tone, children }.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited

// The longest projection query text shown on a node.
const MAX_QUERY_LENGTH = 80;

// Puts rows in groups by their table, in the order they come.
function groupByTable(rows) {
  const rowsByTable = new Map();
  for (const row of rows) {
    if (!rowsByTable.has(row.table)) rowsByTable.set(row.table, []);
    rowsByTable.get(row.table).push(row);
  }
  return rowsByTable;
}

// Database -> tables -> indexes -> index expression.
// rows: system.data_skipping_indices (table, name, type_full, granularity, expr).
export function buildIndexTree(databaseName, rows) {
  if (!rows || rows.length === 0) return null;
  const tables = [...groupByTable(rows)].map(([tableName, tableRows]) => ({
    name: tableName,
    kind: "table",
    tone: "warning",
    children: tableRows.map((row) => ({
      name: `${row.name} (${row.type_full}, granularity ${row.granularity})`,
      kind: "index",
      tone: "success",
      children: [{ name: row.expr, kind: "expr", tone: "neutral" }],
    })),
  }));
  return { name: databaseName, kind: "database", tone: "accent", children: tables };
}

// Database -> tables -> projections -> sorting key and query.
// rows: system.projections (table, name, type, sorting_key, query).
export function buildProjectionTree(databaseName, rows) {
  if (!rows || rows.length === 0) return null;
  const tables = [...groupByTable(rows)].map(([tableName, tableRows]) => ({
    name: tableName,
    kind: "table",
    tone: "warning",
    children: tableRows.map((row) => {
      const details = [{ name: row.sorting_key || "none", kind: "key", tone: "info" }];
      if (row.query) {
        const shortQuery = row.query.length > MAX_QUERY_LENGTH ? `${row.query.slice(0, MAX_QUERY_LENGTH)}...` : row.query;
        details.push({ name: shortQuery, kind: "query", tone: "neutral" });
      }
      return { name: `${row.name} (${row.type})`, kind: "projection", tone: "success", children: details };
    }),
  }));
  return { name: databaseName, kind: "database", tone: "accent", children: tables };
}
