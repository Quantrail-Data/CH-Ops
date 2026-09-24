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
import AIDDLButton from "../common/AIDDLButton.jsx";
import AIDDLModelComponent from "../common/AIDDLModelComponent.jsx";

// Keep at most this many result rows in the DOM,
const RESULT_MAX_ROWS = 100;
const RESULT_MAX_HEIGHT = "390px";

// VITE_SELECTEDAID_DBS=aiselectedid
const SELECTLSKEY = import.meta.env.VITE_SELECTEDAID_DBS ?? "aiselectedid";

const DDLTABLE_DATABASE_KEY = "chops-ddl-details";

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



function responseBodyStructTableDatabase(genTables) {
  if (!genTables) return [];

  let result = [];
  Object.keys(genTables)?.forEach((_v) => {
    const tables = genTables[_v];
    if (tables) {
      tables?.forEach((_t) => {
        if (_t?.isSelected) {
          result.push({
            database: _v,
            table: _t?.table,
          });
        }
      });
    }
  });
  return result ? result : [];
}

// Memoized result area for one side: estimate panel or execute table, or the
// matching error banner.
const PaneResults = memo(function PaneResults({ estimate, exec }) {
  return (
    <div style={{ width: "100%" }}>
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
    </div>
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
  selectDb,
  selectedClusterId,
  nodeName,
  AIdbsInfo,
  setShowDBModel,
  genTables
}) {
  const placeholder =
    side === "left"
      ? "Paste your current query here..."
      : "Write your rewritten query here...";
  const disabled = !!busy || !sql.trim() || !connected;
  const [isAILoadingGenerating, setIsAILoadingGenerating] = useState(false);

  const [index, setIndex] = useState(0);
  const toast = useToast();

  const [apikey, setApiKey] = useState({
    status: false,
    id: null,
    serviceName: null,
    model: null,
  });
  const [apikeys, setApikeys] = useState([]);

  useEffect(() => {
    const fetchAPIKEY_Details = async () => {
      try {
        const { apiKey } = await apiFetch(`/api/qurioz/api-keys/active`);
        const apiData = await apiFetch(`/api/qurioz/api-keys`);
        setApikeys(apiData?.apiKeys);
        setApiKey({
          status: apiKey?.id ? true : false,
          id: apiKey?.id || null,
          serviceName: apiKey?.name || null,
          model: apiKey?.model || null,
        });
      } catch (err) {
        setApiKey({
          status: false,
          id: null,
          serviceName: null,
        });
      }
    };

    fetchAPIKEY_Details();
  }, []);

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
    // split the database value and selected tables data
    const result = responseBodyStructTableDatabase(genTables);

    setIsAILoadingGenerating(true);
    onChange(LOADING_PHRASES[index]);

    try {
      // generate the object or json for request body based the new chat or old chat
      const requestBody = {
        method: "POST",
        body: JSON.stringify({
          instruction: message,
          tables: result,
          clusterId: selectedClusterId,
          node: nodeName,
          previousInstruction: null,
          previousSql: null,
          forceRefreshDdl: false,
          messageId: null,
          isApiConfigured: apikey?.id ? true : false,
        }),
      };

      const responseAIQuery = await await apiFetch(
        "/api/ai/editor/generate",
        requestBody,
      );

      if (!responseAIQuery?.error) {
        onChange(
          `/*\n\n--QUESTION : ${message}? \n\n*/\n\n${format(
            responseAIQuery?.sql,
            { language: "clickhouse" },
          )}`,
        );
      }
    } catch (error) {
      onChange(
        `/*\n--QUESTION : ${message}? \n*/\n\n-- Error : ${
          error?.message || "SQL generation failed"
        }`,
      );
    } finally {
      setIsAILoadingGenerating(false);
    }
  }

  const ListTheSelectedDatabase = () => {
    const result  = responseBodyStructTableDatabase(genTables)
  return result?.length > 0
  };

  return (
    <div
      className={"cmp-pane cmp-pane-" + side}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
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
        {side === "right" ? (
          <div>
            <AIDDLButton
              isDisabled={!connected}
              onClickEventMethod={() => setShowDBModel(true)}
            />
          </div>
        ) : (
          <div style={{ width: 200, height: 45 }}></div>
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
        height="clamp(260px, 42vh, 560px)"
      />

      <div
        className="cmp-pane-buttons"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "10px",
          minHeight: "42px",
          marginTop: "12px",
        }}
      >
        {side === "right" ? (
          <button
            className="ai-button btn "
            style={{ color: "white" }}
            onClick={() => GeneratingSQLHandler()}
            disabled={isAILoadingGenerating || !ListTheSelectedDatabase()}
          >
            {isAILoadingGenerating ? (
              <>
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
        ) : (
          <div style={{ width: 156, height: 32 }}></div>
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

      <div style={{ width: "100%", marginTop: "12px" }}>
        <PaneResults estimate={estimate} exec={exec} />
      </div>
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

  const [editorCreds, setEditorCreds] = useState(null);
  const editorConnected = !!editorCreds;
  const [connUser, setConnUser] = useState("");
  const [connPassword, setConnPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState(null);
  const [AIdbsInfo, setAIdbsInfo] = useState([]);
  const [showDBModel, setShowDBModel] = useState(false);
  const [genTables, setGenTables] = useState({});
  const [estimateScore, setEstimateScore] = useState(null);
  const [newSelection, setNewSelection] = useState([]);
  const [isNewSelectAll, setIsNewSelectAll] = useState(false);
  const [updateSelection, setUpdateSelection] = useState([]);
  const [isUpdateSelectAll, setIsUpdateSelectAll] = useState(false);
  const [dbLoading, setDBLoading] = useState({ flag: false, message: null });
  const [alertMessage, setAlertMessage] = useState({
    flag: false,
    message: null,
  });
  const toast = useToast();

  const credsRef = useRef(null);
  useEffect(() => {
    credsRef.current = editorCreds;
  }, [editorCreds]);

  useEffect(() => {
    function setupDDLLS() {
      const isThere = localStorage.getItem(DDLTABLE_DATABASE_KEY);
      if (isThere) {
        const { selectdbDDL, estimate } = JSON.parse(isThere);
        setGenTables(selectdbDDL);
        setEstimateScore(estimate);
        return;
      }

      localStorage.setItem(
        DDLTABLE_DATABASE_KEY,
        JSON.stringify({ selectdbDDL: {}, estimate: null }),
      );
      setGenTables({});
      setEstimateScore(null);
      return;
    }

    setupDDLLS();
  }, []);

  function SelectTablehandler(db, table) {
    const setter = { ...genTables };
    setter[db] = setter[db]?.map((_v) => {
      if (_v?.table === table) {
        return { ..._v, isSelected: !_v?.isSelected };
      }
      return _v;
    });
    // SetterLSDDL(setter);
    setGenTables(setter);
  }

  function selectAllHandler(type) {
    if (type === "new") {
      if (!isNewSelectAll) {
        setNewSelection((prev) =>
          prev?.map((_v) => ({ ..._v, isSelected: true })),
        );
        setIsNewSelectAll(true);
        return;
      }

      setNewSelection((prev) =>
        prev?.map((_v) => ({ ..._v, isSelected: false })),
      );
      setIsNewSelectAll(false);
      return;
    }
    if (!isUpdateSelectAll) {
      setUpdateSelection((prev) =>
        prev?.map((_v) => ({ ..._v, isSelected: true })),
      );
      setIsUpdateSelectAll(true);
      return;
    }
    setUpdateSelection((prev) =>
      prev?.map((_v) => ({ ..._v, isSelected: false })),
    );
    setIsUpdateSelectAll(false);
    return;
  }

  async function databaseSchemaSetterHandler(type) {
    if (type === "refresh") {
      setDBLoading({
        flag: true,
        message: "Refreshing the database schema ID. Please wait...",
      });
      try {
        const req = updateSelection
          ?.filter((_v) => _v?.isSelected)
          ?.map((_v) => _v?.id);

        const requestBody = JSON.stringify({
          database_ids: req || [],
        });

        const responseRefresh = await apiFetch(
          "/api/ai/database/refresh-schema",
          {
            method: "POST",
            body: requestBody,
          },
        );
        if (responseRefresh?.success) {
          setUpdateSelection((prev) =>
            prev?.map((_v) => ({
              ..._v,
              isSelected: false,
            })),
          );
        }
        setAlertMessage({
          flag: true,
          message: `Refreshing the database schema is completed successfully!`,
        });
        return;
      } catch (err) {
        setAlertMessage({
          flag: true,
          message: err?.message,
        });
      } finally {
        setDBLoading({ flag: false, message: null });
        isUpdateSelectAll && setIsUpdateSelectAll(false);
        setTimeout(() => {
          setAlertMessage({ flag: false, message: null });
        }, 2000);
      }
    }
    setDBLoading({
      flag: true,
      message: "Getting table information. Please wait…",
    });
    try {
      const req = newSelection
        ?.filter((_v) => _v?.isSelected)
        ?.map((_v) => _v?.name);

      const findDB =
        Object.keys(genTables)?.length > 0
          ? req?.filter((v) => {
              const find = Object.keys(genTables)?.find((b) => b === v);

              return find === undefined;
            })
          : req;

      if (findDB?.length === 0) return;

      const responseInsert = await apiFetch(
        `/api/ai/tables?databases=${findDB?.join(",")}`,
        {
          method: "GET",
        },
      );

      if (responseInsert?.tables) {
        const { tables } = responseInsert;

        const splitDatabaseTables = { ...genTables };
        tables.forEach((_v) => {
          const isFind = Object.keys(splitDatabaseTables).find(
            (_key) => _key === _v?.database,
          );
          if (isFind) {
            splitDatabaseTables[_v?.database] = [
              ...splitDatabaseTables[_v?.database],
              { isSelected: false, table: _v?.table },
            ];
          } else {
            splitDatabaseTables[_v?.database] = [
              { isSelected: false, table: _v?.table },
            ];
          }
        });
        setGenTables(splitDatabaseTables);
        SetterLSDDL(splitDatabaseTables, estimateScore);
      }
    } catch (err) {
      setAlertMessage({
        flag: true,
        message: err?.message,
      });
    } finally {
      setDBLoading({ flag: false, message: null });
      setTimeout(() => {
        setAlertMessage({ flag: false, message: null });
      }, 2000);
      isNewSelectAll && setIsNewSelectAll(false);
    }
  }

  async function GenerateDDL_EsitmateHandler() {
    setDBLoading({
      flag: true,
      message: "Getting table information. Please wait…",
    });
    try {
      const result = responseBodyStructTableDatabase(genTables);

      const ddl_estimate_res = await apiFetch("/api/ai/ddl-estimate", {
        method: "POST",
        body: JSON.stringify({
          tables: result,
        }),
      });

      const { tokensEstimated } = ddl_estimate_res;
      setEstimateScore(tokensEstimated);
      SetterLSDDL(genTables, tokensEstimated);
    } catch (err) {
      setAlertMessage({
        flag: true,
        message: err?.message,
      });
    } finally {
      setDBLoading({
        flag: false,
        message: null,
      });
    }
  }

  function isEmptyTableAndDatabase() {
    return Object.keys(genTables)?.length === 0;
  }

  async function DeleteDatabaseDDLHandler(db) {
    setDBLoading({
      flag: true,
      message: "Deleting table and refreshing estimate information…",
    });

    const setter = { ...genTables };
    delete setter[db];

    try {
      let result = [];
      Object.keys(setter)?.forEach((_v) => {
        const tables = genTables[_v];
        if (tables) {
          tables?.forEach((_t) => {
            if (_t?.isSelected) {
              result.push({
                database: _v,
                table: _t?.table,
              });
            }
          });
        }
      });

      setNewSelection((prev) =>
        prev.map((_v) => {
          const db = Object.keys(setter).find((_b) => _b === _v?.name);
          if (!db) {
            return { ..._v, isSelected: false };
          }
          return _v;
        }),
      );

      if (!result) {
        return;
      }

      const ddl_estimate_res = await apiFetch("/api/ai/ddl-estimate", {
        method: "POST",
        body: JSON.stringify({
          tables: result,
        }),
      });

      const { tokensEstimated } = ddl_estimate_res;
      setEstimateScore(tokensEstimated);
      SetterLSDDL(setter, tokensEstimated);
      setGenTables(setter);
    } catch (err) {
      if (err?.message === "empty") {
        SetterLSDDL(setter, 0);
        setGenTables(setter);
        setEstimateScore(0);
      } else {
        setAlertMessage({
          flag: true,
          message: err?.message,
        });
      }
    } finally {
      setDBLoading({
        flag: false,
        message: null,
      });
    }
  }

  function isSelectDb(database, type) {
    return type === "new"
      ? newSelection?.some((_v) => _v?.name === database && _v?.isSelected)
      : updateSelection?.some((_v) => _v?.name === database && _v?.isSelected);
  }

  function isDisableSelectDb(database) {
    const dbSelected = Object.keys(genTables)?.find((_v) => _v === database);
    return dbSelected ? true : false;
  }

  function isSelectTable(database, table) {
    const value = genTables[database];
    if (!value) return false;
    return value?.find((_v) => _v?.table === table)?.isSelected ?? false;
  }

  function SetterLSDDL(data, estimate) {
    localStorage.setItem(
      DDLTABLE_DATABASE_KEY,
      JSON.stringify({ selectdbDDL: data, estimate: estimate }),
    );
  }

  function isEnableAddButton() {
    return newSelection?.length > 0
      ? newSelection?.some((_v) => _v?.isSelected)
      : false;
  }

  async function selectDBGenerateID(database, type) {
    if (type === "new") {
      isNewSelectAll && setIsNewSelectAll(false);
      // const tablesGen = await apiFetch(`/api/ai/tables`,{method:'GET'})
      setNewSelection((prev) =>
        prev?.map((_v) => {
          if (_v?.name === database) {
            return {
              ..._v,
              isSelected: !_v?.isSelected,
            };
          }
          return _v;
        }),
      );
    }
  }

 
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
  const [leftBusy, setLeftBusy] = useState(null);
  const [rightBusy, setRightBusy] = useState(null);

  const [compareData, setCompareData] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [acWords, setAcWords] = useState([]);
  const [dialectData, setDialectData] = useState(null);

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
    setNewSelection(
      response?.map((_v) => ({
        name: _v,
        id: null,
        isSelected: false,
        isAllowForRequest: true,
      })) || [],
    );
  }, [mode]);

  useEffect(() => {
    if (!editorConnected) return;
    loadDbs();
  }, [editorConnected, selectedClusterId, selectedNode, mode]);

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
  }, [mode]);

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
    } catch {}
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
  }, [editorConnected, editorCreds, active, mode]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

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
      <div className="cmp-toolbar">
        <div className="cmp-toolbar-left">
          <ModeSelect mode={mode} onChange={onModeChange} />
          {!editorConnected ? (
            <>
              <span className="cmp-connect-field">
                <Icon
                  className="ti ti-user"
                  style={{ fontSize: 15, opacity: 0.55 }}
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

      <div
        className="cmp-split"
        style={{ marginTop: "30px", alignItems: "stretch" }}
      >
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
          setShowDBModel={setShowDBModel}
          genTables={genTables}
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

      {showDBModel && (
        <AIDDLModelComponent
          SelectTablehandler={SelectTablehandler}
          dbLoading={dbLoading}
          newSelection={newSelection}
          genTables={genTables}
          setShowDBModel={setShowDBModel}
          selectAllHandler={selectAllHandler}
          databaseSchemaSetterHandler={databaseSchemaSetterHandler}
          isNewSelectAll={isNewSelectAll}
          isEnableAddButton={isEnableAddButton}
          estimateScore={estimateScore}
          GenerateDDL_EsitmateHandler={GenerateDDL_EsitmateHandler}
          isEmptyTableAndDatabase={isEmptyTableAndDatabase}
          DeleteDatabaseDDLHandler={DeleteDatabaseDDLHandler}
          alertMessage={alertMessage}
          isSelectDb={isSelectDb}
          isDisableSelectDb={isDisableSelectDb}
          isSelectTable={isSelectTable}
          selectDBGenerateID={selectDBGenerateID}
        />
      )}
    </div>
  );
}
