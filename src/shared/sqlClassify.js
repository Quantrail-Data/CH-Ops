// sqlClassify.js - Shared, dependency-free SQL statement classifier.
//
// One place, used by both the frontend and the backend, to answer "what kind of
// statement is this and is it read-only?". It deliberately does NOT try to fully
// parse ClickHouse grammar (a generic SQL parser is brittle against ClickHouse's
// dialect and would disagree with the server). Instead it does a single robust
// lexical pass that correctly skips comments, string literals and quoted
// identifiers, so it can reliably:
//   1. split top-level statements on ';' (ignoring ';' inside strings/comments),
//   2. find each statement's leading keyword (past leading comments and '('), and
//   3. classify each statement as read-only via an allowlist of leading keywords.
//
// The allowlist is intentionally conservative: only row-returning / read
// statements pass. Everything else (INSERT, CREATE, ALTER, DROP, RENAME,
// TRUNCATE, OPTIMIZE, SYSTEM, SET, KILL, GRANT, ... and anything unknown) is
// treated as not read-only. This is a UX/first-line gate; the authoritative
// enforcement is ClickHouse's readonly setting applied server-side.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

// Leading keywords that only ever read (and return rows). Kept explicit.
export const READ_ONLY_LEADERS = new Set([
  "SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE", "DESC", "EXISTS",
]);

// Lex the SQL once and return an array of statement strings, split on top-level
// semicolons. Comments are replaced by a single space (to preserve token
// boundaries) and string / identifier literals are copied verbatim so that a ';'
// or keyword-looking text inside them is never treated as structure.
function splitTopLevel(sql) {
  const s = String(sql || "");
  const n = s.length;
  const out = [];
  let buf = "";
  let i = 0;
  while (i < n) {
    const c = s[i];
    const c2 = s[i + 1];

    // line comment: -- ... end-of-line
    if (c === "-" && c2 === "-") {
      i += 2;
      while (i < n && s[i] !== "\n") i++;
      buf += " ";
      continue;
    }
    // block comment: /* ... */
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      buf += " ";
      continue;
    }
    // single-quoted string literal
    if (c === "'") {
      buf += c; i++;
      while (i < n) {
        if (s[i] === "\\") { buf += s[i] + (s[i + 1] || ""); i += 2; continue; }
        if (s[i] === "'" && s[i + 1] === "'") { buf += "''"; i += 2; continue; }
        buf += s[i];
        if (s[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    // quoted identifiers: "double" and `backtick`
    if (c === '"' || c === "`") {
      const q = c;
      buf += c; i++;
      while (i < n) {
        if (s[i] === "\\") { buf += s[i] + (s[i + 1] || ""); i += 2; continue; }
        if (s[i] === q && s[i + 1] === q) { buf += q + q; i += 2; continue; }
        buf += s[i];
        if (s[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    // statement separator
    if (c === ";") {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// First keyword of a single (already comment-free) statement, skipping leading
// whitespace and any leading '(' (parenthesized SELECT / UNION forms).
export function leadingKeyword(statement) {
  const t = String(statement || "");
  let j = 0;
  while (j < t.length && (t[j] === "(" || /\s/.test(t[j]))) j++;
  const m = /^[A-Za-z_]+/.exec(t.slice(j));
  return m ? m[0].toUpperCase() : "";
}

// Classify a single statement. category is a coarse label for callers that want
// it; readOnly is the load-bearing flag.
export function classifyStatement(statement) {
  const keyword = leadingKeyword(statement);
  const readOnly = READ_ONLY_LEADERS.has(keyword);
  let category = "other";
  if (readOnly) category = "read";
  else if (["INSERT", "DELETE", "UPDATE"].includes(keyword)) category = "write";
  else if (["CREATE", "ALTER", "DROP", "RENAME", "TRUNCATE", "ATTACH", "DETACH"].includes(keyword)) category = "ddl";
  else if (["SYSTEM", "KILL", "OPTIMIZE", "SET", "USE", "GRANT", "REVOKE", "BACKUP", "RESTORE"].includes(keyword)) category = "admin";
  else if (keyword === "") category = "empty";
  return { keyword, category, readOnly };
}

// Analyze a whole SQL string (which may contain multiple statements).
export function analyzeSql(sql) {
  const statements = splitTopLevel(sql).map((text) => {
    const info = classifyStatement(text);
    return { text, keyword: info.keyword, category: info.category, readOnly: info.readOnly };
  });
  const empty = statements.length === 0;
  return {
    empty,
    multiple: statements.length > 1,
    statements,
    // Read-only only if there is at least one statement and every one reads.
    readOnly: !empty && statements.every((s) => s.readOnly),
  };
}

// Convenience: is the whole input read-only (non-empty, all statements read)?
export function isReadOnlySql(sql) {
  return analyzeSql(sql).readOnly;
}

// Convenience: does the (first) statement return rows, so a FORMAT clause should
// be appended? Equivalent to the old first-word check, but comment/quote safe.
export function isDataQuery(sql) {
  const st = splitTopLevel(sql);
  if (st.length === 0) return false;
  return READ_ONLY_LEADERS.has(leadingKeyword(st[0]));
}
