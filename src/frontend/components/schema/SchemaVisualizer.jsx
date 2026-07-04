// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy,  Sanjeev Kumar G)
// Interactive diagram that visualizes database tables, column relationships, and foreign key mappings.


import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  fetchSchemaData,
  fetchViewsLoad,
  getEnginePalette,
  getEdgeColors,
  fmtBytes,
  fmtRows,
  formatLoadValue,
  loadIntensity,
  loadColour,
  loadBadgeTextColor,
} from "../../utils/schemaParser.js";
import { layoutGraph } from "../../utils/schemaLayout.js";
import SchemaNode from "./SchemaNode.jsx";
import { useTheme } from "../../App.jsx";

const nodeTypes = { schemaNode: SchemaNode };

function SchemaFlow() {
  const { fitView } = useReactFlow();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [graphData, setGraphData] = useState(null);
  const [heatmap, setHeatmap] = useState({
    loadByMv: new Map(),
    loadByEdge: new Map(),
    loadMax: { byMv: {}, byEdge: {} },
  });
  const [selectedKey, setSelectedKey] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dbFilter, setDbFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [showColumns, setShowColumns] = useState(true);
  const [loadDays, setLoadDays] = useState(7);
  const [loadMetric, setLoadMetric] = useState("total_duration_ms");
  const [themeVersion, setThemeVersion] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const mountedRef = useRef(true);
  const adjRef = useRef({ incoming: new Map(), outgoing: new Map() });
  const { theme } = useTheme()

  // heatmap interactive button boolean
  const [isInteractive, setIsInteractive] = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const o = new MutationObserver(() => setThemeVersion((v) => v + 1));
    o.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => o.disconnect();
  }, []);

  // Reset table filter when database changes.
  useEffect(() => {
    setTableFilter("");
    setSelectedKey(null);
  }, [dbFilter]);

  // Fetch schema on mount (for dropdowns, not for drawing).
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus("Loading schema...");
    try {
      const d = await fetchSchemaData();
      if (mountedRef.current) {
        setGraphData(d);
        setStatus(
          `${d.tables.length} tables loaded. Select a database and table.`,
        );
      }
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch heatmap when load period changes (only if graph data exists).
  useEffect(() => {
    if (!graphData) return;
    let cancelled = false;
    (async () => {
      if (loadDays > 0) {
        const hm = await fetchViewsLoad(graphData.nodes, loadDays);
        if (cancelled || !mountedRef.current) return;
        setHeatmap(hm);
      } else {
        setHeatmap({
          loadByMv: new Map(),
          loadByEdge: new Map(),
          loadMax: { byMv: {}, byEdge: {} },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDays, graphData]);

  // BFS: find all nodes connected to the selected table (crosses databases).
  const visibleKeys = useMemo(() => {
    if (!graphData || !tableFilter) return new Set();
    const visited = new Set();
    const queue = [tableFilter];
    visited.add(tableFilter);

    const adjacency = new Map();
    for (const e of graphData.edges) {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      if (!adjacency.has(e.to)) adjacency.set(e.to, []);
      adjacency.get(e.from).push(e.to);
      adjacency.get(e.to).push(e.from);
    }

    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency.get(cur) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return visited;
  }, [graphData, tableFilter]);

  // Layout visible nodes whenever the set changes.
  useEffect(() => {
    if (!graphData || visibleKeys.size === 0) return;
    layoutGraph(graphData.nodes, visibleKeys, graphData.edges, showColumns);
    setLayoutVersion((v) => v + 1);
    setTimeout(() => fitView({ padding: 0.15 }), 100);
  }, [graphData, visibleKeys, showColumns, fitView]);

  // Convert to ReactFlow nodes + edges.
  useEffect(() => {
    if (!graphData || visibleKeys.size === 0) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }
    const palette = getEnginePalette();
    const edgeColors = getEdgeColors();
    const searchLc = debouncedSearch ? debouncedSearch.toLowerCase() : "";

    // Adjacency for highlight.
    const incoming = new Map(),
      outgoing = new Map();
    for (const e of graphData.edges) {
      if (!visibleKeys.has(e.from) || !visibleKeys.has(e.to)) continue;
      if (!incoming.has(e.to)) incoming.set(e.to, []);
      if (!outgoing.has(e.from)) outgoing.set(e.from, []);
      incoming.get(e.to).push(e.from);
      outgoing.get(e.from).push(e.to);
    }
    const connected = new Set();
    if (selectedKey) {
      connected.add(selectedKey);
      for (const k of incoming.get(selectedKey) || []) connected.add(k);
      for (const k of outgoing.get(selectedKey) || []) connected.add(k);
    }

    // Search filter.
    const filtered = new Set();
    if (debouncedSearch) {
      for (const key of visibleKeys) {
        const n = graphData.nodes.get(key);
        if (!n) continue;
        if (n.displayName.toLowerCase().includes(searchLc)) filtered.add(n.key);
        else if (n.columns.some((c) => c.name.toLowerCase().includes(searchLc)))
          filtered.add(n.key);
      }
    }

    // Build RF nodes.
    const nodes = [];
    for (const key of visibleKeys) {
      const n = graphData.nodes.get(key);
      if (!n) continue;
      const isDimmed =
        (debouncedSearch && !filtered.has(n.key)) ||
        (selectedKey && !connected.has(n.key));
      const isSelected = selectedKey === n.key;
      const isHighlighted =
        !isSelected && selectedKey != null && connected.has(n.key);
      const p = palette[n.kind] || palette.other;
      const hasIncoming = (incoming.get(n.key) || []).length > 0;
      const hasOutgoing = (outgoing.get(n.key) || []).length > 0;
      nodes.push({
        id: n.key,
        type: "schemaNode",
        position: { x: n.x, y: n.y },
        width: n.w,
        height: n.h,
        selectable: true,
        data: {
          node: n,
          p,
          showColumns,
          searchLc,
          isDimmed,
          isSelected,
          isHighlighted,
          mvLoad: heatmap.loadByMv.get(n.key),
          loadDays,
          loadMetric,
          heatmapMvMax: heatmap.loadMax.byMv[loadMetric] || 0,
          hasIncoming,
          hasOutgoing,
        },
      });
    }

    // Build RF edges with arrow markers.
    const edgeMax = heatmap.loadMax.byEdge[loadMetric] || 0;
    const edgeList = [];
    const seenEdges = new Set();

    for (const e of graphData.edges) {
      if (!visibleKeys.has(e.from) || !visibleKeys.has(e.to)) continue;
      const a = graphData.nodes.get(e.from),
        b = graphData.nodes.get(e.to);
      if (!a || !b) continue;

      const edgeId = e.from + ">" + e.to + ">" + (e.kind || "normal");
      if (seenEdges.has(edgeId)) continue;
      seenEdges.add(edgeId);

      let stroke = edgeColors[e.kind] || edgeColors.normal;
      let sw = 1.6,
        op = 0.8;

      if (loadDays > 0 && edgeMax > 0) {
        const el =
          heatmap.loadByEdge.get(e.from + "\x00" + e.to) ||
          heatmap.loadByEdge.get(e.to + "\x00" + e.from);
        if (el) {
          const v = el[loadMetric] || 0;
          if (v > 0) {
            const intensity = loadIntensity(v, edgeMax);
            stroke = loadColour(intensity);
            sw = 1.5 + 3 * intensity;
            op = 0.55 + 0.45 * intensity;
          }
        }
      }
      let showMarker = true;
      if (selectedKey) {
        if (e.from === selectedKey || e.to === selectedKey) {
          sw = 2.4;
          op = 1;
        } else {
          op = 0.08;
          showMarker = false;
        }
      }
      if (debouncedSearch) {
        const mf = a.displayName.toLowerCase().includes(searchLc),
          mt = b.displayName.toLowerCase().includes(searchLc);
        if (!mf && !mt) {
          op = 0.08;
          showMarker = false;
        }
      }

      edgeList.push({
        id: edgeId,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        style: { stroke, strokeWidth: sw, opacity: op },
        markerEnd: showMarker
          ? {
              type: MarkerType.ArrowClosed,
              color: stroke,
              width: 16,
              height: 16,
            }
          : undefined,
      });
    }

    setRfNodes(nodes);
    setRfEdges(edgeList);
    adjRef.current = { incoming, outgoing };
  }, [
    graphData,
    visibleKeys,
    layoutVersion,
    heatmap,
    loadMetric,
    loadDays,
    selectedKey,
    debouncedSearch,
    showColumns,
    themeVersion,
  ]);

  // Derived values.
  const selectedNode =
    selectedKey && graphData ? graphData.nodes.get(selectedKey) : null;
  const databases = graphData
    ? Array.from(graphData.nodesByDb.keys()).sort()
    : [];
  const tablesInDb =
    graphData && dbFilter
      ? (graphData.nodesByDb.get(dbFilter) || [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const palette = getEnginePalette();
  const edgeColors = getEdgeColors();
  const graphDrawn = visibleKeys.size > 0;

  // Handlers.
  const onNodeDragStop = useCallback(
    (_, rfNode) => {
      const n = graphData?.nodes.get(rfNode.id);
      if (n) {
        n.x = rfNode.position.x;
        n.y = rfNode.position.y;
      }
    },
    [graphData],
  );
  const onNodeClick = useCallback((_, node) => {
    setSelectedKey((prev) => (prev === node.id ? null : node.id));
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedKey(null);
  }, []);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleRelayout = useCallback(() => {
    if (!graphData || visibleKeys.size === 0) return;
    layoutGraph(graphData.nodes, visibleKeys, graphData.edges, showColumns);
    setLayoutVersion((v) => v + 1);
    setTimeout(() => fitView({ padding: 0.15 }), 150);
  }, [graphData, visibleKeys, showColumns, fitView]);

      function isDark() {
    return theme === "dark"
  }

  if (error)
    return (
      <div style={{ padding: 20 }}>
        <div className="alert-banner danger" style={{ margin: 0 }}>
          <Icon className="ti ti-alert-circle" />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Failed to load schema
            </div>
            <div style={{ fontSize: "13px" }}>{error}</div>
          </div>
        </div>
      </div>
    );
  if (!graphData)
    return (
      <div
        style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}
      >
        Loading schema...
      </div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 12rem)",
      }}
    >
      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "8px 0",
          borderBottom: "1px solid var(--border-default)",
          marginBottom: 4,
        }}
      >
        <Select
          className="form-select"
          value={dbFilter}
          onChange={(e) => setDbFilter(e.target.value)}
          style={{ width: 200 }}
        >
          <option value="">Select database...</option>
          {databases.map((db) => (
            <option key={db} value={db}>
              {db} ({graphData.nodesByDb.get(db).length})
            </option>
          ))}
        </Select>
        {dbFilter && (
          <Select
            className="form-select"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            style={{
              width: 240,
              fontFamily: "var(--font-code)",
              fontSize: "12px",
            }}
          >
            <option value="">Select table...</option>
            {tablesInDb.map((n) => (
              <option key={n.key} value={n.key}>
                {n.name} ({n.kind})
              </option>
            ))}
          </Select>
        )}
        {graphDrawn && (
          <>
            <input
              type="text"
              className="form-input"
              placeholder="Search table or column..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              spellCheck={false}
              style={{
                width: 200,
                fontFamily: "var(--font-code)",
                fontSize: "13px",
              }}
            />
            <button
              className={`btn btn-sm ${showColumns ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setShowColumns(!showColumns)}
            >
              Columns
            </button>
            <Select
              className="form-select"
              value={loadDays}
              onChange={(e) => setLoadDays(Number(e.target.value))}
              style={{ width: 150 }}
            >
              <option value="0">Load: off</option>
              <option value="1">Last 1 day</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </Select>
            {loadDays > 0 && (
              <Select
                className="form-select"
                value={loadMetric}
                onChange={(e) => setLoadMetric(e.target.value)}
                style={{ width: 170 }}
              >
                <option value="total_duration_ms">Duration</option>
                <option value="written_rows">Rows written</option>
                <option value="written_bytes">Bytes written</option>
                <option value="read_rows">Rows read</option>
                <option value="read_bytes">Bytes read</option>
                <option value="peak_memory_usage">Peak memory</option>
                <option value="executions">Executions</option>
              </Select>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRelayout}
            >
              Re-layout
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fitView({ padding: 0.15 })}
            >
              Fit
            </button>
          </>
        )}
        <span
          style={{
            fontSize: "0.75rem",
            fontFamily: "var(--font-code)",
            color: "var(--text-muted)",
            marginLeft: "auto",
          }}
        >
          {graphDrawn
            ? `${rfNodes.length} nodes, ${rfEdges.length} edges`
            : status}
        </span>
      </div>

      {/* Legend (only when graph is drawn) */}
      {graphDrawn && (
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            fontSize: "12px",
            color: "var(--text-muted)",
            flexWrap: "wrap",
            paddingBottom: 6,
          }}
        >
          {["mt", "mv", "rmv", "dict", "distributed", "view"].map((kind) => (
            <span
              key={kind}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: palette[kind]?.bg,
                  border: "1px solid var(--border-default)",
                }}
              />
              {kind === "mt"
                ? "MergeTree"
                : kind === "mv"
                  ? "Mat. View"
                  : kind === "rmv"
                    ? "Refresh MV"
                    : kind === "dict"
                      ? "Dictionary"
                      : kind === "distributed"
                        ? "Distributed"
                        : "View"}
            </span>
          ))}
          <span
            style={{
              width: 1,
              height: 14,
              background: "var(--border-default)",
            }}
          />
          {[
            ["MV flow", edgeColors.mv],
            ["Dict source", edgeColors.dict],
            ["Distributed", edgeColors.distributed],
          ].map(([label, color]) => (
            <span
              key={label}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <svg width="20" height="10">
                <line
                  x1="0"
                  y1="5"
                  x2="14"
                  y2="5"
                  stroke={color}
                  strokeWidth="2"
                />
                <polygon points="14,2 20,5 14,8" fill={color} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        style={{
          flex: 1,
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Sidebar */}
        {selectedNode && (
          <aside
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 380,
              background:isDark() ? 'rgba(11, 19, 35,0.96)' : 'rgba(244, 245, 247,0.96)',
              borderLeft: "3px solid var(--accent)",
              padding: "16px 20px",
              overflowY: "auto",
              zIndex: 200,
              boxShadow: "-6px 0 18px var(--shadow-md)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: "2px solid var(--accent)",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontFamily: "var(--font-code)",
                  fontSize: "14px",
                  flex: 1,
                  minWidth: 0,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                  lineHeight: 1.35,
                }}
              >
                {selectedNode.displayName}
              </span>
              <button
                onClick={() => setSelectedKey(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "19px",
                  lineHeight: 1,
                  flexShrink: 0,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                }}
              >
                <Icon className="ti ti-x" style={{ fontSize: '19px' }} />
              </button>
            </div>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                tableLayout: "fixed",
              }}
            >
              <tbody>
                {[
                  ["Engine", selectedNode.engineFull || selectedNode.engine],
                  selectedNode.partitionKey && [
                    "Partition by",
                    selectedNode.partitionKey,
                  ],
                  selectedNode.sortingKey && [
                    "Order by",
                    selectedNode.sortingKey,
                  ],
                  selectedNode.primaryKey &&
                    selectedNode.primaryKey !== selectedNode.sortingKey && [
                      "Primary key",
                      selectedNode.primaryKey,
                    ],
                  selectedNode.totalRows &&
                    Number(selectedNode.totalRows) > 0 && [
                      "Rows",
                      fmtRows(selectedNode.totalRows),
                    ],
                  selectedNode.totalBytes &&
                    Number(selectedNode.totalBytes) > 0 && [
                      "Bytes",
                      fmtBytes(selectedNode.totalBytes),
                    ],
                  selectedNode.comment && ["Comment", selectedNode.comment],
                  selectedNode.dictSource && [
                    "Dict source",
                    selectedNode.dictSource,
                  ],
                ]
                  .filter(Boolean)
                  .map(([k, v], i) => (
                    <tr key={i}>
                      <td
                        style={{
                          padding: "3px 6px",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          width: "36%",
                          borderBottom: "1px dotted var(--border-default)",
                          fontFamily: "var(--font-code)",
                          verticalAlign: "top",
                        }}
                      >
                        {k}
                      </td>
                      <td
                        style={{
                          padding: "3px 6px",
                          borderBottom: "1px dotted var(--border-default)",
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                          fontFamily: ["Rows", "Bytes"].includes(k)
                            ? "var(--font-chart)"
                            : "var(--font-code)",
                          verticalAlign: "top",
                        }}
                      >
                        {v}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(() => {
              const ins = adjRef.current.incoming.get(selectedKey) || [],
                outs = adjRef.current.outgoing.get(selectedKey) || [];
              return (
                <>
                  {ins.length > 0 && (
                    <>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          margin: "12px 0 6px",
                        }}
                      >
                        Reads from ({ins.length})
                      </div>
                      {ins.map((k) => (
                        <div
                          key={k}
                          onClick={() => setSelectedKey(k)}
                          style={{
                            cursor: "pointer",
                            color: "var(--accent)",
                            fontFamily: "var(--font-code)",
                            fontSize: "12px",
                            padding: "2px 0",
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.textDecoration = "underline")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.textDecoration = "none")
                          }
                        >
                          {graphData.nodes.get(k)?.displayName || k}
                        </div>
                      ))}
                    </>
                  )}
                  {outs.length > 0 && (
                    <>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          margin: "12px 0 6px",
                        }}
                      >
                        Writes to ({outs.length})
                      </div>
                      {outs.map((k) => (
                        <div
                          key={k}
                          onClick={() => setSelectedKey(k)}
                          style={{
                            cursor: "pointer",
                            color: "var(--accent)",
                            fontFamily: "var(--font-code)",
                            fontSize: "12px",
                            padding: "2px 0",
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.textDecoration = "underline")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.textDecoration = "none")
                          }
                        >
                          {graphData.nodes.get(k)?.displayName || k}
                        </div>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
            {selectedNode.createQuery && (
              <>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    margin: "12px 0 6px",
                  }}
                >
                  CREATE Statement
                </div>
                <pre
                  style={{
                    fontFamily: "var(--font-code)",
                    fontSize: "0.75rem",
                    padding: "8px 10px",
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 4,
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                  }}
                >
                  {selectedNode.createQuery}
                </pre>
              </>
            )}
          </aside>
        )}
        
        {!graphDrawn ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              gap: 12,
            }}
          >
            <Icon
              className="ti ti-database-search"
              style={{ fontSize: 48, opacity: 0.3 }}
            />
            <div style={{ fontSize: "14px" }}>
              {!dbFilter
                ? "Select a database to begin"
                : "Select a table to visualize its relationships"}
            </div>
            <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>
              All connected tables across databases will be shown
            </div>
          </div>
        ) : (
          <>
            <style>{`
              .schema-visualizer-flow .react-flow__controls {
                box-shadow: 0 4px 14px var(--shadow-md);
                border: 1px solid var(--border-default);
                border-radius: 8px;
                overflow: hidden;
              }
              .schema-visualizer-flow .react-flow__controls-button {
                background: var(--bg-card);
                border-bottom: 1px solid var(--border-default);
                color: var(--text-primary);
              }
              .schema-visualizer-flow .react-flow__controls-button:last-child {
                border-bottom: none;
              }
              .schema-visualizer-flow .react-flow__controls-button:hover {
                background: var(--bg-sunken);
              }
              .schema-visualizer-flow .react-flow__controls-button svg {
                fill: var(--text-primary);
                stroke: var(--text-primary);
              }
              .schema-visualizer-flow .react-flow__controls-button path {
                fill: var(--text-primary);
                stroke: var(--text-primary);
              }
            `}</style>
            <ReactFlow
              className="schema-visualizer-flow"
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={isInteractive && onNodeClick}
              onNodeDragStop={onNodeDragStop}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.05}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              style={{ background: "var(--bg-card)" }}
              nodesConnectable={isInteractive}
              elementsSelectable={isInteractive}
              panOnDrag={isInteractive}
              zoomOnDoubleClick={isInteractive}
              zoomOnScroll={isInteractive}
              zoomOnPinch={isInteractive}
            >
              <Controls
                showInteractive={true}
                onInteractiveChange={(newStatus) =>
                  setIsInteractive(newStatus)
                }
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                }}
              />
            </ReactFlow>
          </>
        )}
      </div>
    </div>
  );
}

export default function SchemaVisualizer() {
  return (
    <ReactFlowProvider>
      <SchemaFlow />
    </ReactFlowProvider>
  );
}
