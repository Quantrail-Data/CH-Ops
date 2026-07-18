// Copyright (C) 2026 Quantrail™ Data Private Limited
// @Kathir -> Kathir Moorthy
// Interactive SQL editor featuring syntax highlighting, query execution, and schema auto-completion.

import React, { useEffect, useRef, useState, useCallback } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { format } from "sql-formatter";
import {
  runEditorQuery,
  apiFetch,
  editorConnect,
  editorConnectionStatus,
  editorDisconnect,
} from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import { useConnection, useTheme } from "../../App.jsx";
import DataTable from "../layout/DataTable.jsx";
import CostEstimatePanel from "./CostEstimatePanel.jsx";
import ModeSelect from "./ModeSelect.jsx";
import { highlightSQL } from "../../utils/sqlHighlight.js";
import { isDataQuery, analyzeSql } from "../../../shared/sqlClassify.js";
import {
  runEstimate,
  lookupMemoryUsage,
  fmtBytes,
} from "../../utils/costEstimator.js";
import { initChart, disposeChart } from "../../utils/echarts.js";
import { treeSizeTB } from "../../utils/treeChart.js";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";

import { isValidSizeSqlQuery } from "../../utils/querySize.js";

// VITE_SELECTEDAID_DBS=aiselectedid
const SELECTLSKEY = import.meta.env.VITE_SELECTEDAID_DBS;

// Query history - stored in localStorage, capped at 100 entries
const HISTORY_KEY = "chops_query_history";
const HISTORY_MAX = 100;

const LOADING_PHRASES = [
  "Generating ClickHouse query...",
  "Optimizing ClickHouse SQL...",
  "Building analytical query...",
  "Drafting your columnar query...",
  "Preparing ClickHouse syntax...",
  "Generating real-time analytics...",
  "Calculating sub-second query logic...",
  "Drafting a high-performance query...",
  "Aggregating billions of rows of thought...",
  "Synthesizing blazing-fast SQL...",
];

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function addHistory(entry) {
  const h = getHistory();
  h.unshift(entry);
  if (h.length > HISTORY_MAX) h.length = HISTORY_MAX;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {}
}

function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

// Export helpers - trigger browser download from in-memory data
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function engineIcon(engine) {
  if (!engine) return "ti-table";

  const e = String(engine).trim().toLowerCase();

  const rules = [
    // { test: /^system/, icon: 'ti-settings' },

    { test: /materializedview|windowview|(^|[^a-z])view/, icon: "ti-eye" },

    { test: /mergetree/, icon: "ti-table" },
    { test: /^(log|tinylog|stripelog)$/, icon: "ti-table" },

    {
      test: /iceberg|hudi|deltalake|delta_lake|^delta|hive/,
      icon: "ti-layers-difference",
    },

    { test: /kafka|rabbitmq|nats|queue/, icon: "ti-broadcast" },

    {
      test: /s3|gcs|oss|cosn|azureblobstorage|azure_blob|hdfs/,
      icon: "ti-cloud",
    },

    {
      test: /mysql|postgresql|mongodb|redis|sqlite|odbc|jdbc|ytsaurus/,
      icon: "ti-database-import",
    },

    { test: /distributed/, icon: "ti-topology-ring" },

    { test: /dictionary|keepermap/, icon: "ti-book" },

    { test: /memory|buffer/, icon: "ti-cpu" },

    { test: /^null$/, icon: "ti-circle-off" },

    { test: /url|arrowflight/, icon: "ti-world" },

    { test: /file|timeseries/, icon: "ti-file" },

    { test: /^join$/, icon: "ti-arrows-join" },

    { test: /^set$/, icon: "ti-list-check" },

    { test: /generaterandom|fuzzquery|fuzzjson/, icon: "ti-dice" },

    { test: /executable/, icon: "ti-terminal" },

    { test: /^(alias|loop)$/, icon: "ti-link" },

    { test: /rocksdb/, icon: "ti-stack-2" },
  ];

  const rule = rules.find((r) => r.test.test(e));
  return rule ? rule.icon : "ti-table";
}

export default function QueryEditor({
  onSidebarStateChange,
  mode,
  onModeChange,
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const {
    selectedClusterId,
    selectedNode,
    connected,
    port,
    clusters,
    clusterName,
    user,
    password,
    nodeName,
  } = useConnection();
  const [editorCreds, setEditorCreds] = useState(null);
  const editorConnected = !!editorCreds;
  const [connUser, setConnUser] = useState("");
  const [connPassword, setConnPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState(null);
  const textareaRef = useRef(null),
    highlightRef = useRef(null),
    selectedRef = useRef(null);
  const [sql, setSql] = useState("SELECT version()");
  const [dbs, setDbs] = useState([]);
  const [selectedDb, setSelectedDb] = useState(null);
  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [resultCols, setResultCols] = useState([]);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [queryStats, setQueryStats] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [graphZoomLevel, setGraphZoomLevel] = useState(1);
  const [graphTitle, setGraphTitle] = useState("");
  const [showGraphSqlModal, setShowGraphSqlModal] = useState(false);
  const graphRef = useRef(null);
  const graphInst = useRef(null);
  const [selectedAIDB, setSelectedAIDB] = useState(null);
  const [selectedAIDBID, setSelectedAIDBID] = useState(null);
  const [isAILoading, setIsAILoading] = useState(false);
  // Inside the component:
  const [searchParams] = useSearchParams();
  const qidFromUrl = searchParams.get("qid");

  const [ExplainOptionSelector, setExplainOptionSelector] = useState({type:""}); // for selection explain function dropdown values

  const [isAILoadingGenerating, setIsAILoadingGenerating] = useState(false);
  const [aiError, setAIError] = useState(null);

  // default cred password view flag
  const [isViewFlag, setIsViewFlag] = useState(false);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % LOADING_PHRASES.length);
      if (isAILoadingGenerating) {
        console.log(LOADING_PHRASES[index]);
        setSql(LOADING_PHRASES[index]);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Render ECharts tree when graphData changes
  useEffect(() => {
    if (!graphRef.current || !graphData || graphData._json) {
      if (graphInst.current) {
        disposeChart(graphRef.current);
        graphInst.current = null;
      }
      return;
    }
    try {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      const lc = isDark ? "#cbd5e1" : "#374151";

      const CAT_MATCHERS = [
        { name: "ReadFrom", match: (n) => /read|scan|merge.*read/i.test(n) },
        { name: "Filter", match: (n) => /filter|where|prewhere/i.test(n) },
        {
          name: "Sort/Limit",
          match: (n) => /sort|order|limit|offset|top/i.test(n),
        },
        {
          name: "Aggregate",
          match: (n) => /aggregat|group|rollup|cube/i.test(n),
        },
        { name: "Join", match: (n) => /join|union|intersect|except/i.test(n) },
        {
          name: "Transform",
          match: (n) => /transform|expression|project|column/i.test(n),
        },
        {
          name: "Output",
          match: (n) => /output|write|sink|insert|buffer/i.test(n),
        },
      ];
      function getCatName(name) {
        return (CAT_MATCHERS.find((c) => c.match(name)) || {}).name || "Other";
      }

      const usedCats = [
        ...new Set(graphData.nodes.map((n) => getCatName(n.name))),
      ];
      const base = isDark ? [0.7, 0.65] : [0.6, 0.5];
      const catColors = usedCats.map(
        (_, i) =>
          `hsl(${Math.round((i * 137.508) % 360)}, ${base[0] * 100}%, ${base[1] * 100}%)`,
      );
      const catColorMap = new Map(
        usedCats.map((name, i) => [name, catColors[i]]),
      );

      const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
      const childrenMap = new Map();
      const hasParent = new Set();
      graphData.links.forEach((l) => {
        if (!childrenMap.has(l.source)) childrenMap.set(l.source, []);
        childrenMap.get(l.source).push(l.target);
        hasParent.add(l.target);
      });
      const roots = graphData.nodes.filter((n) => !hasParent.has(n.id));
      if (!roots.length && graphData.nodes.length)
        roots.push(graphData.nodes[0]);

      function buildTreeNode(id, visited = new Set()) {
        if (visited.has(id)) return null;
        visited.add(id);
        const node = nodeMap.get(id) || { id, name: id };
        function wrapLabel(name) {
          if (!name || name.length <= 18) return name;
          const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
          const words = spaced.split(" ");
          const lines = [];
          let line = "";
          for (const w of words) {
            if (line && (line + " " + w).length > 18) {
              lines.push(line);
              line = w;
            } else {
              line = line ? line + " " + w : w;
            }
          }
          if (line) lines.push(line);
          return lines.join("\n");
        }

        const catName = getCatName(node.name);
        return {
          name: wrapLabel(node.name),
          itemStyle: {
            color: catColorMap.get(catName),
            borderColor: isDark ? "#1e293b" : "#fff",
            borderWidth: 2,
          },
          children: (childrenMap.get(id) || [])
            .map((cid) => buildTreeNode(cid, visited))
            .filter(Boolean),
        };
      }

      const treeData =
        roots.length === 1
          ? buildTreeNode(roots[0].id)
          : {
              name: "Root",
              itemStyle: { color: isDark ? "#64748b" : "#94a3b8" },
              children: roots.map((r) => buildTreeNode(r.id)).filter(Boolean),
            };

      const size = treeSizeTB(treeData);
      if (graphRef.current) {
        graphRef.current.style.width =
          Math.round(size.width * graphZoomLevel) + "px";
        graphRef.current.style.height =
          Math.round(size.height * graphZoomLevel) + "px";
      }
      if (graphInst.current) {
        disposeChart(graphRef.current);
        graphInst.current = null;
      }
      graphInst.current = initChart(graphRef.current);
      graphInst.current.setOption(
        {
          title: graphTitle
            ? {
                text: graphTitle,
                left: "center",
                top: 8,
                textStyle: { color: lc, fontSize: 14, fontWeight: 600 },
              }
            : undefined,
          tooltip: { trigger: "item", formatter: (p) => p.data?.name || "" },
          series: [
            {
              type: "tree",
              data: [treeData],
              top: graphTitle ? 70 : 40,
              left: 30,
              bottom: 80,
              right: 30,
              orient: "TB",
              symbolSize: Math.round(12 * graphZoomLevel),
              edgeForkPosition: "60%",
              edgeShape: "polyline",
              label: {
                position: "bottom",
                verticalAlign: "top",
                align: "center",
                fontSize: 11,
                fontFamily: "Red hat Mono, monospace",
                color: lc,
                width: 140,
                overflow: "truncate",
              },
              leaves: {
                label: {
                  position: "bottom",
                  verticalAlign: "top",
                  align: "center",
                },
              },
              lineStyle: { color: isDark ? "#475569" : "#94a3b8", width: 1.5 },
              emphasis: { focus: "descendant" },
              expandAndCollapse: true,
              initialTreeDepth: -1,
              animationDuration: 550,
            },
          ],
        },
        true,
      );
      setTimeout(() => graphInst.current?.resize(), 100);
    } catch (err) {
      console.error("Graph render error:", err);
    }
    return () => {
      if (graphRef.current && graphInst.current) {
        disposeChart(graphRef.current);
        graphInst.current = null;
      }
    };
  }, [graphData, graphZoomLevel, graphTitle]);

  async function exportCSV(rows, columns) {
    if (!rows?.length) return;

    const cols = columns?.length ? columns : Object.keys(rows[0]);

    const escape = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };

    const lines = [cols.join(",")];
    for (const row of rows) {
      lines.push(cols.map((c) => escape(row[c])).join(","));
    }

    const csvContent = lines.join("\n");

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "query-results.csv",
        types: [
          {
            description: "CSV Files",
            accept: {
              "text/csv": [".csv"],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(csvContent);
      await writable.close();
      toast.success(`Downloaded ${handle.name}`);
    } catch (err) {
      if (err.name !== "AbortError") {
        toast.error("Export failed:", err);
      }
    }
  }

  async function exportTSV(rows, columns) {
    if (!rows?.length) return;
    const cols = columns?.length ? columns : Object.keys(rows[0]);
    const lines = [cols.join("\t")];
    for (const row of rows)
      lines.push(
        cols.map((c) => String(row[c] ?? "").replace(/\t/g, " ")).join("\t"),
      );

    const tsvContent = lines.join("\n");

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "query-results.tsv",
        types: [
          {
            description: "TSV Files",
            accept: {
              "text/tab-separated-values": [".tsv"],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(tsvContent);
      await writable.close();
      toast.success(`Downloaded ${handle.name}`);
    } catch (err) {
      if (err.name !== "AbortError") {
        toast.error("TSV Export failed:", err);
      }
    }
  }

  async function exportJSON(rows) {
    if (!rows?.length) return;
    const jsonContent = JSON.stringify(rows, null, 2);

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "query-results.json",
        types: [
          {
            description: "JSON Files",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(jsonContent);
      await writable.close();

      console.log(handle);
      console.log(writable);
      toast.success(`Downloaded ${handle.name}`);
    } catch (err) {
      if (err.name !== "AbortError") {
        toast.error("JSON Export failed:", err);
      }
    }
  }

  function graphDownload() {
    if (!graphInst.current) return;
    const url = graphInst.current.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "transparent",
    });
    const a = document.createElement("a");
    a.href = url;
    a.download = "explain-tree.png";
    a.click();
  }
  function graphZoom(f) {
    setGraphZoomLevel((z) => Math.max(0.3, Math.min(3, +(z * f).toFixed(2))));
  }
  const [running, setRunning] = useState(false);
  const [estimateResult, setEstimateResult] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [lastQueryId, setLastQueryId] = useState(null);
  const [featureQueryId, setFeatureQueryId] = useState(null);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const memoryTimerRef = useRef(null);
  const lastQueryIdRef = useRef(null);
  // Always-current credentials, for use inside callbacks and effects that would
  // otherwise capture a stale value.
  const editorCredsRef = useRef(null);
  const featureQueryIdRef = useRef(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(240);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sqlCollapsed, setSqlCollapsed] = useState(false);
  const [acWords, setAcWords] = useState([]);
  const [acVisible, setAcVisible] = useState(false);
  const [acFiltered, setAcFiltered] = useState([]);
  const [acIndex, setAcIndex] = useState(0);
  const [acPos, setAcPos] = useState({ top: 0, left: 0 });
  const [ddlModal, setDdlModal] = useState(null); // { name, ddl, loading }
  const [panel, setPanel] = useState(null); // 'history' | 'bookmarks' | null
  const [history, setHistory] = useState(() => getHistory());
  const [bookmarks, setBookmarks] = useState([]);
  const [bookmarkName, setBookmarkName] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);

  const lastSqlRef = useRef("");
  const lastRunMetaRef = useRef({ written: 0 });

  const { theme } = useTheme();

  async function initSetup() {
    const isExits = localStorage?.getItem(SELECTLSKEY);

    if (isExits === undefined || isExits === null) {
      let clusterAiId = {};
      clusters?.forEach((value) => {
        let nodeObj = {};
        value?.nodes?.forEach((node) => {
          nodeObj[node?.name] = [];
        });
        clusterAiId[value?.id] = nodeObj;
      });

      localStorage.setItem(SELECTLSKEY, JSON.stringify(clusterAiId));
      return;
    }

    const selectDB = JSON.parse(localStorage?.getItem(SELECTLSKEY));
    let updateCluster = { ...selectDB };

    clusters.forEach((value) => {
      const find = Object?.keys(selectDB).includes(value?.id);
      if (find) {
        let newNodes = {};
        value?.nodes?.forEach((node) => {
          const isInOldNodes = Object.keys(updateCluster[value?.id]).find(
            (val) => val === node?.name,
          );
          if (!isInOldNodes) {
            newNodes[node?.name] = [];
          }
        });
        updateCluster[value?.id] = { ...selectDB[value?.id], ...newNodes };
      } else {
        let nodeObj = {};
        value?.nodes?.forEach((node) => {
          nodeObj[node?.name] = [];
        });
        updateCluster[value?.id] = nodeObj;
      }
    });
    localStorage?.setItem(SELECTLSKEY, JSON.stringify(updateCluster));

    if (Object.keys(updateCluster).length > 0) {
      const SelectedClusterAndNode = updateCluster[selectedClusterId][nodeName];
      SelectedClusterAndNode?.forEach((dbsConnections) => {
        if (dbsConnections?.isSelected) {
          setSelectedAIDB(dbsConnections?.dbName);
          setSelectedAIDBID(dbsConnections?.ai_id);
        }
      });

      return;
    }

    setSelectedAIDB(null);
    setSelectedAIDBID(null);

    return;
  }

  useEffect(() => {
    featureQueryIdRef.current = featureQueryId;
  }, [featureQueryId]);

  useEffect(() => {
    if (qidFromUrl) {
      setLastQueryId(qidFromUrl);
      setFeatureQueryId(qidFromUrl);
    }
  }, [qidFromUrl]);

  useEffect(() => {
    if (ExplainOptionSelector.type) {
      doRun();
    }
  }, [ExplainOptionSelector]);

  useEffect(() => {
    if (onSidebarStateChange) {
      onSidebarStateChange(true);
    }
    return () => {
      if (onSidebarStateChange) {
        onSidebarStateChange(false);
      }
    };
  }, [onSidebarStateChange]);

  // Validate the entered credentials by running a trivial query as that user.
  // Only on success do we store them and unlock the editor.
  async function handleConnect() {
    if (!connUser.trim()) {
      setConnError("Username is required.");
      return;
    }
    setConnecting(true);
    setConnError(null);
    const candidate = { user: connUser.trim(), password: connPassword };
    try {
      // Validates the credentials and stores them encrypted server-side under
      // (jti, 'editor'). The password is never held in client state afterwards.
      await editorConnect(candidate);
      setEditorCreds({ user: candidate.user });
      setConnPassword("");
    } catch (e) {
      setConnError(e.message);
    } finally {
      setConnecting(false);
    }
  }

  // Clear the server-side session and any loaded schema so nothing stale remains.
  async function handleDisconnect() {
    try {
      await editorDisconnect();
    } catch {
      /* best effort; clear locally regardless */
    }
    setEditorCreds(null);
    setConnUser("");
    setConnPassword("");
    setConnError(null);
    setDbs([]);
    setSelectedDb(null);
    setTables([]);
    setAcWords([]);
  }

  async function showDdl(db, tableName) {
    const creds = editorCredsRef.current;
    if (!creds) return;
    setDdlModal({ name: `${db}.${tableName}`, ddl: "", loading: true });
    try {
      const r = await runEditorQuery(
        `SHOW CREATE TABLE ${db}.${tableName}`,
        creds,
      );
      const ddl =
        r.rows?.[0]?.statement ||
        r.rows?.[0]?.["SHOW CREATE TABLE"] ||
        r.rows?.[0]?.[Object.keys(r.rows[0])[0]] ||
        "No DDL returned";
      setDdlModal({ name: `${db}.${tableName}`, ddl, loading: false });
    } catch (e) {
      setDdlModal({
        name: `${db}.${tableName}`,
        ddl: `Error: ${e.message}`,
        loading: false,
      });
    }
  }

  const loadDbs = useCallback(() => {
    const creds = editorCredsRef.current;
    if (!creds) return;
    runEditorQuery("SELECT name FROM system.databases ORDER BY name", creds)
      .then((r) => setDbs((r.rows || []).map((r) => r.name)))
      .catch(() => {});
    initSetup();
  }, []);

  async function loadBookmarks() {
    try {
      const r = await apiFetch("/api/settings/query_bookmarks");
      if (r?.value) setBookmarks(JSON.parse(r.value));
    } catch {
      setBookmarks([]);
    }
  }

  function loadAutocomplete() {
    const creds = editorCredsRef.current;
    if (!creds) return;
    Promise.all([
      runEditorQuery("SELECT keyword FROM system.keywords", creds).catch(
        () => ({
          rows: [],
        }),
      ),
      runEditorQuery("SELECT name FROM system.functions", creds).catch(() => ({
        rows: [],
      })),
      runEditorQuery(
        "SELECT database, name FROM system.tables WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY database, name",
        creds,
      ).catch(() => ({ rows: [] })),
    ]).then(([kw, fn, tb]) => {
      const words = [];
      (kw.rows || []).forEach((r) => {
        if (r.keyword) words.push(r.keyword.toUpperCase());
      });
      (fn.rows || []).forEach((r) => {
        if (r.name) words.push(r.name);
      });
      const dbSet = new Set();
      (tb.rows || []).forEach((r) => {
        if (r.database) dbSet.add(r.database);
        if (r.name) words.push(r.name);
        if (r.database && r.name) words.push(`${r.database}.${r.name}`);
      });
      dbSet.forEach((d) => words.push(d));
      setAcWords([...new Set(words)].sort());
    });
  }

  // Clean up the memory lookup timer if the component unmounts
  useEffect(() => {
    return () => {
      if (memoryTimerRef.current) clearTimeout(memoryTimerRef.current);
    };
  }, []);

  // Keep ref in sync with state so async callbacks can check staleness.
  useEffect(() => {
    lastQueryIdRef.current = lastQueryId;
  }, [lastQueryId]);

  useEffect(() => {
    editorCredsRef.current = editorCreds;
  }, [editorCreds]);

  // After a page reload the (jti, 'editor') credential session may still be live
  // server-side (it shares the 2h JWT lifetime). Restore the connected state from
  // it so the user does not have to reconnect. Never carries a password.
  useEffect(() => {
    let cancelled = false;
    editorConnectionStatus()
      .then((s) => {
        if (!cancelled && s?.connected && s.chUser) {
          setEditorCreds({ user: s.chUser });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // useEffect(() => {
  //   loadDbs();
  //   loadBookmarks();
  //   loadAutocomplete();
  // }, []);

  useEffect(() => {
    loadBookmarks();
  }, []);

  // Load schema and autocomplete once the user connects, and again if they
  // switch node or cluster in the navbar (credentials are kept across switches).
  useEffect(() => {
    if (!editorConnected) return;
    loadDbs();
    loadAutocomplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorConnected, selectedClusterId, selectedNode]);

  useEffect(() => {
    if (!selectedDb || !editorConnected) {
      setTables([]);
      return;
    }
    const creds = editorCredsRef.current;
    setTablesLoading(true);
    setTables([]);
    runEditorQuery(
      `SELECT name, engine FROM system.tables WHERE database='${selectedDb}' ORDER BY name`,
      creds,
    )
      .then((r) => {
        const rows = r.rows || [];
        if (rows.length === 0) {
          return runEditorQuery(
            `SELECT name, engine FROM system.tables WHERE database='${selectedDb}' OR engine LIKE '%Distributed%' ORDER BY name`,
            creds,
          ).then((fr) => fr.rows || []);
        }
        return rows;
      })
      .then((arr) => {
        const seen = new Set();
        const merged = (arr || []).filter((x) => {
          if (!x || !x.name) return false;
          if (seen.has(x.name)) return false;
          seen.add(x.name);
          return true;
        });
        setTables(merged);
      })
      .catch(() => setTables([]))
      .finally(() => setTablesLoading(false));
  }, [selectedDb, editorConnected]);

  useEffect(() => {
    setTimeout(() => {
      selectedRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 0);
  }, [acIndex]);

  function syncScroll() {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  function parseDotGraph(dotText) {
    const nodes = new Map();
    const links = [];
    const lines = dotText.split("\n");
    for (const line of lines) {
      const nodeMatch = line.match(
        /^\s*"?(\w+)"?\s*\[.*?label\s*=\s*"([^"]*)".*?\]/,
      );
      if (nodeMatch) {
        nodes.set(nodeMatch[1], {
          id: nodeMatch[1],
          name: nodeMatch[2] || nodeMatch[1],
        });
        continue;
      }
      const edgeMatch = line.match(/^\s*"?(\w+)"?\s*->\s*"?(\w+)"?/);
      if (edgeMatch) {
        const src = edgeMatch[1],
          tgt = edgeMatch[2];
        if (!nodes.has(src)) nodes.set(src, { id: src, name: src });
        if (!nodes.has(tgt)) nodes.set(tgt, { id: tgt, name: tgt });
        links.push({ source: src, target: tgt });
      }
    }
    return { nodes: [...nodes.values()], links };
  }

  // If an editor query failed because the server-side credential session expired
  // (or was revoked), drop the connected state so the reconnect panel appears.
  // Strict: we never silently fall back to the node/default user.
  function handleSessionExpiry(e) {
    if (e?.code === "CRED_SESSION_EXPIRED") {
      setEditorCreds(null);
      setDbs([]);
      setSelectedDb(null);
      setTables([]);
      setAcWords([]);
      return true;
    }
    return false;
  }

  const doRun = useCallback(async () => {
    const text = sql.trim();
    if (!text) return;
    if (!editorConnected) {
      setError("Connect with your ClickHouse credentials first.");
      return;
    }

    if (!isValidSizeSqlQuery(text)) {
      toast.warning("SQL content exceeds the 100 KB limit.");
      setRunning(false);
      setError(null);
      setResult(null);
      setResultCols([]);
      setSuccessMsg(null);
      setGraphData(null);
      setGraphTitle("");
      setQueryStats(null);
      setEstimateResult(null);
      setEstimating(false);
      setLastQueryId(null);
      setFeatureQueryId(null);
      setMemoryUsage(null);
      return;
    }

    lastSqlRef.current = text;

    lastRunMetaRef.current = { written: 0 };

    setRunning(true);
    setError(null);
    setResult(null);
    setResultCols([]);
    setSuccessMsg(null);
    setGraphData(null);
    setGraphTitle("");
    setQueryStats(null);
    setEstimateResult(null);
    setEstimating(false);
    setLastQueryId(null);
    setFeatureQueryId(null);
    setMemoryUsage(null);
    if (memoryTimerRef.current) clearTimeout(memoryTimerRef.current);

    try {
      const validExplain =
        ExplainOptionSelector.type !== null &&
        ExplainOptionSelector.type !== "" &&
        ExplainOptionSelector.type !== "GENERAL RUN"
          ? `${ExplainOptionSelector.type} ${text}`
          : text;
      const r = await runEditorQuery(validExplain, editorCreds);
      if (r.stats) setQueryStats(r.stats);

      // Capture query_id for profiling deep-links.
      const qid = r.queryId || null;
      setLastQueryId(qid);
      setFeatureQueryId(qid);

      // Look up peak memory after ClickHouse flushes query_log (~300ms).
      if (qid) {
        const capturedQid = qid;
        memoryTimerRef.current = setTimeout(async () => {
          // Bail if a newer query has started or component unmounted.
          if (lastQueryIdRef.current !== capturedQid) return;
          const mem = await lookupMemoryUsage(
            capturedQid,
            editorCredsRef.current,
          );
          if (lastQueryIdRef.current === capturedQid && mem != null) {
            setMemoryUsage(mem);
          }
        }, 300);
      }

      const extractWritten = (res) => {
        if (!res) return 0;
        if (res.stats) {
          const s = res.stats;
          if (s.written_rows) return Number(s.written_rows);
          if (s.written_rows_count) return Number(s.written_rows_count);
          if (s.written) return Number(s.written);
        }
        if (typeof res.written_rows !== "undefined")
          return Number(res.written_rows) || 0;
        if (typeof res.rows_written !== "undefined")
          return Number(res.rows_written) || 0;
        if (typeof res.inserted_rows !== "undefined")
          return Number(res.inserted_rows) || 0;
        if (typeof res.affected_rows !== "undefined")
          return Number(res.affected_rows) || 0;
        if (typeof res.row_count !== "undefined")
          return Number(res.row_count) || 0;
        if (
          Array.isArray(res.rows) &&
          res.rows.length === 0 &&
          res.stats &&
          res.stats.written_rows
        )
          return Number(res.stats.written_rows);
        return 0;
      };
      const written = extractWritten(r);
      lastRunMetaRef.current = { written };

      if (r.rows?.length > 0) {
        const firstVal = Object.values(r.rows[0])[0] || "";
        const allText = r.rows
          .map((row) => Object.values(row)[0] || "")
          .join("\n");
        if (
          typeof firstVal === "string" &&
          (allText.includes("digraph") || allText.includes("->"))
        ) {
          const parsed = parseDotGraph(allText);
          if (parsed.nodes.length > 0) {
            const isAstGraph = String(ExplainOptionSelector.type || "")
              .toUpperCase()
              .includes("EXPLAIN AST");
            const isPipelineGraph = String(ExplainOptionSelector.type || "")
              .toUpperCase()
              .includes("EXPLAIN PIPELINE");
            setGraphTitle(
              isAstGraph
                ? "AST Graph"
                : isPipelineGraph
                  ? "Pipeline Graph"
                  : "EXPLAIN Graph",
            );
            setGraphData(parsed);
            setGraphFullscreen(true);
            setResult(r.rows);
            setResultCols(r.columns || []);
            setRunning(false);
            return;
          }
        }
        if (
          typeof firstVal === "string" &&
          (firstVal.trim().startsWith("{") || firstVal.trim().startsWith("["))
        ) {
          try {
            const parsed = JSON.parse(allText);
            setResult(r.rows);
            setResultCols(r.columns || []);
            setGraphData({ _json: true, data: parsed });
            setRunning(false);
            return;
          } catch {
            try {
              const unescaped = allText
                .replace(/\\n/g, "\n")
                .replace(/\\t/g, "\t");
              const parsed = JSON.parse(unescaped);
              setResult(r.rows);
              setResultCols(r.columns || []);
              setGraphData({ _json: true, data: parsed });
              setRunning(false);
              return;
            } catch {}
          }
        }
        setResult(r.rows);
        setResultCols(r.columns || []);
      } else if (isDataQuery(text)) {
        // A row-returning statement (SELECT / SHOW / EXPLAIN / DESCRIBE / ...)
        // that matched nothing. Show the empty result state with "0 row(s)
        // returned" rather than a DDL-style "executed successfully" message.
        setResult([]);
        setResultCols(r.columns || []);
        setSuccessMsg(null);
      } else {
        const firstWord = analyzeSql(text).statements[0]?.keyword || "";
        const msgs = {
          CREATE: "Created successfully.",
          INSERT: "Insert executed successfully.",
          ALTER: "Altered successfully.",
          DROP: "Dropped successfully.",
          GRANT: "Granted successfully.",
          REVOKE: "Revoked successfully.",
          SYSTEM: "System command executed.",
          OPTIMIZE: "Optimize executed.",
          TRUNCATE: "Truncated successfully.",
          KILL: "Kill executed.",
        };
        let baseMsg = msgs[firstWord] || "Query executed successfully.";
        if (written && written > 0) {
          baseMsg = `${baseMsg} ${written.toLocaleString()} row(s) affected.`;
        }
        setSuccessMsg(baseMsg);
        setResult([]);
        setResultCols([]);
      }
    } catch (e) {
      handleSessionExpiry(e);
      setError(e.message);
      setFeatureQueryId(null);
    }
    setRunning(false);
  }, [sql, ExplainOptionSelector, editorConnected, editorCreds]);

  const doEstimate = useCallback(async () => {
    const text =
      sql.trim().split("*/").length > 1
        ? sql.trim().split("*/")[1]
        : sql?.trim();

    if (!text) return;
    if (!editorConnected) {
      setError("Connect with your ClickHouse credentials first.");
      return;
    }

    setEstimating(true);

    setEstimating(true);
    setEstimateResult(null);
    setResult(null);
    setResultCols([]);
    setError(null);
    setSuccessMsg(null);
    setGraphData(null);
    setQueryStats(null);
    setLastQueryId(null);
    setFeatureQueryId(null);
    setMemoryUsage(null);

    try {
      const est = await runEstimate(text, editorCreds);
      setEstimateResult(est);
    } catch (e) {
      handleSessionExpiry(e);
      setError("Estimate failed: " + e.message);
    } finally {
      setEstimating(false);
    }
  }, [sql, editorConnected, editorCreds]);

  useEffect(() => {
    if (lastSqlRef.current === "") return;
    if (running) return;
    const text = lastSqlRef.current;
    if (!text) return;
    const rowsCount =
      result && Array.isArray(result) && result.length > 0
        ? result.length
        : lastRunMetaRef.current?.written || 0;
    addHistory({
      sql: text,
      timestamp: new Date().toISOString(),
      rows: rowsCount,
      status: error ? "error" : "ok",
      error: error ? String(error).substring(0, 200) : null,
      elapsed: queryStats?.elapsed_ns
        ? (Number(queryStats.elapsed_ns) / 1e9).toFixed(3) + "s"
        : null,
    });
    setHistory(getHistory());
    lastSqlRef.current = "";
    lastRunMetaRef.current = { written: 0 };
  }, [result, error, running, queryStats]);

  async function saveBookmark() {
    if (!bookmarkName.trim() || !sql.trim()) return;
    const updated = [
      ...bookmarks,
      {
        name: bookmarkName.trim(),
        sql: sql.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    try {
      await apiFetch("/api/settings/query_bookmarks", {
        method: "PUT",
        body: JSON.stringify({
          value: JSON.stringify(updated),
          category: "editor",
        }),
      });
      setBookmarks(updated);
      setBookmarkName("");
    } catch {}
  }

  async function deleteBookmark(idx) {
    const updated = bookmarks.filter((_, i) => i !== idx);
    try {
      await apiFetch("/api/settings/query_bookmarks", {
        method: "PUT",
        body: JSON.stringify({
          value: JSON.stringify(updated),
          category: "editor",
        }),
      });
      setBookmarks(updated);
    } catch {}
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      doRun();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      setPanel(panel === "bookmarks" ? null : "bookmarks");
      return;
    }
    if (e.key === "Tab" && !acVisible) {
      e.preventDefault();
      const ta = textareaRef.current;
      const s = ta.selectionStart;
      setSql(sql.substring(0, s) + "  " + sql.substring(ta.selectionEnd));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
      return;
    }
    if (acVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIndex((i) => Math.min(i + 1, acFiltered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (acFiltered.length) {
          e.preventDefault();
          insertAc(acFiltered[acIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        setAcVisible(false);
        return;
      }
    }
    if (e.key === "Escape" && fullscreen) {
      setFullscreen(false);
    }
  }

  function insertAc(word) {
    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    let ws = pos;
    while (ws > 0 && /[\w.]/.test(sql[ws - 1])) ws--;
    const ns = sql.substring(0, ws) + word + " " + sql.substring(pos);
    setSql(ns);
    setAcVisible(false);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = ws + word.length + 1;
      ta.focus();
    });
  }

  function handleInput(e) {
    const val = e.target.value;
    setSql(val);
    const pos = e.target.selectionStart;
    let ws = pos;
    while (ws > 0 && /[\w.]/.test(val[ws - 1])) ws--;
    const partial = val.substring(ws, pos);
    if (partial.length >= 2) {
      const up = partial.toUpperCase();
      const filtered = acWords
        .filter((w) => w.toUpperCase().startsWith(up))
        .slice(0, 12);
      if (filtered.length) {
        setAcFiltered(filtered);
        setAcIndex(0);
        setAcVisible(true);
        const lines = val.substring(0, pos).split("\n");
        setAcPos({
          top: lines.length * 21 + 4 - (textareaRef.current?.scrollTop || 0),
          left:
            lines[lines.length - 1].length * 8.4 +
            50 -
            (textareaRef.current?.scrollLeft || 0),
        });
        return;
      }
    }
    setAcVisible(false);
  }

  function insertText(t) {
    const ta = textareaRef.current;
    const p = ta.selectionStart;
    setSql(sql.substring(0, p) + t + sql.substring(p));
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = p + t.length;
      ta.focus();
    });
  }

  const lineNums = Array.from(
    { length: sql.split("\n").length },
    (_, i) => i + 1,
  ).join("\n");
  const shellStyle = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 900,
        margin: 0,
        backgroundColor: "var(--bg-page)",
        width: "100%",
        height: "100%",
      }
    : { height: "90.5vh" };

  const effectiveQueryId = featureQueryId || lastQueryId || qidFromUrl || null;

  async function selectHandler(db) {
    try {
      const localStorageData = JSON.parse(localStorage?.getItem(SELECTLSKEY));
      const selected = db;

      let SelectedClusterAndNode =
        localStorageData[selectedClusterId][nodeName];

      const find = SelectedClusterAndNode?.filter(
        (db) => db?.dbName === selected,
      );

      if (find?.length === 0 && !isAILoading) {
        setIsAILoading(true);
        const responseData = await await apiFetch(`/api/ai/database/connect`, {
          method: "POST",
          body: JSON.stringify({
            database_type: "clickhouse",
            credentials: {
              host: selectedNode,
              port: port,
              username: user,
              password: password,
              database: selected,
            },
            llm_provider: "string",
            model_name: "string",
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (responseData?.success) {
          const obj = {
            dbName: selected,
            ai_id: responseData?.database_id,
            isSelected: true,
          };

          let filtered = SelectedClusterAndNode?.map((db) => ({
            ...db,
            isSelected: false,
          }));

          filtered?.push(obj);

          let filterData = { ...localStorageData };
          filterData[selectedClusterId][nodeName] = filtered;

          localStorage?.setItem(SELECTLSKEY, JSON.stringify(filterData));
          setSelectedAIDB(selected);
          setSelectedAIDBID(responseData?.database_id);
          toast.success(`Successfully AI database id generated!`);
        } else {
          toast.error("Failed to load database ID. Please retry.");
        }
      } else {
        setIsAILoading(true);
        const filtered = localStorageData[selectedClusterId][nodeName].map(
          (db) => {
            if (db?.dbName === selected) {
              return { ...db, isSelected: true };
            }
            return { ...db, isSelected: false };
          },
        );
        let filterData = { ...localStorageData };
        filterData[selectedClusterId][nodeName] = filtered;
        localStorage?.setItem(SELECTLSKEY, JSON.stringify(filterData));
        setSelectedAIDB(selected);
        setSelectedAIDBID(find[0]?.ai_id);
      }
    } catch (err) {
      toast?.error(`Failed to load database ID. Please retry.`);
    } finally {
      setIsAILoading(false);
    }
  }

  async function GeneratingSQLHandler() {
    const message =
      sql?.trim()?.split("*/")?.length > 1
        ? sql?.trim()?.split("*/")[1]
        : sql?.trim();

    if (message?.length > 0) {
      setSql(LOADING_PHRASES[index]);
      setIsAILoadingGenerating(true);

      try {
        const responseAIQuery = await await apiFetch(
          `/api/ai/sql/generate-sql`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON?.stringify({
              database_id: selectedAIDBID,
              user_question: message,
            }),
          },
        );

        if (responseAIQuery?.success) {
          setSql(
            `/*\n\n--QUESTION : ${message}? \n--DATABASE_NAME : ${selectedAIDB}\n\n*/\n\n${format(responseAIQuery?.generated_sql, { language: "clickhouse" })}`,
          );
        }
      } catch (error) {
        toast?.error(error?.message);
        setSql(
          `/*\n--QUESTION : ${message}? \n--DATABASE_NAME : ${selectedAIDB}\n*/\n\n-- Error : ${format(responseAIQuery?.generated_sql, { language: "clickhouse" })}`,
        );
      } finally {
        setIsAILoadingGenerating(false);
      }
    }
  }

  return (
    <div
      className="editor-shell"
      style={{ ...shellStyle, pointerEvents: "auto" }}
    >
      {explorerOpen ? (
        <div
          className="editor-sidebar"
          style={{
            width: explorerWidth,
            minWidth: 160,
            maxWidth: 500,
            height: fullscreen ? "100%" : "90.5vh",
            position: "relative",
            marginLeft: 0,
          }}
        >
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div className="editor-sidebar-header">
              <Icon className="ti ti-database"></Icon> Explorer
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  loadDbs();
                  setSelectedDb(null);
                }}
                title="Refresh databases"
                style={{ marginLeft: "auto" }}
              >
                <Icon className="ti ti-refresh"></Icon>
              </button>
            </div>
            {!editorConnected ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "28px 16px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                <Icon
                  className="ti ti-lock"
                  style={{ fontSize: 22, opacity: 0.6 }}
                ></Icon>
                <span>Connect to browse databases.</span>
              </div>
            ) : (
              dbs.map((db) => (
                <div key={db} style={{ display: "flex", alignItems: "start" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyItems: "center",
                      width: "30px",
                      height: "30px",
                      marginTop: "5px",
                      paddingLeft: "5px",
                      cursor: "pointer",
                    }}
                    onClick={() => selectHandler(db)}
                    title="Select database for work AI"
                  >
                    {isAILoading ? (
                      <div className="loading-spinner"></div>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill={
                          selectedAIDB === db
                            ? "var(--accent)"
                            : theme === "dark"
                              ? "lightgray"
                              : "lightgray"
                        }
                        className="icon icon-tabler icons-tabler-filled icon-tabler-sparkles-2"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M17.964 2.733c.156 .563 .312 1 .484 1.353c.342 .71 .758 1.125 1.47 1.467c.353 .17 .79 .326 1.352 .484c.98 .276 .97 1.668 -.013 1.93a8.3 8.3 0 0 0 -1.34 .481c-.71 .342 -1.127 .757 -1.463 1.453a8 8 0 0 0 -.486 1.352c-.258 .988 -1.658 1 -1.932 .015c-.156 -.565 -.312 -1.002 -.484 -1.354c-.342 -.71 -.758 -1.124 -1.458 -1.46a8 8 0 0 0 -1.374 -.495a.4 .4 0 0 1 -.06 -.02l-.044 -.017l-.045 -.02l-.049 -.025l-.035 -.02a.4 .4 0 0 1 -.049 -.03l-.032 -.023l-.043 -.034l-.033 -.028l-.036 -.035l-.034 -.035l-.028 -.033l-.035 -.043l-.022 -.032a.4 .4 0 0 1 -.032 -.049l-.02 -.035l-.025 -.05l-.02 -.044l-.017 -.043a.4 .4 0 0 1 -.02 -.06l-.01 -.034a.5 .5 0 0 1 -.02 -.098l-.006 -.065l-.005 -.035v-.05a.4 .4 0 0 1 .003 -.085a.5 .5 0 0 1 .013 -.093a.5 .5 0 0 1 .024 -.103a.4 .4 0 0 1 .02 -.06l.017 -.044l.02 -.045l.025 -.049l.02 -.035a.4 .4 0 0 1 .03 -.049l.023 -.032l.034 -.043l.028 -.033l.035 -.036l.035 -.034q .015 -.015 .033 -.028l.043 -.035l.032 -.022a.4 .4 0 0 1 .049 -.032l.035 -.02l.05 -.025l.044 -.02l.043 -.017a.4 .4 0 0 1 .06 -.02l.027 -.008a8.3 8.3 0 0 0 1.339 -.48c.71 -.342 1.127 -.757 1.47 -1.466c.17 -.354 .327 -.792 .483 -1.355c.272 -.976 1.657 -.976 1.928 0" />
                        <path d="M10.965 6.737q .219 .801 .503 1.574c.856 2.28 1.945 3.363 4.23 4.22q .708 .265 1.571 .506c.976 .272 .974 1.656 -.002 1.927q -.798 .221 -1.568 .504c-2.288 .858 -3.376 1.94 -4.229 4.216a19 19 0 0 0 -.505 1.579c-.268 .983 -1.662 .983 -1.93 0a19 19 0 0 0 -.503 -1.574c-.856 -2.281 -1.944 -3.363 -4.226 -4.219a20 20 0 0 0 -1.594 -.513a.4 .4 0 0 1 -.054 -.018l-.044 -.017l-.043 -.02a.3 .3 0 0 1 -.048 -.024l-.036 -.02a.4 .4 0 0 1 -.048 -.03l-.032 -.024l-.044 -.034l-.033 -.029l-.037 -.034l-.034 -.037l-.03 -.033l-.033 -.044l-.023 -.032a.4 .4 0 0 1 -.03 -.048l-.021 -.036a.3 .3 0 0 1 -.024 -.048l-.02 -.043l-.017 -.044a.4 .4 0 0 1 -.018 -.054a.2 .2 0 0 1 -.01 -.039a.4 .4 0 0 1 -.014 -.059l-.007 -.04l-.007 -.056l-.003 -.044l-.002 -.05v-.05q 0 -.023 .004 -.044q .001 -.03 .007 -.057l.007 -.04a.4 .4 0 0 1 .017 -.076l.007 -.021a.4 .4 0 0 1 .018 -.054l.017 -.044l.02 -.043a.3 .3 0 0 1 .024 -.048l.02 -.036a.4 .4 0 0 1 .03 -.048l.024 -.032l.034 -.044l.029 -.033l.034 -.037l.037 -.034l.033 -.03l.044 -.033l.032 -.023a.4 .4 0 0 1 .048 -.03l.036 -.021a.3 .3 0 0 1 .048 -.024l.043 -.02l.044 -.017a.4 .4 0 0 1 .054 -.018l.021 -.007a20 20 0 0 0 1.568 -.504c2.287 -.858 3.375 -1.94 4.229 -4.216a19 19 0 0 0 .505 -1.579c.268 -.983 1.662 -.983 1.93 0" />
                      </svg>
                    )}
                  </div>
                  <div style={{ width: "100%" }}>
                    <div
                      className={
                        "editor-db-item" + (selectedDb === db ? " active" : "")
                      }
                      onClick={() =>
                        setSelectedDb(selectedDb === db ? null : db)
                      }
                    >
                      <Icon className="ti ti-database-import"></Icon>
                      <span style={{ flex: 1 }}>{db}</span>
                      <Icon
                        className={
                          "ti ti-chevron-" +
                          (selectedDb === db ? "down" : "right")
                        }
                        style={{ fontSize: 14, opacity: 0.5 }}
                      ></Icon>
                    </div>
                    {selectedDb === db && (
                      <div
                        style={{
                          borderLeft: "2px solid var(--accent-border)",
                          marginLeft: 14,
                        }}
                      >
                        {tablesLoading ? (
                          <div
                            style={{
                              padding: "8px 12px",
                              fontSize: "13px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <span
                              className="loading-spinner"
                              style={{
                                width: 12,
                                height: 12,
                                display: "inline-block",
                                verticalAlign: "middle",
                                marginRight: 6,
                              }}
                            ></span>{" "}
                            Loading...
                          </div>
                        ) : tables.length === 0 ? (
                          <div
                            style={{
                              padding: "8px 12px",
                              fontSize: "13px",
                              color: "var(--text-muted)",
                            }}
                          >
                            No tables
                          </div>
                        ) : (
                          tables.map((t) => (
                            <div
                              key={t.name}
                              className="editor-table-item"
                              title={`${t.name} (${t.engine})`}
                            >
                              <Icon
                                className={"ti " + engineIcon(t.engine)}
                              ></Icon>
                              <span
                                style={{ flex: 1, cursor: "pointer" }}
                                onClick={() =>
                                  insertText(selectedDb + "." + t.name + " ")
                                }
                              >
                                {t.name}
                              </span>
                              <Icon
                                className="ti ti-code"
                                title="View DDL"
                                style={{
                                  fontSize: 14,
                                  cursor: "pointer",
                                  opacity: 0.5,
                                  flexShrink: 0,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showDdl(selectedDb, t.name);
                                }}
                              ></Icon>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setExplorerOpen(false)}
          >
            <Icon className="ti ti-chevron-left"></Icon> <span>Collapse</span>
          </button>
          <div
            style={{
              position: "absolute",
              top: 0,
              right: -3,
              width: 6,
              height: "100%",
              cursor: "col-resize",
              zIndex: 10,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX,
                startW = explorerWidth;
              const onMove = (ev) => {
                const w = Math.max(
                  160,
                  Math.min(500, startW + ev.clientX - startX),
                );
                setExplorerWidth(w);
              };
              const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
          >
            <div
              style={{
                width: 2,
                height: "100%",
                margin: "0 auto",
                background: "var(--border-default)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--accent)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--border-default)")
              }
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            width: 36,
            minWidth: 36,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--sidebar-border)",
            background: "var(--sidebar-bg)",
          }}
        >
          <div style={{ flex: 1 }}></div>
          <div
            style={{
              padding: "8px 0",
              borderTop: "1px solid var(--sidebar-border)",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Icon
              className="ti ti-folder-open"
              style={{
                fontSize: 18,
                color: "var(--icon-color)",
                cursor: "pointer",
              }}
              onClick={() => setExplorerOpen(true)}
              title="Open Explorer"
            ></Icon>
          </div>
        </div>
      )}

      <div className="editor-main">
        <div className="editor-toolbar">
          <ModeSelect mode={mode} onChange={onModeChange} />
          {/* Connect control: lives in the toolbar to save vertical space.
              Icon-only fields (user/lock) with title + aria-label for access. */}
          {!editorConnected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon
                  className="ti ti-user"
                  style={{ fontSize: 15, opacity: 0.55 }}
                  // aria-hidden="true"
                ></Icon>
                <input
                  className="form-input"
                  style={{
                    height: 28,
                    width: 150,
                    fontSize: "12px",
                    padding: "0 6px",
                  }}
                  placeholder="user"
                  title="ClickHouse username"
                  aria-label="ClickHouse username"
                  value={connUser}
                  onChange={(e) => setConnUser(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnect();
                  }}
                  autoComplete="off"
                />
              </span>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon
                  className="ti ti-lock"
                  style={{ fontSize: 15, opacity: 0.55 }}
                  // aria-hidden="true"
                ></Icon>
                <div
                  style={{
                    position: "relative",
                  }}
                >
                  <input
                    className="form-input"
                    type={isViewFlag ? "text" : "password"}
                    style={{
                      height: 28,
                      width: 150,
                      fontSize: "12px",
                      padding: "0 6px",
                      paddingRight: "30px",
                    }}
                    placeholder="password"
                    title="ClickHouse password"
                    aria-label="ClickHouse password"
                    value={connPassword}
                    onChange={(e) => setConnPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConnect();
                    }}
                    autoComplete="off"
                  />
                  <div onClick={() => setIsViewFlag(!isViewFlag)}>
                    <Icon
                      className={isViewFlag ? "ti ti-eye-off" : "ti ti-eye"}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "17%",
                        fontSize: "17px",
                      }}
                    />
                  </div>
                </div>
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleConnect}
                disabled={connecting || !connUser.trim()}
                title={`Connect to ${selectedNode || "node"}:${port}`}
              >
                {connecting ? (
                  <span className="loading-spinner"></span>
                ) : (
                  <Icon className="ti ti-plug"></Icon>
                )}{" "}
                Go
              </button>
              {connError && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--color-danger)",
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={connError}
                >
                  {connError}
                </span>
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              <Icon
                className="ti ti-plug-connected"
                style={{ fontSize: 15, color: "var(--color-success)" }}
              ></Icon>
              <span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {editorCreds.user}
                </strong>
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  @ {selectedNode}:{port}
                </span>
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDisconnect}
                title="Disconnect and clear credentials"
                style={{ padding: "2px 6px" }}
              >
                <Icon className="ti ti-logout"></Icon>
              </button>
            </div>
          )}
          {copied && (
            <span style={{ fontSize: "12px", color: "var(--color-success)" }}>
              <Icon className="ti ti-check" style={{ fontSize: 16 }}></Icon>{" "}
              Copied
            </span>
          )}
          <span style={{ flex: 1 }}></span>
          <button
            className={
              "btn btn-ghost btn-sm" + (panel === "history" ? " active" : "")
            }
            onClick={() => setPanel(panel === "history" ? null : "history")}
            title="Query History"
          >
            <Icon className="ti ti-history"></Icon> History
          </button>
          <button
            className={
              "btn btn-ghost btn-sm" + (panel === "bookmarks" ? " active" : "")
            }
            onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")}
            title="Bookmarks"
          >
            <Icon className="ti ti-star"></Icon> Bookmarks
          </button>
          {result?.length > 0 && !error && (
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Select
                className="form-select"
                style={{
                  height: 28,
                  fontSize: "12px",
                  padding: "0 6px",
                  minWidth: "120px",
                  width: 90,
                }}
                onChange={(e) => {
                  if (e.target.value === "csv") {
                    exportCSV(result, resultCols);
                  } else if (e.target.value === "json") {
                    exportJSON(result);
                  } else if (e.target.value === "tsv") {
                    exportTSV(result, resultCols);
                  }
                  e.target.value = "";
                }}
                defaultValue="EXPORT"
              >
                <option value="">Export</option>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="tsv">TSV</option>
              </Select>
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSqlCollapsed(!sqlCollapsed)}
            title={sqlCollapsed ? "Expand SQL" : "Collapse SQL"}
          >
            <Icon
              className={`ti ${sqlCollapsed ? "ti-chevron-down" : "ti-chevron-up"}`}
            ></Icon>{" "}
            {sqlCollapsed ? "Expand SQL" : "Collapse SQL"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Icon
              className={`ti ${fullscreen ? "ti-minimize" : "ti-maximize"}`}
            ></Icon>{" "}
            {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>

        {!sqlCollapsed && (
          <div className="sql-editor-wrap">
            <pre className="sql-line-numbers">{lineNums}</pre>
            <div className="sql-editor-inner">
              <pre
                ref={highlightRef}
                className="sql-highlight"
                // aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightSQL(sql) + "\n" }}
              />
              <textarea
                ref={textareaRef}
                className="sql-textarea"
                value={sql}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onScroll={syncScroll}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
              />
              <div className="sql-hint">
                Ctrl+Enter to run | Ctrl+B bookmarks
              </div>
              {acVisible && acFiltered.length > 0 && (
                <div
                  className="sql-autocomplete"
                  style={{ top: acPos.top, left: acPos.left }}
                >
                  {acFiltered.map((w, i) => (
                    <div
                      key={w}
                      ref={i === acIndex ? selectedRef : null}
                      className={
                        "sql-ac-item" + (i === acIndex ? " active" : "")
                      }
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertAc(w);
                      }}
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            padding: "6px 16px",
            borderBottom: "1px solid var(--border-default)",
            background: "var(--glass-bg)",
            backdropFilter: "blur(8px)",
            flexShrink: 0,
          }}
        >
          {result && !error && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              {successMsg ? (
                <>
                  <Icon
                    className="ti ti-check"
                    style={{ color: "var(--color-success)", fontSize: 16 }}
                  />
                  {successMsg}
                  {queryStats?.written_rows && queryStats.written_rows !== "0"
                    ? ` | ${Number(queryStats.written_rows).toLocaleString()} rows written`
                    : ""}
                </>
              ) : (
                <>
                  <Icon
                    className="ti ti-check"
                    style={{ color: "var(--color-success)", fontSize: 16 }}
                  />
                  {result.length.toLocaleString()} row(s) returned
                </>
              )}
              {queryStats && (
                <span>
                  {queryStats.read_rows && queryStats.read_rows !== "0"
                    ? ` | ${Number(queryStats.read_rows).toLocaleString()} scanned`
                    : ""}
                  {queryStats.read_bytes && queryStats.read_bytes !== "0"
                    ? ` | ${fmtBytes(Number(queryStats.read_bytes))}`
                    : ""}
                  {queryStats.elapsed_ns
                    ? ` | ${(Number(queryStats.elapsed_ns) / 1e9).toFixed(3)}s`
                    : ""}
                </span>
              )}
              {memoryUsage != null && memoryUsage > 0 && (
                <span> | Mem: {fmtBytes(memoryUsage)}</span>
              )}
              {effectiveQueryId && (
                <span style={{ display: "inline-flex", gap: 4, marginLeft: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "11px", padding: "1px 6px" }}
                    onClick={() => {
                      navigator.clipboard?.writeText(effectiveQueryId);
                      toast.success("Query ID Copied Succesfully");
                    }}
                    title={"query_id: " + effectiveQueryId}
                  >
                    <Icon className="ti ti-copy" style={{ fontSize: 12 }} />{" "}
                    query_id
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "11px", padding: "1px 6px" }}
                    onClick={() => {
                      navigate(
                        `/tools/profiler?qid=${encodeURIComponent(effectiveQueryId)}`,
                      );
                    }}
                    title="Open in Query Profiler (flame graph)"
                  >
                    <Icon className="ti ti-flame" style={{ fontSize: 12 }} />{" "}
                    Flame Graph
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "11px", padding: "1px 6px" }}
                    onClick={() => {
                      navigate(
                        `/tools/pipeline?qid=${encodeURIComponent(effectiveQueryId)}`,
                      );
                    }}
                    title="Open in Processors Profile (pipeline DAG)"
                  >
                    <Icon
                      className="ti ti-git-branch"
                      style={{ fontSize: 12 }}
                    />{" "}
                    Pipeline
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "11px", padding: "1px 6px" }}
                    onClick={() => {
                      navigate(
                        `/tools/metrics?qid=${encodeURIComponent(effectiveQueryId)}`,
                      );
                    }}
                    title="Open in Query Metrics"
                  >
                    <Icon
                      className="ti ti-chart-line"
                      style={{ fontSize: 12 }}
                    />{" "}
                    Metrics
                  </button>
                </span>
              )}
            </span>
          )}
          {error && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--color-danger)",
                flex: 1,
              }}
            >
              Error occurred
            </span>
          )}
          {!result && !error && <span style={{ flex: 1 }}></span>}
          <Select
            style={{
              height: 40,
              fontSize: "10px",
              padding: "0 6px",
              // border: "1px solid var(--border-default)",
              borderRadius: "5px",
              // background: "var(--input-bg)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-ui)",
              fontWeight: "500",
              width: "200px",
            }}
            onChange={(e) => {
              if (e.target.value && e.target.value !== "GENERAL RUN") {
                setExplainOptionSelector({ type: e.target.value });
              }
            }}
            value={ExplainOptionSelector?.type || "GENERAL RUN"}
            disabled={isAILoadingGenerating}
          >
            <option value="GENERAL RUN">GENERAL RUN</option>
            <option value="EXPLAIN">EXPLAIN</option>
            {/* <option value="EXPLAIN AST">AST</option> */}
            <option value="EXPLAIN SYNTAX">SYNTAX</option>
            <option value="EXPLAIN QUERY TREE">QUERY TREE</option>
            <option value="EXPLAIN PLAN">PLAN</option>
            <option value="EXPLAIN PIPELINE">PIPELINE</option>
            <option value="EXPLAIN ESTIMATE">ESTIMATE</option>
            <option value="EXPLAIN AST graph = 1">AST (graph)</option>
            <option value="EXPLAIN PIPELINE graph = 1">PIPELINE (graph)</option>
            <option value="EXPLAIN json = 1, description = 0">
              PLAN (JSON)
            </option>
          </Select>

          <button
            className="btn btn-secondary btn-sm"
            onClick={doEstimate}
            disabled={
              estimating || running || !editorConnected || isAILoadingGenerating
            }
            title="Estimate cost without executing (EXPLAIN ESTIMATE + PLAN + Indexes)"
          >
            {estimating ? (
              <>
                <span className="loading-spinner"></span> Estimating...
              </>
            ) : (
              <>
                <Icon className="ti ti-calculator"></Icon> Estimate
              </>
            )}
          </button>

          <button
            className="ai-button "
            style={{ color: "white" }}
            onClick={() => GeneratingSQLHandler()}
            disabled={isAILoadingGenerating}
          >
            {isAILoadingGenerating ? (
              <>
                {" "}
                <div className="loading-spinner"></div>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={"white"}
                  className="icon icon-tabler icons-tabler-filled icon-tabler-sparkles-2"
                >
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M17.964 2.733c.156 .563 .312 1 .484 1.353c.342 .71 .758 1.125 1.47 1.467c.353 .17 .79 .326 1.352 .484c.98 .276 .97 1.668 -.013 1.93a8.3 8.3 0 0 0 -1.34 .481c-.71 .342 -1.127 .757 -1.463 1.453a8 8 0 0 0 -.486 1.352c-.258 .988 -1.658 1 -1.932 .015c-.156 -.565 -.312 -1.002 -.484 -1.354c-.342 -.71 -.758 -1.124 -1.458 -1.46a8 8 0 0 0 -1.374 -.495a.4 .4 0 0 1 -.06 -.02l-.044 -.017l-.045 -.02l-.049 -.025l-.035 -.02a.4 .4 0 0 1 -.049 -.03l-.032 -.023l-.043 -.034l-.033 -.028l-.036 -.035l-.034 -.035l-.028 -.033l-.035 -.043l-.022 -.032a.4 .4 0 0 1 -.032 -.049l-.02 -.035l-.025 -.05l-.02 -.044l-.017 -.043a.4 .4 0 0 1 -.02 -.06l-.01 -.034a.5 .5 0 0 1 -.02 -.098l-.006 -.065l-.005 -.035v-.05a.4 .4 0 0 1 .003 -.085a.5 .5 0 0 1 .013 -.093a.5 .5 0 0 1 .024 -.103a.4 .4 0 0 1 .02 -.06l.017 -.044l.02 -.045l.025 -.049l.02 -.035a.4 .4 0 0 1 .03 -.049l.023 -.032l.034 -.043l.028 -.033l.035 -.036l.035 -.034q .015 -.015 .033 -.028l.043 -.035l.032 -.022a.4 .4 0 0 1 .049 -.032l.035 -.02l.05 -.025l.044 -.02l.043 -.017a.4 .4 0 0 1 .06 -.02l.027 -.008a8.3 8.3 0 0 0 1.339 -.48c.71 -.342 1.127 -.757 1.47 -1.466c.17 -.354 .327 -.792 .483 -1.355c.272 -.976 1.657 -.976 1.928 0" />
                  <path d="M10.965 6.737q .219 .801 .503 1.574c.856 2.28 1.945 3.363 4.23 4.22q .708 .265 1.571 .506c.976 .272 .974 1.656 -.002 1.927q -.798 .221 -1.568 .504c-2.288 .858 -3.376 1.94 -4.229 4.216a19 19 0 0 0 -.505 1.579c-.268 .983 -1.662 .983 -1.93 0a19 19 0 0 0 -.503 -1.574c-.856 -2.281 -1.944 -3.363 -4.226 -4.219a20 20 0 0 0 -1.594 -.513a.4 .4 0 0 1 -.054 -.018l-.044 -.017l-.043 -.02a.3 .3 0 0 1 -.048 -.024l-.036 -.02a.4 .4 0 0 1 -.048 -.03l-.032 -.024l-.044 -.034l-.033 -.029l-.037 -.034l-.034 -.037l-.03 -.033l-.033 -.044l-.023 -.032a.4 .4 0 0 1 -.03 -.048l-.021 -.036a.3 .3 0 0 1 -.024 -.048l-.02 -.043l-.017 -.044a.4 .4 0 0 1 -.018 -.054a.2 .2 0 0 1 -.01 -.039a.4 .4 0 0 1 -.014 -.059l-.007 -.04l-.007 -.056l-.003 -.044l-.002 -.05v-.05q 0 -.023 .004 -.044q .001 -.03 .007 -.057l.007 -.04a.4 .4 0 0 1 .017 -.076l.007 -.021a.4 .4 0 0 1 .018 -.054l.017 -.044l.02 -.043a.3 .3 0 0 1 .024 -.048l.02 -.036a.4 .4 0 0 1 .03 -.048l.024 -.032l.034 -.044l.029 -.033l.034 -.037l.037 -.034l.033 -.03l.044 -.033l.032 -.023a.4 .4 0 0 1 .048 -.03l.036 -.021a.3 .3 0 0 1 .048 -.024l.043 -.02l.044 -.017a.4 .4 0 0 1 .054 -.018l.021 -.007a20 20 0 0 0 1.568 -.504c2.287 -.858 3.375 -1.94 4.229 -4.216a19 19 0 0 0 .505 -1.579c.268 -.983 1.662 -.983 1.93 0" />
                </svg>
                <span>Generate SQL</span>
              </>
            )}
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setExplainOptionSelector({ type: "GENERAL RUN" })}
            disabled={running || !editorConnected || isAILoadingGenerating}
          >
            {running ? (
              <>
                <span className="loading-spinner"></span> Running...
              </>
            ) : (
              <>
                <Icon className="ti ti-player-play"></Icon> Run
              </>
            )}
          </button>
        </div>

        {panel && (
          <div
            className="modal-overlay"
            onClick={() => setPanel(null)}
            style={{ zIndex: 400 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "95%",
                maxWidth: 960,
                maxHeight: "80vh",
                overflow: "auto",
                background: "var(--glass-dropdown)",
                backdropFilter: "blur(24px)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-lg)",
                padding: 0,
                boxShadow: "var(--shadow-md)",
                animation: "fadeIn 0.2s",
              }}
            >
              {panel === "history" && (
                <div style={{ padding: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <Icon
                        className="ti ti-history"
                        style={{ fontSize: 16 }}
                      ></Icon>{" "}
                      Recent Queries ({history.length})
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          clearHistory();
                          setHistory([]);
                        }}
                        title="Clear history"
                      >
                        <Icon className="ti ti-trash"></Icon>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPanel(null)}
                      >
                        <Icon className="ti ti-x"></Icon>
                      </button>
                    </div>
                  </div>
                  {history.length === 0 ? (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        padding: 8,
                      }}
                    >
                      No queries yet. Run a query to start recording.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {history.map((h, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "13px",
                            borderBottom: "1px solid var(--border-default)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "start",
                              gap: 8,
                            }}
                          >
                            <Icon
                              className={
                                "ti " +
                                (h.status === "ok" ? "ti-check" : "ti-x")
                              }
                              style={{ fontSize: 14, flexShrink: 0 }}
                            ></Icon>
                            <span
                              style={{
                                fontFamily: "var(--font-code)",
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace:
                                  expandedIdx === i ? "pre-wrap" : "nowrap",
                                wordBreak:
                                  expandedIdx === i ? "break-all" : "normal",
                                color: "var(--text-primary)",
                              }}
                            >
                              {h.sql}
                            </span>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                fontSize: "12px",
                                flexShrink: 0,
                              }}
                            >
                              {h.rows} rows
                            </span>
                            {h.elapsed && (
                              <span
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "12px",
                                  flexShrink: 0,
                                }}
                              >
                                {h.elapsed}
                              </span>
                            )}
                            <span
                              style={{
                                color: "var(--text-muted)",
                                fontSize: "12px",
                                flexShrink: 0,
                                minWidth: 110,
                                textAlign: "right",
                              }}
                            >
                              {new Date(h.timestamp).toLocaleString()}
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                setExpandedIdx(expandedIdx === i ? null : i)
                              }
                              title={
                                expandedIdx === i ? "Collapse" : "Expand SQL"
                              }
                              style={{ padding: "2px 4px" }}
                            >
                              <Icon
                                className={
                                  "ti " +
                                  (expandedIdx === i
                                    ? "ti-chevron-up"
                                    : "ti-chevron-down")
                                }
                                style={{ fontSize: 14 }}
                              ></Icon>
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSql(h.sql);
                                setPanel(null);
                              }}
                              title="Load into editor"
                              style={{
                                padding: "2px 8px",
                                fontSize: "12px",
                              }}
                            >
                              <Icon
                                className="ti ti-player-play"
                                style={{
                                  fontSize: 13,
                                  color: "var(--color-success)",
                                }}
                              ></Icon>{" "}
                              Load
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {panel === "bookmarks" && (
                <div style={{ padding: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <Icon
                        className="ti ti-star"
                        style={{ fontSize: 16 }}
                      ></Icon>{" "}
                      Bookmarks ({bookmarks.length})
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPanel(null)}
                    >
                      <Icon className="ti ti-x"></Icon>
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input
                      className="form-input"
                      placeholder="Bookmark name"
                      value={bookmarkName}
                      onChange={(e) => setBookmarkName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveBookmark();
                      }}
                      style={{
                        fontSize: "13px",
                        padding: "4px 8px",
                        flex: 1,
                      }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={saveBookmark}
                      disabled={!bookmarkName.trim() || !sql.trim()}
                    >
                      <Icon className="ti ti-star"></Icon> Save
                    </button>
                  </div>
                  {bookmarks.length === 0 ? (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        padding: 8,
                      }}
                    >
                      No bookmarks. Type a name above and click Save to bookmark
                      the current query.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {bookmarks.map((b, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "13px",
                            borderBottom: "1px solid var(--border-default)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <Icon
                              className="ti ti-star"
                              style={{ fontSize: 14, flexShrink: 0 }}
                            ></Icon>
                            <span
                              style={{
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                minWidth: 80,
                                flexShrink: 0,
                              }}
                            >
                              {b.name}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-code)",
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace:
                                  expandedIdx === "b" + i
                                    ? "pre-wrap"
                                    : "nowrap",
                                wordBreak:
                                  expandedIdx === "b" + i
                                    ? "break-all"
                                    : "normal",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {b.sql}
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                setExpandedIdx(
                                  expandedIdx === "b" + i ? null : "b" + i,
                                )
                              }
                              title={
                                expandedIdx === "b" + i
                                  ? "Collapse"
                                  : "Expand SQL"
                              }
                              style={{ padding: "2px 4px" }}
                            >
                              <Icon
                                className={
                                  "ti " +
                                  (expandedIdx === "b" + i
                                    ? "ti-chevron-up"
                                    : "ti-chevron-down")
                                }
                                style={{ fontSize: 14 }}
                              ></Icon>
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSql(b.sql);
                                setPanel(null);
                              }}
                              title="Load into editor"
                              style={{
                                padding: "2px 8px",
                                fontSize: "12px",
                              }}
                            >
                              <Icon
                                className="ti ti-player-play"
                                style={{
                                  fontSize: 13,
                                  color: "var(--color-success)",
                                }}
                              ></Icon>{" "}
                              Load
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => deleteBookmark(i)}
                              title="Remove bookmark"
                              style={{ padding: "2px 4px" }}
                            >
                              <Icon
                                className="ti ti-trash"
                                style={{ fontSize: 14 }}
                              ></Icon>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="editor-results">
          {error && (
            <div className="alert-banner danger" style={{ margin: 12 }}>
              <Icon className="ti ti-alert-circle"></Icon>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontSize: "14px",
                  margin: 0,
                  flex: 1,
                }}
              >
                {error}
              </pre>
            </div>
          )}

          {graphData && !graphData._json && graphFullscreen && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 300,
                background: "var(--bg-page)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--border-default)",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {graphTitle && (
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--text-primary)",
                        fontWeight: 700,
                      }}
                    >
                      {graphTitle}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginRight: 4,
                    }}
                  >
                    {Math.round(graphZoomLevel * 100)}%
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => graphZoom(1.25)}
                    title="Zoom in"
                  >
                    <Icon className="ti ti-zoom-in"></Icon>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => graphZoom(0.8)}
                    title="Zoom out"
                  >
                    <Icon className="ti ti-zoom-out"></Icon>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setGraphZoomLevel(1)}
                    title="Reset zoom"
                  >
                    <Icon className="ti ti-zoom-reset"></Icon>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={graphDownload}
                    title="Download PNG"
                    aria-label="Download PNG"
                  >
                    <Icon className="ti ti-download"></Icon>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowGraphSqlModal(true)}
                    title="View SQL"
                  >
                    <Icon className="ti ti-code"></Icon> View SQL
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setGraphFullscreen(!graphFullscreen)}
                    title={graphFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  >
                    <Icon
                      className={`ti ${graphFullscreen ? "ti-arrows-minimize" : "ti-arrows-maximize"}`}
                    ></Icon>
                  </button>
                </div>
              </div>
              <div
                style={{
                  overflow: "auto",
                  flex: 1,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <div ref={graphRef} />
              </div>
            </div>
          )}

          {graphData?._json && (
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  EXPLAIN JSON Output
                </span>
              </div>
              <pre
                style={{
                  fontFamily: "var(--font-code)",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  padding: 16,
                  background: "var(--bg-sunken)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  maxHeight: 500,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(graphData.data, null, 2)}
              </pre>
            </div>
          )}

          {estimateResult && !error && (
            <CostEstimatePanel estimate={estimateResult} loading={estimating} />
          )}

          {!graphData && result && !error && (
            <DataTable
              whiteSpaceFlag={true}
              rows={result}
              columns={resultCols}
              onCellClick={(v) => {
                if (v != null) {
                  navigator.clipboard?.writeText(String(v));
                  toast.success("Query Text Copied Succesfully");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
            />
          )}
          {!result && !running && !error && !estimateResult && (
            <div className="empty-state">
              <Icon
                className={
                  "ti " + (editorConnected ? "ti-terminal-2" : "ti-lock")
                }
              ></Icon>
              <p>
                {editorConnected
                  ? "Run a query to see results."
                  : "Connect with your ClickHouse credentials to begin."}
              </p>
            </div>
          )}
        </div>
      </div>

      {ddlModal && (
        <div className="modal-overlay" onClick={() => setDdlModal(null)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 700, width: "95%" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon
                  className="ti ti-code"
                  style={{ color: "var(--accent)" }}
                ></Icon>{" "}
                DDL: {ddlModal.name}
              </h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setDdlModal(null)}
              >
                <Icon className="ti ti-x"></Icon>
              </button>
            </div>
            {ddlModal.loading ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: 32,
                }}
              >
                <span className="loading-spinner"></span>
              </div>
            ) : (
              <div>
                <pre
                  style={{
                    fontFamily: "var(--font-code)",
                    fontSize: "14px",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    padding: 16,
                    background: "var(--bg-sunken)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    maxHeight: 400,
                    overflow: "auto",
                    color: "var(--text-primary)",
                  }}
                >
                  {ddlModal.ddl}
                </pre>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 12,
                    gap: 8,
                  }}
                >
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(ddlModal.ddl);
                      toast.success("DDL Text Copied Succesfully");
                    }}
                  >
                    <Icon className="ti ti-copy"></Icon> Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showGraphSqlModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowGraphSqlModal(false)}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 900, width: "95%" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon
                  className="ti ti-code"
                  style={{ color: "var(--accent)" }}
                ></Icon>{" "}
                SQL
              </h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowGraphSqlModal(false)}
              >
                <Icon className="ti ti-x"></Icon>
              </button>
            </div>
            <div>
              <pre
                style={{
                  fontFamily: "var(--font-code)",
                  fontSize: "14px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  padding: 16,
                  background: "var(--bg-sunken)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  maxHeight: 500,
                  overflow: "auto",
                  color: "var(--text-primary)",
                }}
              >
                {sql}
              </pre>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 12,
                  gap: 8,
                }}
              >
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(sql);
                    toast.success("Quer Text Copied Succesfully");
                  }}
                >
                  <Icon className="ti ti-copy"></Icon> Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
