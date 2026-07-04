// schemaGraphLayout.js - Dagre layout engine for schema visualizer
//
// Takes a graph of database tables and computes x,y positions using dagre
// for the schema visualizer. Nodes are sized dynamically based on column
// count and whether columns are shown. Used to lay out the dependency graph
// of tables, views, materialized views, dictionaries, and distributed tables.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import dagre from '@dagrejs/dagre';

const NODE_W = 240;
const NODE_GAP = 40;
const RANK_GAP = 60;

export function estimateNodeSize(node, showColumns) {
  const colCount = showColumns ? Math.min(node.columns.length, 14) : 0;
  const moreRow = showColumns && node.columns.length > 14 ? 1 : 0;
  const colHeight = Math.min((colCount + moreRow) * 17, 220);
  return { w: NODE_W, h: 36 + colHeight };
}

// Layout all visible nodes in one dagre graph.
// Writes x, y, w, h onto each node object.
export function layoutGraph(nodesMap, visibleKeys, edges, showColumns) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: NODE_GAP, ranksep: RANK_GAP, marginx: 20, marginy: 20 });

  // Size each visible node and add to dagre.
  for (const key of visibleKeys) {
    const n = nodesMap.get(key);
    if (!n) continue;
    const s = estimateNodeSize(n, showColumns);
    n.w = s.w;
    n.h = s.h;
    g.setNode(key, { width: n.w, height: n.h });
  }

  // Add edges between visible nodes.
  for (const e of edges) {
    if (visibleKeys.has(e.from) && visibleKeys.has(e.to)) {
      g.setEdge(e.from, e.to);
    }
  }

  dagre.layout(g);

  // dagre returns center positions. Convert to top-left and write back.
  for (const key of visibleKeys) {
    const n = nodesMap.get(key);
    if (!n) continue;
    const pos = g.node(key);
    if (pos) {
      n.x = pos.x - n.w / 2;
      n.y = pos.y - n.h / 2;
    }
  }
}