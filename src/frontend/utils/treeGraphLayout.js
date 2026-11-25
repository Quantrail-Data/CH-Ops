// Helpers for TreeGraph: they turn a tree into nodes and edges for React Flow
// and give each node a position (dagre, left to right).
//
// A tree node is { name, kind, tone, children }:
//   name      the text on the node
//   kind      a short type name shown on the node, for example "role"
//   tone      a color name: accent, success, warning, danger, info or neutral
//   children  an array of tree nodes (optional)
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import dagre from "@dagrejs/dagre";

export const NODE_HEIGHT = 40;
const MIN_NODE_WIDTH = 120;
const MAX_NODE_WIDTH = 320;
const CHARACTER_WIDTH = 7.5;
const NODE_GAP = 12;
const LEVEL_GAP = 70;

// Node ids are the path from the root, so the same tree always gives the
// same ids. The index keeps two children with the same name apart.
function childId(parentId, index) {
  return `${parentId}/${index}`;
}

// Nodes deeper than openDepth start closed. The root has depth 0. A node
// with more than maxOpenChildren children also starts closed, so a big tree
// does not show hundreds of nodes at once.
export function findStartClosedIds(tree, openDepth = 4, maxOpenChildren = 25) {
  const closedIds = new Set();
  function visit(node, id, depth) {
    const children = node.children || [];
    const isDeep = depth >= openDepth;
    const hasManyChildren = children.length > maxOpenChildren;
    if (children.length > 0 && (isDeep || hasManyChildren)) closedIds.add(id);
    children.forEach((child, index) => visit(child, childId(id, index), depth + 1));
  }
  if (tree) visit(tree, "root", 0);
  return closedIds;
}

// Turns the tree into a list of nodes and edges. The children of a closed
// node are left out.
export function flattenTree(tree, closedIds = new Set()) {
  const nodes = [];
  const edges = [];
  function visit(node, id, parentId, depth) {
    const children = node.children || [];
    const isClosed = closedIds.has(id);
    nodes.push({
      id,
      parentId,
      depth,
      name: node.name,
      kind: node.kind || "",
      tone: node.tone || "neutral",
      childCount: children.length,
      isClosed,
    });
    if (parentId) edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
    if (isClosed) return;
    children.forEach((child, index) => visit(child, childId(id, index), id, depth + 1));
  }
  if (tree) visit(tree, "root", null, 0);
  return { nodes, edges };
}

// The ids of the nodes and edges from the root to the given node. TreeGraph
// draws the beam on these edges.
export function findPathToRoot(nodeId, nodes) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIds = new Set();
  const edgeIds = new Set();
  let current = nodeById.get(nodeId);
  while (current) {
    nodeIds.add(current.id);
    if (!current.parentId) break;
    edgeIds.add(`${current.parentId}->${current.id}`);
    current = nodeById.get(current.parentId);
  }
  return { nodeIds, edgeIds };
}

// The node width fits its text (kind badge plus name), within limits.
export function estimateNodeWidth(node) {
  const textLength = (node.name || "").length + (node.kind || "").length + 4;
  const width = 48 + textLength * CHARACTER_WIDTH;
  return Math.round(Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, width)));
}

// Gives each node x, y (top left), width and height.
export function layoutTree(nodes, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: NODE_GAP, ranksep: LEVEL_GAP, marginx: 16, marginy: 16 });
  for (const node of nodes) {
    graph.setNode(node.id, { width: estimateNodeWidth(node), height: NODE_HEIGHT });
  }
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);
  return nodes.map((node) => {
    const placed = graph.node(node.id);
    return {
      ...node,
      width: placed.width,
      height: placed.height,
      // dagre gives the center; React Flow needs the top left corner.
      x: placed.x - placed.width / 2,
      y: placed.y - placed.height / 2,
    };
  });
}
