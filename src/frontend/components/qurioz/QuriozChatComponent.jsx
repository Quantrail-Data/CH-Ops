// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Main container managing state, message history, and UI layouts for the AI chat interface.

import { useState, useEffect } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import ChatInputComponent from "./ChatInputComponent";
import IntroChatComponent from "./IntroChatComponent.jsx";
import AILoaderComponent from "./AILoaderComponent";
import ChatRenderComponent from "./ChatRenderComponent";
import { useConnection, useQuriozChatContext, useTheme } from "../../App.jsx";
import { apiFetch, runQuery } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import { useNavigate } from "react-router-dom";
import { isMessageFinders } from "../../utils/AIGreetsHandler.js";
import { motion } from "framer-motion";

const chat_length = 1000;
const CHAT_LIMIT = chat_length * 2;

function QuriozChatComponent({ ScrollBottomAuto, sidebar }) {
  const {
    quriozMessage,
    insertMessage,
    deleteAllChatMessage,
    isNewChat,
    replaceChat,
    QURIOZLENGTH,
  } = useQuriozChatContext();
  const {
    clusters,
    clusterName,
    selectedClusterId,
    user,
    password,
    port,
    connected,
    selectedNode,
    nodeName,
  } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfrirmDelete, setShowConfrimDelete] = useState(false);
  const [_, setDbs] = useState([]);
  const [apikey, setApiKey] = useState({
    status: false,
    id: null,
    serviceName: null,
  });
  const [apikeys, setApikeys] = useState([]);

  const { theme } = useTheme();

  function isDark() {
    return theme === "dark";
  }

  const [showdbs, setShowdbs] = useState(false);
  const [showDBModel, setShowDBModel] = useState(false);
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

  const navigate = useNavigate();

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

  const loadDbs = () =>
    new Promise((res, rej) => {
      runQuery("SELECT name FROM system.databases ORDER BY name")
        .then((r) => {
          setDbs(r);
          return res((r.rows || []).map((r) => r.name));
        })
        .catch(() => {
          rej([]);
        });
    });

  async function initSetup() {
    const databases = await loadDbs();

    if (clusters?.length === 0) {
      return;
    }
    try {
      const response = await apiFetch("/api/ai/database/generated/databaseid", {
        method: "POST",
        body: JSON.stringify({
          cluster_id: selectedClusterId,
          node_id: nodeName,
        }),
      });
      if (response?.success) {
        setUpdateSelection(
          response?.databaseIDs?.map((database) => {
            const cred = JSON.parse(database?.credentials);
            return {
              name: cred?.database,
              id: database?.database_id,
              isSelected: false,
              isAllowForRequest: true,
            };
          }),
        );

        setNewSelection(
          databases
            ?.filter((_v) => {
              return !response?.databaseIDs
                ?.map((database) => {
                  const cred = JSON.parse(database?.credentials);
                  return cred?.database;
                })
                ?.includes(_v);
            })
            ?.map((_v) => ({
              name: _v,
              id: null,
              isSelected: false,
              isAllowForRequest: true,
            })),
        );
      }
    } catch (err) {
      console.log(err?.message);
    }
    return;
  }

  useEffect(() => {
    initSetup();
  }, [clusters, clusterName, selectedClusterId]);


  const ToggelChartHandler = (message) => {
    if (message) {
      const updatedChart = {
        ...message,
        chart: { ...message?.chart, isOpen: !message?.chart?.isOpen },
      };

      replaceChat(updatedChart);
    }
  };

  const RunSqlQueryhandler = async (sql) => {
    try {
      if (connected && sql) {
        const connectionOption = {
          node: selectedNode,
          user,
          password,
          port,
          clusterId: selectedClusterId,
        };
        const response = await runQuery(sql, connectionOption);
        return { success: true, ...response };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const userSubmitMessagehandler = async (userQuestion) => {
    const databaseIDS =
      updateSelection
        ?.filter((_v) => _v?.isAllowForRequest)
        ?.map((_v) => _v?.id) || [];
    if (apikey?.id) {
      if (QURIOZLENGTH() <= CHAT_LIMIT) {
        setIsLoading(true);
        try {
          if (userQuestion?.length > 0) {
            if (databaseIDS?.length > 0) {
              if (isNewChat()) {
                const userQuestionMessage = {
                  id: Date.now(),
                  type: "user",
                  userQuestion: userQuestion,
                };
                insertMessage(userQuestionMessage);
                ScrollBottomAuto();

                const responseAIQuery = await await apiFetch(
                  `/api/ai/sql/generate-sql`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON?.stringify({
                      database_ids: databaseIDS,
                      user_question: userQuestion?.trim(),
                    }),
                  },
                );

                if (responseAIQuery?.success) {
                  // const responseSQL = responseAIQuery?.generated_sql?.includes(
                  //   "--Unable to generate SQL",
                  // );
                  const responseSQL = isMessageFinders(
                    responseAIQuery?.generated_sql,
                  );

                  if (responseSQL) {
                    insertMessage({
                      id: Date.now(),
                      type: "bot",
                      isLoading: false,
                      sql: responseAIQuery?.generated_sql,
                      showResponse: true,
                      tableData: [],
                      chart: {
                        isOpen: false,
                        chartOption: {},
                        error: { status: false, message: "" },
                        editorOption: {},
                      },
                      error: { status: false, message: null },
                      aiError: { status: false, message: null },
                    });
                    setIsLoading(false);
                  } else {
                    const SQL = responseAIQuery?.generated_sql
                      ?.toLowerCase()
                      .includes("limit")
                      ? responseAIQuery?.generated_sql
                      : `${responseAIQuery?.generated_sql} limit 10`;

                    const QueryResult = await RunSqlQueryhandler(SQL);

                    if (QueryResult?.success) {
                      insertMessage({
                        id: Date.now(),
                        type: "bot",
                        isLoading: false,
                        sql: SQL,
                        showResponse: true,
                        tableData: QueryResult?.rows || [],
                        chart: {
                          isOpen: false,
                          chartOption: {},
                          error: { status: false, message: "" },
                          editorOption: {},
                        },
                        error: { status: false, message: null },
                        aiError: { status: false, message: null },
                      });
                      setIsLoading(false);
                    } else {
                      insertMessage({
                        id: Date.now(),
                        type: "bot",
                        isLoading: false,
                        sql: SQL,
                        showResponse: true,
                        tableData: QueryResult?.rows || [],
                        chart: {
                          isOpen: false,
                          chartOption: {},
                          error: { status: false, message: "" },
                          editorOption: {},
                        },
                        error: { status: true, message: QueryResult?.message },
                        aiError: { status: false, message: null },
                      });
                      setIsLoading(false);
                    }
                  }
                } else {
                  insertMessage({
                    id: Date.now(),
                    type: "bot",
                    isLoading: false,
                    sql: "",
                    showResponse: true,
                    tableData: [],
                    chart: {
                      isOpen: false,
                      chartOption: {},
                      error: { status: false, message: "" },
                      editorOption: {},
                    },
                    error: { status: false, message: null },
                    aiError: {
                      status: true,
                      message:
                        responseAIQuery?.message ||
                        "Error occurs on generating the query!",
                    },
                  });
                  setIsLoading(false);
                }
              } else {
                const userQuestionMessage = {
                  id: Date.now(),
                  type: "user",
                  userQuestion: userQuestion,
                };
                insertMessage(userQuestionMessage);
                ScrollBottomAuto();

                const responseAIQuery = await await apiFetch(
                  `/api/ai/sql/generate-sql`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON?.stringify({
                      database_ids: databaseIDS,
                      user_question: userQuestion?.trim(),
                    }),
                  },
                );

                if (responseAIQuery?.success) {
                  // const responseSQL = responseAIQuery?.generated_sql?.includes(
                  //   "--Unable to generate SQL",
                  // );

                  const responseSQL = isMessageFinders(
                    responseAIQuery?.generated_sql,
                  );

                  if (responseSQL) {
                    insertMessage({
                      id: Date.now(),
                      type: "bot",
                      isLoading: false,
                      sql: responseAIQuery?.generated_sql,
                      showResponse: true,
                      tableData: [],
                      chart: {
                        isOpen: false,
                        chartOption: {},
                        error: { status: false, message: "" },
                        editorOption: {},
                      },
                      error: { status: false, message: null },
                      aiError: { status: false, message: null },
                    });
                    setIsLoading(false);
                  } else {
                    const SQL = responseAIQuery?.generated_sql
                      ?.toLowerCase()
                      .includes("limit")
                      ? responseAIQuery?.generated_sql
                      : `${responseAIQuery?.generated_sql} limit 10`;

                    const QueryResult = await RunSqlQueryhandler(SQL);

                    if (QueryResult?.success) {
                      insertMessage({
                        id: Date.now(),
                        type: "bot",
                        isLoading: false,
                        sql: SQL,
                        showResponse: true,
                        tableData: QueryResult?.rows || [],
                        chart: {
                          isOpen: false,
                          chartOption: {},
                          error: { status: false, message: "" },
                          editorOption: {},
                        },
                        error: { status: false, message: null },
                        aiError: { status: false, message: null },
                      });
                      setIsLoading(false);
                    } else {
                      insertMessage({
                        id: Date.now(),
                        type: "bot",
                        isLoading: false,
                        sql: SQL,
                        showResponse: true,
                        tableData: [],
                        chart: {
                          isOpen: false,
                          chartOption: {},
                          error: { status: false, message: "" },
                          editorOption: {},
                        },
                        error: { status: false, message: null },
                        aiError: { status: false, message: null },
                      });
                      setIsLoading(false);
                    }
                  }
                } else {
                  insertMessage({
                    id: Date.now(),
                    type: "bot",
                    isLoading: false,
                    sql: "",
                    showResponse: true,
                    tableData: [],
                    chart: {
                      isOpen: false,
                      chartOption: {},
                      error: { status: false, message: "" },
                      editorOption: {},
                    },
                    error: { status: false, message: null },
                    aiError: {
                      status: true,
                      message:
                        responseAIQuery?.message ||
                        "Failed to fetch the generating the response",
                    },
                  });
                  setIsLoading(false);
                }
              }
            } else {
              toast?.warning(`Select Database and generate the ID!`);
            }
          }
        } catch (err) {
          insertMessage({
            id: Date.now(),
            type: "bot",
            isLoading: false,
            sql: "",
            showResponse: true,
            tableData: [],
            chart: {
              isOpen: false,
              chartOption: {},
              error: { status: false, message: "" },
              editorOption: {},
            },
            error: { status: false, message: null },
            aiError: {
              status: true,
              message:
                err?.message === "Failed to fetch"
                  ? "Sorry, we couldn't load your request at the moment. Please try again in a few seconds."
                  : err?.message ||
                  "Request failed to load. Please check your internet connection and try again.",
            },
          });
        } finally {
          setIsLoading(false);
          setTimeout(() => {
            ScrollBottomAuto();
          }, 500);
        }
      } else {
        insertMessage({
          id: Date.now(),
          type: "bot",
          isLoading: false,
          aiError: {
            status: true,
            message:
              "The chat limit has been exceeded. Please clear the old chat and continue the conversation.",
          },
        });
      }
    } else {
      const userQuestionMessage = {
        id: Date.now(),
        type: "user",
        userQuestion: userQuestion,
      };
      insertMessage(userQuestionMessage);

      insertMessage({
        id: Date.now(),
        type: "bot",
        isLoading: false,
        aiError: {
          status: true,
          message:
            "AI model and token configuration is missing or invalid. Please configure a valid model and token limit to continue.",
        },
      });
      ScrollBottomAuto();
    }
  };

  const ReFormQuestionSQLGenerating = async (updatedQuestion, UserIndex) => {
    const databaseIDS =
      updateSelection
        ?.filter((_v) => _v?.isAllowForRequest)
        ?.map((_v) => _v?.id) || [];

    let BotMessagesResponseBelowUser = (quriozMessage || []).filter(
      (value, indx) => indx === UserIndex + 1,
    );

    try {
      let UpdatedMessage = null;

      replaceChat({ ...BotMessagesResponseBelowUser[0], isLoading: true });

      const responseAIQuery = await await apiFetch(`/api/ai/sql/generate-sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON?.stringify({
          database_ids: databaseIDS,
          user_question: updatedQuestion?.trim(),
        }),
      });

      if (responseAIQuery?.success) {
        // const responseSQL = responseAIQuery?.generated_sql?.includes(
        //   "--Unable to generate SQL",
        // );

        const responseSQL = isMessageFinders(responseAIQuery?.generated_sql);

        if (responseSQL) {
          UpdatedMessage = {
            id: BotMessagesResponseBelowUser[0]?.id,
            type: "bot",
            isLoading: false,
            sql: responseAIQuery?.generated_sql,
            showResponse: true,
            tableData: [],
            chart: {
              isOpen: false,
              chartOption: {},
              error: { status: false, message: "" },
              editorOption: {},
            },
            error: { status: false, message: null },
            aiError: { status: false, message: null },
          };
          replaceChat(UpdatedMessage)
        } else {
          const SQL = responseAIQuery?.generated_sql
            ?.toLowerCase()
            .includes("LIMIT")
            ? responseAIQuery?.generated_sql
            : `${responseAIQuery?.generated_sql} limit 10`;

          const QueryResult = await RunSqlQueryhandler(SQL);

          if (QueryResult?.success) {
            UpdatedMessage = {
              id: BotMessagesResponseBelowUser[0]?.id,
              type: "bot",
              isLoading: false,
              sql: SQL,
              showResponse: true,
              tableData: QueryResult?.rows || [],
              chart: {
                isOpen: false,
                chartOption: {},
                error: { status: false, message: "" },
                editorOption: {},
              },
              error: { status: false, message: null },
              aiError: { status: false, message: null },
            };
          } else {
            UpdatedMessage = {
              id: BotMessagesResponseBelowUser[0]?.id,
              type: "bot",
              isLoading: false,
              sql: SQL,
              showResponse: true,
              tableData: [],
              chart: {
                isOpen: false,
                chartOption: {},
                error: { status: false, message: "" },
                editorOption: {},
              },
              error: { status: true, message: QueryResult?.message },
              aiError: { status: false, message: null },
            };
          }

          replaceChat(UpdatedMessage);
        }
      }
    } catch (err) {
      let error = {
        id: BotMessagesResponseBelowUser[0]?.id,
        type: "bot",
        isLoading: false,
        sql: "",
        showResponse: true,
        tableData: [],
        chart: {
          isOpen: false,
          chartOption: {},
          error: { status: false, message: "" },
          editorOption: {},
        },
        error: { status: false, message: null },
        aiError: {
          status: true,
          message:
            err?.message === "Failed to fetch"
              ? "Sorry, we couldn't load your request at the moment. Please try again in a few seconds."
              : err?.message ||
              "Request failed to load. Please check your internet connection and try again.",
        },
      };
      replaceChat(error);
    }
  };

  const DeleteDatabaseConnectionID = async () => {
    setDBLoading({
      flag: true,
      message: "Deleting the schema ID. Please wait...",
    });
    try {
      const dbs = updateSelection
        ?.filter((_v) => _v?.isSelected)
        ?.map((_db) => ({ dname: _db?.name, id: _db?.id }));
      await apiFetch(`/api/ai/database/delete/schema`, {
        method: "DELETE",
        body: JSON.stringify({ database_ids: dbs?.map((_v) => _v?.id) || [] }),
      });
      console.log(
        updateSelection.filter((_v) => {
          return !dbs?.map((_d) => _d?.id)?.includes(_v?.id);
        }),
      );
      setUpdateSelection((prev) =>
        prev?.filter((_v) => {
          return !dbs?.map((_d) => _d?.id)?.includes(_v?.id);
        }),
      );
      setNewSelection((prev) => [
        ...prev,
        ...dbs?.map((_v) => ({
          name: _v?.dname,
          id: null,
          isSelected: false,
          isAllowForRequest: true,
        })),
      ]);
      // toast?.success(`Database connection removed successfully.`);
      setAlertMessage({
        flag: true,
        message: `Database connection removed successfully.`,
      });
    } catch (err) {
      setAlertMessage({ flag: false, message: err?.message });
      // toast?.error(err?.message);
    } finally {
      setDBLoading({ flag: false, message: null });
      isUpdateSelectAll && setIsUpdateSelectAll(false);
      setTimeout(() => {
        setAlertMessage({ flag: false, message: null });
      }, 2000);
    }
  };

  async function SelectAIProvider(e) {
    const llm_provider = e?.target?.value;
    const { id } = apikeys?.find((val_) => val_?.name === llm_provider);

    try {
      const res = await apiFetch(`/api/qurioz/api-keys/select`, {
        method: "POST",
        body: JSON.stringify({ keyId: id }),
      });
      setApiKey({
        status: true,
        id: res?.id,
        serviceName: res?.name,
      });
      toast?.success(`${res?.name} selected successfully.`);
    } catch (err) {
      setApiKey({ status: false, id: null, serviceName: null });
      toast?.error(err?.message);
    }
  }

  function selectDBGenerateID(database, type) {
    if (type === "new") {
      isNewSelectAll && setIsNewSelectAll(false)
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
    } else {
      setUpdateSelection((prev) =>
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

  function selectForAllowForRequestHandler(db_con) {
    setUpdateSelection((prev) =>
      prev?.map((_b) => {
        if (_b?.name === db_con?.name) {
          return { ..._b, isAllowForRequest: !_b?.isAllowForRequest };
        }
        return _b;
      }),
    );
  }

  function isSelectDb(database, type) {
    return type === "new"
      ? newSelection?.some((_v) => _v?.name === database && _v?.isSelected)
      : updateSelection?.some((_v) => _v?.name === database && _v?.isSelected);
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
        console.log(err?.message);
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
      message: "Creating the database schema ID. Please wait...",
    });
    try {
      const req = newSelection
        ?.filter((_v) => _v?.isSelected)
        ?.map((_v) => _v?.name);
      const requestBody = JSON.stringify({
        database_type: "clickhouse",
        credentials: { port, username: user, password, host: selectedNode },
        databases: req || [],
        cluster_id: selectedClusterId,
        node_id: nodeName,
      });

      const responseInsert = await apiFetch("/api/ai/database/connect", {
        method: "POST",
        body: requestBody,
      });

      if (responseInsert?.success) {
        setNewSelection((prev) =>
          prev?.filter((_v) => {
            return !req?.includes(_v?.name);
          }),
        );
        setUpdateSelection((prev) => [
          ...prev,
          ...responseInsert?.database_id?.map((_v) => ({
            name: _v?.database,
            id: _v?.databaseId,
            isSelected: false,
            isAllowForRequest: true,
          })),
        ]);
        // toast?.success(`Database ID is created successfully!`);
        setAlertMessage({
          flag: true,
          message: `Database ID is created successfully!`,
        });
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

  function isEnableRefreshSchema() {
    return updateSelection?.length > 0
      ? updateSelection?.some((item) => item?.isSelected)
      : false;
  }

  function isEnableAddButton() {
    return newSelection?.length > 0
      ? newSelection?.some((_v) => _v?.isSelected)
      : false;
  }

  function isAllowForRequestHandler() {
    return updateSelection?.length > 0
      ? updateSelection.some((item) => item?.isAllowForRequest)
      : false;
  }

  return (
    <div className="chat-layout ">
      <div
        className="delete-chat"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexDirection: "row",
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexDirection: "row",
            gap: "10px",
          }}
        >
          <button
            className="btn btn-ghost"
            title="Clear All Chats"
            disabled={isNewChat()}
            onClick={() => {
              setShowConfrimDelete(true);
            }}
          >
            <Icon className="ti ti-eraser"></Icon>
          </button>

          <div
            className="form-group"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <div
              className="select-db-ai"
              style={{ minWidth: "200px", maxWidth: "250px" }}
            >
              <div
                className="select-db-header"
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                onMouseEnter={() => setShowdbs(true)}
                onMouseLeave={() => setShowdbs(false)}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  {isAllowForRequestHandler() ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0px",
                      }}
                    >
                      <div className="conn-indicator connected"> </div>
                    </div>
                  ) : (
                    <div>
                      <div className="conn-indicator disconnected"> </div>
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {isAllowForRequestHandler()
                      ? "Database Selected"
                      : "Database Not Selected"}
                  </span>
                </div>
                <div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setShowDBModel(true)}
                  >
                    <Icon className="ti ti-edit" style={{ fontSize: "14px" }} />
                  </button>
                </div>
              </div>
              {showdbs &&
                (updateSelection?.length > 0 ? (
                  <div
                    onMouseLeave={() => setShowdbs(false)}
                    onMouseEnter={() => setShowdbs(true)}
                    style={{
                      position: "absolute",
                      padding: "5px",
                      border: "1px solid var(--border-default",
                      borderRadius: "10px",
                      maxWidth: "250px",
                      minWidth: "200px",
                      overflow: "auto",
                      maxHeight: "200px",
                      backgroundColor: "var(--bg-page)",
                    }}
                  >
                    {updateSelection?.map(
                      (u) =>
                        u?.id && (
                          <div
                            key={u?.name}
                            style={{
                              cursor: "pointer",
                              backgroundColor: u?.isAllowForRequest
                                ? "var(--accent)"
                                : "",
                              color: u?.isAllowForRequest ? "white" : undefined,
                            }}
                            className="select-db-option"
                            onClick={() => selectForAllowForRequestHandler(u)}
                          >
                            <span
                              style={{ fontSize: "11px", fontWeight: "600" }}
                            >
                              {u?.name}
                            </span>
                            <Icon
                              className={`ti ti-${u?.isAllowForRequest ? "check" : "x"}`}
                              style={{
                                fontSize: "11px",
                                color: u?.isAllowForRequest
                                  ? "white"
                                  : undefined,
                              }}
                            />
                          </div>
                        ),
                    )}
                  </div>
                ) : (
                  <div></div>
                ))}
            </div>
          </div>
        </div>

        {apikeys?.length > 0 ? (
          <div>
            <Select
              className="form-input"
              value={apikey?.serviceName}
              onChange={SelectAIProvider}
              style={{
                width: "150px",
                padding: "5px",
                paddingLeft: "10px",
                fontSize: "10px",
              }}
            >
              {apikeys?.map((u) => (
                <option
                  key={u?.id}
                  value={u?.name}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    fontSize: "12px",
                  }}
                >
                  {u?.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div
            className={`api-details alert-banner danger `}
            style={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              borderRadius: "5px",
              gap: "10px",
              padding: "5px 15px",
            }}
            title={
              apikey?.status
                ? `Active API key: ${apikey?.serviceName}`
                : "No AI API key selected."
            }
            onClick={() => navigate("/admin/api-management")}
          >
            <Icon className="ti ti-key" style={{ fontSize: "13px" }}></Icon>
            <div className="details">
              <h6 style={{ fontSize: "10px" }}>{"NO API KEY"} </h6>
            </div>
          </div>
        )}
      </div>

      {isNewChat() ? (
        <IntroChatComponent
          inputSubmitHandler={userSubmitMessagehandler}
          isSendDisabled={isAllowForRequestHandler() || !isLoading}
        />
      ) : (
        <>
          <div className="chat-area">
            {quriozMessage?.map((message, index) => {
              return (
                <ChatRenderComponent
                  chatMessage={message}
                  key={message?.id}
                  ToggelChart={ToggelChartHandler}
                  RunSqlQueryhandler={RunSqlQueryhandler}
                  index={index}
                  ReFormQuestionSQLGenerating={ReFormQuestionSQLGenerating}
                />
              );
            })}

            {isLoading && <AILoaderComponent />}

            <div
              className="input-area"
              style={{
                background: isDark()
                  ? "linear-gradient(0deg,rgba(10, 14, 30, 1) 0%, rgba(10, 14, 30, 1) 79%, rgba(10, 14, 30, 0.5) 100%)"
                  : "linear-gradient(0deg,rgba(244, 245, 247, 1) 0%, rgba(244, 245, 247, 1) 79%, rgba(244, 245, 247, 0.84) 100%)",
              }}
            >
              <ChatInputComponent
                stage={"non-inital"}
                onSubmit={userSubmitMessagehandler}
                isSendDisabled={isAllowForRequestHandler() || isLoading}
              />
            </div>
          </div>
        </>
      )}

      {/* <IntroChatComponent /> */}

      {showConfrirmDelete && (
        <ConfirmModal
          title={"Due you want to delete all chat history? "}
          confirmText="Delete messages"
          danger={true}
          onCancel={() => {
            setShowConfrimDelete(false);
          }}
          chat={true}
          onConfirm={() => {
            deleteAllChatMessage();
            setShowConfrimDelete(false);
            toast.success(`Successfully deleted!`);
          }}
        />
      )}

      {showDBModel && (
        <div
          className="modal-overlay"
          style={{ zIndex: "100000", padding: "0px" }}
        >
          <motion.div
            initial={{ scale: 0.99 }}
            animate={{ scale: 1 }}
            style={{
              width: "50rem",
              backgroundColor: "var(--bg-page)",
              borderRadius: "10px",
              padding: "15px",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "30px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <Icon className="ti ti-database" />
                <h5>Database Schema Generator</h5>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowDBModel(false)}
                >
                  <Icon className="ti ti-x" />
                </button>
              </div>
            </div>
            {alertMessage?.flag && (
              <div
                className={`alert-banner info`}
                style={{ fontSize: "12px", margin: "10px 0px" }}
              >
                {alertMessage?.message}
              </div>
            )}
            {/* non-selected */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h5>Database Schema Generator</h5>{" "}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <button
                    onClick={() => selectAllHandler("new")}
                    className={`btn btn-ghost`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isNewSelectAll
                        ? "var(--accent)"
                        : undefined,
                      color: isNewSelectAll && "white",
                      ...{
                        fontSize: "11px",
                        padding: "5px 10px",
                        height: "30px",
                      },
                    }}
                  >
                    {!isNewSelectAll ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="icon icon-tabler icons-tabler-outline icon-tabler-select-all"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M8 9a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -6" />
                        <path d="M12 20v.01" />
                        <path d="M16 20v.01" />
                        <path d="M8 20v.01" />
                        <path d="M4 20v.01" />
                        <path d="M4 16v.01" />
                        <path d="M4 12v.01" />
                        <path d="M4 8v.01" />
                        <path d="M4 4v.01" />
                        <path d="M8 4v.01" />
                        <path d="M12 4v.01" />
                        <path d="M16 4v.01" />
                        <path d="M20 4v.01" />
                        <path d="M20 8v.01" />
                        <path d="M20 12v.01" />
                        <path d="M20 16v.01" />
                        <path d="M20 20v.01" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="icon icon-tabler icons-tabler-outline icon-tabler-deselect"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M12 8h3a1 1 0 0 1 1 1v3" />
                        <path d="M16 16h-7a1 1 0 0 1 -1 -1v-7" />
                        <path d="M12 20v.01" />
                        <path d="M16 20v.01" />
                        <path d="M8 20v.01" />
                        <path d="M4 20v.01" />
                        <path d="M4 16v.01" />
                        <path d="M4 12v.01" />
                        <path d="M4 8v.01" />
                        <path d="M8 4v.01" />
                        <path d="M12 4v.01" />
                        <path d="M16 4v.01" />
                        <path d="M20 4v.01" />
                        <path d="M20 8v.01" />
                        <path d="M20 12v.01" />
                        <path d="M20 16v.01" />
                        <path d="M3 3l18 18" />
                      </svg>
                    )}
                    <span style={{ fontSize: "11px" }}>
                      {isNewSelectAll ? "Deselect All" : "Select All"}
                    </span>
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      databaseSchemaSetterHandler("add");
                    }}
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      height: "30px",
                    }}
                    disabled={
                      newSelection?.length === 0 || !isEnableAddButton()
                    }
                  >
                    <>
                      {" "}
                      <Icon className="ti ti-plus" />
                      Add Schema
                    </>
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  width: "100%",
                  margin: "20px auto",
                  minHeight: "100px",
                  maxHeight: "300px",
                  alignItems: "start",
                  gap: "10px",
                }}
                className="alert-banner dbcard"
              >
                {newSelection?.map((_b, i) => {
                  return (
                    <div
                      key={i}
                      onClick={() => selectDBGenerateID(_b?.name, "new")}
                      className="db-select-model"
                      style={{
                        cursor: "pointer",
                        margin: "3px",
                        padding: "5px 15px",
                        borderRadius: "5px",
                        border: "1px solid var(--border-default)",
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: isSelectDb(_b?.name, "new")
                          ? "var(--accent)"
                          : "transparent",
                        color: isSelectDb(_b?.name, "new")
                          ? "white"
                          : isDark()
                            ? "lightgray"
                            : "gray",
                        gap: "10px",
                      }}
                    >
                      <span style={{ fontSize: "12px", fontWeight: "700" }}>
                        {_b?.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              style={{
                width: "100%",
                height: "1px",
                backgroundColor: "var(--border-default)",
                margin: "30px 0px",
              }}
            ></div>

            {/* selected */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h5>Database Schema Generated</h5>
                <div style={{ gap: "10px", display: "flex" }}>
                  <button
                    onClick={() => selectAllHandler("update")}
                    className={`btn btn-ghost`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isUpdateSelectAll
                        ? "var(--accent)"
                        : undefined,
                      color: isUpdateSelectAll && "white",
                      ...{
                        fontSize: "11px",
                        padding: "5px 10px",
                        height: "30px",
                      },
                    }}
                  >
                    {!isUpdateSelectAll ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="icon icon-tabler icons-tabler-outline icon-tabler-select-all"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M8 9a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -6" />
                        <path d="M12 20v.01" />
                        <path d="M16 20v.01" />
                        <path d="M8 20v.01" />
                        <path d="M4 20v.01" />
                        <path d="M4 16v.01" />
                        <path d="M4 12v.01" />
                        <path d="M4 8v.01" />
                        <path d="M4 4v.01" />
                        <path d="M8 4v.01" />
                        <path d="M12 4v.01" />
                        <path d="M16 4v.01" />
                        <path d="M20 4v.01" />
                        <path d="M20 8v.01" />
                        <path d="M20 12v.01" />
                        <path d="M20 16v.01" />
                        <path d="M20 20v.01" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="icon icon-tabler icons-tabler-outline icon-tabler-deselect"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M12 8h3a1 1 0 0 1 1 1v3" />
                        <path d="M16 16h-7a1 1 0 0 1 -1 -1v-7" />
                        <path d="M12 20v.01" />
                        <path d="M16 20v.01" />
                        <path d="M8 20v.01" />
                        <path d="M4 20v.01" />
                        <path d="M4 16v.01" />
                        <path d="M4 12v.01" />
                        <path d="M4 8v.01" />
                        <path d="M8 4v.01" />
                        <path d="M12 4v.01" />
                        <path d="M16 4v.01" />
                        <path d="M20 4v.01" />
                        <path d="M20 8v.01" />
                        <path d="M20 12v.01" />
                        <path d="M20 16v.01" />
                        <path d="M3 3l18 18" />
                      </svg>
                    )}
                    <span style={{ fontSize: "11px" }}>
                      {isUpdateSelectAll ? "Deselect All" : "Select All"}
                    </span>
                  </button>

                  <button
                    className="btn btn-primary"
                    disabled={
                      !isEnableRefreshSchema() || updateSelection?.length === 0
                    }
                    onClick={() => databaseSchemaSetterHandler("refresh")}
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      height: "30px",
                    }}
                  >
                    <>
                      <Icon className="ti ti-refresh" />
                      Refresh Selected Schema
                    </>
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      DeleteDatabaseConnectionID();
                    }}
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      height: "30px",
                    }}
                    disabled={
                      !isEnableRefreshSchema() || updateSelection?.length === 0
                    }
                  >
                    <>
                      {" "}
                      <Icon className="ti ti-trash" />
                      Delete Schema's
                    </>
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  width: "100%",
                  margin: "20px auto",
                  minHeight: "100px",
                  maxHeight: "300px",
                  alignItems: "start",
                }}
                className="alert-banner dbcard"
              >
                {updateSelection?.map((_b, i) => {
                  return (
                    <div
                      key={i}
                      onClick={() => selectDBGenerateID(_b?.name, "update")}
                      className="db-select-model"
                      style={{
                        cursor: "pointer",
                        margin: "3px",
                        padding: "5px 15px",
                        borderRadius: "5px",
                        border: "1px solid var(--border-default)",
                        // width:"180px",
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: isSelectDb(_b?.name, "update")
                          ? "var(--accent)"
                          : "transparent",
                        color: isSelectDb(_b?.name, "update")
                          ? "white"
                          : isDark()
                            ? "lightgray"
                            : "gray",
                        justifyContent: "space-between",
                        gap: "20px",
                      }}
                    >
                      <span style={{ fontSize: "12px", fontWeight: "700" }}>
                        {_b?.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {dbLoading?.flag && (
              <div
                className="model-loading-schema"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <div
                  className="loading-spinner"
                  style={{ width: "30px", height: "30px" }}
                ></div>
                <h5>{dbLoading?.message}</h5>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

// export default ChatLayoutComponent;

export default QuriozChatComponent;
