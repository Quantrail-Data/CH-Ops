// sqlPostProcessor.js — pure, no imports, no db, no network

// A model sometimes wraps its answer in a markdown fence even though the
// system prompt says not to. This removes ONE fence pair wrapping the whole
// response. It does not look for SQL inside — extractSql does that part.
export function stripFences(raw) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z]*\r?\n([\s\S]*?)```$/);
  if (fenced) {
    return fenced[1].trim();
  }
  return trimmed;
}

// Keywords the system prompt allows a response to start with — matches the
// list in buildPrompt.js's SYSTEM_PROMPT (SELECT, WITH ... SELECT, SHOW *, DESCRIBE).
const SQL_START_KEYWORDS = ["SELECT", "WITH", "SHOW", "DESCRIBE"];
const startsWithKeyword = new RegExp(`^(${SQL_START_KEYWORDS.join("|")})\\b`, "i");

// Scans line by line for the first line that looks like real SQL, and drops
// everything before it — prose the model added despite being told not to.
// If no such line exists anywhere, there's nothing to extract.
export function extractSql(raw) {
  const lines = raw.split("\n");

  const startIndex = lines.findIndex((line) => startsWithKeyword.test(line.trim()));

  if (startIndex === -1) {
    return { sql: null, rawIfNoSql: raw.trim() };
  }

  const sql = lines.slice(startIndex).join("\n").trim();
  return { sql, rawIfNoSql: null };
}