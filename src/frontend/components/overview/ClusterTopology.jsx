// Copyright (C) 2026 Quantrail™ Data Private Limited
// Block diagram of every configured cluster, laid out one column per shard and one row per replica.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import InfoTip from "../common/InfoTip.jsx";


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
.chops-topology .react-flow__controls-button:hover { background: var(--bg-sunken); }
.chops-topology .react-flow__controls-button svg { fill: var(--text-primary); }
.chops-topology .react-flow__minimap {
  background: var(--bg-sunken);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}
.chops-topology .react-flow__background { opacity: 0.5; }
`;

// Eight hues, cycled.
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

// The health columns system.clusters carries
const HEALTH_COLUMNS = [
  { key: "errors_count", label: "Errors", kind: "count" },
  { key: "slowdowns_count", label: "Slowdowns", kind: "count" },
  { key: "estimated_recovery_time", label: "Est. recovery", kind: "seconds" },
  { key: "recovery_time", label: "Recovery", kind: "millis" },
  { key: "replication_lag", label: "Replication lag", kind: "count" },
  { key: "unsynced_after_recovery", label: "Unsynced", kind: "count" },
];

/** Null and undefined mean "not reported"; zero is a real reading. */
export function readHealth(row, key) {
  const raw = row?.[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Render a health value, keeping "not reported" distinct from zero. */
export function formatHealth(value, kind) {
  if (value === null) return "-";
  if (value === 0) return "0";
  if (kind === "seconds") return fmtDuration(value);
  if (kind === "millis") return fmtDuration(value / 1000);
  return String(value);
}

function fmtDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Anything above zero on any health column is worth surfacing. */
export function nodeIsUnhealthy(row) {
  return HEALTH_COLUMNS.some(({ key }) => (readHealth(row, key) ?? 0) > 0);
}

function TopologyNode({ data }) {
  const {
    hostName, hostAddress, port, shard, replica,
    errors, slowdowns, isLocal, isActive, selected,
  } = data;

  const fill = SHARD_FILLS[(shard - 1) % SHARD_FILLS.length];
  const stroke = REPLICA_STROKES[(replica - 1) % REPLICA_STROKES.length];


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
          style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }}
        />
        <InfoTip what={dotTitle} />
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
        title={`${hostAddress}:${port}${isLocal ? "  (this node)" : ""}`}
      >
        {hostAddress}:{port}
        {isLocal ? "  (this node)" : ""}
      </div>

      {/* Only rendered when something is wrong, so a healthy cluster stays quiet. */}
      {(errors > 0 || slowdowns > 0) && (
        <div style={{ display: "flex", gap: 8, fontSize: "0.6875rem", fontWeight: 600 }}>
          {errors > 0 && <span style={{ color: "var(--color-danger)" }}>{errors} errors</span>}
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
  // Sorted by name, not by health.
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
          errors: readHealth(node, "errors_count") ?? 0,
          slowdowns: readHealth(node, "slowdowns_count") ?? 0,
          isLocal: node.is_local === 1 || node.is_local === true,
          isActive: node.is_active,
          selected: node.host_address === selectedHost || node.host_name === selectedHost,
        },
      });
    });
  });

  return flowNodes;
}

// The health table under each diagram.

function HealthTable({ nodes }) {
  const columns = HEALTH_COLUMNS.filter((c) =>
    nodes.some((n) => readHealth(n, c.key) !== null),
  );
  if (!columns.length) return null;

  const cell = { padding: "4px 8px", fontFamily: "var(--font-code)", fontSize: "0.6875rem" };
  const head = {
    ...cell,
    color: "var(--text-muted)",
    textAlign: "left",
    borderBottom: "1px solid var(--border-default)",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        // Sits beside the diagram and wraps under it on a narrow screen. Sized
        // to its content rather than to a share of the row, because a table of
        // small integers does not benefit from extra width.
        flex: "1 1 280px",
        minWidth: 0,
        maxWidth: 520,
        overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>Node</th>
            {columns.map((c) => (
              <th key={c.key} style={{ ...head, textAlign: "right" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={`${n.shard_num}-${n.replica_num}-${n.host_address}`}>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                {n.host_name}
                <span style={{ color: "var(--text-muted)" }}>
                  {"  "}S{n.shard_num}/R{n.replica_num}
                </span>
              </td>
              {columns.map((c) => {
                const v = readHealth(n, c.key);
                const bad = (v ?? 0) > 0;
                return (
                  <td
                    key={c.key}
                    style={{
                      ...cell,
                      textAlign: "right",
                      color: bad ? "var(--color-danger)" : "var(--text-muted)",
                      fontWeight: bad ? 700 : 400,
                    }}
                    title={v === null ? "Not reported by this cluster" : undefined}
                  >
                    {formatHealth(v, c.kind)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClusterCanvas({ cluster, selectedHost, onSelectNode }) {
  const { fitView } = useReactFlow();
  const [fullscreen, setFullscreen] = useState(false);

  const flowNodes = useMemo(
    () => buildFlow(cluster.nodes, selectedHost),
    [cluster.nodes, selectedHost],
  );

  // fitView after the nodes change, and again after a fullscreen toggle, because
  // the container has only just been resized when the effect runs.
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15 }), 80);
    return () => clearTimeout(timer);
  }, [flowNodes, fullscreen, fitView]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const onNodeClick = useCallback(
    (_event, node) => {
      if (node.type !== "chNode") return;
      onSelectNode?.(node.data.hostAddress, node.data.hostName);
    },
    [onSelectNode],
  );

  const unhealthy = cluster.nodes.filter(nodeIsUnhealthy).length;

  const shardCounts = cluster.nodes.reduce((acc, n) => {
    const shard = Number(n.shard_num) || 1;
    acc[shard] = (acc[shard] || 0) + 1;
    return acc;
  }, {});
  const tallestShard = Math.max(1, ...Object.values(shardCounts));
  const height = Math.min(560, HEADER + tallestShard * (NODE_HEIGHT + ROW_GAP) + GROUP_PAD + 60);

  const shell = fullscreen
    ? {
        padding: 16,
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg-page)",
        display: "flex",
        flexDirection: "column",
        marginBottom: 0,
      }
    : { padding: 16, marginBottom: 16 };

  return (
    <div className="card" style={shell}>
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
            {unhealthy} of {cluster.nodes.length} reporting problems
          </span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={() => setFullscreen((v) => !v)}
          title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        >
          <Icon className={`ti ti-${fullscreen ? "arrows-minimize" : "arrows-maximize"}`} />
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "stretch",
          flex: fullscreen ? 1 : undefined,
          minHeight: fullscreen ? 0 : undefined,
        }}
      >
      <div
        className="chops-topology"
        style={{
          // Grows to fill, but never below 380px, at which point the health
          // table wraps underneath instead of squeezing the diagram flat.
          flex: "1 1 380px",
          minWidth: 0,
          height: fullscreen ? "auto" : Math.max(220, height),
        }}
      >
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
          <Controls showInteractive={false} showZoom showFitView position="bottom-right" />
          {cluster.nodes.length > 12 && (
            <MiniMap pannable zoomable nodeColor={() => "var(--text-muted)"} maskColor="rgba(0,0,0,0.35)" />
          )}
        </ReactFlow>
      </div>

        <HealthTable nodes={cluster.nodes} />
      </div>
    </div>
  );
}

export default function ClusterTopology({ rows, loading, selectedHost, onSelectNode }) {
  // Collapsed by default.
  const [open, setOpen] = useState(false);
  const clusters = useMemo(() => groupByCluster(rows), [rows]);

  const totalNodes = clusters.reduce((n, c) => n + c.nodes.length, 0);
  const unhealthy = (rows || []).filter(nodeIsUnhealthy).length;

  const header = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="btn btn-ghost"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        justifyContent: "flex-start",
        padding: "10px 12px",
      }}
    >
      <Icon className={`ti ti-chevron-${open ? "up" : "down"}`} />
      <span style={{ fontWeight: 600 }}>Cluster topology</span>
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>
        {loading && !rows
          ? "loading"
          : `${clusters.length} ${clusters.length === 1 ? "cluster" : "clusters"}, ${totalNodes} ${
              totalNodes === 1 ? "node" : "nodes"
            }`}
      </span>
      {/* The summary has to carry the health, or collapsing the section hides a
          problem the page is meant to surface. */}
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
          {unhealthy} reporting problems
        </span>
      )}
    </button>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{FLOW_THEME_CSS}</style>
      <div className="card" style={{ padding: 0, marginBottom: open ? 12 : 0 }}>
        {header}
      </div>

      {open && loading && !rows?.length && (
        <div className="card" style={{ padding: 24 }}>
          <span className="loading-spinner" /> Loading topology...
        </div>
      )}

      {open && !loading && !clusters.length && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            <Icon className="ti ti-info-circle" /> No clusters are configured on this server.
          </div>
        </div>
      )}

      {open &&
        clusters.map((cluster) => (
          // One provider per canvas. A shared provider is a shared store, which
          // is what made every cluster render the same nodes and pan together.
          <ReactFlowProvider key={cluster.name}>
            <ClusterCanvas
              cluster={cluster}
              selectedHost={selectedHost}
              onSelectNode={onSelectNode}
            />
          </ReactFlowProvider>
        ))}
    </div>
  );
}
