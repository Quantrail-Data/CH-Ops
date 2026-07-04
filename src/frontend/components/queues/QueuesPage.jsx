//@author: Sanjeev Kumar G

// QueuesPage.jsx
// Top-level Queues page. Four tabs, matching the app's tab-bar pattern:
// S3 Queue, Azure Queue, Distribution Queue, Replication Queue. Each tab is
// isolated in its own ErrorBoundary so a failure in one never blanks the rest.

import React, { useState } from "react";
import Icon from "../common/Icon.jsx";
import IngestionTab from "./IngestionTab.jsx";
import DistReplTab from "./DistReplTab.jsx";
import ErrorBoundary from "../layout/ErrorBoundary.jsx";
import "./queues.css";

const TABS = [
  { id: "s3", label: "S3 Queue", icon: "ti-bucket" },
  { id: "azure", label: "Azure Queue", icon: "ti-cloud" },
  { id: "distribution", label: "Distribution Queue", icon: "ti-topology-ring" },
  { id: "replication", label: "Replication Queue", icon: "ti-git-branch" },
];

export default function QueuesPage() {
  const [tab, setTab] = useState("s3");

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-stack-2"></Icon> Queues
        </h2>
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`tab-item ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <Icon className={`ti ${t.icon}`}></Icon> {t.label}
          </div>
        ))}
      </div>

      {/* key=tab so the boundary resets when switching tabs (a tab that errored
          earlier is retried on return). */}
      <ErrorBoundary key={tab}>
        {tab === "s3" && <IngestionTab source="s3" />}
        {tab === "azure" && <IngestionTab source="azure" />}
        {tab === "distribution" && <DistReplTab view="distribution" />}
        {tab === "replication" && <DistReplTab view="replication" />}
      </ErrorBoundary>
    </div>
  );
}
