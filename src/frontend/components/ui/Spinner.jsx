// Spinner - thin wrapper over the existing .loading-spinner class
//
// Not related to .loader, which is a separate, single-purpose animation used
// only by components/qurioz/AILoaderComponent.jsx.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";

const SIZE_PX = { sm: 14, md: 18, lg: 24 };

// size: "sm" | "md" (default, matches .loading-spinner's own 18px) | "lg"
export default function Spinner({ size = "md", className = "" }) {
  const px = SIZE_PX[size];
  const style = size !== "md" ? { width: px, height: px } : undefined;
  return <span className={["loading-spinner", className].filter(Boolean).join(" ")} style={style} />;
}
