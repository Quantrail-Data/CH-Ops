// sqlParams.js - typed query parameters and optional filter blocks.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail Data Private Limited

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Scanner

// Cap SQL length to avoid unbounded loops on attacker-controlled input.
const MAX_SQL_LENGTH = 1_000_000;

function scan(sql) {
  const text = String(sql || "").slice(0, MAX_SQL_LENGTH);
  const textLength = text.length;
  const spans = [];
  let i = 0;
  let start = 0;

  const push = (kind, a, b) => {
    if (b > a) spans.push({ kind, start: a, end: b });
  };

  while (i < textLength) {
    const c = text[i];
    const c2 = text[i + 1];

    // -- line comment, runs to end of line
    if (c === "-" && c2 === "-") {
      push("code", start, i);
      const a = i;
      i += 2;
      while (i < textLength && text[i] !== "\n") i++;
      push("comment", a, i);
      start = i;
      continue;
    }

    // /* block comment */, which may be an optional block if it opens with /*[
    if (c === "/" && c2 === "*") {
      push("code", start, i);
      const a = i;
      const isBlock = text[i + 2] === "[";
      i += 2;
      while (i < textLength && !(text[i] === "*" && text[i + 1] === "/")) i++;
      const b = Math.min(i + 2, textLength);
      push(isBlock ? "block" : "comment", a, b);
      i = b;
      start = i;
      continue;
    }

    // A {name:Type} placeholder is CODE, all of it, including a type whose
    // enum members are quoted.
    if (c === "{") {
      const ph = matchPlaceholder(text, i, textLength);
      if (ph) {
        i = ph.end;
        continue;
      }
    }

    // 'string literal', "quoted identifier", `backtick identifier`
    if (c === "'" || c === '"' || c === "`") {
      push("code", start, i);
      const a = i;
      const q = c;
      i++;
      while (i < textLength) {
        if (text[i] === "\\") { i += 2; continue; }        // escaped char
        if (text[i] === q && text[i + 1] === q) { i += 2; continue; }  // doubled quote
        if (text[i] === q) { i++; break; }
        i++;
      }
      push("string", a, i);
      start = i;
      continue;
    }

    i++;
  }

  push("code", start, textLength);
  return { text, spans };
}

// Placeholder parsing

function matchPlaceholder(text, at, limit) {
  let i = at + 1;
  while (i < limit && /\s/.test(text[i])) i++;

  const nameStart = i;
  while (i < limit && /[A-Za-z0-9_]/.test(text[i])) i++;
  const name = text.slice(nameStart, i);
  if (!NAME_RE.test(name)) return null;

  while (i < limit && /\s/.test(text[i])) i++;
  if (text[i] !== ":") return null;
  i++;
  while (i < limit && /\s/.test(text[i])) i++;

  const typeStart = i;
  let depth = 0;
  while (i < limit) {
    const c = text[i];
    if (c === "'") {                      // skip a quoted enum member
      i++;
      while (i < limit && text[i] !== "'") i++;
      i++;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "}" && depth === 0) break;
    i++;
  }

  if (i >= limit || text[i] !== "}") return null;   // unbalanced, not a parameter
  const type = text.slice(typeStart, i).trim();
  if (!type) return null;

  return { name, type, end: i + 1 };
}

function collectIn(text, from, to, required, out) {
  let i = from;
  while (i < to) {
    if (text[i] !== "{") { i++; continue; }
    const m = matchPlaceholder(text, i, to);
    if (!m) { i++; continue; }
    out.push({ name: m.name, type: m.type, required });
    i = m.end;
  }
}

// Public API

export function findParameters(sql) {
  const { text, spans } = scan(sql);
  const found = [];

  for (const s of spans) {
    if (s.kind === "code") collectIn(text, s.start, s.end, true, found);
    else if (s.kind === "block") collectIn(text, s.start, s.end, false, found);
  }

  const byName = new Map();
  for (const p of found) {
    const seen = byName.get(p.name);
    if (!seen) {
      byName.set(p.name, { ...p });
      continue;
    }
    if (seen.type !== p.type) {
      throw new Error(
        `Parameter '${p.name}' is declared with two different types: ` +
        `'${seen.type}' and '${p.type}'. Use one type for one name.`,
      );
    }
    // Appearing anywhere outside a block makes it required.
    if (p.required) seen.required = true;
  }
  return [...byName.values()];
}

// Every optional block, validated. Throws with a specific message rather than
// silently mangling anything.
export function findBlocks(sql) {
  const { text, spans } = scan(sql);
  const blocks = [];

  for (const s of spans) {
    if (s.kind !== "block") continue;
    const raw = text.slice(s.start, s.end);

    if (!raw.endsWith("]*/")) {
      throw new Error(
        "An optional filter block must end with ]*/ . Check for a stray */ " +
        "inside the block, including inside a string literal: ClickHouse ends " +
        "the comment at the first */ regardless of quoting.",
      );
    }

    const inner = raw.slice(3, -3);

    if (inner.includes("/*")) {
      throw new Error("Optional filter blocks cannot be nested.");
    }
    if (inner.includes(";")) {
      throw new Error("An optional filter block cannot contain a semicolon.");
    }

    const params = [];
    collectIn(inner, 0, inner.length, false, params);
    if (params.length === 0) {
      throw new Error(
        "An optional filter block must contain at least one parameter, " +
        "otherwise there is nothing to decide inclusion by.",
      );
    }

    blocks.push({ start: s.start, end: s.end, inner, params });
  }
  return blocks;
}

// A value counts as present if it is a non-empty string after trimming.
// Note this is deliberately NOT a truthiness check: 0 and false are values.
export function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

export function isTemporal(type) {
  return /^(Date|Date32|DateTime64|DateTime)\b/i.test(unwrap(type));
}

export function isNumeric(type) {
  return /^(U?Int(8|16|32|64|128|256)|Float(32|64)|Decimal)/i.test(unwrap(type));
}

// Nullable(T) and LowCardinality(T) behave as T for input and formatting.
function unwrap(type) {
  let t = String(type || "").trim();
  let changed = true;
  while (changed) {
    changed = false;
    const m = /^(Nullable|LowCardinality)\s*\((.*)\)$/i.exec(t);
    if (m) { t = m[2].trim(); changed = true; }
  }
  return t;
}

// Members of Enum8('a'=1,'b'=2) -> ['a','b']. Empty array if not an enum.
export function enumMembers(type) {
  const t = unwrap(type);
  if (!/^Enum(8|16)?\s*\(/i.test(t)) return [];
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(t))) out.push(m[1]);
  return out;
}

function two(n) { return String(n).padStart(2, "0"); }

// The wire format for each declared type.

export function formatValue(type, value) {
  const t = unwrap(type);

  if (isTemporal(t)) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return String(value);          // let ClickHouse report it
    const base =
      `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
    if (/^Date(32)?$/i.test(t)) return base;
    const time =
      `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
    if (/^DateTime64/i.test(t)) {
      return `${base} ${time}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
    }
    return `${base} ${time}`;
  }

  if (isNumeric(t)) return String(Number(value));

  // Everything else, including String, Identifier, UUID, Enum, Array and Map,
  // is sent as typed.
  return String(value);
}

// Resolve optional blocks and return the SQL to send plus the parameters that
// survived.
export function materialize(sql, values = {}) {
  const { text, spans } = scan(sql);
  findBlocks(sql);                 // validate, throwing on a malformed block

  let out = "";
  let cursor = 0;

  for (const s of spans) {
    if (s.kind !== "block") continue;
    out += text.slice(cursor, s.start);

    const inner = text.slice(s.start, s.end).slice(3, -3);
    const inBlock = [];
    collectIn(inner, 0, inner.length, false, inBlock);
    const filled = inBlock.every((p) => hasValue(values[p.name]));

    if (filled) out += inner;      // keep the content, drop the markers
    cursor = s.end;                // otherwise drop the block entirely
  }
  out += text.slice(cursor);

  const params = {};
  for (const p of findParameters(out)) {
    if (!hasValue(values[p.name])) continue;
    params[p.name] = formatValue(p.type, values[p.name]);
  }

  return { sql: out, params };
}