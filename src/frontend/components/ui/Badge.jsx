// Badge - thin wrapper over the existing .badge/.badge-* classes
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";

// color: "green" | "red" | "amber" | "blue" | "gray" | "purple"
export default function Badge({ color = "gray", className = "", children, ...rest }) {
  return (
    <span className={["badge", `badge-${color}`, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
