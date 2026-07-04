// treeUtils.js - Tree dimension and series utilities for ECharts tree charts
//
// Shared helpers for rendering tree-based visualizations in ECharts
// (flame graphs, EXPLAIN AST, pipeline graphs). Computes tree dimensions
// based on node count, depth, and label lengths. Provides both left-to-right
// and top-to-bottom layout configurations with dynamic padding based on
// label text length to prevent cropping.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
export function countLeaves(node) {
  if (!node) return 0;
  if (!node.children || node.children.length === 0) return 1;
  let n = 0;
  for (const c of node.children) n += countLeaves(c);
  return n;
}

export function maxDepth(node, d = 0) {
  if (!node?.children?.length) return d;
  return Math.max(...node.children.map(c => maxDepth(c, d + 1)));
}

export function countAll(node) {
  if (!node) return 0;
  let n = 1;
  if (node.children) for (const c of node.children) n += countAll(c);
  return n;
}

function longestLabel(node, max = 0) {
  if (!node) return max;
  const len = (node.name || '').length;
  if (len > max) max = len;
  if (node.children) for (const c of node.children) max = longestLabel(c, max);
  return max;
}

// Find the root node label length (for left margin in LR trees).
function rootLabelLen(tree) {
  return (tree?.name || '').length;
}

// Left-to-right tree dimensions.
export function treeSize(tree) {
  const leaves = countLeaves(tree);
  const depth = maxDepth(tree);
  const label = longestLabel(tree);
  const rootLen = rootLabelLen(tree);
  const height = Math.max(350, leaves * 28 + 100);
  const labelPx = Math.min(label * 7.5, 280);
  // Extra width for root label on the left side
  const rootPx = rootLen * 8 + 30;
  const width = Math.max(500, depth * 150 + labelPx + rootPx + 120);
  return { height, width };
}

// Top-to-bottom tree dimensions (EXPLAIN AST/Pipeline).
export function treeSizeTB(tree) {
  const leaves = countLeaves(tree);
  const depth = maxDepth(tree);
  // More horizontal room per leaf since labels sit below nodes
  const width = Math.max(600, leaves * 160 + 200);
  // More vertical room per depth level to accommodate wrapped labels below nodes.
  // Extra 80px at bottom for the deepest nodes' labels.
  const height = Math.max(400, depth * 120 + 280);
  return { height, width };
}

// Left-to-right tree series config.
// Left margin is calculated in PIXELS from the root label length
// so the root node text never gets cropped. ECharts accepts pixel
// values as numbers for top/left/bottom/right.
export function treeSeries(tree, isDark) {
  const lc = isDark ? '#cbd5e1' : '#1a1a2e';
  const label = longestLabel(tree);
  const rootLen = rootLabelLen(tree);
  // Pixel margins: enough for label text at each edge
  const leftPx = rootLen * 8 + 20;
  const rightPx = Math.min(label * 7 + 16, 280);
  return {
    type: "tree",
    data: [tree],
    top: 20,
    left: leftPx,
    bottom: 20,
    right: rightPx,
    symbolSize: 12,
    edgeForkPosition: "60%",
    label: {
      position: "top",
      verticalAlign: "middle",
      align: "center",
      fontSize: 10,
      color: lc,
      distance: 8,
      width: 300,
      overflow: "break",
      lineHeight: 12
    },
   nodeGap: 180,
layerGap: 300,
    leaves: {
      label: {
        position: "right",
        verticalAlign: "middle",
        align: "left",
        width: 140,
        overflow: "break",
        lineHeight: 12
      },
    },
    lineStyle: { color: isDark ? "#475569" : "#94a3b8", width: 1.5 },
    emphasis: { focus: "descendant" },
    expandAndCollapse: true,
    initialTreeDepth: 3,
    animationDuration: 550,
  };
}