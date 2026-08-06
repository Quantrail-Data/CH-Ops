// format.js - shared display formatters
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Five other byte formatters divide by 1024 but label it KB/MB/GB. Use this one.

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

// 64-bit columns arrive as strings.
export function num(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function fmtBytes(v) {
  let n = num(v);
  if (n === 0) return "0 B";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  let i = 0;
  while (n >= 1024 && i < BYTE_UNITS.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n < 10 ? 2 : n < 100 ? 1 : 0;
  return `${sign}${n.toFixed(digits)} ${BYTE_UNITS[i]}`;
}

// Grouped below a million, short scale above.
export function fmtRows(v) {
  const n = num(v);
  if (Math.abs(n) < 1_000_000) return Math.round(n).toLocaleString("en-US");
  if (Math.abs(n) < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) < 1_000_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  return `${(n / 1_000_000_000_000).toFixed(2)}T`;
}

// Float64 seconds. Unit follows magnitude: ms for a new query, hours for a runaway.
export function fmtDuration(seconds) {
  const s = num(seconds);
  if (s < 0) return "0s";
  if (s < 1) return `${Math.round(s * 1000)}ms`;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  if (m < 60) return `${m}m ${String(rem).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function fmtMs(ms) {
  return fmtDuration(num(ms) / 1000);
}

// null when unknowable: total_rows_approx is 0 until ClickHouse knows the size.
export function ratio(part, whole) {
  const p = num(part);
  const w = num(whole);
  if (!Number.isFinite(w) || w <= 0) return null;
  return Math.min(1, Math.max(0, p / w));
}

export function fmtPercent(r, digits = 0) {
  if (r === null || r === undefined) return "-";
  return `${(r * 100).toFixed(digits)}%`;
}

// "YYYY-MM-DD hh:mm:ss" in, anything else passes through untouched.
export function fmtClock(v) {
  if (!v) return "-";
  const s = String(v);
  return s.length >= 19 && s[10] === " " ? s.slice(0, 19) : s;
}

export function truncate(text, max = 200) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}...`;
}
