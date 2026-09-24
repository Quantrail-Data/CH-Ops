import { motion } from "motion/react";

function SchemaIcon() {
  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="icon icon-tabler icons-tabler-outline icon-tabler-schema"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M5 2h5v4h-5l0 -4" />
        <path d="M15 10h5v4h-5l0 -4" />
        <path d="M5 18h5v4h-5l0 -4" />
        <path d="M5 10h5v4h-5l0 -4" />
        <path d="M10 12h5" />
        <path d="M7.5 6v4" />
        <path d="M7.5 14v4" />
      </svg>
    </>
  );
}

function AIDDLButton({ onClickEventMethod, isDisabled }) {
  return (
    <motion.button
      style={{
        display: "flex",
        fontSize: "11px",
        fontWeight: "800",
        padding: "6px 10px",
      }}
      className="btn btn-secondary"
      title={
        isDisabled
          ? "Login to Generate Schema & Estimate"
          : "Database Schema & Estimate Generator"
      }
      disabled={isDisabled}
      onClick={onClickEventMethod}
    >
      <SchemaIcon />
      DB Schema/Estimate
    </motion.button>
  );
}

export default AIDDLButton;
