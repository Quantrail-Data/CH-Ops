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
export const PLAN_TYPES = ["EXPLAIN", "EXPLAIN PLAN"];

export const EXPLAIN_OPTIONS = [
  {
    key: "indexes",
    label: "Indexes",
    appliesTo: PLAN_TYPES,
    default: false,
    help: "Which indexes the query actually used, and how much each one cut. MergeTree only.",
  },
  {
    key: "projections",
    label: "Projections",
    appliesTo: PLAN_TYPES,
    default: false,
    help: "Each analyzed projection, and whether it was used for reading or only for filtering.",
  },
  {
    key: "distributed",
    label: "Distributed",
    appliesTo: PLAN_TYPES,
    default: false,
    help: "The plans that will run on remote nodes.",
  },
  {
    key: "pretty",
    label: "Pretty",
    appliesTo: PLAN_TYPES,
    default: true,
    help: "Line-drawing tree, expressions in SQL notation.",
  },
  {
    key: "compact",
    label: "Compact",
    appliesTo: PLAN_TYPES,
    default: true,
    help: "Hides Expression steps. Pairs with Pretty.",
  },
  {
    key: "sorting",
    label: "Sorting",
    appliesTo: PLAN_TYPES,
    default: false,
    help: "The sort description for each step producing sorted output.",
  },
  {
    key: "actions",
    label: "Actions",
    appliesTo: PLAN_TYPES,
    default: false,
    help: "Detailed step actions. Verbose.",
  },
  {
    key: "run_query_tree_passes",
    label: "Analyzer passes",
    appliesTo: ["EXPLAIN SYNTAX"],
    default: false,
    help: "Shows the query after the analyzer has rewritten it.",
  },
];

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
export function composeStatement(explainType, ticked) {
  const opts = optionsFor(explainType)
    .filter((o) => ticked[o.key])
    .map((o) => `${o.key} = 1`);
  if (!opts.length) return explainType;
  return `${explainType} ${opts.join(", ")}`;
}

// The request settings implied by the ticked options.
export function settingsFor(ticked) {
  let out = {};
  for (const [key, on] of Object.entries(ticked)) {
    if (on && REQUIRED_SETTINGS[key]) out = { ...out, ...REQUIRED_SETTINGS[key] };
  }
  return out;
}
