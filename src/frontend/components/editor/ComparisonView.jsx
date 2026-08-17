// ComparisonView - Side-by-side query comparison page
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import { format } from "sql-formatter";
import Select from "../common/Select.jsx";
import SqlEditor from "./SqlEditor.jsx";
import ComparisonMetrics from "./ComparisonMetrics.jsx";
import CostEstimatePanel from "./CostEstimatePanel.jsx";
import ModeSelect from "./ModeSelect.jsx";
import DataTable from "../layout/DataTable.jsx";
import Icon from "../common/Icon.jsx";
import { useConnection, useTheme } from "../../App.jsx";
import {
  runEditorQuery,
  editorConnectionStatus,
  editorDisconnect,
} from "../../utils/api.js";
import {
  estimateOne,
  executeOne,
  loadAcWords,
} from "../../utils/queryCompare.js";
import { runQuery } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import { apiFetch } from "../../utils/api.js";

// Keep at most this many result rows in the DOM,
const RESULT_MAX_ROWS = 100;
const RESULT_MAX_HEIGHT = "390px";

// VITE_SELECTEDAID_DBS=aiselectedid
const SELECTLSKEY = import.meta.env.VITE_SELECTEDAID_DBS ?? "aiselectedid";

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

function AIKeyButton({ dbdetails, dataSelectionHandler, connectDatabaseID }) {
  const [isLoading, setIsLoading] = useState(false);

  if (!dbdetails) return null;
  const { dbName, id, isSelected } = dbdetails;

  const connecthandler = async (db) => {
    setIsLoading(true);
    await connectDatabaseID(db);
    setIsLoading(false);
  };

  if (dbName && id) {
    return (
      <button
        className={`btn btn-primary`}
        style={{
          // marginTop: "5px",/
          padding: "3px",
          borderRadius: "5px",
          backgroundColor: !isSelected ? "#e0d4ffba" : undefined,
          color: !isSelected ? "#4e4e4eba" : undefined,
        }}
        title={!isSelected ? "Select" : "Deselect"}
        onClick={() => {
          dataSelectionHandler && dataSelectionHandler(dbName);
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="icon icon-tabler icons-tabler-filled icon-tabler-bolt"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M13 2l.018 .001l.016 .001l.083 .005l.011 .002h.011l.038 .009l.052 .008l.016 .006l.011 .001l.029 .011l.052 .014l.019 .009l.015 .004l.028 .014l.04 .017l.021 .012l.022 .01l.023 .015l.031 .017l.034 .024l.018 .011l.013 .012l.024 .017l.038 .034l.022 .017l.008 .01l.014 .012l.036 .041l.026 .027l.006 .009c.12 .147 .196 .322 .218 .513l.001 .012l.002 .041l.004 .064v6h5a1 1 0 0 1 .868 1.497l-.06 .091l-8 11c-.568 .783 -1.808 .38 -1.808 -.588v-6h-5a1 1 0 0 1 -.868 -1.497l.06 -.091l8 -11l.01 -.013l.018 -.024l.033 -.038l.018 -.022l.009 -.008l.013 -.014l.04 -.036l.028 -.026l.008 -.006a1 1 0 0 1 .402 -.199l.011 -.001l.027 -.005l.074 -.013l.011 -.001l.041 -.002z" />
        </svg>
      </button>
    );
  }
  return (
    <button
      className="btn btn-primary"
      style={{
        // marginTop: "5px",
        padding: "3px",
        borderRadius: "5px",
        backgroundColor: "#3a2055fd",
      }}
      title="Generate database ID"
      onClick={() => connecthandler(dbName)}
    >
      {isLoading ? (
        <div
          className="loading-spinner"
          style={{
            width: "12px",
            height: "12px",
            borderColor: "gray",
            borderTopColor: "white",
          }}
        ></div>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          className="icon icon-tabler icons-tabler-outline icon-tabler-plug-connected"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1 -5 -5l1.5 -1.5" />
          <path d="M17 12l-5 -5l1.5 -1.5a3.536 3.536 0 1 1 5 5l-1.5 1.5" />
          <path d="M3 21l2.5 -2.5" />
          <path d="M18.5 5.5l2.5 -2.5" />
          <path d="M10 11l-2 2" />
          <path d="M13 14l-2 2" />
        </svg>
      )}
    </button>
  );
}

// Memoized result area for one side: estimate panel or execute table, or the
// matching error banner.
const PaneResults = memo(function PaneResults({ estimate, exec }) {
  return (
    <>
      {estimate && !estimate.ok && (
        <div className="alert-banner danger cmp-pane-error">
          <Icon className="ti ti-alert-circle"></Icon>
          <span>{estimate.error}</span>
        </div>
      )}
      {estimate && estimate.ok && (
        <div className="cmp-pane-estimate">
          <CostEstimatePanel estimate={estimate.raw} />
        </div>
      )}

      {exec && !exec.ok && (
        <div className="alert-banner danger cmp-pane-error">
          <Icon className="ti ti-alert-circle"></Icon>
          <span>{exec.error}</span>
        </div>
      )}
      {exec && exec.ok && (
        <div className="cmp-pane-results">
          <DataTable
            rows={exec.rows}
            columns={exec.columns}
            maxRows={RESULT_MAX_ROWS}
            maxHeight={RESULT_MAX_HEIGHT}
          />
          {exec.metrics && exec.metrics.resultRows > RESULT_MAX_ROWS && (
            <p className="cmp-rows-note">
              Results truncated to the first {RESULT_MAX_ROWS} rows (
              {exec.metrics.resultRows.toLocaleString()} total).
            </p>
          )}
        </div>
      )}
    </>
  );
});

// Memoized single side: header, editor, right-aligned action buttons, results.
// Re-renders only when its own props change, so typing in the other pane is free.
const ComparePane = memo(function ComparePane({
  side,
  title,
  sql,
  onChange,
  acWords,
  dialectData,
  onEstimate,
  onExecute,
  busy,
  estimate,
  exec,
  connected,
  databases,
  selectDb,
  selectHandler,
  aiDatabase_id,
  selectedClusterId,
  nodeName,
  user,
  port,
  selectedNode,
  AIdbsInfo,
  setAIdbsInfo,
}) {
  const placeholder =
    side === "left"
      ? "Paste your current query here..."
      : "Write your rewritten query here...";
  const disabled = !!busy || !sql.trim() || !connected;
  const [isAILoadingGenerating, setIsAILoadingGenerating] = useState(false);

  const [index, setIndex] = useState(0);
  const [isShowDbs, setIsShowDbs] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % LOADING_PHRASES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  async function GeneratingSQLHandler() {
    const message =
      sql?.trim()?.split("*/")?.length > 1
        ? sql?.trim()?.split("*/")[1]
        : sql?.trim();

    if (!message?.length) {
      setIsAILoadingGenerating(false);
      return;
    }

    setIsAILoadingGenerating(true);
    onChange(LOADING_PHRASES[index]);

    try {
      const dbsSelected = AIdbsInfo?.filter((_v) => _v?.isSelected)?.map(
        (_v) => _v?.id,
      );

      const responseAIQuery = await apiFetch(`/api/ai/sql/generate-sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          database_ids: dbsSelected,
          user_question: message,
        }),
      });

      if (responseAIQuery?.success) {
        onChange(
          `/*\n\n--QUESTION : ${message}? \n--DATABASE_NAME : ${selectDb}\n\n*/\n\n${format(
            responseAIQuery?.generated_sql,
            { language: "clickhouse" },
          )}`,
        );
      }
    } catch (error) {
      onChange(
        `/*\n--QUESTION : ${message}? \n--DATABASE_NAME : ${selectDb}\n*/\n\n-- Error : ${
          error?.message || "SQL generation failed"
        }`,
      );
    } finally {
      setIsAILoadingGenerating(false);
    }
  }

  const isFindDatabase = (dbname) => {
    if (!dbname) return null;
    const find = AIdbsInfo?.filter((_v) => {
      return _v?.dbName === dbname;
    });
    return find?.length > 0 ? find[0] : null;
  };

  const connectDatabaseID = async (dbName) => {
    try {
      const requestBody = JSON.stringify({
        database_type: "clickhouse",
        credentials: { port, username: user, host: selectedNode },
        databases: [dbName] || [],
        cluster_id: selectedClusterId,
        node_id: nodeName,
      });

      const responseInsert = await apiFetch("/api/ai/database/connect", {
        method: "POST",
        body: requestBody,
      });

      if (responseInsert?.success) {
        const dbObject = Object.fromEntries(
          responseInsert?.database_id?.map((db) => [
            db.database,
            db.databaseId,
          ]),
        );
        setAIdbsInfo((prev) =>
          prev?.map((_v) => {
            const find = Object?.keys(dbObject).includes(_v?.dbName);
            if (!find) {
              if (_v?.isSelected || _v?.id !== null) {
                return _v;
              }
              return {
                dbName: _v?.dbName,
                id: null,
                isSelected: false,
              };
            }

            return {
              dbName: _v?.dbName,
              id: dbObject[_v?.dbName],
              isSelected: true,
            };
          }),
        );

        toast?.success(`Database ID is created successfully!`);
      } else {
        toast?.error(
          `Failed to connect to the database : ${dbName}. Please try again.`,
        );
      }
    } catch (err) {
      toast?.error(
        `Failed to connect to the database : ${dbName}. Please try again.`,
      );
    }
  };

  const dataSelectionHandler = (dbname) => {
    setAIdbsInfo((prev) =>
      prev?.map((_v) =>
        _v?.dbName === dbname ? { ..._v, isSelected: !_v?.isSelected } : _v,
      ),
    );
  };

  const ListTheSelectedDatabase = () => {
    const find = AIdbsInfo?.filter((_v) => _v?.isSelected);
    if (find?.length === 0) return "Select the database";
    return find?.map((_v) => _v?.dbName)?.join(", ");
  };

  return (
    <div className={"cmp-pane cmp-pane-" + side}>
      {/* Was a fixed 100px block. The old editor needed the room; CodeMirror
          does not, and the leftover showed as a band of empty space above every
          pane. It sizes to its contents now and the editor takes what it gave
          back. */}
      <div
        className="cmp-pane-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          minHeight: 40,
        }}
      >
        <span>{title}</span>
        {side === "right" && (
          <div>
            <div
              className="form-group"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "20px",
                position: "relative",
                height: "45px",
              }}
              onMouseEnter={() => setIsShowDbs(true)}
              onMouseLeave={() => setIsShowDbs(false)}
            >
              <button
                className="btn btn-secondary"
                style={{
                  display: "flex",
                  width: "200px",
                  alignItems: "center",
                  cursor: "pointer",
                  justifyContent: "start",
                  textAlign: "start",
                }}
                title={`${AIdbsInfo?.filter((_v) => _v?.isSelected)?.length > 0 ? `Selected ${ListTheSelectedDatabase()}` : "Select the Database"}`}
                onMouseEnter={() => setIsShowDbs(true)}
                onMouseLeave={() => setIsShowDbs(true)}
              >
                <Icon className="ti ti-database"></Icon>
                <p
                  style={{
                    width: "250px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {ListTheSelectedDatabase()}
                </p>
              </button>
              {isShowDbs && (
                <div
                  style={{
                    position: "absolute",
                    marginTop: "40px",
                    padding: "5px",
                    backgroundColor: "var(--bg-page)",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "var(--shadow-md)",
                    opacity: 1,
                    zIndex: "10000",
                    borderRadius: "10px",
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  {AIdbsInfo?.map((_val) => {
                    return (
                      <div
                        key={_val?.dbName}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            marginLeft: "5px",
                            paddingTop: "6px",
                            display: "flex",
                            alignItems: "start",
                            justifyContent: "center",
                          }}
                        >
                          <AIKeyButton
                            dbdetails={isFindDatabase(_val?.dbName)}
                            dataSelectionHandler={dataSelectionHandler}
                            connectDatabaseID={connectDatabaseID}
                          />
                        </div>
                        <div>{_val?.dbName}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* <Select
              className="form-input"
              value={selectDb || "Select Database"}
              onChange={(e) => selectHandler(e)}
              style={{
                width: "150px",
                padding: "5px",
                paddingLeft: "10px",
                fontSize: "12px",
              }}
            >
              <option value="Select Database">Select Database</option>
              {databases?.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select> */}

              {/* {selectDb && aiDatabase_id ? (
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div className="conn-indicator connected"> </div>
               
              </div>
            ) : (
              <div>
                <div className="conn-indicator disconnected"> </div>
              </div>
            )} */}
            </div>
          </div>
        )}
      </div>

      <SqlEditor
        value={sql}
        onChange={onChange}
        variant="full"
        completions={acWords}
        dialectData={dialectData}
        onRun={onExecute}
        placeholder={placeholder}
        // Grows with the window rather than sitting at a fixed 220px, which was
        // chosen when a fixed header sat above it.
        height="clamp(260px, 42vh, 560px)"
      />

      <div className="cmp-pane-buttons">
        {side === "right" && (
          <button
            className="ai-button btn "
            style={{ color: "white" }}
            onClick={() => GeneratingSQLHandler()}
            disabled={
              isAILoadingGenerating ||
              ListTheSelectedDatabase() === "Select the database"
            }
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
        )}

        <button
          className="btn btn-secondary btn-sm"
          disabled={disabled || isAILoadingGenerating}
          onClick={onEstimate}
        >
          {busy === "estimate" ? "Working..." : "Estimate"}
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={disabled || isAILoadingGenerating}
          onClick={onExecute}
        >
          {busy === "execute" ? "Working..." : "Execute"}
        </button>
      </div>

      <PaneResults estimate={estimate} exec={exec} />
    </div>
  );
});

export default function ComparisonView({ mode, onModeChange, active = true }) {
  const {
    selectedNode,
    port,
    selectedClusterId,
    connected,
    clusters,
    clusterName,
    user,
    nodeName,
  } = useConnection();

  // Per-user editor credentials (independent of the main editor)
  const [editorCreds, setEditorCreds] = useState(null);
  const editorConnected = !!editorCreds;
  const [connUser, setConnUser] = useState("");
  const [connPassword, setConnPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState(null);
  const [AIdbsInfo, setAIdbsInfo] = useState([]);
  const toast = useToast();

  // Live credentials in a ref so the run handlers stay stable across renders.
  const credsRef = useRef(null);
  useEffect(() => {
    credsRef.current = editorCreds;
  }, [editorCreds]);

  const initSetup = async (dbs) => {
    try {
      const response = await apiFetch("/api/ai/database/generated/databaseid", {
        method: "POST",
        body: JSON.stringify({
          cluster_id: selectedClusterId,
          node_id: nodeName,
        }),
      });
      if (response?.success) {
        const dbObject = Object.fromEntries(
          response?.databaseIDs
            ?.map((_v) => {
              const cred = JSON.parse(_v?.credentials);
              return {
                db: cred?.database,
                id: _v?.database_id,
              };
            })
            .map((db) => [db.db, db.id]),
        );
        setAIdbsInfo(
          dbs?.map((_v) => {
            const find = Object?.keys(dbObject).includes(_v);
            if (!find) {
              return {
                dbName: _v,
                id: null,
                isSelected: false,
              };
            }

            return {
              dbName: _v,
              id: dbObject[_v],
              isSelected: true,
            };
          }),
        );
      }
    } catch (err) {
      console.log(err?.message);
    }
  };

  // Per-side query state (state for rendering, refs for stable handlers)
  const [leftSql, setLeftSql] = useState("");
  const [rightSql, setRightSql] = useState("");
  const leftSqlRef = useRef("");
  const rightSqlRef = useRef("");

  const onLeftChange = useCallback((v) => {
    leftSqlRef.current = v;
    setLeftSql(v);
  }, []);
  const onRightChange = useCallback((v) => {
    rightSqlRef.current = v;
    setRightSql(v);
  }, []);

  const [leftEstimate, setLeftEstimate] = useState(null);
  const [rightEstimate, setRightEstimate] = useState(null);
  const [leftExec, setLeftExec] = useState(null);
  const [rightExec, setRightExec] = useState(null);
  const [leftBusy, setLeftBusy] = useState(null); // 'estimate' | 'execute' | null
  const [rightBusy, setRightBusy] = useState(null);

  // Compare (both sides) + fullscreen
  const [compareData, setCompareData] = useState(null); // { left, right } | null
  const [comparing, setComparing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [acWords, setAcWords] = useState([]);
  // The connected server's own keyword and function lists, so highlighting
  // matches the version in use. Null falls back to the built-in SQL dialect.
  const [dialectData, setDialectData] = useState(null);

  // default cred password view flag
  const [isViewFlag, setIsViewFlag] = useState(false);

  const [dbs, setDBS] = useState([]);
  const [selectDb, setSelectDb] = useState(null);
  const [selectAIDatabase_id, setAIDatabase_id] = useState(null);

  const fetchDatabaseDetails = (creds) =>
    new Promise((res, rej) => {
      runEditorQuery("SELECT name FROM system.databases ORDER BY name", creds)
        .then((r) => {
          return res((r.rows || []).map((rs) => rs.name));
        })
        .catch(() => {
          return rej([]);
        });
    });

  const loadDbs = useCallback(async () => {
    const creds = credsRef.current;
    if (!creds) return;
    const response = await fetchDatabaseDetails(creds);
    setDBS(response);

    initSetup(response);
  }, []);
  useEffect(() => {
    if (!editorConnected) return;
    loadDbs();
  }, [editorConnected, selectedClusterId, selectedNode,mode]);
  async function selectHandler(event) {
    try {
      const localStorageData = JSON.parse(localStorage?.getItem(SELECTLSKEY));
      const selected = event?.target?.value;

      if (selected !== "Select Database") {
        let SelectedClusterAndNode =
          localStorageData[selectedClusterId][nodeName];

        const find = SelectedClusterAndNode?.filter(
          (db) => db?.dbName === selected,
        );

        if (find?.length === 0) {
          const responseData = await await apiFetch(
            `/api/ai/database/connect`,
            {
              method: "POST",
              body: JSON.stringify({
                database_type: "clickhouse",
                // Credentials are resolved server-side from the cluster
                // configuration; the browser does not hold them.
                clusterId: selectedClusterId,
                node: selectedNode,
                database: selected,
                llm_provider: "string",
                model_name: "string",
              }),
              headers: {
                "Content-Type": "application/json",
              },
            },
          );

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
            setSelectDb(selected);
            setAIDatabase_id(responseData?.database_id);
            toast.success(`Successfully AI database id generated!`);
          } else {
            toast.error("Failed to load database ID. Please retry.");
          }
        } else {
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
          setSelectDb(selected);
          setAIDatabase_id(find[0]?.ai_id);
        }
      } else {
        setSelectDb(null);
        setAIDatabase_id(null);
      }
    } catch (err) {
      toast?.error(`Failed to load database ID. Please retry.`);
    }
  }

  // After a page reload the (jti, 'editor') credential session may still be
  // live server-side (it shares the 2h JWT lifetime).
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

  // Validate the entered credentials by running a trivial query as that user.
  async function handleConnect() {
    if (!connUser.trim()) {
      setConnError("Username is required.");
      return;
    }
    setConnecting(true);
    setConnError(null);
    const candidate = { user: connUser.trim(), password: connPassword };
    try {
      await runEditorQuery("SELECT 1", candidate);
      setEditorCreds(candidate);
      initSetup();
    } catch (e) {
      setConnError(e.message);
    } finally {
      setConnecting(false);
    }
  }

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
    setAcWords([]);
    setDialectData(null);
    setLeftEstimate(null);
    setRightEstimate(null);
    setLeftExec(null);
    setRightExec(null);
    setCompareData(null);
  }

  // Load autocomplete words once connected (under the editor credentials).
  useEffect(() => {
    if (!active) return;
    if (!editorConnected) {
      setAcWords([]);
      setDialectData(null);
      return;
    }
    let cancelled = false;
    loadAcWords(editorCreds).then((res) => {
      if (cancelled) return;
      setAcWords(res.options || []);
      setDialectData(res.dialect || null);
    });
    return () => {
      cancelled = true;
    };
  }, [editorConnected, editorCreds, active]);

  // Exit fullscreen on Escape.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Stable run handlers (read live SQL + creds from refs)
  const onEstimateLeft = useCallback(async () => {
    if (!credsRef.current) return;
    setLeftBusy("estimate");
    setLeftExec(null);
    setCompareData(null);
    try {
      setLeftEstimate(await estimateOne(leftSqlRef.current, credsRef.current));
    } finally {
      setLeftBusy(null);
    }
  }, []);
  const onExecuteLeft = useCallback(async () => {
    if (!credsRef.current) return;
    setLeftBusy("execute");
    setLeftEstimate(null);
    setCompareData(null);
    try {
      setLeftExec(await executeOne(leftSqlRef.current, credsRef.current));
    } finally {
      setLeftBusy(null);
    }
  }, []);
  const onEstimateRight = useCallback(async () => {
    if (!credsRef.current) return;
    setRightBusy("estimate");
    setRightExec(null);
    setCompareData(null);
    try {
      const sql =
        rightSqlRef.current?.trim()?.split("*/")?.length > 1
          ? rightSqlRef?.current?.trim()?.split("*/")[1]
          : rightSqlRef?.current?.trim();
      setRightEstimate(await estimateOne(sql, credsRef.current));
    } finally {
      setRightBusy(null);
    }
  }, []);
  const onExecuteRight = useCallback(async () => {
    if (!credsRef.current) return;
    setRightBusy("execute");
    setRightEstimate(null);
    setCompareData(null);
    try {
      setRightExec(await executeOne(rightSqlRef.current, credsRef.current));
    } finally {
      setRightBusy(null);
    }
  }, []);

  // Compare estimates BOTH queries together so the comparison is always a fresh,
  // consistent pair (this is what keeps the per-metric badges stable on re-run).
  const runCompare = useCallback(async () => {
    if (!credsRef.current) return;
    setComparing(true);
    setLeftEstimate(null);
    setRightEstimate(null);
    setLeftExec(null);
    setRightExec(null);
    try {
      const sql =
        rightSqlRef.current?.trim()?.split("*/")?.length > 1
          ? rightSqlRef?.current?.trim()?.split("*/")[1]
          : rightSqlRef?.current?.trim();
      const [l, r] = await Promise.all([
        estimateOne(leftSqlRef.current, credsRef.current),
        estimateOne(sql, credsRef.current),
      ]);
      setCompareData({ left: l, right: r });
    } finally {
      setComparing(false);
    }
  }, []);

  const canCompare =
    editorConnected && !!leftSql.trim() && !!rightSql.trim() && !comparing;

  return (
    <div className={"cmp-root" + (fullscreen ? " cmp-fullscreen" : "")}>
      {/* Toolbar: connect on the left, Compare + Fullscreen on the right. */}
      <div className="cmp-toolbar">
        <div className="cmp-toolbar-left">
          <ModeSelect mode={mode} onChange={onModeChange} />
          {!editorConnected ? (
            <>
              <span className="cmp-connect-field">
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
                className="cmp-connect-field"
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
                <span className="cmp-connect-error" title={connError}>
                  {connError}
                </span>
              )}
            </>
          ) : (
            <div className="cmp-connect-status">
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
        </div>

        <div className="cmp-toolbar-right">
          <button
            className="btn btn-primary btn-sm"
            onClick={runCompare}
            disabled={!canCompare}
            title="Estimate both queries and compare them"
          >
            <Icon className="ti ti-versions"></Icon>{" "}
            {comparing ? "Comparing..." : "Compare"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Icon
              className={"ti " + (fullscreen ? "ti-minimize" : "ti-maximize")}
            ></Icon>{" "}
            {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      {!editorConnected && (
        <p className="cmp-connect-hint">
          Connect with your ClickHouse credentials to estimate, execute, or
          compare queries. Only SELECT queries are allowed in comparison mode.
        </p>
      )}

      <div className="cmp-split" style={{ marginTop: "30px" }}>
        <ComparePane
          side="left"
          title="Current query"
          sql={leftSql}
          onChange={onLeftChange}
          acWords={acWords}
          dialectData={dialectData}
          onEstimate={onEstimateLeft}
          onExecute={onExecuteLeft}
          busy={leftBusy}
          estimate={leftEstimate}
          exec={leftExec}
          connected={editorConnected}
        />
        <ComparePane
          side="right"
          title="Experimental query"
          sql={rightSql}
          onChange={onRightChange}
          acWords={acWords}
          dialectData={dialectData}
          onEstimate={onEstimateRight}
          onExecute={onExecuteRight}
          busy={rightBusy}
          estimate={rightEstimate}
          exec={rightExec}
          connected={editorConnected}
          databases={dbs}
          selectDb={selectDb}
          aiDatabase_id={selectAIDatabase_id}
          selectHandler={selectHandler}
          selectedClusterId={selectedClusterId}
          nodeName={nodeName}
          user={user}
          port={port}
          selectedNode={selectedNode}
          AIdbsInfo={AIdbsInfo}
          setAIdbsInfo={setAIdbsInfo}
        />
      </div>

      {compareData && (
        <div className="cmp-metrics-wrap">
          <h3 className="cmp-metrics-title">Comparison (Estimated)</h3>
          <ComparisonMetrics
            left={compareData.left}
            right={compareData.right}
            mode="estimate"
          />
        </div>
      )}
    </div>
  );
}
