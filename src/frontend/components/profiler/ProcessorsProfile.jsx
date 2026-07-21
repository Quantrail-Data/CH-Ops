// ProcessorsProfile - Interactive visualization of ClickHouse query execution pipeline
//
// Renders a directed graph showing the processor chain for a given query
// using data from EXPLAIN PIPELINE and processors_profile_log. Each node
// represents a processor with heatmap coloring based on elapsed time,
// and the graph is laid out using a hierarchical algorithm. Clicking a
// node opens a detail panel with its metrics.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useState, useRef, useEffect, useCallback } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSearchParams } from "react-router-dom";
import { runQuery } from "../../utils/api.js";
import {
  parseDot,
  layoutGraph,
  heatmapColor,
  computeHeatmapRange,
  buildProfileMap,
  formatUs,
  formatBytes,
  formatNum,
  formatDuration,
  DEFAULT_WHERE,
  DEFAULT_KIND,
  DEFAULT_TYPE,
  defaultTimeRange,
  composeProcessorsWhere,
  buildDistinctValuesSql,
  buildQueryListSql,
  buildQueryTextSql,
  buildExplainPipelineSql,
  buildProfileDataSql,
  buildQueryListSqlQuery_ID,
} from "../../utils/processorsPipeline.js";
import { useToast } from "../layout/Toast.jsx";

// Custom Node: Processor

//
// Each node shows:
// - Processor name (truncated)
// - Elapsed time in ms
// - Background color from heatmap (white=fast, orange=slow)
// - Click to select and show details in the side panel

function ProcessorNode({ data, selected }) {
  const { label, profile, heatColor } = data;
  const elapsed = profile ? formatUs(profile.elapsed_us) : "";
  const shortLabel = label.length > 28 ? label.substring(0, 26) + "..." : label;

  const textColor = heatColor ? "#1e293b" : "var(--text-primary)";
  const subTextColor = heatColor ? "rgba(0,0,0,0.6)" : "var(--text-muted)";
 
  return (
    <div
      style={{
        width: 220,
        padding: "8px 12px",
        borderRadius: 6,
        border: selected
          ? "2px solid var(--accent)"
          : "1px solid var(--border-default)",
        background: heatColor || "var(--bg-card)",
        fontFamily: "var(--font-code)",
        fontSize: "12px",
        color: textColor,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 6,
          height: 6,
          background: "var(--text-muted)",
          border: "none",
        }}
      />

      <div
        style={{
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {shortLabel}
      </div>
      {elapsed && (
        <div style={{ marginTop: 3, color: subTextColor, fontSize: "11px" }}>
          {elapsed}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 6,
          height: 6,
          background: "var(--text-muted)",
          border: "none",
        }}
      />
    </div>
  );
}

// Detail Panel (shows when a node is selected)

function DetailPanel({ processorId, profile, onClose }) {
  if (!processorId) return null;

  const rows = profile
    ? [
        ["Processor", profile.name || processorId],
        ["Uniq ID", processorId],
        ["Step", profile.step_id || "-"],
        ["Elapsed", formatUs(profile.elapsed_us)],
        ["Input wait", formatUs(profile.input_wait_us)],
        ["Output wait", formatUs(profile.output_wait_us)],
        ["Input rows", formatNum(profile.input_rows)],
        ["Input bytes", formatBytes(profile.input_bytes)],
        ["Output rows", formatNum(profile.output_rows)],
        ["Output bytes", formatBytes(profile.output_bytes)],
      ]
    : [
        ["Processor", processorId],
        ["Status", "No data in processors_profile_log"],
      ];

  return (
    <div
      style={{
        position: "absolute",
        top: 44,
        right: 12,
        zIndex: 10,
        width: 280,
        background: "var(--bg-page)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 16,
        fontSize: "12px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "13px" }}>
          Processor Details
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          style={{ fontSize: "13px" }}
        >
          <Icon className="ti ti-x" />
        </button>
      </div>
      <table
        style={{
          width: "100%",
          fontSize: "0.75rem",
          borderCollapse: "collapse",
        }}
      >
        <tbody>
          {rows.map(([key, val], i) => (
            <tr key={i}>
              <td
                style={{
                  padding: "4px 8px 4px 0",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {key}
              </td>
              <td
                style={{
                  padding: "4px 0",
                  fontFamily: "var(--font-code)",
                  textAlign: "right",
                  wordBreak: "break-all",
                }}
              >
                {val}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Heatmap Legend

function HeatmapLegend({ minUs, maxUs }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "12px",
        color: "var(--text-muted)",
      }}
    >
      <span>fast</span>
      <div
        style={{
          width: 140,
          height: 10,
          borderRadius: 2,
          border: "1px solid var(--border-default)",
          background: "linear-gradient(to right, #FFFFFF, #FFC080, #FF8000)",
        }}
      />
      <span>slow</span>
      {maxUs > 0 && (
        <span
          style={{
            marginLeft: 8,
            fontFamily: "var(--font-code)",
            fontSize: "11px",
          }}
        >
          {formatUs(minUs)} - {formatUs(maxUs)}
        </span>
      )}
    </div>
  );
}

// Main Component

const nodeTypes = { processor: ProcessorNode };

function ProcessorsProfileInner( ) {
  const [searchParams] = useSearchParams();
  const qidFromUrl = searchParams.get("qid");

  // Query list filter form
  const initialRange = defaultTimeRange();
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [queryKind, setQueryKind] = useState(DEFAULT_KIND);
  const [type, setType] = useState(DEFAULT_TYPE);
  const [kindOptions, setKindOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [optsLoading, setOptsLoading] = useState(false);
  const [queries, setQueries] = useState([]);
  const [selectedQid, setSelectedQid] = useState("");
  const [loadingQueries, setLoadingQueries] = useState(false);

  // Pipeline
  const [queryText, setQueryText] = useState("");
  const [profileMap, setProfileMap] = useState({});
  const [heatRange, setHeatRange] = useState({ minUs: 0, maxUs: 0 });
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [initialNodes, setInitialNodes] = useNodesState([]);  
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [initialEdges, setInitialEdges] = useEdgesState([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState("");

  // Detail panel
  const [selectedNode, setSelectedNode] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Stale request guard
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  // ReactFlow instance for fitView
  const reactFlowInstance = useReactFlow();

  // heatmap interactive boolean

  const [isInteractive, setIsInteractive] = useState(true);

  const toast = useToast()

  

  useEffect(() => {
    if (qidFromUrl) {
      setSelectedQid(qidFromUrl);
      loadQueries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qidFromUrl]);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load pipeline for selected query
  const loadPipeline = async (queryId) => {
    const gen = ++generationRef.current;
    const isStale = () => gen !== generationRef.current || !mountedRef.current;

    setLoadingPipeline(true);
    setPipelineError("");
    setQueryText("");
    setSelectedNode(null);
    setNodes([]);
    setEdges([]);

    try {
      qidFromUrl && (await runQuery("SYSTEM FLUSH LOGS"));
      // Step 1: Fetch query text
      const textResult = await runQuery(buildQueryTextSql(queryId));

      if (isStale()) return;

      const qText = textResult.rows?.[0]?.query || "";

      if (!qText)
        throw new Error(
          `Query text not found for query_id: ${queryId}. The query may have aged out of system.query_log.`,
        );
      setQueryText(qText);

      // Step 2: Flush logs (best-effort, non-fatal)
      try {
        await runQuery("SYSTEM FLUSH LOGS");
      } catch {}
      if (isStale()) return;

      // Step 3: EXPLAIN PIPELINE graph
      const explainSql = buildExplainPipelineSql(qText);
      const dotResult = await runQuery(explainSql);
      if (isStale()) return;

      // Reconstruct DOT string from row-per-line response
      const dotString = (dotResult.rows || []).map((r) => r.explain).join("\n");

      if (!dotString.includes("digraph")) {
        throw new Error(
          "EXPLAIN PIPELINE returned no graph. The query may not be re-explainable (DDL, or uses temp tables).",
        );
      }

      // Step 4: Fetch profile data
      const profileResult = await runQuery(buildProfileDataSql(queryId));
      if (isStale()) return;

      const pMap = buildProfileMap(profileResult.rows || []);
      const range = computeHeatmapRange(pMap);
      setProfileMap(pMap);
      setHeatRange(range);

      // Step 5: Parse DOT and compute layout
      const parsed = parseDot(dotString);
      const { rfNodes, rfEdges } = layoutGraph(
        parsed.nodes,
        parsed.edges,
        pMap,
      );

      // Step 6: Apply heatmap colors to node data
      const coloredNodes = rfNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          heatColor: n.data.profile
            ? heatmapColor(n.data.profile.elapsed_us, range.minUs, range.maxUs)
            : "#FFffff",
        },
      }));

      if (isStale()) return;
      setNodes(coloredNodes);
      setEdges(rfEdges);
      setInitialNodes(coloredNodes)
      setInitialEdges(rfEdges)

      // Fit the view to show all nodes after a brief layout settle
      setTimeout(() => reactFlowInstance?.fitView({ padding: 0.15 }), 100);
    } catch (err) {
      if (!isStale()) setPipelineError(err.message);
    } finally {
      if (!isStale()) setLoadingPipeline(false);
    }
  };

  // Load query list

  const loadQueries = useCallback(
    async (explicitWhere) => {
      setLoadingQueries(true);
      try {
        const browseWhere =
          explicitWhere ||
          composeProcessorsWhere({
            start: startTime,
            end: endTime,
            queryKind,
            type,
          });

        const sql = qidFromUrl
          ? buildQueryListSqlQuery_ID(`query_id = '${qidFromUrl}'`)
          : buildQueryListSql(browseWhere);

        const result = await runQuery(sql);

        if (!mountedRef.current) return;
        setQueries(result.rows || []);

        if (result.rows?.length > 0) {
          const exists = qidFromUrl
            ? result.rows.some((r) => {
                if (r.query_id === qidFromUrl) {
                  return r;
                }
              })
            : false;

          const qid = exists ? qidFromUrl : result.rows[0].query_id;

          setSelectedQid(qid);
          loadPipeline(qid);
        } else {
          if (qidFromUrl) {
            loadPipeline(qidFromUrl);
          }
        }
      } catch (err) {
        if (mountedRef.current)
          setPipelineError("Failed to load queries: " + err.message);
      } finally {
        if (mountedRef.current) setLoadingQueries(false);
      }
    },
    [startTime, endTime, queryKind, type, qidFromUrl, loadPipeline],
  );

  // Load dropdown options (distinct kind/type in the selected window)

  const loadOptions = useCallback(async () => {
    if (qidFromUrl) return;
    if (!startTime || !endTime) return;
    setOptsLoading(true);
    try {
      const [kindRes, typeRes] = await Promise.all([
        runQuery(buildDistinctValuesSql("query_kind", startTime, endTime)),
        runQuery(buildDistinctValuesSql("type", startTime, endTime)),
      ]);
      if (!mountedRef.current) return;
      setKindOptions((kindRes.rows || []).map((r) => r.v).filter(Boolean));
      setTypeOptions((typeRes.rows || []).map((r) => r.v).filter(Boolean));
    } catch {
      if (mountedRef.current) {
        setKindOptions([]);
        setTypeOptions([]);
      }
    } finally {
      if (mountedRef.current) setOptsLoading(false);
    }
  }, [startTime, endTime, qidFromUrl]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Load on mount. In qid mode the qid effect handles loading; in browse mode
  // load with the default form values composed into a WHERE.
  useEffect(() => {
    if (!qidFromUrl) {
      loadQueries(
        composeProcessorsWhere({
          start: initialRange.start,
          end: initialRange.end,
          queryKind: DEFAULT_KIND,
          type: DEFAULT_TYPE,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the current form values: compose the WHERE and load the query list.
  function handleApply() {
    if (!startTime || !endTime) return;
    loadQueries(
      composeProcessorsWhere({ start: startTime, end: endTime, queryKind, type }),
    );
  }

  // Reset the form to defaults (last hour, Select, QueryFinish) and reload.
  function handleReset() {
    const r = defaultTimeRange();
    setStartTime(r.start);
    setEndTime(r.end);
    setQueryKind(DEFAULT_KIND);
    setType(DEFAULT_TYPE);
    loadQueries(
      composeProcessorsWhere({
        start: r.start,
        end: r.end,
        queryKind: DEFAULT_KIND,
        type: DEFAULT_TYPE,
      }),
    );
  }

  function handlePickerChange(e) {
    setSelectedQid(e.target.value);
    if (e?.target?.value) loadPipeline(e?.target?.value);
  }
  // Handle node click

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode({
      processorId: node.data.label,
      profile: node.data.profile,
    });
  }, []);


  const handleResetView = () =>{
    setNodes(initialNodes)
    setEdges(initialEdges);
    reactFlowInstance?.fitView({ padding: 0.15 });
  }

  // Render

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
      }}
    >
      {/* Filter form and query picker */}
      <div
        className="card"
        style={{ padding: 16, marginBottom: 12, flexShrink: 0 }}
      >
        {!qidFromUrl && (
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-end",
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              Start time
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{
                  padding: "7px 8px",
                  fontFamily: "var(--font-code)",
                  fontSize: "12px",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                }}
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              End time
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{
                  padding: "7px 8px",
                  fontFamily: "var(--font-code)",
                  fontSize: "12px",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                }}
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              Query kind
              <Select
                className="form-select cui-sm"
                value={queryKind}
                onChange={(e) => setQueryKind(e.target.value)}
                style={{ minWidth: 150 }}
              >
                <option value="">All</option>
                {(queryKind && !kindOptions.includes(queryKind)
                  ? [queryKind, ...kindOptions]
                  : kindOptions
                ).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              Type
              <Select
                className="form-select cui-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ minWidth: 150 }}
              >
                <option value="">All</option>
                {(type && !typeOptions.includes(type)
                  ? [type, ...typeOptions]
                  : typeOptions
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleApply}
                disabled={loadingQueries || !startTime || !endTime}
              >
                {loadingQueries ? "Loading..." : "Apply"}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleReset}
                disabled={loadingQueries}
              >
                Reset
              </button>
            </div>
            {optsLoading && (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Refreshing options...
              </span>
            )}
          </div>
        )}
        {!qidFromUrl ? (
          <Select
            value={selectedQid}
            onChange={handlePickerChange}
            disabled={loadingQueries}
            style={{
              width: "100%",
              padding: "8px 10px",
              fontFamily: "var(--font-code)",
              fontSize: "0.75rem",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
            }}
          >
            {queries.length === 0 && (
              <option value="">
                {loadingQueries ? "Loading..." : "No queries match the filter"}
              </option>
            )}
            {queries.map((q) => (
              <option key={q.query_id} value={q.query_id}>
                {q.event_time} · {q.user} ·{" "}
                {formatDuration(q.query_duration_ms)} · {q.query_id} ·{" "}
                {q.query_preview}
              </option>
            ))}
          </Select>
        ) : 
        
        
        (
          <div className="alert-banner info" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <h5>Query ID : {qidFromUrl}</h5>
            <div onClick={()=>{
              window?.navigator?.clipboard?.writeText(qidFromUrl && qidFromUrl);
              toast.success('Query ID copied!')
            }}>
              <Icon className="ti ti-copy"></Icon>
            </div>
          </div>
        )}

      
      </div>

      {/* Query text (collapsible) */}
      {queryText && (
        <details
          className="card"
          style={{
            padding: "10px 16px",
            marginBottom: 12,
            flexShrink: 0,
            fontSize: "12px",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Query text (click to expand)
          </summary>
          <pre
            style={{
              marginTop: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--font-code)",
              fontSize: "0.75rem",
              color: "var(--text-primary)",
              lineHeight: 1.5,
            }}
          >
            {queryText}
          </pre>
        </details>
      )}

      {/* Error display */}
      {pipelineError && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 12,
            flexShrink: 0,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 6,
            fontSize: "12px",
            color: "var(--color-danger, #ef4444)",
            fontFamily: "var(--font-code)",
          }}
        >
          {pipelineError}
        </div>
      )}

      {/* Pipeline graph */}
      <div
        className="card"
        style={{
          ...(fullscreen
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                borderRadius: 0,
                margin: 0,
              }
            : { flex: 1 }),
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar: legend + controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "1px solid var(--border-default)",
            background: "var(--bg-card)",
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <HeatmapLegend minUs={heatRange.minUs} maxUs={heatRange.maxUs} />
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleResetView()}
              title="Reset"
            >
              <Icon className="ti ti-zoom-reset" />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFullscreen(!fullscreen)}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              <Icon
                className={`ti ${fullscreen ? "ti-arrows-minimize" : "ti-arrows-maximize"}`}
              />
            </button>
          </div>
        </div>

        {/* Detail panel */}
        <DetailPanel
          processorId={selectedNode?.processorId}
          profile={selectedNode?.profile}
          onClose={() => setSelectedNode(null)}
        />

        {/* Graph area */}
        <div style={{ flex: 1, position: "relative" }}>
          {loadingPipeline ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-muted)",
              }}
            >
              Loading pipeline graph...
            </div>
          ) : nodes.length === 0 && !pipelineError ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              Select a query above to visualize its execution pipeline
            </div>
          ) : (
            <>
              <style>{`
              .processor-react-flow .react-flow__controls {
                box-shadow: 0 4px 14px var(--shadow-md) !important;
                border: 1px solid var(--border-default) !important;
                border-radius: 8px !important;
                overflow: hidden !important;
              }
              .processor-react-flow .react-flow__controls-button {
                background: var(--bg-card) !important;
                border-bottom: 1px solid var(--border-default) !important;
                color: var(--text-primary) !important;
              }
              .processor-react-flow .react-flow__controls-button:last-child {
                border-bottom: none !important;
              }
              .processor-react-flow .react-flow__controls-button:hover {
                background: var(--bg-sunken) !important;
              }
              .processor-react-flow .react-flow__controls-button svg {
                fill: var(--text-primary) !important;
                stroke: var(--text-primary) !important;
              }
              .processor-react-flow .react-flow__controls-button path {
                fill: var(--text-primary) !important;
                stroke: var(--text-primary) !important;
              }
            `}</style>

              <ReactFlow
                className="processor-react-flow"
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={isInteractive ? onNodeClick : undefined}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.1}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                nodesConnectable={isInteractive}
                elementsSelectable={isInteractive}
                panOnDrag={isInteractive}
                zoomOnDoubleClick={isInteractive}
                zoomOnScroll={isInteractive}
                zoomOnPinch={isInteractive}
              >
                <Controls
                  position="bottom-left"
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
                {/* <MiniMap
                position="bottom-right"
                nodeColor={(n) => n.data?.heatColor || "#666"}
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: 4,
                }}
              /> */}
                <Background gap={16} size={1} />
              </ReactFlow>
            </>
          )}

          {nodes.length > 0 && Object.keys(profileMap).length === 0 && (
            <div
              style={{
                position: "absolute",
                bottom: 48,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                background: "var(--bg-card)",
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid var(--border-default)",
                fontSize: "12px",
                color: "var(--text-muted)",
                maxWidth: 500,
                textAlign: "center",
              }}
            >
              No rows in processors_profile_log for this query. The heatmap is
              empty. The query may have run with log_processors_profiles = 0, or
              its logs may have aged out.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrap in ReactFlowProvider so useReactFlow() works inside the component
export default function ProcessorsProfile() {
  return (
    <ReactFlowProvider>
      <ProcessorsProfileInner  />
    </ReactFlowProvider>
  );
}
