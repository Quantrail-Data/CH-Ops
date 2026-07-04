// studioSource.js - Pure helpers for Schema Studio source + statistics SQL
//
// No external dependencies, so these are unit-testable in isolation: mapping a
// format hint to a ClickHouse input format, escaping a SQL string literal,
// building the source expression (uploaded text/binary or object storage), and
// composing the bounded per-column statistics query and shaping its result.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Bound the rows scanned for statistics so a large source stays fast.
export const STATS_ROW_LIMIT = 100000;

// Formats offered for object storage (allow-list, so the value cannot smuggle
// anything into the SQL string).
export const OBJECT_FORMATS = new Set([
  'Parquet', 'ORC', 'CSVWithNames', 'TSVWithNames', 'JSONEachRow',
]);

// Map a file/object format hint to a ClickHouse input format + binary flag.
export function formatFromName(name = '') {
  const n = String(name).toLowerCase();
  if (n.endsWith('.parquet') || n === 'parquet') return { format: 'Parquet', binary: true };
  if (n.endsWith('.orc') || n === 'orc') return { format: 'ORC', binary: true };
  if (n.endsWith('.tsv') || n.endsWith('.tab') || n === 'tsvwithnames') return { format: 'TSVWithNames', binary: false };
  if (n.endsWith('.ndjson') || n.endsWith('.jsonl') || n === 'jsoneachrow') return { format: 'JSONEachRow', binary: false };
  if (n.endsWith('.json')) return { format: 'JSONEachRow', binary: false };
  if (n.endsWith('.csv') || n === 'csvwithnames') return { format: 'CSVWithNames', binary: false };
  return { format: 'CSVWithNames', binary: false };
}

// Escape a string for embedding inside a single-quoted ClickHouse SQL literal.
export function sqlEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Build the ClickHouse source expression to read from.
//   text upload   -> format(<fmt>, '<sample>')   (data embedded; body null)
//   binary upload -> format(<fmt>)               (data in the request body)
//   object store  -> s3(...) / azureBlobStorage(...)
export function buildSourceExpr({ kind, format, binary, sampleText, objectStore }) {
  if (kind === 'object') {
    const o = objectStore || {};
    const fmt = OBJECT_FORMATS.has(o.format) ? o.format : 'Parquet';
    if (o.provider === 's3') {
      return `s3('${sqlEscape(o.path)}', '${sqlEscape(o.accessKeyId)}', '${sqlEscape(o.secretAccessKey)}', '${fmt}')`;
    }
    return `azureBlobStorage('${sqlEscape(o.connectionString)}', '${sqlEscape(o.container)}', '${sqlEscape(o.path)}', '${fmt}')`;
  }
  if (binary) return `format(${format})`;
  return `format(${format}, '${sqlEscape(sampleText)}')`;
}

// Aliases must be valid identifiers; hash the column name into a stable alias so
// per-column stat outputs never collide with odd column names.
export function aliasName(col, suffix) {
  let h = 0;
  for (let i = 0; i < col.length; i++) h = (h * 31 + col.charCodeAt(i)) >>> 0;
  return `c_${h}_${suffix}`;
}

// Build the one aggregate query that returns per-column statistics, bounded by
// a row limit so a large source stays fast.
export function buildStatsSql(expr, columns, limit = STATS_ROW_LIMIT) {
  const parts = ['count() AS _rows'];
  for (const c of columns) {
    const id = '`' + String(c.name).replace(/`/g, '``') + '`';
    parts.push(`uniqExact(${id}) AS ${aliasName(c.name, 'uniq')}`);
    parts.push(`sum(isNull(${id})) AS ${aliasName(c.name, 'nulls')}`);
    parts.push(`toString(min(${id})) AS ${aliasName(c.name, 'min')}`);
    parts.push(`toString(max(${id})) AS ${aliasName(c.name, 'max')}`);
  }
  return `SELECT ${parts.join(', ')} FROM (SELECT * FROM ${expr} LIMIT ${limit})`;
}

// Shape the stats row (one JSONEachRow object) into per-column statistics.
export function shapeStats(row, columns) {
  const sampleRows = Number(row._rows || 0);
  const stats = {};
  for (const c of columns) {
    const uniq = Number(row[aliasName(c.name, 'uniq')] || 0);
    const nulls = Number(row[aliasName(c.name, 'nulls')] || 0);
    stats[c.name] = {
      approx_distinct: uniq,
      null_fraction: sampleRows ? +(nulls / sampleRows).toFixed(4) : 0,
      min: row[aliasName(c.name, 'min')] ?? null,
      max: row[aliasName(c.name, 'max')] ?? null,
    };
  }
  return { stats, sample_rows: sampleRows };
}
