// Copyright (C) 2026 Quantrail™ Data Private Limited
// shareLink.js - put a query in a URL, and get it back out.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";

/* Above this many characters the dialog warns. */
export const LINK_WARN_CHARS = 8000;

/** The fragment key, so a share link is distinguishable from any other hash. */
export const SHARE_PARAM = "q";

const VERSION = 1;

// One byte in front of the payload saying how it was packed.
const PLAIN = 0x70; // 'p'
const DEFLATED = 0x64; // 'd'

function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/* Encode a query, and optionally its parameter values, into a fragment payload. */
export function encodeShare(sql, params = null) {
  const payload = { v: VERSION, sql: String(sql ?? "") };
  // Absent, not empty. An empty object would still say "the sender chose to
  // share values and there were none", which is a different statement.
  if (params && Object.keys(params).length) payload.p = params;

  const json = strToU8(JSON.stringify(payload));
  const packed = deflateSync(json, { level: 9 });

  const useDeflate = packed.length < json.length;
  const body = useDeflate ? packed : json;
  const out = new Uint8Array(body.length + 1);
  out[0] = useDeflate ? DEFLATED : PLAIN;
  out.set(body, 1);
  return toBase64Url(out);
}

/* Decode a fragment payload. */
export function decodeShare(text) {
  if (!text || typeof text !== "string") return null;
  try {
    const bytes = fromBase64Url(text);
    if (bytes.length < 2) return null;

    const marker = bytes[0];
    const body = bytes.subarray(1);
    let json;
    if (marker === DEFLATED) json = strFromU8(inflateSync(body));
    else if (marker === PLAIN) json = strFromU8(body);
    else return null;

    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.sql !== "string") return null;
    if (parsed.v !== VERSION) return null;

    return {
      sql: parsed.sql,
      params:
        parsed.p && typeof parsed.p === "object" && !Array.isArray(parsed.p)
          ? parsed.p
          : null,
    };
  } catch {
    return null;
  }
}

/* The full link to hand to someone. */
export function buildShareUrl(sql, params = null, base) {
  const origin = base || `${window.location.origin}${window.location.pathname}`;
  return `${origin}#${SHARE_PARAM}=${encodeShare(sql, params)}`;
}

/* Read a shared query out of the current fragment, if there is one. */
export function readShareFromHash(hash) {
  const h = (hash ?? window.location.hash ?? "").replace(/^#/, "");
  if (!h) return null;
  const params = new URLSearchParams(h);
  const value = params.get(SHARE_PARAM);
  return value ? decodeShare(value) : null;
}

/* A short name for a shared query, from its first meaningful line. */
export function shareTabName(sql) {
  const line = String(sql || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("--") && !l.startsWith("/*"));
  if (!line) return "Shared query";
  return line.length > 28 ? `${line.slice(0, 28)}...` : line;
}
