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
  let t = String(raw || '').trim();
  t = t.replace(/^```(?:json|sql)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
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
  return /\bORDER\s+BY\b/i.test(ddl || '');
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
  return keys.length ? `(${keys.join(', ')})` : 'tuple()';
}

// Guard for the create route: allow only a single CREATE TABLE statement.
export function isCreateTableOnly(sql) {
  const trimmed = String(sql || '').trim().replace(/;\s*$/, '');
  if (trimmed.includes(';')) return false; // single statement only
  const upper = trimmed.toUpperCase();
  return upper.startsWith('CREATE TABLE') || upper.startsWith('CREATE OR REPLACE TABLE');
}

// AI evaluation (review + suggested rewrite)
// The DDL is composed deterministically from the user's choices. The AI reviews
// that DDL given the columns, statistics, and intent, returns advisory feedback,
// and may return a full corrected CREATE TABLE the user can choose to apply.

export const EVAL_SYSTEM_PROMPT = `You are an expert ClickHouse data engineer reviewing a proposed CREATE TABLE statement.

You are given the columns, sampled statistics, the design intent, and the exact DDL the user has composed. Assess whether the DDL is sound and how it could be improved.

Consider, among other things:
- The sort key (ORDER BY): is the column order sensible (low to high cardinality, frequently filtered columns first)?
- Whether a separate PRIMARY KEY would help, and whether it is a valid prefix of ORDER BY.
- Partitioning: is it coarse and reasonable, or missing or too granular?
- Per column types and codecs: low cardinality strings, delta or double delta for monotonic values, and so on.
- TTL, sampling, indexes, and projections where relevant.

Return a single JSON object and nothing else, with this shape:
{
  "assessment": "one or two sentences on the overall quality",
  "suggestions": ["specific, actionable suggestions"],
  "warnings": ["correctness or performance risks, if any"],
  "suggested_ddl": "the FULL corrected CREATE TABLE statement that applies your suggestions - the complete statement, not a diff. Use an empty string if the DDL is already optimal and needs no change."
}`;

// Build the user message for evaluation from a review payload.
export function buildEvalMessage(payload) {
  return JSON.stringify(payload, null, 2);
}

// Parse the evaluation response into { assessment, suggestions, warnings }.
export function parseEvalResponse(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  let obj = {};
  if (start >= 0 && end > start) {
    try { obj = JSON.parse(t.slice(start, end + 1)); } catch { obj = {}; }
  }
  return {
    assessment: typeof obj.assessment === 'string' ? obj.assessment : '',
    suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.filter((s) => typeof s === 'string') : [],
    warnings: Array.isArray(obj.warnings) ? obj.warnings.filter((s) => typeof s === 'string') : [],
    suggested_ddl: typeof obj.suggested_ddl === 'string' ? obj.suggested_ddl : '',
  };
}
