//@author: Sanjeev Kumar G
// EmptyState.jsx
// Friendly placeholder when a queue type is not in use on this server.

import React from "react";
import Icon from "../common/Icon.jsx";

export default function EmptyState({ icon = "ti-inbox", title, children }) {
  return (
    <div className="queue-empty">
      <Icon className={"ti " + icon}></Icon>
      <div className="queue-empty-title">{title}</div>
      {children && <div className="queue-empty-body">{children}</div>}
    </div>
  );
}