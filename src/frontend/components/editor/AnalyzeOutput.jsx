// AnalyzeOutput.jsx - the summary and the plan tree for EXPLAIN ANALYZE.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail Data pvt Ltd

import React from "react";
import Icon from "../common/Icon.jsx";
import {
  parseAnalyzeSummary,
  parseAnalyzeLines,
  stripAnalyzeSummary,
  SLOW_SHARE_PERCENT,
} from "../../utils/analyzeOutput.js";

export default function AnalyzeOutput({ text }) {
  const summary = parseAnalyzeSummary(text);
  const lines = parseAnalyzeLines(stripAnalyzeSummary(text));
  const slowCount = lines.filter((l) => l.slow).length;

  return (
    <div className="analyze-output">
      {summary?.split && (
        <div className="analyze-time">
          <div className="analyze-time-head">
            <span className="stat-card-label">Time</span>
            <span className="analyze-time-total">{summary.time}</span>
          </div>

          <div className="analyze-time-bar">
            <div
              className="analyze-seg planning"
              style={{ width: `${summary.split.planningPct}%` }}
              title={`Planning ${summary.split.planningLabel}`}
            />
            <div
              className="analyze-seg execution"
              style={{ width: `${summary.split.executionPct}%` }}
              title={`Execution ${summary.split.executionLabel}`}
            />
          </div>

          <div className="analyze-time-key">
            <span>
              <i className="analyze-dot planning" />
              Planning {summary.split.planningLabel} (
              {summary.split.planningPct.toFixed(0)}%)
            </span>
            <span>
              <i className="analyze-dot execution" />
              Execution {summary.split.executionLabel} (
              {summary.split.executionPct.toFixed(0)}%)
            </span>
          </div>
        </div>
      )}

      {(summary?.read || summary?.peak) && (
        <div className="stat-grid analyze-cards">
          {summary.read && (
            <div className="stat-card">
              <div className="stat-card-label">Read</div>
              <div className="stat-card-value">{summary.read}</div>
            </div>
          )}
          {summary.peak && (
            <div className="stat-card">
              <div className="stat-card-label">Peak memory</div>
              <div className="stat-card-value">{summary.peak}</div>
            </div>
          )}
        </div>
      )}

      {slowCount > 0 && (
        <div className="analyze-legend">
          <Icon className="ti ti-alert-triangle" />
          <span>
            {slowCount} step{slowCount === 1 ? " uses" : "s use"}{" "}
            {SLOW_SHARE_PERCENT} percent or more of the execution time. Steps run
            at the same time, so the shares can add up to more than 100 percent.
          </span>
        </div>
      )}

      <div className="analyze-tree">
        {lines.map((l, i) => (
          <div key={i} className={l.slow ? "analyze-line slow" : "analyze-line"}>
            {l.line || "\u00a0"}
          </div>
        ))}
      </div>
    </div>
  );
}
