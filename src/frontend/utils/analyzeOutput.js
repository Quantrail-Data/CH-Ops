// analyzeOutput.js - reads the numbers out of EXPLAIN ANALYZE output.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail Data pvt Ltd


export const SLOW_SHARE_PERCENT = 25;

// Time units, converted to milliseconds so that planning and execution can be compared

const UNITS = { ns: 1e-6, us: 1e-3, ms: 1, s: 1000, m: 60000 };
const toMs = (n, u) => Number(n) * (UNITS[String(u).toLowerCase()] ?? 1);

// Splits the Time line into planning and execution.

export function parseTimeSplit(timeLine) {
  if (typeof timeLine !== "string") return null;

  const m = timeLine.match(
    /planning\s+([\d.]+)\s*([a-z]+)\s*[^\d]*execution\s+([\d.]+)\s*([a-z]+)/i,
  );
  if (!m) return null;

  const planning = toMs(m[1], m[2]);
  const execution = toMs(m[3], m[4]);
  const total = planning + execution;
  if (!(total > 0)) return null;

  return {
    planningLabel: `${m[1]} ${m[2]}`,
    executionLabel: `${m[3]} ${m[4]}`,
    planningPct: (planning / total) * 100,
    executionPct: (execution / total) * 100,
  };
}

// Reads the three lines at the top of the output.

export function parseAnalyzeSummary(text) {
  if (typeof text !== "string") return null;
  if (!text.startsWith("Query summary:")) return null;

  const readLine = (label) => {
    const found = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"));
    return found ? found[1].trim() : null;
  };

  const time = readLine("Time");
  const read = readLine("Read");
  const peak = readLine("Peak memory");

  // A header with none of the three is not a header we understand. 
  if (!time && !read && !peak) return null;

  return { time, read, peak, split: parseTimeSplit(time) };
}

// Splits the output into lines, and marks the lines that report a time share.

export function parseAnalyzeLines(text, slowAt = SLOW_SHARE_PERCENT) {
  if (typeof text !== "string") return [];

  return text.split("\n").map((line) => {
    // Matches "time 3.51 s (83.6%)" and "Stage (partial aggregation): time 3.51 s (83.6%)".

    const found = line.match(/time\s+[\d.]+\s*[a-z]+\s+\(([\d.]+)%\)/i);
    const share = found ? Number(found[1]) : null;

    return {
      line,
      share,
      slow: share !== null && share >= slowAt,

      barWidth: share === null ? 0 : Math.max(0, Math.min(100, share)),
    };
  });
}

// Removes the header from the top of the output.

export function stripAnalyzeSummary(text) {
  if (typeof text !== "string") return text;
  if (!text.startsWith("Query summary:")) return text;

  const blank = text.indexOf("\n\n");
  // No blank line means the whole output is the header. Keep it, rather than
  // show nothing at all.
  if (blank === -1) return text;

  return text.slice(blank + 2);
}