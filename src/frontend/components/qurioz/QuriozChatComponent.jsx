// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Main container managing state, message history, and UI layouts for the AI chat interface.


import { useState, useCallback, useEffect } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import ChatInputComponent from "./ChatInputComponent";
import IntroChatComponent from "./IntroChatComponent.jsx";
import AILoaderComponent from "./AILoaderComponent";
import ChatRenderComponent from "./ChatRenderComponent";
import { useParams } from "react-router-dom";
import { useConnection, useQuriozChatContext, useTheme } from "../../App.jsx";
import { apiFetch, runQuery } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import { useNavigate } from "react-router-dom";

// VITE_SELECTEDAID_DBS=aiselectedid
const SELECTLSKEY = import.meta.env.VITE_SELECTEDAID_DBS;

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
  const [error, setError] = useState({ status: false, message: null });
  const { session_id } = useParams();
  const [showConfrirmDelete, setShowConfrimDelete] = useState(false);
  const [dbs, setDbs] = useState([]);
  const [apikey, setApiKey] = useState({
    status: false,
    id: null,
    serviceName: null,
  });

  const { theme } = useTheme();

  function isDark() {
    return theme === "dark";
  }

  const [selectDb, setSelectDb] = useState(null);
  const [aiDatabase_id, setAIDatabase_id] = useState(null);

  const toast = useToast();

  const isConnected = (selectDb && aiDatabase_id) || !isLoading;

  const navigate = useNavigate();

  useEffect(() => {
    const fetchAPIKEY_Details = async () => {
      try {
        const { apiKey } = await apiFetch(`/api/qurioz/api-keys/active`);
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

  const loadDbs = useCallback(() => {
    runQuery("SELECT name FROM system.databases ORDER BY name")
      .then((r) => {
        return setDbs((r.rows || []).map((r) => r.name));
      })
      .catch(() => {});
  }, []);

  async function initSetup() {
    const isExits = localStorage?.getItem(SELECTLSKEY);
    loadDbs();

    if (clusters?.length === 0) {
      localStorage?.setItem(SELECTLSKEY, JSON.stringify({}));
      deleteAllChatMessage();
      return;
    }

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
          setSelectDb(dbsConnections?.dbName);
          setAIDatabase_id(dbsConnections?.ai_id);
        }
      });

      return;
    }

    setSelectDb(null);
    setAIDatabase_id(null);

    return;
  }

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
    initSetup();
  }, [clusters, clusterName, selectedClusterId]);

  const editingContentHandler = (quest, id) => {
    setChatMessage((prev) =>
      prev?.map((value) => {
        if (value?.id === id) {
          return { ...value, question: quest };
        }
        return value;
      }),
    );
  };

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
    if (apikey?.id) {
      if (QURIOZLENGTH() <= CHAT_LIMIT) {
        setIsLoading(true);
        try {
          if (userQuestion?.length > 0) {
            if (selectDb && aiDatabase_id) {
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
                      database_id: aiDatabase_id,
                      user_question: userQuestion?.trim(),
                    }),
                  },
                );

                if (responseAIQuery?.success) {
                  const responseSQL = responseAIQuery?.generated_sql?.includes(
                    "--Unable to generate SQL",
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
                      database_id: aiDatabase_id,
                      user_question: userQuestion?.trim(),
                    }),
                  },
                );

                if (responseAIQuery?.success) {
                  const responseSQL = responseAIQuery?.generated_sql?.includes(
                    "--Unable to generate SQL",
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
                  : err?.message || "Request failed to load. Please check your internet connection and try again.",
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
          database_id: aiDatabase_id,
          user_question: updatedQuestion?.trim(),
        }),
      });

      if (responseAIQuery?.success) {
        const responseSQL = responseAIQuery?.generated_sql?.includes(
          "--Unable to generate SQL",
        );

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
              : err?.message || "Request failed to load. Please check your internet connection and try again.",
        },
      };
      replaceChat(error);
    }
  };

  const DeleteDatabaseConnectionID = () => {
    let findClusterNode = JSON.parse(localStorage?.getItem(SELECTLSKEY));
    if (
      findClusterNode &&
      selectedClusterId &&
      nodeName &&
      selectDb &&
      aiDatabase_id
    ) {
      const removedData = findClusterNode[selectedClusterId][nodeName]?.filter(
        (dbs) => {
          return dbs?.ai_id !== aiDatabase_id;
        },
      );
      findClusterNode[selectedClusterId][nodeName] = removedData;
      setAIDatabase_id(null);
      setSelectDb(null);

      localStorage.setItem(SELECTLSKEY, JSON.stringify(findClusterNode));

      toast?.success(`Database connection removed successfully.`);
    }
  };

  return (
    <div className="chat-layout ">
      <div
        className="delete-chat"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexDirection: "row",
          // width: !sidebar ? "80%" : "90%",
          // left: !sidebar ? "13%" : "5%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexDirection: "row",
            gap: "10px",
            left: !sidebar ? "15rem" : "0rem",
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
            <Select
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
              {dbs?.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>

            {selectDb && aiDatabase_id ? (
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div className="conn-indicator connected"> </div>
                <button
                  className="btn btn-ghost"
                  title="Remove the database connection permanently"
                  onClick={() => DeleteDatabaseConnectionID()}
                >
                  <Icon className="ti ti-plug-connected-x"></Icon>
                </button>
              </div>
            ) : (
              <div>
                <div className="conn-indicator disconnected"> </div>
              </div>
            )}
          </div>
        </div>

        <div
          className={`api-details alert-banner ${apikey?.status ? "success" : "danger"} `}
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
            <h6 style={{ fontSize: "10px" }}>
              {apikey?.serviceName || "NO API key"}{" "}
            </h6>
          </div>
        </div>
      </div>

      {isNewChat() ? (
        <IntroChatComponent inputSubmitHandler={userSubmitMessagehandler} isSendDisabled={isConnected} />
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
                isSendDisabled={isConnected}
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
    </div>
  );
}

// export default ChatLayoutComponent;

export default QuriozChatComponent;

