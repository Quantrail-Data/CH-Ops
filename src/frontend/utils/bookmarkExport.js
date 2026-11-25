// Copyright (C) 2026 Quantrail™ Data Private Limited
// bookmarkExport.js - getting saved queries out of CHOps, and back in.
// Contributors - Kathirdhasan, Praveen kumar, Kathir Moorthy

const FORMAT_VERSION = 1;

/** A bookmark, reduced to the fields that are worth carrying between installs. */
function clean(b) {
  const out = { name: String(b?.name ?? "").trim(), sql: String(b?.sql ?? "") };
  if (b?.createdAt) out.createdAt = b.createdAt;
  if (b?.defaults && Object.keys(b.defaults).length) out.defaults = { ...b.defaults };
  return out;
}

// Out

export function toJson(bookmarks) {
  return JSON.stringify(
    {
      version: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      bookmarks: (bookmarks || []).map(clean),
    },
    null,
    2,
  );
}

export function toMarkdown(bookmarks) {
  const parts = ["# CHOps saved queries", ""];
  for (const b of bookmarks || []) {
    const c = clean(b);
    parts.push(`## ${c.name || "Untitled"}`, "");
    if (c.defaults) {
      // Not machine-readable, and not meant to be.
      const pairs = Object.entries(c.defaults)
        .map(([k, v]) => `${k} = ${v}`)
        .join(", ");
      parts.push(`Defaults: ${pairs}`, "");
    }
    // The fence is four backticks, not three, so a query containing a fenced
    // block of its own cannot end the block early.
    parts.push("````sql", c.sql.trimEnd(), "````", "");
  }
  return parts.join("\n");
}

export function toSql(bookmarks) {
  const parts = [];
  for (const b of bookmarks || []) {
    const c = clean(b);
    // A name can contain a newline, and a newline in a -- comment ends it,
    // turning the rest of the name into SQL. Flatten it.
    parts.push(`-- ${c.name.replace(/\s+/g, " ") || "Untitled"}`);
    const body = c.sql.trimEnd().replace(/;+\s*$/, "");
    parts.push(`${body};`, "");
  }
  return parts.join("\n");
}

export const FORMATS = [
  { id: "json", label: "JSON", ext: "json", mime: "application/json", write: toJson,
    hint: "Everything, and the only one that can be imported back" },
  { id: "markdown", label: "Markdown", ext: "md", mime: "text/markdown", write: toMarkdown,
    hint: "For a runbook, a ticket or a wiki" },
  { id: "sql", label: "SQL", ext: "sql", mime: "text/plain", write: toSql,
    hint: "For another tool, or version control" },
];

export function exportFileName(formatId, now = new Date()) {
  const fmt = FORMATS.find((f) => f.id === formatId) || FORMATS[0];
  const stamp = now.toISOString().slice(0, 10);
  return `chops-queries-${stamp}.${fmt.ext}`;
}

/** Hand a string to the browser as a download. */
export function downloadText(filename, text, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Back in

/* Read a JSON export. */
export function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That is not a JSON file. Only the JSON export can be imported." };
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.bookmarks;
  if (!Array.isArray(list)) {
    return { ok: false, error: "No bookmarks found in that file." };
  }
  if (parsed?.version && parsed.version > FORMAT_VERSION) {
    return {
      ok: false,
      error: `That file was written by a newer version of CHOps (format ${parsed.version}).`,
    };
  }

  const bookmarks = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.name ?? "").trim();
    const sql = typeof item.sql === "string" ? item.sql : "";
    // Both are required. An entry with no SQL is not a query, and an entry
    // with no name cannot be told apart from any other.
    if (!name || !sql.trim()) continue;
    bookmarks.push(clean({ ...item, name, sql }));
  }

  if (!bookmarks.length) {
    return { ok: false, error: "That file contains no usable queries." };
  }
  return { ok: true, bookmarks };
}

/** A name not already taken, as "name (2)", "name (3)" and so on. */
export function uniqueName(name, taken) {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
  return `${name} (${Date.now()})`;
}

const sameQuery = (a, b) =>
  a.sql.trim() === b.sql.trim() &&
  JSON.stringify(a.defaults || {}) === JSON.stringify(b.defaults || {});

/* Work out what importing would do, without doing any of it. */
export function planImport(existing, incoming) {
  const byName = new Map((existing || []).map((b) => [b.name, b]));
  const plan = [];
  // Names claimed by earlier entries in this same file, so two incoming
  // queries with one name do not both resolve to the same slot.
  const claimed = new Set(byName.keys());

  for (const raw of incoming || []) {
    const item = clean(raw);
    const match = byName.get(item.name);
    if (!match) {
      plan.push({ incoming: item, existing: null, status: "new" });
      claimed.add(item.name);
      continue;
    }
    if (sameQuery(item, clean(match))) {
      plan.push({ incoming: item, existing: match, status: "identical" });
      continue;
    }
    plan.push({
      incoming: item,
      existing: match,
      status: "conflict",
      // Precomputed so the dialog can show what "keep both" would call it.
      copyName: uniqueName(item.name, claimed),
    });
    claimed.add(uniqueName(item.name, claimed));
  }
  return plan;
}

export const CHOICES = {
  KEEP: "keep", // keep mine, discard the incoming one
  REPLACE: "replace", // take theirs, overwrite mine
  BOTH: "both", // keep mine and add theirs under a new name
};

/* Apply a plan and return the new bookmark array. */
export function applyImport(existing, plan, choices = {}) {
  const out = [...(existing || [])];
  const indexOf = (name) => out.findIndex((b) => b.name === name);

  for (const entry of plan || []) {
    const { incoming, status } = entry;
    if (status === "identical") continue; // nothing to do, by definition
    if (status === "new") {
      out.push(incoming);
      continue;
    }

    switch (choices[incoming.name] || CHOICES.KEEP) {
      case CHOICES.REPLACE: {
        const i = indexOf(incoming.name);
        if (i === -1) out.push(incoming);
        else out[i] = incoming;
        break;
      }
      case CHOICES.BOTH: {
        // Recomputed against the array as it stands, not the name guessed at
        // plan time, because earlier choices may have taken it since.
        out.push({ ...incoming, name: uniqueName(incoming.name, out.map((b) => b.name)) });
        break;
      }
      default:
        break; // KEEP: leave the existing one alone
    }
  }
  return out;
}

/** A one-line summary of what a plan will do, for the dialog. */
export function summarise(plan, choices = {}) {
  let added = 0;
  let replaced = 0;
  let kept = 0;
  let identical = 0;
  for (const e of plan || []) {
    if (e.status === "identical") identical += 1;
    else if (e.status === "new") added += 1;
    else {
      const c = choices[e.incoming.name] || CHOICES.KEEP;
      if (c === CHOICES.REPLACE) replaced += 1;
      else if (c === CHOICES.BOTH) added += 1;
      else kept += 1;
    }
  }
  return { added, replaced, kept, identical };
}
