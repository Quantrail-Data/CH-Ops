// queueFormat.js
// Display formatters for the Queues feature. Pure functions, no dependencies.

// Duration in milliseconds -> "12 ms" / "1.40 s" / "2.5 min".
export function fmtMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "unavailable";
  const n = Number(ms);
  if (n < 1000) return `${n.toFixed(n < 10 ? 1 : 0)} ms`;
  if (n < 60000) return `${(n / 1000).toFixed(2)} s`;
  return `${(n / 60000).toFixed(1)} min`;
}

// Seconds -> compact age "45s" / "12m" / "3h 20m" / "2d 4h".
export function fmtAge(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return "-";
  let s = Math.max(0, Math.floor(Number(sec)));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

// Percent -> "99.8%" with a null guard.
export function fmtPct(p) {
  if (p == null || !Number.isFinite(Number(p))) return "-";
  return `${Number(p).toFixed(Number(p) >= 99.95 || Number(p) === 100 ? 0 : 1)}%`;
}

// Large integer -> "1,240,000".
export function fmtInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return "-";
  return Number(n).toLocaleString();
}

// ISO-ish datetime string -> relative "3m ago" / "just now".
// Accepts ClickHouse "YYYY-MM-DD HH:MM:SS" (treated as UTC).
export function fmtRelative(dt) {
  if (!dt || dt === "1970-01-01 00:00:00") return "no activity";
  const ms = Date.parse(dt.replace(" ", "T") + "Z");
  if (Number.isNaN(ms)) return dt;
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
