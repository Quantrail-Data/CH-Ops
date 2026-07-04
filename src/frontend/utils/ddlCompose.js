// ddlCompose.js - Deterministic CREATE TABLE composer for Schema Studio
//
// Assembles a MergeTree-family CREATE TABLE statement exactly from the user's
// structured choices, following the grammar in the ClickHouse MergeTree docs:
//
//   CREATE TABLE [IF NOT EXISTS] [db.]name [ON CLUSTER c]
//   ( <column defs>, <index defs>, <projection defs> )
//   ENGINE = <engine>
//   ORDER BY <expr> [PARTITION BY ...] [PRIMARY KEY ...] [SAMPLE BY ...]
//   [TTL ...] [SETTINGS ...]
//
// Column grammar:
//   name [type] [[NOT] NULL] [DEFAULT|MATERIALIZED|ALIAS|EPHEMERAL expr]
//        [COMMENT '...'] [CODEC(...)] [STATISTICS(...)] [TTL expr]
//        [PRIMARY KEY] [SETTINGS (name = value, ...)]
//
// The output is exactly what the user configured (no AI interpretation). The AI
// is used elsewhere only to suggest values that prefill this form. All pure.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

// The four kinds of column value expressions.
export const DEFAULT_KINDS = ["DEFAULT", "MATERIALIZED", "ALIAS", "EPHEMERAL"];

// Data skipping index types offered in the form, with a hint for their params.
export const SKIP_INDEX_TYPES = [
  { value: "minmax", label: "minmax", paramHint: "" },
  { value: "set", label: "set(max_rows)", paramHint: "0" },
  { value: "bloom_filter", label: "bloom_filter(false_positive)", paramHint: "0.025" },
  { value: "ngrambf_v1", label: "ngrambf_v1(n, size, hashes, seed)", paramHint: "3, 256, 2, 0" },
  { value: "tokenbf_v1", label: "tokenbf_v1(size, hashes, seed)", paramHint: "256, 2, 0" },
  { value: "text", label: "text", paramHint: "" },
  { value: "vector_similarity", label: "vector_similarity(...)", paramHint: "" },
];

// Quote an identifier only when it is not a plain identifier already.
export function quoteIdent(name) {
  const s = String(name == null ? "" : name);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return s;
  return "`" + s.replace(/`/g, "``") + "`";
}

// Escape a string literal for COMMENT.
export function sqlString(s) {
  return "'" + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

// Split a tuple/expression list on top-level commas, respecting parentheses.
export function splitTopLevel(str) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(str || "")) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Normalize a key expression into a list of key parts. Handles "a", "(a, b)",
// and "tuple()".
export function keyList(expr) {
  let s = String(expr || "").trim();
  if (!s || /^tuple\(\s*\)$/i.test(s)) return [];
  if (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1);
  return splitTopLevel(s);
}

// Serialize an ordered list of key parts back into a key expression. The inverse
// of keyList for the common cases: one part is bare, several are wrapped in a
// tuple, and none yields the empty string. Ordinal position is preserved.
export function joinKey(parts) {
  const list = (parts || []).map((p) => String(p).trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return "(" + list.join(", ") + ")";
}

// True when the primary key is a prefix of the order-by key (the ClickHouse
// requirement when the two differ).
export function primaryKeyIsPrefix(primaryKey, orderBy) {
  const pk = keyList(primaryKey);
  const ob = keyList(orderBy);
  if (pk.length > ob.length) return false;
  return pk.every((k, i) => k === ob[i]);
}

// Normalize the sort/primary keys: if only a primary key is given, it becomes
// the ORDER BY (the canonical single-key form) and the separate PRIMARY KEY is
// dropped, since the primary key defaults from the sorting key.
export function normalizeKeys({ orderBy, primaryKey }) {
  const ob = String(orderBy || "").trim();
  const pk = String(primaryKey || "").trim();
  if (!ob && pk) return { orderBy: pk, primaryKey: "" };
  return { orderBy: ob, primaryKey: pk };
}

// Compose a single column definition line.
export function composeColumn(col) {
  let s = quoteIdent(col.name);
  if (col.type) s += ` ${col.type}`;

  if (col.nullability === "notnull") s += " NOT NULL";
  else if (col.nullability === "null") s += " NULL";

  if (col.defaultKind && DEFAULT_KINDS.includes(col.defaultKind) && col.defaultExpr) {
    s += ` ${col.defaultKind} ${col.defaultExpr}`;
  }
  if (col.comment) s += ` COMMENT ${sqlString(col.comment)}`;
  if (col.codec) s += ` CODEC(${col.codec})`;
  if (col.statistics) s += ` STATISTICS(${col.statistics})`;
  if (col.ttl) s += ` TTL ${col.ttl}`;
  if (col.primaryKey) s += " PRIMARY KEY";
  if (col.settings) s += ` SETTINGS (${col.settings})`;
  return s;
}

// Compose a data skipping index line.
export function composeIndex(idx) {
  const type = idx.params ? `${idx.type}(${idx.params})` : idx.type;
  let s = `INDEX ${quoteIdent(idx.name)} ${idx.expr} TYPE ${type}`;
  if (idx.granularity != null && idx.granularity !== "") s += ` GRANULARITY ${idx.granularity}`;
  return s;
}

// Compose a projection line. `select` is the inner projection query body.
export function composeProjection(proj) {
  return `PROJECTION ${quoteIdent(proj.name)} (${String(proj.select || "").trim()})`;
}

// Collect human-readable validation errors for a spec.
export function validateSpec(spec) {
  const errors = [];
  if (!spec.table || !spec.table.trim()) errors.push("Table name is required.");
  if (!Array.isArray(spec.columns) || spec.columns.length === 0) errors.push("At least one column is required.");
  (spec.columns || []).forEach((c, i) => {
    if (!c.name || !c.name.trim()) errors.push(`Column ${i + 1} needs a name.`);
  });

  const { orderBy, primaryKey } = normalizeKeys(spec);
  const isDistributed = /^\s*Distributed\s*\(/i.test(spec.engine || "");
  if (!isDistributed) {
    if (!orderBy && !primaryKey) {
      errors.push("An ORDER BY or PRIMARY KEY is required (use tuple() for none).");
    }
    if (orderBy && primaryKey && !primaryKeyIsPrefix(primaryKey, orderBy)) {
      errors.push("PRIMARY KEY must be a prefix of ORDER BY.");
    }
  }
  (spec.indexes || []).forEach((idx, i) => {
    if (!idx.name || !idx.expr || !idx.type) errors.push(`Index ${i + 1} needs a name, expression, and type.`);
  });
  (spec.projections || []).forEach((p, i) => {
    if (!p.name || !p.select) errors.push(`Projection ${i + 1} needs a name and a SELECT.`);
  });
  return errors;
}

// Compose the full CREATE TABLE statement from the spec.
export function composeCreateTable(spec) {
  const { orderBy, primaryKey } = normalizeKeys(spec);

  const qualified = spec.database ? `${quoteIdent(spec.database)}.${quoteIdent(spec.table)}` : quoteIdent(spec.table);
  const head =
    "CREATE TABLE " +
    (spec.ifNotExists ? "IF NOT EXISTS " : "") +
    qualified +
    (spec.onCluster ? ` ON CLUSTER ${spec.onCluster}` : "");

  const bodyLines = [
    ...(spec.columns || []).map(composeColumn),
    ...(spec.indexes || []).map(composeIndex),
    ...(spec.projections || []).map(composeProjection),
  ];
  const body = "(\n    " + bodyLines.join(",\n    ") + "\n)";

  // A Distributed table takes no MergeTree clauses (ORDER BY, PARTITION BY, ...).
  const isDistributed = /^\s*Distributed\s*\(/i.test(spec.engine || "");
  const clauses = [`ENGINE = ${spec.engine}`];
  if (!isDistributed) {
    clauses.push(`ORDER BY ${orderBy || "tuple()"}`);
    if (spec.partitionBy) clauses.push(`PARTITION BY ${spec.partitionBy}`);
    if (primaryKey) clauses.push(`PRIMARY KEY ${primaryKey}`);
    if (spec.sampleBy) clauses.push(`SAMPLE BY ${spec.sampleBy}`);
    if (spec.ttl) clauses.push(`TTL ${spec.ttl}`);
  }
  if (spec.settings) clauses.push(`SETTINGS ${spec.settings}`);

  return `${head}\n${body}\n${clauses.join("\n")}`;
}
