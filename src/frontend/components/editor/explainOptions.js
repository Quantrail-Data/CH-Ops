// explainOptions.js - the EXPLAIN settings offered under the dropdown.
//
// Declarative on purpose: each option says which EXPLAIN types it belongs to,
// and the row is a filter over this list. These settings do not all apply to
// every type, and showing an option that does nothing is worse than hiding it.
//
// Copyright (C) 2026 Quantrail Data Private Limited

// The dropdown values that behave as PLAN. Plain "EXPLAIN" is PLAN under
// another name, which is easy to miss: there are NINE entries in that dropdown,
// not seven.


export function isVersion267OrLater(versionString) {
  try {
    const parts = String(versionString).split(".");
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
    if (major > 26) return true;
    return major === 26 && minor >= 7;
  } catch {
    return false;
  }
}


export const PLAN_TYPES = ["EXPLAIN", "EXPLAIN PLAN"];

export const ANALYZE_TYPE = ["EXPLAIN ANALYZE"];


export const PLAN_AND_ANALYZE = [...PLAN_TYPES, ...ANALYZE_TYPE];


export const EXPLAIN_OPTIONS = [
  {
    key: "indexes",
    label: "Indexes",
    appliesTo: PLAN_AND_ANALYZE,
    serverDefault: { "EXPLAIN ANALYZE": 1 },
    help: "Which indexes the query actually used, and how much each one cut. MergeTree only.",
  },
  {
    key: "projections",
    label: "Projections",
    appliesTo: PLAN_AND_ANALYZE,
    help: "Each analyzed projection, and whether it was used for reading or only for filtering.",
  },
  {
    key: "distributed",
    label: "Distributed",
    appliesTo: PLAN_TYPES,
    help: "The plans that will run on remote nodes. Turns off Pretty, Compact and Actions.",
  },
  {
    key: "pretty",
    label: "Pretty",
    appliesTo: PLAN_AND_ANALYZE,
    serverDefault: { "EXPLAIN ANALYZE": 1, planFrom267: 1 },
    help: "Line-drawing tree, expressions in SQL notation.",
  },
  {
    key: "compact",
    label: "Compact",
    appliesTo: PLAN_AND_ANALYZE,
    serverDefault: { "EXPLAIN ANALYZE": 1, planFrom267: 1 },
    help: "Hides Expression steps and detailed action info. Only has an effect when Actions is on.",
  },
  {
    key: "sorting",
    label: "Sorting",
    appliesTo: PLAN_AND_ANALYZE,
    help: "The sort description for each step producing sorted output.",
  },
  {
    key: "actions",
    label: "Actions",
    appliesTo: PLAN_AND_ANALYZE,
    serverDefault: { "EXPLAIN ANALYZE": 1, planFrom267: 1 },
    help: "Detailed step actions. Verbose.",
  },
  {
    key: "processors",
    label: "Per processor",
    appliesTo: ANALYZE_TYPE,
    uiDefault: 1,
    help: "Time spread across each stage's processors. A large gap between median and max means load skew.",
  },
  {
    key: "matches",
    label: "Join match counts",
    appliesTo: ANALYZE_TYPE,
    help: "Exact matched rows, match rate and fanout for each side of a join. Adds work inside the join, so the times it reports run slightly slower than without it.",
  },
  {
    key: "run_query_tree_passes",
    label: "Analyzer passes",
    appliesTo: ["EXPLAIN SYNTAX"],
    help: "Shows the query after the analyzer has rewritten it.",
  },
  {
    key: "header",
    label: "Header",
    appliesTo: PLAN_AND_ANALYZE,
    advanced: true,
    help: "Output column names and types for each step.",
  },
  {
    key: "description",
    label: "Description",
    appliesTo: PLAN_AND_ANALYZE,
    serverDefault: { "*": 1 },
    advanced: true,
    help: "Step descriptions. On by default, untick to shorten the output.",
  },
  {
    key: "input_headers",
    label: "Input headers",
    appliesTo: PLAN_AND_ANALYZE,
    advanced: true,
    help: "Input columns for each step. Mainly for debugging header mismatches.",
  },
  {
    key: "column_structure",
    label: "Column structure",
    appliesTo: PLAN_AND_ANALYZE,
    advanced: true,
    help: "Column structure in headers beyond name and type. Mainly for debugging.",
  },
];


export function serverDefaultFor(option, explainType, serverVersion) {
  const d = option.serverDefault;
  if (!d) return 0;
  if (d["*"] !== undefined) return d["*"];
  if (d[explainType] !== undefined) return d[explainType];
  if (d.planFrom267 !== undefined && PLAN_TYPES.includes(explainType)) {
    return isVersion267OrLater(serverVersion) ? d.planFrom267 : 0;
  }
  return 0;
}


export function initialTicked(explainType, serverVersion) {
  const out = {};
  for (const o of optionsFor(explainType)) {
    out[o.key] =
      o.uiDefault !== undefined
        ? !!o.uiDefault
        : !!serverDefaultFor(o, explainType, serverVersion);
  }
  return out;
}

// Settings that MUST accompany an option, sent as request settings rather than
// appended to the user's SQL.
//
// From ClickHouse v25.9 onwards, indexes only produces sensible output with
// these two. CHOps targets 26.3, so this always applies. Without them the
// output is not missing, it is MISLEADING: it looks like an answer, and anyone
// reading it would draw the wrong conclusion about which index helped.
export const REQUIRED_SETTINGS = {
  indexes: {
    use_query_condition_cache: 0,
    use_skip_indexes_on_data_read: 0,
  },
};

export function optionsFor(explainType) {
  return EXPLAIN_OPTIONS.filter((o) => o.appliesTo.includes(explainType));
}

// Compose "EXPLAIN indexes = 1, pretty = 1" from the ticked options.
export function composeStatement(explainType, ticked, serverVersion) {
  const parts = optionsFor(explainType)
    .filter((o) => {
      const def = serverDefaultFor(o, explainType, serverVersion);
      const want = ticked[o.key] === undefined ? def : ticked[o.key] ? 1 : 0;
      return want !== def;
    })
    .map((o) => `${o.key} = ${ticked[o.key] ? 1 : 0}`);
  if (!parts.length) return explainType;
  return `${explainType} ${parts.join(", ")}`;
}

// The request settings implied by the ticked options.
export function settingsFor(ticked, explainType, serverVersion) {
  let out = {};
  for (const o of optionsFor(explainType)) {
    if (!REQUIRED_SETTINGS[o.key]) continue;
    const inForce =
      ticked[o.key] !== undefined
        ? !!ticked[o.key]
        : !!serverDefaultFor(o, explainType, serverVersion);
    if (inForce) out = { ...out, ...REQUIRED_SETTINGS[o.key] };
  }
  return out;
}



export function basicOptionsFor(explainType) {
  return optionsFor(explainType).filter((o) => !o.advanced);
}

export function advancedOptionsFor(explainType) {
  return optionsFor(explainType).filter((o) => o.advanced);
}

