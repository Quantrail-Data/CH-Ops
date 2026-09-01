// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Main container managing state, message history, and UI layouts for the AI chat interface.

import { useState, useCallback, useEffect, useRef } from "react";
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
import { isMessageFinders } from "../../utils/AIGreetsHandler.js";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

const chat_length = 1000;
const CHAT_LIMIT = chat_length * 2;
const DDLTABLE_DATABASE_KEY = "chops-ddl-details";

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

function HistoryShowBubbleComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingChatId, setEditingChatId] = useState(null);
  const [title, setTitle] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const menuRef = useRef(null);

  const toast = useToast();
  const navigate = useNavigate();

  const { replaceChat } = useQuriozChatContext();

  const loadHistory = async () => {
    setIsLoading(true);

    try {
      const response = await apiFetch("/api/ai/chats", {
        method: "GET",
      });

      setChats(Array.isArray(response?.chats) ? response.chats : []);
    } catch (error) {
      console.error("Failed to load chat history:", error);

      setChats([]);

      toast.error(error?.message || "Failed to load chat history");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    loadHistory();
  }, [isOpen]);

  useEffect(() => {
    if (openMenuId === null) return;

    const closeMenu = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", closeMenu);

    return () => {
      document.removeEventListener("mousedown", closeMenu);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (openMenuId === null) return;

    const closeMenu = () => {
      setOpenMenuId(null);
      setMenuPosition(null);
    };

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openMenuId]);

  const startEditing = (event, chat) => {
    event?.stopPropagation();

    setTitle(chat?.title || "");
    setEditingChatId(chat.id);

    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const cancelEditing = () => {
    setEditingChatId(null);
    setTitle("");
  };

  const saveTitle = async (chatId) => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      toast.error("Chat title cannot be empty");
      return;
    }

    setIsSaving(true);

    try {
      await apiFetch(`/api/ai/chats/${chatId}`, {
        method: "PATCH",
        body: {
          title: nextTitle,
        },
      });

      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                title: nextTitle,
              }
            : chat,
        ),
      );

      toast.success("Chat title updated");
    } catch (error) {
      console.error("Chat title update failed:", error);

      toast.error(error?.message || "Chat title update failed");
    } finally {
      setIsSaving(false);
      setEditingChatId(null);
      setTitle("");
    }
  };

  const handleTitleKeyDown = (event, chatId) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  };

  const deleteChat = async (event, chatId) => {
    event?.stopPropagation();

    try {
      await apiFetch(`/api/ai/chats/${chatId}`, {
        method: "DELETE",
      });

      setChats((currentChats) =>
        currentChats.filter((chat) => chat.id !== chatId),
      );

      toast.success("Chat deleted successfully");

      const currentPath = window.location.pathname;
      const currentChatId = currentPath.split("/").pop();

      if (String(currentChatId) === String(chatId)) {
        replaceChat([]);
        navigate("/qurioz");
      }
    } catch (error) {
      console.error("Chat delete failed:", error);

      toast.error(error?.message || "Chat delete failed");
    } finally {
      setOpenMenuId(null);
      setMenuPosition(null);
    }
  };

  const createHisMsgArr = (messages = []) => {
    if (!Array.isArray(messages)) {
      return [];
    }

    const timestamp = Date.now();

    return messages.flatMap((chat, index) => [
      {
        id: `${timestamp}-${index}-user`,
        ai_id: chat?.id,
        type: "user",
        userQuestion: chat?.instruction || "",
        showResponse: true,
      },

      {
        id: `${timestamp}-${index}-bot`,
        ai_id: chat?.id,
        type: "bot",

        sql: chat?.sql || chat?.responseText || "",

        sqlFlag: Boolean(chat?.sql),

        tableData: chat?.tableData || [],

        chart: {
          isOpen: chat?.chart?.isOpen || false,
          chartOption: chat?.chart?.chartOption || {},
          error: chat?.chart?.error || {
            status: false,
            message: "",
          },
          editorOption: chat?.chart?.editorOption || {},
        },

        error: chat?.error || {
          status: false,
          message: null,
        },

        aiError: chat?.aiError || {
          status: false,
          message: null,
        },
      },
    ]);
  };

  const handleOpenHistMsg = async (event, chatId) => {
    event?.stopPropagation();

    if (!chatId) {
      toast.error("Invalid chat");
      return;
    }

    setOpenMenuId(null);
    setMenuPosition(null);

    try {
      const response = await apiFetch(`/api/ai/chats/${chatId}`, {
        method: "GET",
      });

      const messageHistory = createHisMsgArr(response?.messages);
      console.log(response)

      replaceChat(messageHistory);

      navigate(`/qurioz/${chatId}`);

      setIsOpen(false);
    } catch (error) {
      console.error("Failed to open chat:", error);

      toast.error(error?.message || "Failed to open chat");
    }
  };

  const handleNewChat = () => {
    replaceChat([]);

    setEditingChatId(null);
    setTitle("");
    setOpenMenuId(null);
    setMenuPosition(null);

    navigate("/qurioz");

    setIsOpen(false);
  };

  const handleMenuToggle = (event, chatId) => {
    event.stopPropagation();
    if (openMenuId === chatId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    const menuWidth = 128;
    const menuHeight = 88;
    const spacing = 4;

    let left = bounds.right - menuWidth;

    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    const shouldOpenAbove =
      window.innerHeight - bounds.bottom < menuHeight + spacing;

    const top = shouldOpenAbove
      ? bounds.top - menuHeight - spacing
      : bounds.bottom + spacing;

    setMenuPosition({
      left,
      top,
    });

    setOpenMenuId(chatId);
  };

  const isNewSession = chats.length === 0;

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.div
          style={{
            position: "absolute",
            top: "0rem",
            width: "50px",
          }}
          title="History"
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          transition={{
            duration: 1,
            ease: "easeInOut",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsOpen(true)}
            aria-label="Open chat history"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="icon icon-tabler icons-tabler-outline icon-tabler-history-toggle"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M10 20.777a8.942 8.942 0 0 1 -2.48 -.969" />
              <path d="M14 3.223a9.003 9.003 0 0 1 0 17.554" />
              <path d="M4.579 17.093a8.961 8.961 0 0 1 -1.227 -2.592" />
              <path d="M3.124 10.5c.16 -.95 .468 -1.85 .9 -2.675l.169 -.305" />
              <path d="M6.907 4.579a8.954 8.954 0 0 1 3.093 -1.356" />
              <path d="M12 8v4l3 3" />
            </svg>
          </button>
        </motion.div>
      )}

      {isOpen && (
        <motion.div
          style={{
            position: "absolute",
            border: "1px solid var(--border-default)",
            top: "0rem",
            borderRadius: "10px",
            padding: "10px",
            backgroundColor: "var(--bg-page)",
            zIndex: 99999,
          }}
          initial={{
            opacity: 0,
            width: "0rem",
            height: "0vh",
          }}
          animate={{
            opacity: 1,
            width: "20rem",
            height: "70vh",
          }}
          exit={{
            opacity: 0,
            width: "0rem",
            height: "0vh",
          }}
        >
          <div className="header-history">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsOpen(false);
                setOpenMenuId(null);
                setMenuPosition(null);
              }}
              aria-label="Close chat history"
            >
              <Icon className="ti ti-chevron-left" />
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleNewChat}
            >
              <Icon className="ti ti-plus" />
              New Chat
            </button>
          </div>
          <div className="chat-sesion-body">
            {isLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "70%",
                }}
              >
                <span
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "12px",
                  }}
                >
                  Loading chats...
                </span>
              </div>
            ) : isNewSession ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexDirection: "column",
                  justifyContent: "center",
                  height: "70%",
                }}
              >
                <Icon className="ti ti-info-circle" />

                <span
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "12px",
                    margin: "10px 0px",
                  }}
                >
                  No chats found
                </span>
              </div>
            ) : (
              chats.map((chat) => (
                <div className="chat-session-tab" key={chat.id}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      cursor: editingChatId === chat.id ? "default" : "pointer",
                    }}
                    onClick={(event) => {
                      if (editingChatId !== chat.id) {
                        handleOpenHistMsg(event, chat.id);
                      }
                    }}
                  >
                    {editingChatId === chat.id ? (
                      <input
                        autoFocus
                        disabled={isSaving}
                        className="form-input"
                        style={{
                          width: "100%",
                          height: "24px",
                          minHeight: 0,
                          padding: "2px 6px",
                          boxSizing: "border-box",
                          fontSize: "13px",
                          lineHeight: "18px",
                        }}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        onBlur={() => saveTitle(chat.id)}
                        onKeyDown={(event) =>
                          handleTitleKeyDown(event, chat.id)
                        }
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <span title={chat?.title || "Untitled chat"}>
                        {chat?.title || "Untitled chat"}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost"
                      title="More options"
                      aria-label={`More options for ${
                        chat?.title || "Untitled chat"
                      }`}
                      aria-expanded={openMenuId === chat.id}
                      onClick={(event) => handleMenuToggle(event, chat.id)}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M12 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2m-7 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2m14 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2" />
                      </svg>
                    </button>

                    {openMenuId === chat.id &&
                      menuPosition &&
                      createPortal(
                        <ul
                          ref={menuRef}
                          className="cui-select-menu"
                          style={{
                            position: "fixed",
                            left: menuPosition.left,
                            top: menuPosition.top,
                            zIndex: 4000,
                            minWidth: "120px",
                            overflow: "hidden",
                          }}
                        >
                          <li
                            className="cui-select-opt"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => startEditing(event, chat)}
                          >
                            <Icon className="ti ti-edit" />
                            <span>Edit</span>
                          </li>
                          <li
                            className="cui-select-opt"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => deleteChat(event, chat.id)}
                            style={{
                              color: "var(--color-danger, #e5484d)",
                            }}
                          >
                            <Icon className="ti ti-trash" />
                            <span>Delete</span>
                          </li>
                        </ul>,
                        document.body,
                      )}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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

  const editorCredsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState({ status: false, message: null });
  const { session_id } = useParams();
  const [showConfrirmDelete, setShowConfrimDelete] = useState(false);
  const [dbs, setDbs] = useState([]);

  const [genTables, setGenTables] = useState({});
  const [estimateScore, setEstimateScore] = useState(null);

  // const {id} = useParams()

  const [apikey, setApiKey] = useState({
    status: false,
    id: null,
    serviceName: null,
  });
  const [apikeys, setApikeys] = useState([]);

  const [chatSession, setChatSession] = useState([]);

  const { theme } = useTheme();

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
  const [editorCreds, setEditorCreds] = useState(null);
  const editorConnected = !!editorCreds;
  const [connUser, setConnUser] = useState("");
  const [connPassword, setConnPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState(null);
  // default cred password view flag
  const [isViewFlag, setIsViewFlag] = useState(false);
  const toast = useToast();

  const navigate = useNavigate();

  function isDark() {
    return theme === "dark";
  }

  const createHisMsgArr = (messages = []) => {
    const timestamp = Date.now();

    return messages.flatMap((chat, index) => [
      {
        id: `${timestamp}-${index}-user`,
        ai_id: chat?.id,
        type: "user",
        userQuestion: chat?.instruction,
        showResponse: true,
      },
      {
        id: `${timestamp}-${index}-bot`,
        ai_id: chat?.id,
        type: "bot",
        sql: chat?.sql ? chat?.sql : chat?.responseText,
        sqlFlag: chat?.sql ? true : false,
        tableData: [],
        chart: {
          isOpen: false,
          chartOption: {},
          error: { status: false, message: "" },
          editorOption: {},
        },
        error: { status: false, message: null },
        aiError: { status: false, message: null },
      },
    ]);
  };

  useEffect(() => {
    const loadMessage = async () => {
      try {
        if (session_id) {
          const response = await apiFetch(`/api/ai/chats/${session_id}`, {
            method: "GET",
          });

          const messageHis = createHisMsgArr(response?.messages);
          console.log(messageHis);
          // messageHis.map((chat) => {
          //   insertMessage(chat);
          // });
          replaceChat(messageHis);
        }
      } catch (error) {
        console.log(error.message);
      }
    };
    loadMessage();
  }, [session_id]);

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
      if (!editorCreds) rej([]);
      apiFetch("/api/ai/databases", { method: "GET" })
        .then((resp) => {
          res(resp?.databases);
        })
        .catch((err) => {
          console.error(err);
          rej([]);
        });
    });

  useEffect(() => {
    async function initSetup() {
      editorCredsRef.current = editorCreds;
      try {
        const databases = await loadDbs();
        console.log(databases);
        setNewSelection(
          databases?.map((_v) => ({
            name: _v,
            id: null,
            isSelected: false,
            isAllowForRequest: true,
          })) || [],
        );
      } catch (err) {
        setNewSelection([]);
      }
    }
    initSetup();
  }, [editorCreds]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/ai/connect", { method: "GET" })
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

  async function handleConnect() {
    if (!connUser.trim()) {
      toast.error("Username is required.");
      return;
    }
    setConnecting(true);
    setConnError(null);
    const candidate = { user: connUser.trim(), password: connPassword };
    try {
      // await editorConnect(candidate);
      const connectCred = await apiFetch("/api/ai/connect", {
        method: "POST",
        body: JSON.stringify({
          clusterId: selectedClusterId,
          node: nodeName,
          user: connUser,
          password: connPassword,
        }),
      });

      setEditorCreds({ user: candidate.user });
      setConnPassword("");
      toast.success("DB connected succesfully");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      // await editorDisconnect();
      console.log("dis");
    } catch {}
    setEditorCreds(null);
    setConnUser("");
    setConnPassword("");
    setConnError(null);
    setDbs([]);
    setSelectedDb(null);
    setTables([]);
    setAcWords([]);
  }

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
      if ( sql) {
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
    const result = responseBodyStructTableDatabase(genTables);

    if (apikey?.id) {
      setIsLoading(true);
      try {
        if (userQuestion?.length > 0) {
          if (result?.length > 0) {
            if (isNewChat()) {
              const userQuestionMessage = {
                id: Date.now(),
                type: "user",
                userQuestion: userQuestion,
              };
              insertMessage(userQuestionMessage);
              ScrollBottomAuto();

              const responseAIQuery = await await apiFetch("/api/ai/generate", {
                method: "POST",
                body: JSON.stringify({
                  chatId: session_id ?? null,
                  instruction: userQuestion,
                  tables: result,
                  clusterId: selectedClusterId,
                  node: nodeName,
                  previousInstruction: null,
                  previousSql: null,
                  forceRefreshDdl: false,
                }),
              });

              console.log(responseAIQuery);

              if (responseAIQuery) {
                // const responseSQL = responseAIQuery?.generated_sql?.includes(
                //   "--Unable to generate SQL",
                // );
                const responseSQL = isMessageFinders(responseAIQuery?.sql);

                if (responseSQL) {
                  insertMessage({
                    id: Date.now(),
                    type: "bot",
                    isLoading: false,
                    sql: responseAIQuery?.sql,
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
                  const SQL = responseAIQuery?.sql
                    ?.toLowerCase()
                    .includes("limit")
                    ? responseAIQuery?.sql
                    : `${responseAIQuery?.sql} limit 10`;

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

              const responseAIQuery = await await apiFetch("/api/ai/generate", {
                method: "POST",
                body: JSON.stringify({
                  chatId: session_id ?? null,
                  instruction: userQuestion,
                  tables: result,
                  clusterId: selectedClusterId,
                  node: nodeName,
                  previousInstruction: null,
                  previousSql: null,
                  forceRefreshDdl: false,
                }),
              });
              console.log(responseAIQuery);

              if (responseAIQuery) {
                // const responseSQL = responseAIQuery?.generated_sql?.includes(
                //   "--Unable to generate SQL",
                // );

                const responseSQL = isMessageFinders(responseAIQuery?.sql);

                if (responseSQL) {
                  insertMessage({
                    id: Date.now(),
                    type: "bot",
                    isLoading: false,
                    sql: responseAIQuery?.sql,
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
                  const SQL = responseAIQuery?.sql
                    ?.toLowerCase()
                    .includes("limit")
                    ? responseAIQuery?.sql
                    : `${responseAIQuery?.sql} limit 10`;

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
        } else {
          const originalSql = responseAIQuery?.generated_sql || "";
          const hasLimit = /\blimit\b/i.test(originalSql);
          const SQL = hasLimit ? originalSql : `${originalSql} LIMIT 10`;
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

  function GetterLSDDL() {
    return JSON.parse(localStorage?.getItem(DDLTABLE_DATABASE_KEY));
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
      message: "Getting table information. Please wait…",
    });
    try {
      const req = newSelection
        ?.filter((_v) => _v?.isSelected)
        ?.map((_v) => _v?.name);

      const responseInsert = await apiFetch(
        `/api/ai/tables?databases=${req?.join(",")}`,
        {
          method: "GET",
        },
      );

      if (responseInsert?.tables) {
        const { tables } = responseInsert;
        // console.log(tables)
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

  function isEmptyTableAndDatabase() {
    return Object.keys(genTables)?.length === 0;
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <HistoryShowBubbleComponent chatSession={chatSession} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {!editorConnected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
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
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
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
              <button
                className="btn btn-ghost"
                onClick={() => setShowDBModel(true)}
              >
                <Icon className="ti ti-edit" style={{ fontSize: "14px" }} />
              </button>
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
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            </div>
          )}
        </div>
      </div>

      {isNewChat() ? (
        <IntroChatComponent
          inputSubmitHandler={userSubmitMessagehandler}
          isSendDisabled={isAllowForRequestHandler() || !isLoading}
        />
      ) : (
        <>
          <div className="chat-area" style={{ height: "auto" }}>
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
              maxHeight: "80vh",
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
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <Icon className="ti ti-database" />
                  <h5>Database Schema & Estimate Generator</h5>
                </div>
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
                <h5>Databases</h5>{" "}
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
                      Get Tables
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
                {newSelection?.length > 0 ? (
                  newSelection?.map((_b, i) => {
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
                          backgroundColor:
                            isSelectDb(_b?.name, "new") ||
                            isDisableSelectDb(_b?.name)
                              ? "var(--accent)"
                              : "transparent",
                          color:
                            isSelectDb(_b?.name, "new") ||
                            isDisableSelectDb(_b?.name)
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
                  })
                ) : (
                  <div></div>
                )}
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
            <div style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h5>Database & Tables</h5>
                <div style={{ gap: "10px", display: "flex" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                    className="btn btn-ghost"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="orange"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="icon icon-tabler icons-tabler-outline icon-tabler-chart-column"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M4 20h3" />
                      <path d="M17 20h3" />
                      <path d="M10.5 20h3" />
                      <path d="M4 16h3" />
                      <path d="M17 16h3" />
                      <path d="M10.5 16h3" />
                      <path d="M4 12h3" />
                      <path d="M17 12h3" />
                      <path d="M10.5 12h3" />
                      <path d="M4 8h3" />
                      <path d="M17 8h3" />
                      <path d="M4 4h3" />
                    </svg>
                    <span style={{ fontSize: "10px" }}>
                      Estimate : {estimateScore ? estimateScore : 0}
                    </span>
                  </div>
                  <button
                    className="btn btn-primary"
                    // disabled={!isEnableRefreshSchema()}
                    onClick={() => GenerateDDL_EsitmateHandler()}
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      height: "30px",
                    }}
                  >
                    <>
                      <Icon className="ti ti-refresh" />
                      Generate DDL & Estimate
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
                  overflowY: "auto",
                }}
                className=""
              >
                {isEmptyTableAndDatabase() ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flexDirection: "column",
                      }}
                    >
                      <Icon className="ti ti-info-circle" />
                      <span style={{ fontSize: "10px" }}>
                        No Table and DDL info founded!
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ width: "100%" }}>
                    {Object.keys(genTables)?.map((_v, idx) => {
                      return (
                        <div style={{ width: "100%" }}>
                          <div
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <h3
                              style={{
                                fontSize: "13px",
                                paddingBottom: "8px",
                                margin: "5px 0px",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                              }}
                            >
                              {" "}
                              <Icon
                                className="ti ti-database"
                                style={{ fontSize: "13px" }}
                              />
                              {_v}
                            </h3>
                            <button
                              className="btn btn-ghost"
                              title={`Delete the DDL of ${_v}`}
                              onClick={() => DeleteDatabaseDDLHandler(_v)}
                            >
                              <Icon className="ti ti-trash" />
                            </button>
                          </div>
                          <div
                            style={{
                              width: "100%",
                              display: "flex",
                              flexWrap: "wrap",
                            }}
                          >
                            {genTables[_v]?.map((_t, idx) => {
                              return (
                                <div
                                  onClick={() =>
                                    SelectTablehandler(_v, _t?.table)
                                  }
                                  key={`tables_${idx}_${_t?.table}`}
                                  className="db-select-model"
                                  style={{
                                    cursor: "pointer",
                                    margin: "3px",
                                    padding: "5px 15px",
                                    borderRadius: "5px",
                                    border: "1px solid var(--border-default)",
                                    display: "flex",
                                    alignItems: "center",
                                    backgroundColor: isSelectTable(
                                      _v,
                                      _t?.table,
                                    )
                                      ? "var(--accent)"
                                      : "transparent",
                                    color: isSelectTable(_v, _t?.table)
                                      ? "white"
                                      : isDark()
                                        ? "lightgray"
                                        : "gray",
                                    gap: "10px",
                                  }}
                                >
                                  <Icon
                                    className="ti ti-table"
                                    style={{ fontSize: "13px" }}
                                  />
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "700",
                                    }}
                                  >
                                    {_t?.table}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
