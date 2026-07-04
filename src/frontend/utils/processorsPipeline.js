// processorsPipeline.js - DOT parser, dagre layout, and heatmap coloring
//
// Utility module for the Processors Profile page. Parses DOT output from
// EXPLAIN PIPELINE compact=0 graph=1, computes hierarchical graph layout
// using dagre, and applies heatmap colors based on elapsed time per
// processor. Also provides SQL builders for fetching query list, query text,
// pipeline graph, and processor profile data from system tables.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import dagre from '@dagrejs/dagre';

// DOT Parser
//
// EXPLAIN PIPELINE compact=0, graph=1 returns DOT like:
//
//   digraph {
//     n0 [label="ReadFromMergeTree_0"];
//     n1 [label="FilterTransform_1"];
//     n0 -> n1;
//   }
//
// compact=0 is critical: it produces one node per processor whose label
// is the processor_uniq_id that matches system.processors_profile_log.
// compact=1 (default) groups nodes like "ExpressionTransform x 32"
// which cannot be joined against the profile log.

export function parseDot(dotLines) {
  // dotLines is an array of strings (from the backend's row-per-line response)
  const dotString = Array.isArray(dotLines)
    ? dotLines.join('\n')
    : String(dotLines);

  const nodes = [];
  const edges = [];
  const nodeLabels = {};  // nN -> label

  // Match node definitions: nN [label="..."]
  // Handle optional extra attributes after label
  const nodeRe = /\b(n\d+)\s*\[\s*label\s*=\s*"([^"]*?)"/g;
  let m;
  while ((m = nodeRe.exec(dotString)) !== null) {
    const id = m[1];
    const label = m[2];
    nodeLabels[id] = label;
    nodes.push({ id, label });
  }

  // Match edge definitions: nN -> nM
  const edgeRe = /\b(n\d+)\s*->\s*(n\d+)/g;
  while ((m = edgeRe.exec(dotString)) !== null) {
    edges.push({ source: m[1], target: m[2] });
  }

  return { nodes, edges };
}

// Dagre Layout
//
// Takes parsed nodes/edges and computes x,y positions using dagre.
// Returns nodes in ReactFlow format: { id, data, position, type }.

const NODE_WIDTH = 220;
const NODE_HEIGHT = 56;

export function layoutGraph(parsedNodes, parsedEdges, profileMap) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',       // top to bottom (pipeline flows downward)
    nodesep: 24,         // horizontal spacing between nodes
    ranksep: 40,         // vertical spacing between ranks
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with fixed dimensions (dagre needs these to compute positions)
  parsedNodes.forEach(n => {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges
  parsedEdges.forEach(e => {
    g.setEdge(e.source, e.target);
  });

  // Run the layout algorithm
  dagre.layout(g);

  // Convert to ReactFlow node format
  const rfNodes = parsedNodes.map(n => {
    const pos = g.node(n.id);
    const profile = profileMap[n.label] || null;
    return {
      id: n.id,
      type: 'processor',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        label: n.label,
        profile,
      },
    };
  });

  // Convert to ReactFlow edge format
  const rfEdges = parsedEdges.map((e, i) => ({
    id: `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: false,
    style: { strokeWidth: 1.5, stroke: 'var(--text-muted)' },
    markerEnd: { type: 'arrowclosed', width: 14, height: 14, color: 'var(--text-muted)' },
  }));

  return { rfNodes, rfEdges };
}

// Heatmap Color
//
// White (#FFFFFF) for fastest, deep orange (#FF8000) for slowest.
// Mirrors the original ClickHouse tool's color scale.

export function heatmapColor(elapsedUs, minUs, maxUs) {
  const range = maxUs - minUs;
  const t = range === 0 ? 0.5 : (elapsedUs - minUs) / range;
  const green = Math.round(255 - t * 127);
  const blue = Math.round(255 * (1 - t));
  const hex = v => v.toString(16).padStart(2, '0');
  return `#FF${hex(green)}${hex(blue)}`;
}

// Compute min/max elapsed across all processors
export function computeHeatmapRange(profileMap) {
  let minUs = Infinity;
  let maxUs = 0;
  for (const data of Object.values(profileMap)) {
    if (data.elapsed_us > maxUs) maxUs = data.elapsed_us;
    if (data.elapsed_us < minUs) minUs = data.elapsed_us;
  }
  if (minUs === Infinity) minUs = 0;
  return { minUs, maxUs };
}

// Formatting

export function formatUs(us) {
  const n = Number(us) || 0;
  if (n < 1000) return `${n} us`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(2)} ms`;
  return `${(n / 1_000_000).toFixed(2)} s`;
}

export function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let v = n;
  do { v /= 1024; ++i; } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(2)} ${units[i]}`;
}

export function formatNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export function formatDuration(ms) {
  const n = Number(ms);
  if (!isFinite(n)) return String(ms);
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

// SQL Templates

export function stripTrailingFormatAndSemicolons(queryText) {
  let q = queryText.replace(/\s+$/, '');
  q = q.replace(/;+\s*$/, '');
  q = q.replace(/\s+FORMAT\s+[A-Za-z0-9_]+\s*$/i, '');
  return q;
}

export const DEFAULT_WHERE = "type = 'QueryFinish' AND query_kind = 'Select' AND event_time > now() - INTERVAL 24 HOUR";

export function buildQueryListSql(where) {
  return `
    SELECT
      query_id,
      user,
      event_time,
      query_duration_ms,
      substring(replaceRegexpAll(query, '[\\s]+', ' '), 1, 120) AS query_preview
    FROM merge('system', '^query_log')
    WHERE ${where}
    ORDER BY event_time DESC
    LIMIT 300`;
}

export function buildQueryListSqlQuery_ID(where) {
  return `
    SELECT
      query_id,
      user,
      event_time,
      query_duration_ms,
      substring(replaceRegexpAll(query, '[\\s]+', ' '), 1, 120) AS query_preview
    FROM merge('system', '^query_log')
    WHERE ${where}  LIMIT 1`;
}

export function buildQueryTextSql(queryId) {
  return `
    SELECT query
    FROM merge('system', '^query_log')
    WHERE query_id = '${queryId}' AND type = 'QueryFinish'`;
}

// queryId.replace(/'/g, "''") insert the buildquerytextsql where condition

export function buildExplainPipelineSql(queryText) {
  const cleaned = stripTrailingFormatAndSemicolons(queryText);
  return `EXPLAIN PIPELINE compact=0, graph=1 ${cleaned}`;
}

export function buildProfileDataSql(queryId) {
  return `
    SELECT
      toString(step_uniq_id)        AS step_id,
      toString(processor_uniq_id)   AS processor_id,
      any(name)                     AS name,
      sum(elapsed_us)               AS elapsed_us,
      sum(input_wait_elapsed_us)    AS input_wait_us,
      sum(output_wait_elapsed_us)   AS output_wait_us,
      sum(input_rows)               AS input_rows,
      sum(input_bytes)              AS input_bytes,
      sum(output_rows)              AS output_rows,
      sum(output_bytes)             AS output_bytes
    FROM merge('system', '^processors_profile_log')
    WHERE query_id = '${queryId.replace(/'/g, "''")}'
    GROUP BY step_uniq_id, processor_uniq_id`;
}

// Profile Map Builder
//
// Converts the rows from processors_profile_log into a lookup map
// keyed by processor_uniq_id.

export function buildProfileMap(rows) {
  const map = {};
  const numCols = ['elapsed_us', 'input_wait_us', 'output_wait_us',
                   'input_rows', 'input_bytes', 'output_rows', 'output_bytes'];
  for (const row of rows) {
    const procId = row.processor_id;
    if (!procId) continue;
    const data = { step_id: row.step_id, name: row.name };
    for (const col of numCols) {
      data[col] = parseInt(row[col], 10) || 0;
    }
    map[procId] = data;
  }
  return map;
}

// Filter form helpers
//
// Used by the Processors Profile filter form. The form composes a WHERE clause
// with the event_time range always first (the table is sorted by event_time),
// and populates the query_kind / type dropdowns from the distinct values present
// in the selected time window.

// Default form values that reproduce the previous DEFAULT_WHERE behavior.
export const DEFAULT_KIND = "Select";
export const DEFAULT_TYPE = "QueryFinish";
export const DEFAULT_RANGE_MINUTES = 60; // one hour lookback

// Escape single quotes for embedding inside a SQL string literal.
function sqlEscapeValue(s) {
  return String(s).replace(/'/g, "''");
}

// A datetime-local input gives 'YYYY-MM-DDTHH:MM' (or with seconds). ClickHouse
// wants 'YYYY-MM-DD HH:MM:SS'. Convert: swap the 'T' for a space, add seconds.
export function toChDateTime(v) {
  if (!v) return "";
  let s = String(v).replace("T", " ").trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) s += ":00";
  return s;
}

// Format a Date as a datetime-local input value 'YYYY-MM-DDTHH:MM' in LOCAL time.
// Used to seed the start/end inputs with sensible defaults.
export function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// The default start/end range: end = now, start = now - DEFAULT_RANGE_MINUTES.
export function defaultTimeRange() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_RANGE_MINUTES * 60 * 1000);
  return { start: toLocalInputValue(start), end: toLocalInputValue(end) };
}

// Compose the browse-mode WHERE. The event_time range is ALWAYS first, because
// the table is sorted by event_time. query_kind and type are omitted when their
// value is "" (the "All" option).
export function composeProcessorsWhere({ start, end, queryKind, type }) {
  const parts = [
    `event_time >= '${toChDateTime(start)}'`,
    `event_time <= '${toChDateTime(end)}'`,
  ];
  if (queryKind) parts.push(`query_kind = '${sqlEscapeValue(queryKind)}'`);
  if (type) parts.push(`type = '${sqlEscapeValue(type)}'`);
  return parts.join(" AND ");
}

// SQL to fetch the distinct values of a column within the selected time window,
// used to populate the dropdowns. The column is allow-listed to prevent any
// injection through the column name.
export function buildDistinctValuesSql(column, start, end) {
  const allowed = { query_kind: true, type: true };
  if (!allowed[column]) throw new Error("Column not allowed: " + column);
  return `
    SELECT DISTINCT ${column} AS v
    FROM merge('system', '^query_log')
    WHERE event_time >= '${toChDateTime(start)}' AND event_time <= '${toChDateTime(end)}'
      AND ${column} != ''
    ORDER BY v`;
}
