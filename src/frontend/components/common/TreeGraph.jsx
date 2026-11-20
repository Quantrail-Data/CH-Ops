// TreeGraph: shows a tree (for example user -> roles -> grants) as a graph
// from left to right. Built on React Flow, with dagre for the layout.
//
// - A click on a node shows a moving beam on the path from the root to it.
// - The +N button on a node opens its children; the arrow button closes them.
// - Zoom, fit and fullscreen; Download PNG saves the whole tree as a picture.
//
// Props:
//   tree          the root node: { name, kind, tone, children } (see
//                 utils/treeGraphLayout.js); null shows emptyMessage
//   fileName      the PNG file name, for example "user-grants.png"
//   emptyMessage  the text when there is no tree
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { Badge, Button } from "../ui/index.jsx";
import { useBackgroundMotion } from "../../utils/backgroundMotion.js";
import {
  findStartClosedIds,
  flattenTree,
  findPathToRoot,
  layoutTree,
} from "../../utils/treeGraphLayout.js";

// A big tree gets a minimap to help find the way.
const MINIMAP_NODE_COUNT = 40;
// The flow beam runs on all lines only while the tree shows at most this
// many lines. A bigger tree keeps the beam on the selected path only.
const MAX_FLOW_EDGE_COUNT = 80;
// The flow beam starts this many seconds later on each level, so it moves
// out from the root, level by level.
const FLOW_DELAY_PER_LEVEL = 0.35;
// The largest PNG side before the 2x export, in pixels. A larger tree is
// scaled down to fit.
const MAX_IMAGE_SIDE = 3000;

function TreeNodeCard({ data }) {
  const className = ["tree-node", `tree-node-${data.tone}`, data.isOnPath ? "is-on-path" : ""].join(" ");
  return (
    <div className={className} style={{ width: data.width }} title={data.name}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {data.kind && (
        <Badge tone={data.tone} className="tree-node-kind">
          {data.kind}
        </Badge>
      )}
      <span className="tree-node-name">{data.name}</span>
      {data.childCount > 0 && (
        <button
          type="button"
          className="tree-node-toggle nodrag"
          aria-expanded={!data.isClosed}
          aria-label={data.isClosed ? `Open ${data.name} (${data.childCount})` : `Close ${data.name}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggle(data.id);
          }}
        >
          {/* Text, not an icon: the PNG export keeps text but not the icon sprite. */}
          {data.isClosed ? `+${data.childCount}` : "\u2212"}
        </button>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

// An edge: a curve from the parent to the child (as in Magic UI Animated
// Beam), so lines to many children do not lie on top of each other.
// - showFlow: a faint beam moves from the parent to the child (direction).
// - isOnPath: the line is on the selected path; its beam is bright.
function BeamEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });
  const isOnPath = Boolean(data?.isOnPath);
  const hasBeam = isOnPath || Boolean(data?.showFlow);
  // An SVG id may not have "/" or ">" in a url() reference.
  const gradientId = `tree-beam-${id.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const beamClass = isOnPath ? "tree-edge-beam" : "tree-edge-beam is-flow";
  const beamDelay = isOnPath ? "0s" : `${(data?.depth || 0) * FLOW_DELAY_PER_LEVEL}s`;
  return (
    <>
      <BaseEdge id={id} path={path} className={isOnPath ? "tree-edge is-on-path" : "tree-edge"} />
      {hasBeam && (
        <>
          <defs>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
              <stop offset="0%" style={{ stopColor: "var(--beam-start)" }} />
              <stop offset="100%" style={{ stopColor: "var(--beam-end)" }} />
            </linearGradient>
          </defs>
          <path
            d={path}
            pathLength={100}
            className={beamClass}
            stroke={`url(#${gradientId})`}
            style={{ animationDelay: beamDelay }}
          />
        </>
      )}
    </>
  );
}

const NODE_TYPES = { treeNode: TreeNodeCard };
const EDGE_TYPES = { beam: BeamEdge };

function TreeGraphInner({ tree, fileName, emptyMessage }) {
  const { fitView, getNodes, getViewport, setViewport } = useReactFlow();
  const wrapperRef = useRef(null);
  const [closedIds, setClosedIds] = useState(() => findStartClosedIds(tree));
  const [selectedId, setSelectedId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The node that was opened or closed last, and where it was before the
  // new layout. The view moves so that it stays at the same place on screen.
  const [toggledNode, setToggledNode] = useState(null);

  // A new tree starts again: the default open depth and no selection.
  useEffect(() => {
    setClosedIds(findStartClosedIds(tree));
    setSelectedId(null);
  }, [tree]);

  const flat = useMemo(() => flattenTree(tree, closedIds), [tree, closedIds]);
  const placedNodes = useMemo(() => layoutTree(flat.nodes, flat.edges), [flat]);
  const path = useMemo(
    () => (selectedId ? findPathToRoot(selectedId, flat.nodes) : { nodeIds: new Set(), edgeIds: new Set() }),
    [selectedId, flat.nodes],
  );

  function toggleNode(nodeId) {
    const before = placedNodes.find((node) => node.id === nodeId);
    if (before) setToggledNode({ id: nodeId, x: before.x, y: before.y });
    setClosedIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  const flowNodes = placedNodes.map((node) => ({
    id: node.id,
    type: "treeNode",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    data: { ...node, isOnPath: path.nodeIds.has(node.id), onToggle: toggleNode },
  }));
  // The flow beam follows the Background animation switch in the user menu.
  const isMotionOn = useBackgroundMotion();
  const showFlow = isMotionOn && flat.edges.length <= MAX_FLOW_EDGE_COUNT;
  const depthById = new Map(flat.nodes.map((node) => [node.id, node.depth]));
  const flowEdges = flat.edges.map((edge) => ({
    ...edge,
    type: "beam",
    data: {
      isOnPath: path.edgeIds.has(edge.id),
      showFlow,
      depth: depthById.get(edge.source) || 0,
    },
  }));

  // Fit the whole tree when the tree or the fullscreen mode changes.
  useEffect(() => {
    // maxZoom keeps a small tree at a normal size.
    const timer = setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.2 }), 50);
    return () => clearTimeout(timer);
  }, [tree, isFullscreen, fitView]);

  // After a node opens or closes, the layout changes. Move the view by the
  // same amount, so the node stays at the same place on screen.
  useEffect(() => {
    if (!toggledNode) return;
    const after = placedNodes.find((node) => node.id === toggledNode.id);
    setToggledNode(null);
    if (!after) return;
    const viewport = getViewport();
    setViewport({
      x: viewport.x - (after.x - toggledNode.x) * viewport.zoom,
      y: viewport.y - (after.y - toggledNode.y) * viewport.zoom,
      zoom: viewport.zoom,
    });
  }, [toggledNode, placedNodes, getViewport, setViewport]);

  async function downloadPng() {
    const viewportElement = wrapperRef.current?.querySelector(".react-flow__viewport");
    if (!viewportElement) return;
    const bounds = getNodesBounds(getNodes());
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bounds.width + 64, bounds.height + 64));
    const imageWidth = Math.round((bounds.width + 64) * scale);
    const imageHeight = Math.round((bounds.height + 64) * scale);
    const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.05, 2, 0.05);
    const pageBackground = getComputedStyle(document.body).backgroundColor;
    const dataUrl = await toPng(viewportElement, {
      backgroundColor: pageBackground,
      pixelRatio: 2,
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    link.click();
  }

  if (!tree) {
    return (
      <div className="card tree-graph-card">
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={isFullscreen ? "card tree-graph-card is-fullscreen" : "card tree-graph-card"}>
      <div className="tree-graph-toolbar">
        <Button size="sm" variant="ghost" icon="ti-download" onClick={downloadPng}>
          Download PNG
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={isFullscreen ? "ti-arrows-minimize" : "ti-arrows-maximize"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={() => setIsFullscreen(!isFullscreen)}
        />
      </div>
      <div className="tree-graph-canvas">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={(event, node) => setSelectedId(node.id === selectedId ? null : node.id)}
          onPaneClick={() => setSelectedId(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onlyRenderVisibleElements
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          {flat.nodes.length > MINIMAP_NODE_COUNT && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
    </div>
  );
}

export default function TreeGraph(props) {
  return (
    <ReactFlowProvider>
      <TreeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
