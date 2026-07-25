// Copyright (C) 2026 Quantrail™ Data Private Limited
// Block diagram of every configured cluster, laid out one column per shard and
// one row per replica.
//
// There are deliberately no edges. Replicas of a shard are peers, not a chain,
// so any line drawn between two nodes would be inventing a relationship the
// server does not have. The grid position carries the topology on its own, and
// a light group container per shard carries the grouping.
//
// Colour encodes shard by fill and replica by outline, which is two colour
// channels doing all the work. That fails for colourblind readers and once the
// shard count exceeds the palette, so every node also states its position as
// text. Colour is the fast path; "S1/R2" is the ground truth.

import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Icon from "../common/Icon.jsx";

// @xyflow/react's stylesheet hardcodes a dark text colour on nodes and ships
// light-theme controls with white backgrounds and dark glyphs. On the dark theme
// that renders node text and every control icon at almost exactly the background
// colour. None of it reads a CSS variable, so it is overridden here rather than
// in global.css, which keeps the fix next to the component that needs it.
const FLOW_THEME_CSS = `
.chops-topology .react-flow__node { color: var(--text-primary); }
.chops-topology .react-flow__attribution { display: none; }
.chops-topology .react-flow__controls {
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.chops-topology .react-flow__controls-button {
  background: var(--bg-elevated, var(--bg-page));
  border-bottom: 1px solid var(--border-default);
  fill: var(--text-primary);
  color: var(--text-primary);
  width: 26px;
  height: 26px;
}
.chops-topology .react-flow__controls-button:hover {
  background: var(--bg-sunken);
}
.chops-topology .react-flow__controls-button svg { fill: var(--text-primary); }
.chops-topology .react-flow__minimap {
  background: var(--bg-sunken);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}
.chops-topology .react-flow__background { opacity: 0.5; }
`;

// Eight hues, cycled. Beyond eight shards the text label disambiguates, which
// is why cycling is acceptable rather than a bug.
const SHARD_FILLS = [
  "rgba(59,130,246,0.18)", "rgba(139,92,246,0.18)", "rgba(34,197,94,0.18)",
  "rgba(245,158,11,0.18)", "rgba(236,72,153,0.18)", "rgba(6,182,212,0.18)",
  "rgba(249,115,22,0.18)", "rgba(132,204,22,0.18)",
];
const REPLICA_STROKES = [
  "#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

const NODE_WIDTH = 210;
const NODE_HEIGHT = 78;
const COL_GAP = 40;
const ROW_GAP = 26;
const GROUP_PAD = 16;
const HEADER = 26;

function TopologyNode({ data }) {
  const {
    hostName, hostAddress, port, shard, replica,
    errors, slowdowns, isLocal, isActive, selected,
  } = data;

  const fill = SHARD_FILLS[(shard - 1) % SHARD_FILLS.length];
  const stroke = REPLICA_STROKES[(replica - 1) % REPLICA_STROKES.length];

  // isActive is Nullable and only populated for clusters using Keeper-backed
  // auto discovery. On a statically configured cluster it is null for every
  // row, so null has to read as "unknown" and never as "down". Painting a
  // healthy cluster red is a worse failure than saying nothing.
  let dot = "var(--text-muted)";
  let dotTitle = "Health unknown. This cluster does not report node liveness.";
  if (errors > 0) {
    dot = "var(--color-danger)";
    dotTitle = `${errors} connection errors recorded`;
  } else if (slowdowns > 0) {
    dot = "var(--color-warning)";
    dotTitle = `${slowdowns} slowdowns recorded`;
  } else if (isActive === 1 || isActive === true) {
    dot = "var(--color-success)";
    dotTitle = "Active";
  }

  return (
    <div
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        boxSizing: "border-box",
        padding: "8px 10px",
        background: fill,
        border: `${isLocal ? 3 : 2}px solid ${stroke}`,
        borderRadius: "var(--radius-sm)",
        color: "var(--text-primary)",
        boxShadow: selected ? "0 0 0 2px var(--accent)" : "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          title={dotTitle}
          style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }}
        />
        <span
          style={{
            fontFamily: "var(--font-code)",
            fontSize: "0.75rem",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
          title={hostName}
        >
          {hostName}
        </span>
        <span
          style={{
            fontSize: "0.625rem",
            fontFamily: "var(--font-chart)",
            fontWeight: 700,
            opacity: 0.8,
            flexShrink: 0,
          }}
        >
          S{shard}/R{replica}
        </span>
      </div>

      <div
        style={{
          fontFamily: "var(--font-code)",
          fontSize: "0.6875rem",
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {hostAddress}:{port}
        {isLocal ? "  (this node)" : ""}
      </div>

      {/* Only rendered when something is wrong, so a healthy cluster stays quiet. */}
      {(errors > 0 || slowdowns > 0) && (
        <div style={{ display: "flex", gap: 8, fontSize: "0.6875rem", fontWeight: 600 }}>
          {errors > 0 && (
            <span style={{ color: "var(--color-danger)" }}>{errors} errors</span>
          )}
          {slowdowns > 0 && (
            <span style={{ color: "var(--color-warning)" }}>{slowdowns} slowdowns</span>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { chNode: TopologyNode };

/** Group rows by cluster, preserving a stable order between polls. */
export function groupByCluster(rows) {
  const byName = new Map();
  for (const row of rows || []) {
    const name = row.cluster;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(row);
  }
  // Sorted by name, not by health. A card that jumps position while someone is
  // reading it is worse than one in an unhelpful place.
  return [...byName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, nodes]) => ({ name, nodes }));
}

function buildFlow(nodes, selectedHost) {
  const shards = [...new Set(nodes.map((n) => Number(n.shard_num) || 1))].sort((a, b) => a - b);
  const maxReplicas = Math.max(
    1,
    ...shards.map((s) => nodes.filter((n) => Number(n.shard_num) === s).length),
  );

  const flowNodes = [];

  shards.forEach((shard, col) => {
    const x = col * (NODE_WIDTH + COL_GAP + GROUP_PAD * 2);
    flowNodes.push({
      id: `shard-${shard}`,
      type: "group",
      position: { x, y: 0 },
      draggable: false,
      selectable: false,
      data: {},
      style: {
        width: NODE_WIDTH + GROUP_PAD * 2,
        height: HEADER + maxReplicas * (NODE_HEIGHT + ROW_GAP) + GROUP_PAD,
        background: "var(--bg-sunken)",
        border: "1px dashed var(--border-default)",
        borderRadius: "var(--radius-sm)",
      },
    });

    const replicas = nodes
      .filter((n) => Number(n.shard_num) === shard)
      .sort((a, b) => Number(a.replica_num) - Number(b.replica_num));

    replicas.forEach((node, row) => {
      flowNodes.push({
        id: `${shard}-${node.replica_num}-${node.host_address}`,
        type: "chNode",
        parentId: `shard-${shard}`,
        extent: "parent",
        draggable: false,
        position: { x: GROUP_PAD, y: HEADER + row * (NODE_HEIGHT + ROW_GAP) },
        data: {
          hostName: node.host_name,
          hostAddress: node.host_address,
          port: node.port,
          shard,
          replica: Number(node.replica_num) || 1,
          errors: Number(node.errors_count) || 0,
          slowdowns: Number(node.slowdowns_count) || 0,
          isLocal: node.is_local === 1 || node.is_local === true,
          isActive: node.is_active,
          selected: node.host_address === selectedHost || node.host_name === selectedHost,
        },
      });
    });
  });

  return flowNodes;
}

function ClusterCanvas({ cluster, selectedHost, onSelectNode }) {
  const { fitView } = useReactFlow();
  const flowNodes = useMemo(
    () => buildFlow(cluster.nodes, selectedHost),
    [cluster.nodes, selectedHost],
  );

  React.useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15 }), 80);
    return () => clearTimeout(timer);
  }, [flowNodes, fitView]);

  const onNodeClick = useCallback(
    (_event, node) => {
      if (node.type !== "chNode") return;
      onSelectNode?.(node.data.hostAddress, node.data.hostName);
    },
    [onSelectNode],
  );

  const unhealthy = cluster.nodes.filter((n) => Number(n.errors_count) > 0).length;

  // Size the canvas to the tallest shard so a two-replica cluster does not get
  // the same slab of empty space as a six-replica one. Capped, because past a
  // point scrolling inside the canvas beats growing the page.
  const shardCounts = cluster.nodes.reduce((acc, n) => {
    const shard = Number(n.shard_num) || 1;
    acc[shard] = (acc[shard] || 0) + 1;
    return acc;
  }, {});
  const tallestShard = Math.max(1, ...Object.values(shardCounts));
  const height = Math.min(560, HEADER + tallestShard * (NODE_HEIGHT + ROW_GAP) + GROUP_PAD + 60);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: "0.9375rem", margin: 0 }}>
          <Icon className="ti ti-topology-star-3" /> {cluster.name}
        </h3>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {cluster.nodes.length} nodes
        </span>
        {unhealthy > 0 && (
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--color-danger)",
              padding: "2px 8px",
              border: "1px solid var(--color-danger)",
              borderRadius: 10,
            }}
          >
            {unhealthy} of {cluster.nodes.length} reporting errors
          </span>
        )}
      </div>

      <div className="chops-topology" style={{ height: Math.max(220, height), width: "100%" }}>
        <ReactFlow
          nodes={flowNodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick
          panOnDrag
          minZoom={0.3}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
        >
          <Background gap={16} size={1} color="var(--border-default)" />
          <Controls
            showInteractive={false}
            showZoom
            showFitView
            position="bottom-right"
          />
          {cluster.nodes.length > 12 && (
            <MiniMap
              pannable
              zoomable
              nodeColor={() => "var(--text-muted)"}
              maskColor="rgba(0,0,0,0.35)"
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export default function ClusterTopology({ rows, loading, selectedHost, onSelectNode }) {
  const clusters = useMemo(() => groupByCluster(rows), [rows]);

  if (loading && !rows?.length) {
    return (
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <span className="loading-spinner" /> Loading topology...
      </div>
    );
  }

  // A stripped configuration can genuinely return nothing. Say so rather than
  // rendering a blank region that looks like a broken component.
  if (!clusters.length) {
    return (
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          <Icon className="ti ti-info-circle" /> No clusters are configured on this server.
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <style>{FLOW_THEME_CSS}</style>
      {clusters.map((cluster) => (
        <ClusterCanvas
          key={cluster.name}
          cluster={cluster}
          selectedHost={selectedHost}
          onSelectNode={onSelectNode}
        />
      ))}
    </ReactFlowProvider>
  );
}
