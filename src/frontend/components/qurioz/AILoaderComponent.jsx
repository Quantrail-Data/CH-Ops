// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Displays an animated loading state while processing AI-generated queries or model responses.


import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useState } from "react";

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

function AILoaderComponent() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % LOADING_PHRASES.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div 
    className="main-loader-com"
    style={
      { display: "flex", alignItems: "center", gap: "30px" }}>
      <div className="loader"></div>
      <div
        style={{
          position: "relative",
          height: "24px",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0, }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            // style={{ position: "absolute", whiteSpace: "nowrap", }}
          >
            {LOADING_PHRASES[index]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default AILoaderComponent;