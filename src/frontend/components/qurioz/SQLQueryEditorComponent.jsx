// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Praveen kumar, Kathir Moorthy, Kathirdhasan
// Inline SQL editor embedded within the chat interface for modifying and executing AI-generated queries.

import React, { useState } from "react";
import SqlEditor from "../editor/SqlEditor.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";

const SQLQueryEditorComponent = ({ chat, RunSqlQueryhandler, replaceChat }) => {
  const [editingSql, setEditingSql] = useState({
    isEditing: false,
    sql: chat.sql,
    originalSql: chat.sql,
    messageId: chat?.messageId,
    chatId: chat?.chatId,
  });
  // const { replaceChat } = useQuriozChatContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isCopy, setIsCopy] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const copyHandler = () => {
    setIsCopy(true);
    if (navigator?.clipboard && navigator?.clipboard?.writeText) {
      navigator?.clipboard?.writeText(chat?.sql);
      setTimeout(() => {
        setIsCopy(false);
      }, 1000);
    }
  };

  const handleEditSql = () => {
    setEditingSql({
      isEditing: true,
      sql: chat.sql,
      originalSql: chat.sql,
      messageId: chat?.messageId,
      chatId: chat?.chatId,
    });
  };

  const handleCancelEditSql = () => {
    setEditingSql({
      isEditing: false,
      sql: chat.sql,
      originalSql: chat.sql,
      messageId: chat?.messageId,
      chatId: chat?.chatId,
    });
  };

  // SqlEditor passes the new text, not an event.
  const handleSqlChange = (next) => {
    setEditingSql((prev) => ({
      ...prev,
      sql: next,
    }));
  };

  const handleUpdateSql = async () => {
    if (!editingSql) return;

    try {
      setIsLoading(true);
      const response = await RunSqlQueryhandler(editingSql.sql);

      const updatedResponse = {
        ...chat,
        sql: editingSql.sql,
        ...(response?.success
          ? {
              error: { status: false, message: null },
              tableData: response.rows || [],
            }
          : {
              error: {
                status: true,
                message: response?.message || "Query execution failed",
              },
              tableData: [],
            }),
      };

      const res = await apiFetch(
        `/api/ai/chats/${editingSql?.chatId}/messages/${editingSql?.messageId}`,
        {
          method: "PATCH",
          body: {
            sql: editingSql.sql,
            errorCode: response?.success
              ? null
              : JSON.stringify({
                  code: 500,
                  message: response?.message || "Query execution failed",
                }),
          },
        },
      );

      replaceChat(updatedResponse);
    } catch (error) {
      console.error("Failed to update SQL:", error);
    } finally {
      setIsLoading(false);
      setEditingSql({
        isEditing: false,
        sql: "",
        originalSql: "",
        messageId: null,
        chatId: null,
      });
    }
  };

  const handleRun = async () => {
    const response = await RunSqlQueryhandler(editingSql.sql);

    const updatedResponse = {
      ...chat,
      sql: editingSql.sql,
      ...(response?.success
        ? {
            error: { status: false, message: null },
            tableData: response.rows || [],
          }
        : {
            error: {
              status: true,
              message: response?.message || "Query execution failed",
            },
            tableData: [],
          }),
    };
    replaceChat(updatedResponse);
  };

  // Ctrl+Enter is registered inside the editor at Prec.highest rather than as a
  // DOM listener: CodeMirror sees the key first and would otherwise swallow it.

  return (
    <div style={{ marginBottom: "16px", width: "90%" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#1f2937",
          color: "#f3f4f6",
          padding: "8px 12px",
          borderTopLeftRadius: "6px",
          borderTopRightRadius: "6px",
          gap: "4px",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: "500",
          }}
        >
          Clickhouse Query
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          {!editingSql.isEditing && (
            <>
              <button
                onClick={handleEditSql}
                title="Edit SQL query"
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "#d1d5db",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.2s",
                }}
              >
                <Icon
                  className="ti ti-edit"
                  style={{ marginRight: "4px", fontSize: 12 }}
                />
                <span style={{ fontSize: "12px" }}>Edit</span>
              </button>

              <button
                onClick={() => copyHandler()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "#d1d5db",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.2s",
                }}
              >
                {isCopy ? (
                  <>
                    <Icon
                      className="ti ti-check"
                      style={{
                        marginRight: "4px",
                        color: "#4ade80",
                        fontSize: 12,
                      }}
                    />
                    <span style={{ fontSize: "12px" }}>Copied!</span>
                  </>
                ) : (
                  <>
                    <Icon
                      className="ti ti-copy"
                      style={{ marginRight: "4px", fontSize: 12 }}
                    />
                    <span style={{ fontSize: "12px" }}>Copy</span>
                  </>
                )}
              </button>
              <button
                onClick={() => handleRun()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "#d1d5db",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.2s",
                }}
              >
                {isRunning ? (
                  <>
                    <div
                      className="loading-spinner"
                      style={{
                        width: "12px",
                        height: "12px",
                        marginRight: "4px",
                        borderTopColor: "#818cf8",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>Run..</span>
                  </>
                ) : (
                  <>
                    <Icon
                      className="ti ti-player-play"
                      style={{
                        marginRight: "4px",
                        fontSize: 12,
                        color: "#818cf8",
                      }}
                    />
                    <span style={{ fontSize: "12px" }}>Run</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {editingSql.isEditing ? (
        <div
          style={{
            backgroundColor: "var(--bg-sunken)",
            color: "var(--text-primary)",
            borderBottomLeftRadius: "6px",
            borderBottomRightRadius: "6px",
            overflow: "hidden",
            width: "100%",
          }}
        >
          <SqlEditor
            value={editingSql.sql}
            onChange={handleSqlChange}
            variant="compact"
            onRun={handleUpdateSql}
            height="160px"
          />

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              marginTop: "8px",
              padding: "12px",
              backgroundColor: "#1f2937",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleCancelEditSql}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: "12px",
                color: "#d1d5db",
                padding: "6px 12px",
                borderRadius: "4px",
                border: "1px solid #4b5563",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <Icon
                className="ti ti-x"
                style={{ marginRight: "4px", fontSize: 12 }}
              />
              Cancel
            </button>

            <button
              onClick={handleUpdateSql}
              disabled={chat.sqlUpdating}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: "12px",
                backgroundColor: "#5D3FD3",
                color: "#ffffff",
                padding: "6px 12px",
                borderRadius: "4px",
                border: "none",
                cursor: chat.sqlUpdating ? "not-allowed" : "pointer",
                opacity: chat.sqlUpdating ? 0.5 : 1,
              }}
            >
              {isLoading ? (
                <>
                  <Icon
                    className="ti ti-loader-2 animate-spin"
                    style={{ marginRight: "4px", fontSize: 12 }}
                  />
                  Updating...
                </>
              ) : (
                <>
                  <Icon
                    className="ti ti-device-floppy"
                    style={{ marginRight: "4px", fontSize: 12 }}
                  />
                  Update
                </>
              )}
            </button>
          </div>

          <div
            style={{
              fontSize: "11px",
              color: "#9ca3af",
              padding: "0 12px 8px",
              backgroundColor: "#1f2937",
            }}
          >
            Tip: Press Ctrl+Enter to quickly update
          </div>
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            width: "100%",
          }}
        >
          <pre
            style={{
              backgroundColor: "#111827",
              color: "#f3f4f6",
              padding: "12px",
              borderBottomLeftRadius: "6px",
              borderBottomRightRadius: "6px",
              overflowX: "auto",
              fontSize: "12px",
              fontFamily: "var(--font-code)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
            }}
          >
            <code
              style={{
                display: "block",
                width: "100%",
              }}
            >
              {chat.sql}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
};

export default SQLQueryEditorComponent;
