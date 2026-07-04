// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Captures, transcribes, and processes spoken audio input into system search queries or AI commands.

import useSpeechRecognitionHook from "../../hooks/useSpeechRecognitionHook"
import Icon from "../common/Icon.jsx";
import { useState } from "react";
import { AnimatePresence,motion } from "motion/react";

const VoiceSearchButton = ({ onTranscript, disabled }) => {
  const {
    hasError,
    isMIC,
    listening,
    StartlisteningHandler,
    isSupportSpeechRecongnition,
    StopListeningHandler
  } = useSpeechRecognitionHook(onTranscript);

  const [showTooltip, setShowTooltip] = useState(false);

  const styles = {
    disabledButton: {
      padding: "8px",
      color: "#9CA3AF",
      cursor: "not-allowed",
      border: "none",
      background: "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },

    container: {
      position: "relative"
    },

    button: {
        width:"30px",
        height:"30px",
      borderRadius: "9999px",
      transition: "all 0.3s ease"
    },

    listeningButton: {
      color: "#fff",
      backgroundColor: "#5D3FD3",
      border: "1px solid #5D3FD3",
      boxShadow: "0 10px 15px rgba(0,0,0,0.15)"
    },

    errorButton: {
      color: "#9CA3AF",
      backgroundColor: "#F9FAFB",
      border: "1px solid #E5E7EB",
      cursor: "not-allowed"
    },

    defaultButton: {
      color: "#ffffffff",
      backgroundColor: "#8b5cf6",
      border: "1px solid #8b5cf6",
      cursor: "pointer"
    },

    micContainer: {
      position: "relative"
    },

    indicatorDot: {
      position: "absolute",
      top: "-4px",
      right: "-4px",
      width: "8px",
      height: "8px",
      backgroundColor: "#fff",
      borderRadius: "50%"
    },

    listeningTooltip: {
      position: "absolute",
      top: "-48px",
      left: "-80px",
      transform: "translateX(-50%)",
      backgroundColor: "#5D3FD3",
      color: "#fff",
      fontSize: "12px",
      padding: "8px 12px",
      borderRadius: "8px",
      boxShadow: "0 10px 15px rgba(0,0,0,0.15)",
      whiteSpace: "nowrap",
      zIndex: 50
    },

    tooltipContent: {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },

    barsContainer: {
      display: "flex",
      gap: "4px"
    },

    bar: {
      width: "4px",
      height: "16px",
      backgroundColor: "#fff",
      borderRadius: "9999px"
    },

    tooltip: {
      position: "absolute",
      top: "-36px",
      left: "-29px",
      transform: "translateX(-50%)",
      backgroundColor: "#5D3FD3",
      color: "#fff",
      fontSize: "12px",
      padding: "4px 8px",
      borderRadius: "4px",
      whiteSpace: "nowrap",
      zIndex: 50
    },

    tooltipArrow: {
      position: "absolute",
      bottom: "-4px",
      left: "50%",
      width: "8px",
      height: "8px",
      backgroundColor: "#5D3FD3",
      transform: "translateX(-50%) rotate(45deg)"
    }
  };

  if (!isSupportSpeechRecongnition()) {
    return (
      <button
        disabled
        style={styles.disabledButton}
        title="Speech recognition not supported in this browser"
      >
        <Icon className="ti ti-microphone-off" style={{ fontSize: 12 }} />
      </button>
    );
  }

  if (isMIC) {
    return (
      <button
        disabled
        style={styles.disabledButton}
        title="Microphone not available"
      >
        <Icon className="ti ti-microphone-off" style={{ fontSize: 12 }} />
      </button>
    );
  }

  return (
    <div style={styles.container}>
      <motion.button
        onClick={!listening ? StartlisteningHandler : StopListeningHandler}
        disabled={disabled || hasError}
        style={{
          ...styles.button,
          ...(listening
            ? styles.listeningButton
            : hasError
            ? styles.errorButton
            : styles.defaultButton)
        }}
        whileHover={!disabled && !hasError ? { scale: 1.05 } : {}}
        whileTap={!disabled && !hasError ? { scale: 0.95 } : {}}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={
          hasError
            ? "Microphone access denied"
            : listening
            ? "Stop listening"
            : "Start voice search"
        }
      >
        <motion.div
          animate={
            listening
              ? {
                  scale: [1, 1.2, 1]
                }
              : {}
          }
          transition={
            listening
              ? {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }
              : {}
          }
        >
          {listening ? (
            <div style={styles.micContainer}>
              <Icon className="ti ti-microphone" style={{ fontSize: 14 }} />
              <motion.div
                style={styles.indicatorDot}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            </div>
          ) : (
            <Icon className="ti ti-microphone" style={{ fontSize: 14 }} />
          )}
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {listening && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={styles.listeningTooltip}
          >
            <div style={styles.tooltipContent}>
              <div style={styles.barsContainer}>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    style={styles.bar}
                    animate={{
                      height: [4, 12, 4]
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.2
                    }}
                  />
                ))}
              </div>
              <span>Listening... Speak now</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTooltip && !listening && !hasError && (
          <motion.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            style={styles.tooltip}
          >
            Voice search
            <div style={styles.tooltipArrow} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


export default VoiceSearchButton