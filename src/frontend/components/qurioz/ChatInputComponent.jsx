// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Text input field with message submission, history scrolling, and AI command triggers.


import React, { useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import "../../styles/global.css";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "../../App";
import VoiceSearchButton from "./VoiceSearchButton";

function ChatInputComponent({ stage, onSubmit, isSendDisabled }) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef();
  const { theme } = useTheme();

  const [isFocus, setIsFocus] = useState(false);

  function isDark() {
    return theme === "dark";
  }

  const isMessageEmpty = () => message?.length === 0;
  const isStage = () => stage === "inital";

  const handleVoiceTranscript = (transcript) => {
    setMessage((prev) => prev + (prev ? " " : "") + transcript);
  };
  
  return (
    <motion.div
      initial={isStage() ? { opacity: 0, y: 15 } : { opacity: 0 }}
      animate={isStage() ? { opacity: 1, y: 0 } : { opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2, ease: "easeIn" }}
      className={isStage() ? "input-container-search" : "bottom-search-bar"}
      style={{
        zIndex: 10999,
        border: isFocus
          ? `2px solid ${isDark() ? "#8b5cf6" : "#8b5cf6"}`
          : "2px solid rgba(200,200,200,0.1)",
          position:"relative"
      }}
    >
      <div>
        <textarea
          ref={textareaRef}
          placeholder="Search for query..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => setIsFocus(true)}
          onBlur={() => setIsFocus(false)}
          rows={1}
          aria-label="Chat input"
          style={{
            paddingBottom: "10px",
            color: isDark() ? "white" : "black",
          }}
          className="chat-textarea"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(message);
              setMessage("");
            }
          }}
        />
      </div>
      <div className="bottom-search">
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <VoiceSearchButton
            onTranscript={handleVoiceTranscript}
            disabled={!isSendDisabled}
          />
          <AnimatePresence>
            {!isMessageEmpty() && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.5 }}
                onClick={() => {
                  if (!isMessageEmpty()) {
                    onSubmit(message);
                    setMessage("");
                  }
                }}
              >
                <div className="qur-chat-btn">
                  <Icon className="ti ti-send" style={{ fontSize: 14,color:"white" }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          textAlign: "center",
          fontSize: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          color: "gray",
        }}
      >
        Press Enter to send, Shift+Enter for new line.
      </div>
    </motion.div>
  );
}

export default ChatInputComponent;
