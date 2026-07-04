// schemaParser.js - Graph model builder for ClickHouse schema visualizer
//
// Core utility for the Schema Visualizer. Fetches and builds a graph of
// database objects (tables, views, materialized views, dictionaries,
// distributed tables) with their dependencies and columns. Provides engine
// classification, theme-aware palettes, identifier quoting, formatting
// helpers, and load metric aggregation from system.query_views_log.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { runQuery } from './api.js';

// Identifier Handling

export function tableKey(db, t) {
  return JSON.stringify([db, t]);
}

const BQ_RESERVED = /^(distinct|all|table|select|from|values)$/i;
const BQ_BARE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BQ_ESCAPE_MAP = {
  '\\': '\\\\', '`': '\\`', '\b': '\\b', '\f': '\\f',
  '\n': '\\n', '\r': '\\r', '\t': '\\t', '\0': '\\0',
};
const BQ_ESCAPE_RE = /[\\`\b\f\n\r\t\0]/g;

export function backQuoteIfNeed(s) {
  if (BQ_BARE.test(s) && !BQ_RESERVED.test(s)) return s;
  return '`' + s.replace(BQ_ESCAPE_RE, ch => BQ_ESCAPE_MAP[ch]) + '`';
}

export function quotedFullName(db, t) {
  return backQuoteIfNeed(db) + '.' + backQuoteIfNeed(t);
}

// Engine Classification

export function engineKind(engine) {
  if (!engine) return 'other';
  if (engine === 'Dictionary') return 'dict';
  if (engine === 'Distributed') return 'distributed';
  if (engine === 'View' || engine === 'LiveView' || engine === 'WindowView') return 'view';
  if (engine === 'MaterializedView') return 'mv';
  if (engine.includes('MergeTree')) return 'mt';
  return 'other';
}

export function engineLabel(node) {
  if (node.kind === 'rmv') return 'RMV';
  if (node.kind === 'mv') return 'MV';
  return node.engine || '';
}

export const ENGINE_ICONS = {
  mt: 'ti-table', mv: 'ti-eye', rmv: 'ti-refresh',
  dict: 'ti-book', distributed: 'ti-topology-ring',
  view: 'ti-eye', other: 'ti-file',
};

// Theme-Aware Palettes

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

const LIGHT_PALETTE = {
  mt:          { bg: '#1B5E20', text: '#fff' },
  mv:          { bg: '#4A148C', text: '#fff' },
  rmv:         { bg: '#880E4F', text: '#fff' },
  dict:        { bg: '#01579B', text: '#fff' },
  distributed: { bg: '#BF360C', text: '#fff' },
  view:        { bg: '#37474F', text: '#fff' },
  other:       { bg: '#3E2723', text: '#fff' },
};
const DARK_PALETTE = {
  mt:          { bg: '#66BB6A', text: '#000' },
  mv:          { bg: '#CE93D8', text: '#000' },
  rmv:         { bg: '#F48FB1', text: '#000' },
  dict:        { bg: '#4FC3F7', text: '#000' },
  distributed: { bg: '#FFB74D', text: '#000' },
  view:        { bg: '#B0BEC5', text: '#000' },
  other:       { bg: '#BCAAA4', text: '#000' },
};

export function getEnginePalette() {
  return isDarkTheme() ? DARK_PALETTE : LIGHT_PALETTE;
}

export function getEdgeColors() {
  return isDarkTheme() ? {
    mv: '#BA68C8', dict: '#4FC3F7', distributed: '#FFB74D', normal: '#666',
  } : {
    mv: '#6A1B9A', dict: '#01579B', distributed: '#BF360C', normal: '#999',
  };
}

// Formatting

export function fmtBytes(n) {
  if (n == null) return '';
  n = Number(n);
  if (!isFinite(n) || n === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
  return n.toFixed(n < 10 ? 2 : (n < 100 ? 1 : 0)) + ' ' + units[u];
}

export function fmtRows(n) {
  if (n == null) return '';
  n = Number(n);
  if (!isFinite(n) || n === 0) return '';
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function fmtMs(n) {
  n = Number(n) || 0;
  if (n < 1000) return n.toFixed(0) + ' ms';
  if (n < 60000) return (n / 1000).toFixed(2) + ' s';
  if (n < 3600000) return (n / 60000).toFixed(1) + ' min';
  return (n / 3600000).toFixed(1) + ' h';
}

export function formatLoadValue(metric, value) {
  if (metric === 'written_bytes' || metric === 'read_bytes' || metric === 'peak_memory_usage') return fmtBytes(value);
  if (metric === 'total_duration_ms') return fmtMs(value);
  if (metric === 'executions') return String(Math.round(Number(value) || 0));
  return fmtRows(value);
}

// Heatmap

export function loadIntensity(value, max) {
  if (!value || !max || max <= 0) return 0;
  if (max === value) return 1;
  return Math.log1p(value) / Math.log1p(max);
}

export function loadColour(intensity) {
  intensity = Math.max(0, Math.min(1, intensity));
  const stops = [
    { p: 0.00, r: 0x2a, g: 0x4d, b: 0x8a },
    { p: 0.33, r: 0x6a, g: 0xa8, b: 0x4f },
    { p: 0.66, r: 0xf1, g: 0xc2, b: 0x32 },
    { p: 1.00, r: 0xcc, g: 0x00, b: 0x00 },
  ];
  let i = 0;
  while (i < stops.length - 1 && intensity > stops[i + 1].p) ++i;
  const a = stops[i], b = stops[i + 1] || stops[i];
  const t = b.p === a.p ? 0 : (intensity - a.p) / (b.p - a.p);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function loadBadgeTextColor(intensity) {
  return (intensity > 0.4 && intensity < 0.75) ? '#000' : '#fff';
}

const METRIC_KEYS = ['executions', 'total_duration_ms', 'read_rows', 'read_bytes',
                     'written_rows', 'written_bytes', 'peak_memory_usage'];

function mkMetrics() {
  const m = {};
  for (const k of METRIC_KEYS) m[k] = 0;
  return m;
}

function parseDistributedTarget(createQuery) {
  if (!createQuery || typeof createQuery !== 'string') return { db: '', table: '' };
  
  const onClusterMatch = createQuery.match(/ON\s+CLUSTER\s+['"`]?(\w+)['"`]?/i);
  const engineMatch = createQuery.match(/ENGINE\s*=\s*Distributed\s*\(\s*['"`]?(\w+)['"`]?\s*,\s*['"`]?(\w+)['"`]?\s*,\s*['"`]?(\w+)['"`]?\s*(?:,|[\s\)])/i);
  
  if (engineMatch) {
    return {
      db: engineMatch[2] || '',
      table: engineMatch[3] || ''
    };
  }
  
  return { db: '', table: '' };
}

// Data Fetching

const SYS_FILTER = "WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')";

export async function fetchSchemaData() {
  const tablesRes = await runQuery(`
    SELECT database, name, engine, engine_full, formatQuery(create_table_query) as create_table_query,
           sorting_key, primary_key, partition_key, sampling_key,
           total_rows, total_bytes, comment,
           dependencies_database, dependencies_table,
           loading_dependencies_database, loading_dependencies_table
    FROM system.tables ${SYS_FILTER} ORDER BY database, name`);

  let columnsRes = { rows: [] };
  try { columnsRes = await runQuery(`
    SELECT database, table, name, type,
           (is_in_primary_key OR is_in_sorting_key) AS is_key,
           default_kind != '' AS has_default
    FROM system.columns ${SYS_FILTER} ORDER BY database, table, position`);
  } catch (e) { console.warn('columns:', e.message); }

  let dictsRes = { rows: [] };
  try { dictsRes = await runQuery(`SELECT database, name, source FROM system.dictionaries WHERE status IN ('LOADED','NOT_LOADED','LOADING')`); } catch {}

  let refreshesRes = { rows: [] };
  try { refreshesRes = await runQuery(`SELECT database, view, status, last_success_time, next_refresh_time, exception FROM system.view_refreshes`); } catch {}

  const columnsByTable = new Map();
  for (const c of columnsRes.rows) {
    const k = tableKey(c.database, c.table);
    if (!columnsByTable.has(k)) columnsByTable.set(k, []);
    columnsByTable.get(k).push(c);
  }
  const dictSources = new Map();
  for (const d of dictsRes.rows) dictSources.set(tableKey(d.database, d.name), d.source);
  const refreshes = new Map();
  for (const r of refreshesRes.rows) refreshes.set(tableKey(r.database, r.view), r);

  return buildGraph(tablesRes.rows, columnsByTable, dictSources, refreshes);
}

export function buildGraph(tables, columnsByTable, dictSources, refreshes) {
  const nodes = new Map();
  const nodesByDb = new Map();
  const zipKeys = (dbs, tbls) => {
    if (!dbs || !tbls) return [];
    const out = [];
    for (let i = 0; i < dbs.length && i < tbls.length; i++) out.push(tableKey(dbs[i], tbls[i]));
    return out;
  };

  for (const t of tables) {
    const key = tableKey(t.database, t.name);
    const isRefreshable = refreshes.has(key);
    const kind = isRefreshable ? 'rmv' : engineKind(t.engine);
    
    let targetDatabase = '';
    let targetTable = '';
    if (kind === 'distributed' && t.create_table_query) {
      const parsed = parseDistributedTarget(t.create_table_query);
      targetDatabase = parsed.db;
      targetTable = parsed.table;
    }
    
    const node = {
      key, displayName: quotedFullName(t.database, t.name),
      database: t.database, name: t.name, engine: t.engine, engineFull: t.engine_full, kind,
      createQuery: t.create_table_query, sortingKey: t.sorting_key, primaryKey: t.primary_key,
      partitionKey: t.partition_key, samplingKey: t.sampling_key,
      totalRows: t.total_rows, totalBytes: t.total_bytes, comment: t.comment,
      targetDatabase: targetDatabase, targetTable: targetTable,
      dependents: zipKeys(t.dependencies_database, t.dependencies_table),
      dependsOn: zipKeys(t.loading_dependencies_database, t.loading_dependencies_table),
      columns: columnsByTable.get(key) || [], dictSource: dictSources.get(key),
      refresh: refreshes.get(key), x: 0, y: 0, w: 0, h: 0, _lonely: false,
    };
    nodes.set(key, node);
    if (!nodesByDb.has(t.database)) nodesByDb.set(t.database, []);
    nodesByDb.get(t.database).push(node);
  }

  const edges = [];
  const seen = new Set();
  function addEdge(from, to, kind) {
    if (!nodes.has(from) || !nodes.has(to) || from === to) return;
    const k = from + '\x00' + to;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ from, to, kind });
  }

  for (const node of nodes.values()) {
    const isMv = node.kind === 'mv' || node.kind === 'rmv';
    for (const dep of node.dependsOn) {
      if (isMv) addEdge(dep, node.key, 'mv');
      else if (node.kind === 'dict') addEdge(dep, node.key, 'dict');
      else if (node.kind === 'distributed') addEdge(dep, node.key, 'distributed');
      else addEdge(dep, node.key, 'normal');
    }
    for (const dep of node.dependents) {
      const dn = nodes.get(dep);
      if (isMv) addEdge(node.key, dep, 'mv');
      else if (dn && (dn.kind === 'mv' || dn.kind === 'rmv')) addEdge(node.key, dep, 'mv');
      else if (dn && dn.kind === 'dict') addEdge(node.key, dep, 'dict');
      else if (dn && dn.kind === 'distributed') addEdge(node.key, dep, 'distributed');
      else addEdge(node.key, dep, 'normal');
    }
    if (isMv && node.targetTable) {
      addEdge(node.key, tableKey(node.targetDatabase || node.database, node.targetTable), 'mv');
    }
    if (node.kind === 'distributed' && node.targetTable) {
      addEdge(node.key, tableKey(node.targetDatabase || node.database, node.targetTable), 'distributed');
    }
  }

  return { nodes, nodesByDb, edges, tables };
}

// INSERT Pipeline Heatmap

export async function fetchViewsLoad(nodes, loadPeriodDays) {
  const result = { loadByMv: new Map(), loadByEdge: new Map(), loadMax: { byMv: {}, byEdge: {} } };
  const days = Number(loadPeriodDays || 0);
  if (!days || !nodes.size) return result;

  const quotedToKey = new Map();
  for (const node of nodes.values()) quotedToKey.set(quotedFullName(node.database, node.name), node.key);

  let rows;
  try {
    const res = await runQuery(`
      SELECT view_name, view_target, count() AS executions,
             sum(view_duration_ms) AS total_duration_ms,
             sum(read_rows) AS read_rows, sum(read_bytes) AS read_bytes,
             sum(written_rows) AS written_rows, sum(written_bytes) AS written_bytes,
             sum(peak_memory_usage) AS peak_memory_usage
      FROM system.query_views_log
      WHERE event_date >= today() - INTERVAL ${days} DAY
        AND status IN ('QueryFinish', 'ExceptionWhileProcessing')
      GROUP BY view_name, view_target`);
    rows = res.rows;
  } catch (e) {
    console.info('query_views_log unavailable:', e.message);
    return result;
  }

  const maxByMv = {}, maxByEdge = {};
  for (const m of METRIC_KEYS) { maxByMv[m] = 0; maxByEdge[m] = 0; }

  for (const r of rows) {
    const mvKey = quotedToKey.get(r.view_name);
    if (!mvKey) continue;
    const targetKey = r.view_target ? quotedToKey.get(r.view_target) : null;
    const mvAgg = result.loadByMv.get(mvKey) || mkMetrics();
    for (const m of METRIC_KEYS) mvAgg[m] += Number(r[m]) || 0;
    result.loadByMv.set(mvKey, mvAgg);
    for (const m of METRIC_KEYS) maxByMv[m] = Math.max(maxByMv[m], mvAgg[m]);
    if (targetKey) {
      const edgeKey = mvKey + '\x00' + targetKey;
      const eAgg = result.loadByEdge.get(edgeKey) || mkMetrics();
      for (const m of METRIC_KEYS) eAgg[m] += Number(r[m]) || 0;
      result.loadByEdge.set(edgeKey, eAgg);
      for (const m of METRIC_KEYS) maxByEdge[m] = Math.max(maxByEdge[m], eAgg[m]);
    }
  }
  result.loadMax = { byMv: maxByMv, byEdge: maxByEdge };
  return result;
}