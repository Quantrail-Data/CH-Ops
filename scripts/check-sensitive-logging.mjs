// check-sensitive-logging.mjs
//
// Scans src/backend and src/frontend for console.* calls that risk printing
// sensitive data (passwords, secrets, tokens, API keys, credentials, or a raw
// error/response object that might carry any of those) to the console, where
// they can end up in server logs, browser devtools history, or a monitoring
// tool's console breadcrumbs.
//
// This is a heuristic line-based scanner, not a full JS parser: it strips
// string-literal contents (so message text like "Invalid password" doesn't
// trigger a false positive) and then checks what's left of each console.*
// call's arguments against two rules:
//   A. a bare error/response identifier passed directly (console.log(err)),
//      instead of a safe field like err.message
//   B. an identifier whose name suggests a secret (password, token, apiKey,
//      encryptedKey, credentials, ...) used somewhere other than a safe
//      accessor like `.message`
//
// A line can be exempted with a trailing `// sensitive-log-ok` comment for
// reviewed, intentional cases.
//
// Run by hand:  bun run check:sensitive-logging
// Runs in CI:   .github/workflows/unit-tests.yaml

import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOTS = ["src/backend", "src/frontend"];
const EXTENSIONS = new Set([".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);
const SKIP_FILE_SUFFIXES = [".generated.js"];

const SUPPRESS_MARKER = "sensitive-log-ok";

const ERROR_IDENTIFIER_RE = /^(err|error|e|ex|exception)$/i;
const SAFE_ACCESSORS = new Set(["message", "stack", "code", "name"]);

const SENSITIVE_NAME_RE =
  /\b(password|passwd|pwd|secret|token|apikey|api_key|encryptedkey|encrypted_key|credentials?|privatekey|private_key|accesskey|access_key|authorization|sessionsecret|session_secret)\w*\b/i;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry))) {
      if (SKIP_FILE_SUFFIXES.some((suffix) => entry.endsWith(suffix))) continue;
      files.push(full);
    }
  }
  return files;
}

// Replace string-literal contents with spaces (same length, so column
// positions are preserved) - keeps quotes/backticks so we can still tell a
// call had a message argument, without matching words that only appear in
// literal text.
function blankStringLiterals(line) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < line.length) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") {
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
        out += ch;
        i++;
        continue;
      }
      out += " ";
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function findConsoleCalls(line) {
  const calls = [];
  const re = /console\.(log|error|warn|info|debug)\s*\(/g;
  let match;
  while ((match = re.exec(line))) {
    const argsStart = match.index + match[0].length;
    let depth = 1;
    let i = argsStart;
    while (i < line.length && depth > 0) {
      if (line[i] === "(") depth++;
      else if (line[i] === ")") depth--;
      i++;
    }
    calls.push({ method: match[1], args: line.slice(argsStart, i - 1) });
  }
  return calls;
}

function splitArgs(argsText) {
  const args = [];
  let depth = 0;
  let current = "";
  for (const ch of argsText) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current);
  return args.map((a) => a.trim()).filter(Boolean);
}

function checkArg(arg) {
  const reasons = [];

  // Rule A: a bare error-like identifier, not narrowed to a safe field.
  const bareIdentifier = arg.match(/^([A-Za-z_$][\w$]*)$/);
  if (bareIdentifier && ERROR_IDENTIFIER_RE.test(bareIdentifier[1])) {
    reasons.push(
      `raw error object '${bareIdentifier[1]}' logged directly - use '${bareIdentifier[1]}.message' instead`,
    );
  }

  // Rule B: an identifier/property chain whose name looks like a secret,
  // unless the access is narrowed down to a safe field (e.g. someErr.message
  // where "someErr" happens to also match - checked on the tail segment).
  const sensitiveMatch = arg.match(SENSITIVE_NAME_RE);
  if (sensitiveMatch) {
    const segments = arg.split(".").map((s) => s.trim());
    const tail = segments[segments.length - 1]?.replace(/[^\w$]/g, "");
    if (!SAFE_ACCESSORS.has(tail)) {
      reasons.push(`looks like a secret value ('${sensitiveMatch[0]}') logged directly`);
    }
  }

  return reasons;
}

function scanFile(filePath) {
  const violations = [];
  const rawLines = readFileSync(filePath, "utf8").split("\n");

  rawLines.forEach((rawLine, idx) => {
    if (rawLine.includes(SUPPRESS_MARKER)) return;
    const line = blankStringLiterals(rawLine);
    for (const call of findConsoleCalls(line)) {
      for (const arg of splitArgs(call.args)) {
        for (const reason of checkArg(arg)) {
          violations.push({ line: idx + 1, code: rawLine.trim(), reason });
        }
      }
    }
  });

  return violations;
}

function main() {
  const files = ROOTS.flatMap((root) => walk(root));
  let total = 0;

  for (const file of files) {
    const violations = scanFile(file);
    if (violations.length === 0) continue;
    total += violations.length;
    console.log(`\n${file}`);
    for (const v of violations) {
      console.log(`  line ${v.line}: ${v.reason}`);
      console.log(`    ${v.code}`);
    }
  }

  if (total > 0) {
    console.log(
      `\nFound ${total} console.* call(s) that may log sensitive data. Fix them, ` +
        `or if reviewed and safe, append "// ${SUPPRESS_MARKER}" to the line.`,
    );
    process.exit(1);
  }

  console.log("No sensitive-looking console.* calls found.");
}

main();
