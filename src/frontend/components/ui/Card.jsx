// Card - thin wrapper over the existing .card class
//
// No variant prop: only a base .card + :hover rule exists in global.css
// today, so there is nothing to parameterize beyond the element type.
// forwardRef so callers that need the DOM node (e.g. scrollIntoView, a
// fullscreen container measured directly) can still get a ref.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { forwardRef } from "react";

const Card = forwardRef(function Card({ as: Tag = "div", className = "", children, ...rest }, ref) {
  return (
    <Tag ref={ref} className={["card", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
});

export default Card;
