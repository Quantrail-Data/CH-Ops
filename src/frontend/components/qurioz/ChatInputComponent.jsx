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
  const textareaRef = useRef(null);
  const { theme } = useTheme();
  const [insideCon,setInsideCon] = useState(false);
  const [isFocus, setIsFocus] = useState(false);
  const [isInputFullview, setIsInputFullview] = useState(false);

  function isDark() {
    return theme === "dark";
  }

  const isMessageEmpty = () => message?.length === 0;
  const isStage = () => stage === "inital";

  const handleVoiceTranscript = (transcript) => {
    setMessage((prev) => prev + (prev ? " " : "") + transcript);
  };

  const styleReturnForchatInput = () => {
    return !isStage()
      ? isInputFullview
        ? { height: "9rem", padding: "20px" }
        : { height: "3rem", padding: "5px" }
      : {};
  };
  const sendHandler = (message) => {
    onSubmit(message);
    setIsInputFullview(!isInputFullview);
  };

  const setAutoFocus = ()=>{
    setIsFocus(true);
    setTimeout(() => {
      const len = message?.length;
      textareaRef?.current?.setSelectionRange(len,len)
      textareaRef?.current?.focus()
    }, 50);
  }

  return (
    <motion.div
      initial={isStage() ? { opacity: 0, y: 15 } : { opacity: 0 }}
      animate={isStage() ? { opacity: 1, y: 0 } : { opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2, ease: "easeIn" }}
      onMouseEnter={()=>setInsideCon(true)}
      onMouseLeave={()=>setInsideCon(false)}
      className={isStage() ? "input-container-search" : "bottom-search-bar"}
      style={{
        zIndex: 10999,
        border: isFocus
          ? `2px solid ${isDark() ? "#8b5cf6" : "#8b5cf6"}`
          : "2px solid rgba(200,200,200,0.1)",
        position: "relative",
        ...styleReturnForchatInput(),
      }}
    >
      <div>
        <textarea
          ref={textareaRef}
          placeholder="Search for query..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => setIsFocus(true)}
          onBlur={() => {
            setIsFocus(false);
            if (!isStage() && isInputFullview && message?.length === 0 && !insideCon) {
              setIsInputFullview(!isInputFullview);
            }
          }}
          rows={1}
          aria-label="Chat input"
          style={{
            paddingBottom: "10px",
            color: isDark() ? "white" : "black",
            display: isInputFullview || isStage() ? "block" : "none",
          }}
          className="chat-textarea"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendHandler(message);
              setMessage("");
            }
          }}
        />
      </div>
      {isInputFullview || isStage() ? (
        <>
          <div className="bottom-search">
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <VoiceSearchButton
                onTranscript={handleVoiceTranscript}
                disabled={!isSendDisabled}
                setAutoFocus={setAutoFocus}
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
                        sendHandler(message);
                        setMessage("");
                      }
                    }}
                  >
                    <div className="qur-chat-btn">
                      <Icon
                        className="ti ti-send"
                        style={{ fontSize: 14, color: "white" }}
                      />
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
        </>
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            opacity: "0.7",
          }}
          onClick={() => {
            setIsInputFullview(!isInputFullview);
            setIsFocus(true);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
        >
          <p
            style={{
              margin: "0px 10px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="icon icon-tabler icons-tabler-outline icon-tabler-sparkle-2"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M12 3c.375 0 .711 .231 .846 .581l1.65 4.29a2.85 2.85 0 0 0 1.632 1.633l4.291 1.65a.906 .906 0 0 1 0 1.692l-4.29 1.65a2.84 2.84 0 0 0 -1.633 1.632l-1.65 4.291a.906 .906 0 0 1 -1.692 0l-1.65 -4.29a2.84 2.84 0 0 0 -1.632 -1.633l-4.291 -1.65a.906 .906 0 0 1 0 -1.692l4.29 -1.65a2.84 2.84 0 0 0 1.633 -1.632l1.65 -4.291a.91 .91 0 0 1 .846 -.581" />
            </svg>{" "}
            Search for query...
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default ChatInputComponent;
