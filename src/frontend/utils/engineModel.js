// engineModel.js - MergeTree-family engine model and engine-string composer
//
// Three axes compose into the final engine: the merge behavior (which
// MergeTree variant), whether it is replicated, and whether it is distributed.
// BEHAVIORS describes each variant's engine parameters and how the form
// collects them; composeEngine turns the form state into the ENGINE = ...
// string and throws when a required parameter is missing. All pure logic.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

// Each behavior lists its engine parameters, in order, with how the form
// collects them:
//   kind 'col'    -> a single column picker
//   kind 'cols'   -> a multi-column picker, rendered as a (a, b, c) tuple
//   kind 'text'   -> a free text field (for example the Graphite config section)
//   required      -> the form must provide it; the composer throws if missing
//   needs         -> this param is only valid if another param is set
//   colFilter     -> restricts the column picker (for example Int8 for sign)
export const BEHAVIORS = {
  MergeTree: {
    label: 'MergeTree (plain)',
    hint: 'General purpose. No special merge behavior.',
    params: [],
  },
  ReplacingMergeTree: {
    label: 'ReplacingMergeTree (dedup)',
    hint: 'Removes duplicate rows with the same sort key on merge.',
    params: [
      { key: 'ver', kind: 'col', required: false, label: 'Version column (optional)' },
      { key: 'is_deleted', kind: 'col', required: false, needs: 'ver', label: 'Is-deleted column (optional, needs version)' },
    ],
  },
  CoalescingMergeTree: {
    label: 'CoalescingMergeTree (column upsert)',
    hint: 'Keeps the latest non-NULL value per column. Needs version 25.6+.',
    minVersion: [25, 6],
    params: [
      { key: 'columns', kind: 'cols', required: false, label: 'Columns to coalesce (optional; default all non-key)' },
    ],
  },
  SummingMergeTree: {
    label: 'SummingMergeTree (rollup)',
    hint: 'Sums numeric columns with the same sort key on merge.',
    params: [
      { key: 'columns', kind: 'cols', required: false, label: 'Columns to sum (optional; default all numeric non-key)' },
    ],
  },
  AggregatingMergeTree: {
    label: 'AggregatingMergeTree (rollup)',
    hint: 'Combines AggregateFunction columns on merge.',
    params: [],
  },
  CollapsingMergeTree: {
    label: 'CollapsingMergeTree',
    hint: 'Collapses pairs of rows using a sign column (1 / -1).',
    params: [
      { key: 'sign', kind: 'col', required: true, colFilter: 'int8', label: 'Sign column (Int8, required)' },
    ],
  },
  VersionedCollapsingMergeTree: {
    label: 'VersionedCollapsingMergeTree',
    hint: 'Like Collapsing, but tolerant of out-of-order inserts via a version column.',
    params: [
      { key: 'sign', kind: 'col', required: true, colFilter: 'int8', label: 'Sign column (Int8, required)' },
      { key: 'version', kind: 'col', required: true, label: 'Version column (required)' },
    ],
  },
  GraphiteMergeTree: {
    label: 'GraphiteMergeTree (advanced)',
    hint: 'Rolls up Graphite data using a server config section.',
    params: [
      { key: 'config_section', kind: 'text', required: true, label: 'Config section name (required)' },
    ],
  },
};

// Compose the ENGINE = ... string from the form state.
//   form.behavior        - a key of BEHAVIORS
//   form.behaviorParams  - { ver, is_deleted, columns: [...], sign, version, config_section }
//   form.replicated      - boolean
//   form.zk_path, form.replica - used when replicated
export function composeEngine(form) {
  const def = BEHAVIORS[form.behavior];
  if (!def) throw new Error('Unknown engine behavior: ' + form.behavior);

  const behaviorParams = [];
  for (const p of def.params) {
    const v = form.behaviorParams?.[p.key];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (p.required) throw new Error(`${form.behavior} requires "${p.key}".`);
      continue;
    }
    if (p.needs && !form.behaviorParams?.[p.needs]) {
      throw new Error(`"${p.key}" needs "${p.needs}" to be set.`);
    }
    if (p.kind === 'cols') behaviorParams.push(`(${v.join(', ')})`);
    else if (p.kind === 'text') behaviorParams.push(`'${v}'`);
    else behaviorParams.push(v);
  }

  let name = form.behavior;
  const head = [];
  if (form.replicated) {
    name = 'Replicated' + form.behavior;
    head.push(`'${form.zk_path}'`, `'${form.replica}'`);
  }

  return `${name}(${[...head, ...behaviorParams].join(', ')})`;
}

// Default Keeper path using macros, following the common convention.
export function defaultZkPath(database, table) {
  return `/clickhouse/tables/{shard}/${database}/${table}`;
}

// Build the Distributed engine string for the outer table.
export function composeDistributed({ cluster, database, localTable, shardingKey }) {
  const parts = [cluster, database, localTable];
  if (shardingKey) parts.push(shardingKey);
  return `Distributed(${parts.join(', ')})`;
}

// Sharding-key presets offered in the form.
export const SHARDING_PRESETS = [
  { label: 'Random (even spread)', value: 'rand()' },
  { label: 'Hash of a column (consistent by key)', value: 'cityHash64(__COL__)' },
  { label: 'A column directly', value: '__COL__' },
];
