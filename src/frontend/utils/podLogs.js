// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathir Moorthy
// Splits, filters and persists settings for the pod log viewer.

export const LOG_LINES_KEY = "chops_k8s_log_lines";
export const LOG_SINCE_KEY = "chops_k8s_log_since";

export const LOG_LINES_MIN = 100;
export const LOG_LINES_MAX = 10000;
export const LOG_LINES_STEP = 100;
export const LOG_LINES_DEFAULT = 1000;

// Every line carries an RFC3339 timestamp written by the container runtime
const K8S_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s(.*)$/;

export function clampLines(n) {
  // Number("abc") is NaN, and `|| 0` would turn that into zero
  if (n === null || n === undefined || String(n).trim() === "") {
    return LOG_LINES_DEFAULT;
  }
  const parsed = Number(n);
  if (!Number.isFinite(parsed)) return LOG_LINES_DEFAULT;
  return Math.min(LOG_LINES_MAX, Math.max(LOG_LINES_MIN, Math.round(parsed)));
}

export function readLineCount() {
  const n = Number(localStorage.getItem(LOG_LINES_KEY));
  return Number.isFinite(n) && n >= LOG_LINES_MIN && n <= LOG_LINES_MAX
    ? n
    : LOG_LINES_DEFAULT;
}

export function writeLineCount(n) {
  localStorage.setItem(LOG_LINES_KEY, String(clampLines(n)));
}

export function readSince() {
  return localStorage.getItem(LOG_SINCE_KEY) || "";
}

export function writeSince(v) {
  if (v) localStorage.setItem(LOG_SINCE_KEY, v);
  else localStorage.removeItem(LOG_SINCE_KEY);
}

// Seconds between the given local datetime and now.
export function sinceSecondsFrom(datetimeLocal) {
  if (!datetimeLocal) return undefined;
  const from = new Date(datetimeLocal).getTime();
  if (!Number.isFinite(from)) return undefined;
  const seconds = Math.floor((Date.now() - from) / 1000);
  return seconds > 0 ? seconds : undefined;
}

// Split the raw response into lines, each with its timestamp separated from its text.
export function splitLines(raw) {
  if (!raw) return [];

  const parts = raw.split("\n");
  const endsClean = raw.endsWith("\n");
  if (!endsClean && parts.length > 1) parts.pop();

  return parts
    .filter((l) => l.length > 0)
    .map((line, i) => {
      const m = line.match(K8S_TIMESTAMP);
      return m
        ? { i, ts: m[1], text: m[2] }
        : { i, ts: null, text: line };
    });
}

// Filter lines by a case-insensitive substring, keeping context around each match.
export function filterLines(lines, query, context = 0) {
  const total = lines.length;
  if (!query) return { lines, matched: total, total };

  const needle = query.toLowerCase();
  const hits = [];
  for (const line of lines) {
    if (line.text.toLowerCase().includes(needle)) hits.push(line.i);
  }

  if (!hits.length) return { lines: [], matched: 0, total };

  const keep = new Set();
  for (const i of hits) {
    for (let j = i - context; j <= i + context; j += 1) keep.add(j);
  }

  const hitSet = new Set(hits);
  const out = [];
  let previous = null;
  for (const line of lines) {
    if (!keep.has(line.i)) continue;
    // A gap between kept ranges gets a separator, so context blocks do not read as one continuous stretch of log.
    if (previous !== null && line.i > previous + 1) out.push({ gap: true, i: `gap-${line.i}` });
    out.push({ ...line, hit: hitSet.has(line.i) });
    previous = line.i;
  }

  return { lines: out, matched: hits.length, total };
}
