// ComparisonMetrics - Side-by-side metrics table for the Query Comparison tool
//
// Takes the two result objects (left and right) from estimateOne/executeOne and
// draws a per-metric comparison, marking which side is better (lower is better
// for every metric). It shows estimate metrics or execute metrics depending on
// what was run, and never declares a single overall winner, only per-metric
// markers, because the right trade-off depends on the user's goal.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { memo } from "react";
import { fmtBytes, fmtRows } from "../../utils/costEstimator.js";
import { compareMetric, pctDelta } from "../../utils/queryCompare.js";

// Format a millisecond duration nicely.
function fmtMs(ms) {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(3)} s`;
}

function fmtPlain(n) {
  if (n == null) return "-";
  return Number(n).toLocaleString();
}

// One row of the comparison table.
function Row({ label, a, b, format }) {
  const winner = compareMetric(a, b); // 'a' | 'b' | 'tie' | null
  const fmt = format || fmtPlain;
  const delta = pctDelta(a, b);

  return (
    <tr>
      <td className="cmp-metric-label">{label}</td>
      <td className={"cmp-metric-val" + (winner === "a" ? " cmp-better" : "")}>
        {fmt(a)}
        {winner === "a" && <span className="cmp-badge">better</span>}
      </td>
      <td className={"cmp-metric-val" + (winner === "b" ? " cmp-better" : "")}>
        {fmt(b)}
        {winner === "b" && <span className="cmp-badge">better</span>}
        {winner === "b" && delta != null && delta < 0 && (
          <span className="cmp-delta">{Math.abs(delta).toFixed(0)}% lower</span>
        )}
        {winner === "a" && delta != null && delta > 0 && (
          <span className="cmp-delta cmp-delta-bad">
            {delta.toFixed(0)}% higher
          </span>
        )}
      </td>
    </tr>
  );
}

function ComparisonMetrics({ left, right, mode }) {
  // `left` and `right` are the objects returned by estimateOne/executeOne,
  // or null if that side has not been run yet.

  // Read a metric safely from a side (null if the side errored or is absent).
  const m = (side, key) =>
    side && side.ok && side.metrics ? side.metrics[key] : null;

  const leftErr = left && !left.ok ? left.error : null;
  const rightErr = right && !right.ok ? right.error : null;

  return (
    <div className="cmp-metrics">
      <table className="cmp-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Left (current)</th>
            <th>Right (experimental)</th>
          </tr>
        </thead>
        <tbody>
          {mode === "estimate" ? (
            <>
              <Row
                label="Estimated rows read"
                a={m(left, "rows")}
                b={m(right, "rows")}
                format={fmtRows}
              />
              <Row
                label="Parts touched"
                a={m(left, "parts")}
                b={m(right, "parts")}
              />
              <Row
                label="Marks touched"
                a={m(left, "marks")}
                b={m(right, "marks")}
              />
              <Row
                label="Tables involved"
                a={m(left, "tables")}
                b={m(right, "tables")}
              />
            </>
          ) : (
            <>
              <Row
                label="Result rows"
                a={m(left, "resultRows")}
                b={m(right, "resultRows")}
                format={fmtPlain}
              />
              <Row
                label="Rows read"
                a={m(left, "readRows")}
                b={m(right, "readRows")}
                format={fmtRows}
              />
              <Row
                label="Data read"
                a={m(left, "readBytes")}
                b={m(right, "readBytes")}
                format={fmtBytes}
              />
              <Row
                label="Duration"
                a={m(left, "elapsedMs")}
                b={m(right, "elapsedMs")}
                format={fmtMs}
              />
              <Row
                label="Memory (peak)"
                a={m(left, "memoryBytes")}
                b={m(right, "memoryBytes")}
                format={fmtBytes}
              />
              <Row
                label="Rows written"
                a={m(left, "writtenRows")}
                b={m(right, "writtenRows")}
                format={fmtPlain}
              />
            </>
          )}
        </tbody>
      </table>

      {(leftErr || rightErr) && (
        <div className="cmp-error-row">
          {leftErr && <div className="cmp-error">Left: {leftErr}</div>}
          {rightErr && <div className="cmp-error">Right: {rightErr}</div>}
        </div>
      )}

      <p className="cmp-note">
        Lower is better for every metric. Each side is marked per metric; no
        single overall winner is declared, because the right trade-off depends
        on your goal.
      </p>
    </div>
  );
}

export default memo(ComparisonMetrics);
