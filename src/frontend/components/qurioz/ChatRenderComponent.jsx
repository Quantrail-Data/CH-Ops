// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Iterates through and renders conversational message threads, markdown text, and embedded code blocks.

import React, { useState } from "react";
import Icon from "../common/Icon.jsx";
import quriozImage from "../../assets/qurioz.png";
import DataTable from "../layout/DataTable";
import SQLQueryEditorComponent from "./SQLQueryEditorComponent";
import { AnimatePresence, motion } from "motion/react";
import ChartVisualization from "./ChartVisualization";
import { useToast } from "../layout/Toast";
import { useQuriozChatContext } from "../../App";
import AILoaderComponent from "./AILoaderComponent";


function ChatRenderComponent({
  chatMessage,
  ToggelChart,
  RunSqlQueryhandler,
  index,
  ReFormQuestionSQLGenerating,
}) {
  const [showQuestionOption, setShowQuestionOption] = useState(false);
  const [isEditable, setIsEditable] = useState(false);
  const [editMessage, setEditMessage] = useState(null);

  const [chatReformLoading, setchatReformLoading] = useState(false);

  const [retryLoading, setRetryLoading] = useState(false);

  const { replaceChat } = useQuriozChatContext();

  const toast = useToast();



  const editHandler = () => {
    setEditMessage(chatMessage?.userQuestion);
    setIsEditable(true);
  };

  const cancelEditHandler = () => {
    setIsEditable(false);
    setEditMessage(null);
  };

  const reformUserQuestionhandler = () => {
    setchatReformLoading(true);
    const updatedUserQuestion = {
      ...chatMessage,
      id: chatMessage?.id,
      userQuestion: editMessage,
    };
    ReFormQuestionSQLGenerating(editMessage, index);
    replaceChat(updatedUserQuestion);
    setIsEditable(false);
    setEditMessage(null);
    setchatReformLoading(false);
  };

  const copyTable = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(JSON.stringify(chatMessage?.tableData));
      toast.success("Data table copied");
    }
  };

  const isTablePresent = (message) => message?.tableData?.length > 0;


  const retryHandler = async () => {
    setRetryLoading(true);
    const sql = chatMessage?.sql;
    const response = await RunSqlQueryhandler(sql);
    let QueryReponseChat;
    if (response?.success) {
      QueryReponseChat = {
        ...chatMessage,
        error: { status: false, message: null },
        tableData: response?.rows,
      };
    } else {
      QueryReponseChat = {
        ...chatMessage,
        error: { status: true, message: response?.message },
        tableData: [],
      };
    }

    replaceChat(QueryReponseChat);
    setRetryLoading(false);
  };

  if (chatMessage?.type === "user")
    return (
      <div id="chat-user-render">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "end",
            justifyContent: "end",
            width: "100%",
          }}
          onMouseEnter={() => {
            setShowQuestionOption(true);
          }}
          onMouseLeave={() => {
            setShowQuestionOption(false);
          }}
        >
          {!isEditable && (
            <motion.div
              style={{ position: "relative" }}
              className="content-user"
            >
              <span> {chatMessage?.userQuestion}</span>
              {showQuestionOption && (
                <div
                  style={{
                    position: "absolute",
                    display: "flex",
                    alignItems: "center",
                    bottom: "-1.5rem",
                    right: "0rem",
                    paddingTop: "10px",
                  }}
                >
                  {chatReformLoading ? (
                    <div>
                      <button className="btn btn-ghost">
                        <div className="loading-spinner">
                          <Icon className="ti ti-loader-2"></Icon>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          if (
                            navigator?.clipboard &&
                            navigator?.clipboard.writeText
                          ) {
                            navigator?.clipboard?.writeText(
                              chatMessage?.userQuestion,
                            );
                          }
                          toast.success("User question copied");
                        }}
                      >
                        <Icon
                          className="ti ti-copy"
                          style={{ fontSize: "13px" }}
                        ></Icon>
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => editHandler()}
                      >
                        {
                          <Icon
                            className="ti ti-edit"
                            style={{ fontSize: "13px" }}
                          ></Icon>
                        }
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {isEditable && (
            <motion.div
              style={{ position: "relative" }}
              className="editor-container"
            >
              <input
                type="text"
                value={editMessage}
                onChange={(e) => {
                  setEditMessage(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    reformUserQuestionhandler();
                  }
                }}
              />

              <div
                style={{
                  position: "absolute",
                  display: "flex",
                  alignItems: "center",
                  bottom: "-2.9rem",
                  paddingTop: "10px",
                  right: "0rem",
                  gap: "5px",
                }}
              >
                <button onClick={cancelEditHandler} className="btn btn-danger">
                  {" "}
                  <Icon className="ti ti-x"></Icon>
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => reformUserQuestionhandler()}
                >
                  {" "}
                  <Icon className="ti ti-send-2"></Icon>
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  else if (chatMessage?.type === "bot")
    return chatMessage?.isLoading ? (
      <AILoaderComponent />
    ) : chatMessage?.aiError?.status ? (
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            height: "60px",
          }}
        >
          <img src={quriozImage} style={{ width: "30px" }} />
        </div>
        <div
          className="alert-banner danger"
          style={{
            width: "90%",
            overflow: "auto",
            display: "flex",
            alignItems: "start",
          }}
        >
          <Icon
            className="ti ti-info-triangle"
            style={{ fontSize: "15px" }}
          ></Icon>
          <code style={{ fontSize: "12px" }}>
            {chatMessage?.aiError?.message}
          </code>
        </div>
      </div>
    ) : (
      <div id="chat-bot-render">
        <div style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              height: "60px",
            }}
          >
            <img src={quriozImage} style={{ width: "30px" }} />
          </div>
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeIn" }}
              >
                <SQLQueryEditorComponent
                  chat={chatMessage}
                  RunSqlQueryhandler={RunSqlQueryhandler}
                />
              </motion.div>

              {chatMessage?.error?.status ? (
                <div
                  className=" alert-banner danger"
                  style={{
                    width: "90%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {retryLoading ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                      }}
                    >
                      <div
                        className="loading-spinner"
                        style={{
                          borderTopColor: "white",
                          margin: "15px auto",
                        }}
                      ></div>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <Icon className="ti ti-info-circle"></Icon>
                          <h5>Error occurs while executing the query</h5>
                        </div>
                        <div>
                          <button
                            className="btn btn-ghost"
                            title="copy"
                            onClick={() => {
                              if (
                                navigator.clipboard &&
                                navigator?.clipboard?.writeText
                              ) {
                                navigator?.clipboard?.writeText(
                                  chatMessage?.error?.message,
                                );
                                toast?.success("Error copied");
                              }
                            }}
                          >
                            <Icon
                              className="ti ti-copy"
                              style={{ fontSize: "14px" }}
                            ></Icon>
                          </button>
                        </div>
                      </div>

                      <code style={{ fontSize: "12px" }}>
                        {chatMessage?.error?.message}
                      </code>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "start",
                          margin: "10px 0px",
                        }}
                      >
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: "12px" }}
                          onClick={() => retryHandler()}
                        >
                          <Icon
                            className="ti ti-refresh-alert"
                            style={{ color: "white", fontSize: "12px" }}
                          ></Icon>
                          Retry
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeIn", delay: 0.6 }}
                    className="data-table-ai-con"
                  >
                    {isTablePresent(chatMessage) ? (
                      <DataTable
                        rows={chatMessage?.tableData}
                        columns={
                          chatMessage?.tableData?.length > 0
                            ? Object.keys(chatMessage?.tableData[0])
                            : []
                        }
                        maxRows={chatMessage?.tableData?.length || 10}
                        QuriozFlag={true}
                      />
                    ) : (
                      <div
                        className="empty-state"
                        style={{ padding: "32px 16px", height: "auto", margin: "20px 0px", border: "1px solid var(--border-default)" }}

                      >
                        <Icon className="ti ti-inbox" style={{ fontSize: "23px" }}></Icon>
                        <p>{"No data found. Please check the SQL query and try again."}</p>
                      </div>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeIn", delay: 0.8 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      margin: "10px 0px",
                    }}
                  >
                    <button
                      className="icon-action-bot btn btn-ghost"
                      title={!isTablePresent(chatMessage) ? "Empty data" : "Copy Table Data"}
                      onClick={() => copyTable()}
                      disabled={!isTablePresent(chatMessage)}
                    >
                      <Icon className="ti ti-copy" />
                    </button>
                    {/* <button
                      className="icon-action-bot btn btn-ghost"
                      title={!isTablePresent(chatMessage) ? "Empty data" : "Download Table Data"}
                      onClick={() =>
                        setShowDownloadingOption(!showDownloadOption)
                      }
                      disabled={!isTablePresent(chatMessage)}
                    >
                      {showDownloadOption ? (
                        <Icon className="ti ti-x"></Icon>
                      ) : (
                        <Icon
                          className="ti ti-download"
                          style={{ fontSize: 20 }}
                        />
                      )}
                    </button>

                    <AnimatePresence>
                      {showDownloadOption && (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="download-container"
                        >
                          {downloadingFilesDataOptionSetting?.map(
                            (downloadOpt, indx) => (
                              <div
                                className="downloading-btn-table"
                                key={indx}
                                onClick={() =>
                                  downloadDatatable(downloadOpt?.title)
                                }
                                title={`Download ${downloadOpt?.title}`}
                              >
                                <Icon
                                  className={`ti ${downloadOpt?.icon}`}
                                  style={{ color: "white", fontSize: "18px" }}
                                ></Icon>
                              </div>
                            ),
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence> */}

                    <button
                      className="icon-action-bot btn btn-ghost"
                      title={
                        chatMessage?.tableData?.length > 0
                          ? "View the visualization"
                          : "Unable to display the chart as the data table is empty."
                      }
                      onClick={() => ToggelChart(chatMessage)}
                      style={{ gap: "10px" }}
                      disabled={chatMessage?.tableData?.length === 0}
                    >
                      <Icon className="ti ti-chart-bar" />{" "}
                      <span>Chart View</span>
                    </button>
                  </motion.div>

                  <AnimatePresence>
                    {chatMessage?.chart?.isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 0 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: 0.2,
                          ease: "easeIn",
                          delay: 0.2,
                        }}
                        style={{ width: "90%" }}
                      >
                        <ChartVisualization
                          editChart={null}
                          ChartData={chatMessage?.tableData}
                          data={chatMessage?.tableData}
                          chatMessage={chatMessage}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );

  return <div></div>;
}

export default ChatRenderComponent;
