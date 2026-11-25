// ddlPrompt.js - Schema Studio DDL prompt and deterministic guards
//
// Builds the production prompt for CREATE TABLE generation and post-processes
// the AI response: parse JSON defensively, then apply conservative, advisory
// guarantees so the model cannot omit or break the non-negotiable parts. The
// guards never rewrite the AI's SQL surgically (fragile); they return advisory
// data and a safe fallback the route injects only when something is clearly
// missing. The editable DDL plus the server-side EXPLAIN AST check catch the
// rest. All functions here are pure and have no external dependencies.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

// System instruction, shared across providers.
export const SYSTEM_PROMPT = `You are an expert ClickHouse data engineer. You design optimal CREATE TABLE statements.

Follow these rules exactly:

1. COLUMNS AND TYPES: Use only the columns provided, with the exact ClickHouse types given. Do not invent columns or change a type unless the input marks it as overridden by the user.

2. ORDER BY (sort key): This is the most important decision. Order columns from lowest to highest cardinality. Put columns the user frequently filters on near the front. If a date or datetime column exists and is filtered, place it early. Never put a high cardinality unique column first. If nothing else is known, use the lowest cardinality columns.

3. CODECS: Choose per column compression codecs from the data characteristics:
   - Monotonic or slowly changing integers and timestamps: CODEC(Delta, ZSTD(LEVEL)) or CODEC(DoubleDelta, ZSTD(LEVEL)).
   - Floats that change slowly: CODEC(Gorilla, ZSTD(LEVEL)).
   - Low cardinality strings: wrap the type as LowCardinality(String) instead of a codec.
   - Everything else: CODEC(ZSTD(LEVEL)).
   Use the compression LEVEL provided by the user.

4. ENGINE: Use exactly the engine described in the input, including replicated and distributed settings and their parameters. Do not change the engine family.

5. PARTITION BY: If a date or datetime column exists and the data spans time, partition monthly with toYYYYMM(col). Otherwise do not partition. Never partition by a high cardinality column. Keep partitions coarse.

6. TTL and SETTINGS: Apply the user's TTL intent if given. Add index_granularity only if you have a specific reason.

7. OUTPUT: Return a single JSON object and nothing else. No markdown, no prose outside the JSON. Shape:
   {
     "ddl": "the CREATE TABLE statement",
     "ddl_local": "only when distributed: the underlying local table CREATE statement",
     "order_by_rationale": "one sentence explaining the sort key",
     "notes": "one or two sentences on notable choices"
   }
   When the table is distributed, "ddl" is the Distributed table and "ddl_local" is the local table.`;

// Build the user message: hand the model clean JSON so it cannot misread input.
export function buildUserMessage(bundle) {
  return JSON.stringify(bundle, null, 2);
}

// Parse the AI response defensively: strip code fences, then extract the JSON
// object. If no JSON is found, treat the whole response as the DDL.
export function parseAiResponse(raw) {
  let t = String(raw || "").trim();
  t = t
    .replace(/^```(?:json|sql)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return { ddl: t };
}

// Advisory: which String columns are low cardinality enough to suggest wrapping
// in LowCardinality. Operates on the known column list, not the DDL text.
export function lowCardinalitySuggestions(columns, stats, sampleRows) {
  const out = [];
  for (const c of columns || []) {
    const s = stats?.[c.name];
    if (!s || c.overridden) continue;
    const isString = /String/.test(c.type) && !/LowCardinality/.test(c.type);
    const ratio = sampleRows > 0 ? Number(s.approx_distinct) / sampleRows : 1;
    if (isString && ratio < 0.1) out.push(c.name);
  }
  return out;
}

// Detect whether a DDL already has an ORDER BY clause.
export function hasOrderBy(ddl) {
  return /\bORDER\s+BY\b/i.test(ddl || "");
}

// Build a fallback ORDER BY from frequently filtered columns first, then by
// ascending cardinality. Returns a tuple expression like "(a, b, c)".
export function fallbackOrderBy(columns, stats, frequentlyFiltered = []) {
  const ranked = [...(columns || [])]
    .filter((c) => !/MATERIALIZED|ALIAS|EPHEMERAL/i.test(c.type))
    .map((c) => ({
      name: c.name,
      card: Number(stats?.[c.name]?.approx_distinct ?? Infinity),
      filtered: frequentlyFiltered.includes(c.name),
    }))
    .sort((a, b) => {
      if (a.filtered !== b.filtered) return a.filtered ? -1 : 1;
      return a.card - b.card;
    });
  const keys = ranked.slice(0, 3).map((r) => r.name);
  return keys.length ? `(${keys.join(", ")})` : "tuple()";
}

// Guard for the create route: allow only a single CREATE TABLE statement.
export function isCreateTableOnly(sql) {
  const trimmed = String(sql || "")
    .trim()
    .replace(/;\s*$/, "");
  if (trimmed.includes(";")) return false; // single statement only
  const upper = trimmed.toUpperCase();
  return (
    upper.startsWith("CREATE TABLE") ||
    upper.startsWith("CREATE OR REPLACE TABLE")
  );
}

// AI evaluation (review + suggested rewrite)
// The DDL is composed deterministically from the user's choices. The AI reviews
// that DDL given the columns, statistics, and intent, returns advisory feedback,
// and may return a full corrected CREATE TABLE the user can choose to apply.

export const EVAL_SYSTEM_PROMPT = `


You are an expert ClickHouse SQL and schema reviewer.


Review the EXACT CREATE TABLE statement provided by the user.


Your tasks:


Validate ClickHouse syntax.
Validate ClickHouse semantic and engine rules.
Identify correctness, compatibility, and meaningful performance risks.
Suggest practical improvements.
ALWAYS return a complete suggested_ddl.
SOURCE OF TRUTH


Use this priority:


Actual ClickHouse execution error/result, if provided.
Target ClickHouse version/settings, if provided.
Official ClickHouse behavior.
General ClickHouse knowledge.


If an actual ClickHouse error is provided, treat it as authoritative. The final DDL MUST resolve that error.


Never invent ClickHouse syntax, settings, rules, or version behavior.


EXACT DDL


Analyze the user's exact SQL.


Never:


substitute or reinterpret columns/clauses
silently add/remove clauses
review a modified version instead of the original


Preserve the user's intent.


VALIDITY VS DESIGN


Distinguish:


SYNTAX_ERROR
SEMANTIC_ERROR
POTENTIAL_PROBLEM
DESIGN_RECOMMENDATION
INSUFFICIENT_CONTEXT


A valid DDL may still have design concerns.


Never present a recommendation as a ClickHouse requirement.


MERGETREE


For MergeTree-family engines, check:


ENGINE
ORDER BY
PRIMARY KEY
PARTITION BY
SAMPLE BY
TTL
indexes
projections
codecs
relevant settings


Rules:


ENGINE = MergeTree() is valid syntax.
An explicit PRIMARY KEY must be a prefix of ORDER BY.
PRIMARY KEY does not enforce uniqueness.
Missing PRIMARY KEY is not an error.
Missing PARTITION BY is not an error.
NULLABLE KEYS


Evaluate the actual key expression, referenced columns, effective allow_nullable_key, and ClickHouse version.


Do not assume:


Nullable keys are always forbidden.
ifNull()/coalesce() automatically makes a MergeTree key valid.
a traditional relational PRIMARY KEY must be physically non-null.


If the server reports:


Sorting key contains nullable columns, but merge tree setting allow_nullable_key is disabled


classify it as SEMANTIC_ERROR and return a DDL that actually resolves it.


Do not change Nullable(T) to T unless the available information supports that semantic change.


Observed null_fraction = 0 does not make a Nullable column non-nullable.


DESIGN REVIEW


Evaluate ORDER BY, PRIMARY KEY, partitioning, data types, nullability, TTL, indexes, projections, and codecs.


Consider workload, cardinality, data distribution, query patterns, table size, retention, and compression.


Do not use simplistic rules such as:


always put time first
always put high-cardinality first
always put low-cardinality first
always add partitioning/indexes


If the correct design depends on missing information, say so instead of guessing.


SUGGESTED_DDL


suggested_ddl MUST NEVER be empty.


It must always contain the COMPLETE CREATE TABLE statement.


Rules:


If DDL is invalid → return corrected full DDL.
If a clearly justified improvement exists → return full improved DDL.
If design depends on missing context → return the original full DDL unchanged and explain the limitation in suggestions.
Never return a diff or partial SQL.
Never return a DDL that reproduces a known ClickHouse error.
Every change in suggested_ddl must be explained in suggestions.
Never silently remove or change unrelated clauses.
OUTPUT


Return ONLY valid JSON:


{
"assessment": "One or two sentences describing validity and overall design quality.",
"suggestions": [
"Specific actionable corrections, improvements, or missing information."
],
"warnings": [
"Correctness, compatibility, semantic, or meaningful performance risks."
],
"suggested_ddl": "The COMPLETE CREATE TABLE statement."
}


Output rules:


No markdown.
No code fences.
No text outside JSON.
Do not invent facts or workload information.
Do not claim server verification unless an actual server result/error was provided.


`;

// Build the user message for evaluation from a review payload.
export function buildEvalMessage(payload) {
  return JSON.stringify(payload, null, 2);
}

// Parse the evaluation response into { assessment, suggestions, warnings }.
export function parseEvalResponse(raw) {
  let t = String(raw || "").trim();
  t = t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  let obj = {};
  if (start >= 0 && end > start) {
    try {
      obj = JSON.parse(t.slice(start, end + 1));
    } catch {
      obj = {};
    }
  }
  return {
    assessment: typeof obj.assessment === "string" ? obj.assessment : "",
    suggestions: Array.isArray(obj.suggestions)
      ? obj.suggestions.filter((s) => typeof s === "string")
      : [],
    warnings: Array.isArray(obj.warnings)
      ? obj.warnings.filter((s) => typeof s === "string")
      : [],
    suggested_ddl:
      typeof obj.suggested_ddl === "string" ? obj.suggested_ddl : "",
  };
}
