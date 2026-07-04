// schema-studio-engine.test.js - Tests for the Schema Studio engine composer
//
// Exercises composeEngine across the MergeTree-family behaviors, the replicated
// variants, the required-parameter and dependency guards, and the distributed
// and Keeper-path helpers. Pure logic, no DOM.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect } from 'vitest';
import {
  BEHAVIORS,
  composeEngine,
  defaultZkPath,
  composeDistributed,
  SHARDING_PRESETS,
} from '../../src/frontend/utils/engineModel.js';

describe('composeEngine: plain behaviors', () => {
  it('MergeTree composes with no parameters', () => {
    expect(composeEngine({ behavior: 'MergeTree' })).toBe('MergeTree()');
  });
  it('AggregatingMergeTree composes with no parameters', () => {
    expect(composeEngine({ behavior: 'AggregatingMergeTree' })).toBe('AggregatingMergeTree()');
  });
  it('throws on an unknown behavior', () => {
    expect(() => composeEngine({ behavior: 'NotARealEngine' })).toThrow(/Unknown engine behavior/);
  });
});

describe('composeEngine: optional and dependent parameters', () => {
  it('ReplacingMergeTree with no version is bare', () => {
    expect(composeEngine({ behavior: 'ReplacingMergeTree', behaviorParams: {} }))
      .toBe('ReplacingMergeTree()');
  });
  it('ReplacingMergeTree with a version column', () => {
    expect(composeEngine({ behavior: 'ReplacingMergeTree', behaviorParams: { ver: 'updated_at' } }))
      .toBe('ReplacingMergeTree(updated_at)');
  });
  it('ReplacingMergeTree is_deleted needs ver', () => {
    expect(() => composeEngine({
      behavior: 'ReplacingMergeTree',
      behaviorParams: { is_deleted: 'deleted' },
    })).toThrow(/needs "ver"/);
  });
  it('ReplacingMergeTree ver + is_deleted', () => {
    expect(composeEngine({
      behavior: 'ReplacingMergeTree',
      behaviorParams: { ver: 'updated_at', is_deleted: 'deleted' },
    })).toBe('ReplacingMergeTree(updated_at, deleted)');
  });
});

describe('composeEngine: required parameters', () => {
  it('CollapsingMergeTree throws without sign', () => {
    expect(() => composeEngine({ behavior: 'CollapsingMergeTree', behaviorParams: {} }))
      .toThrow(/requires "sign"/);
  });
  it('CollapsingMergeTree with sign', () => {
    expect(composeEngine({ behavior: 'CollapsingMergeTree', behaviorParams: { sign: 'sign' } }))
      .toBe('CollapsingMergeTree(sign)');
  });
  it('VersionedCollapsingMergeTree needs sign and version', () => {
    expect(() => composeEngine({ behavior: 'VersionedCollapsingMergeTree', behaviorParams: { sign: 'sign' } }))
      .toThrow(/requires "version"/);
    expect(composeEngine({ behavior: 'VersionedCollapsingMergeTree', behaviorParams: { sign: 'sign', version: 'v' } }))
      .toBe('VersionedCollapsingMergeTree(sign, v)');
  });
  it('GraphiteMergeTree quotes its config section', () => {
    expect(composeEngine({ behavior: 'GraphiteMergeTree', behaviorParams: { config_section: 'graphite_rollup' } }))
      .toBe("GraphiteMergeTree('graphite_rollup')");
  });
});

describe('composeEngine: column tuples', () => {
  it('SummingMergeTree renders a column tuple', () => {
    expect(composeEngine({ behavior: 'SummingMergeTree', behaviorParams: { columns: ['a', 'b'] } }))
      .toBe('SummingMergeTree((a, b))');
  });
  it('SummingMergeTree with an empty column list is bare', () => {
    expect(composeEngine({ behavior: 'SummingMergeTree', behaviorParams: { columns: [] } }))
      .toBe('SummingMergeTree()');
  });
});

describe('composeEngine: replicated variants', () => {
  it('prefixes Replicated and inserts the keeper path + replica', () => {
    expect(composeEngine({
      behavior: 'MergeTree',
      replicated: true,
      zk_path: '/clickhouse/tables/{shard}/db/t',
      replica: '{replica}',
    })).toBe("ReplicatedMergeTree('/clickhouse/tables/{shard}/db/t', '{replica}')");
  });
  it('keeps behavior params after the replication head', () => {
    expect(composeEngine({
      behavior: 'ReplacingMergeTree',
      behaviorParams: { ver: 'updated_at' },
      replicated: true,
      zk_path: '/p',
      replica: '{replica}',
    })).toBe("ReplicatedReplacingMergeTree('/p', '{replica}', updated_at)");
  });
});

describe('helpers', () => {
  it('defaultZkPath follows the shard/db/table convention', () => {
    expect(defaultZkPath('analytics', 'events')).toBe('/clickhouse/tables/{shard}/analytics/events');
  });
  it('composeDistributed without a sharding key', () => {
    expect(composeDistributed({ cluster: 'main', database: 'db', localTable: 't_local' }))
      .toBe('Distributed(main, db, t_local)');
  });
  it('composeDistributed with a sharding key', () => {
    expect(composeDistributed({ cluster: 'main', database: 'db', localTable: 't_local', shardingKey: 'rand()' }))
      .toBe('Distributed(main, db, t_local, rand())');
  });
  it('SHARDING_PRESETS expose label/value pairs with a column placeholder', () => {
    expect(SHARDING_PRESETS.length).toBe(3);
    expect(SHARDING_PRESETS.some((p) => p.value.includes('__COL__'))).toBe(true);
  });
  it('BEHAVIORS exposes the eight documented variants', () => {
    expect(Object.keys(BEHAVIORS)).toContain('CoalescingMergeTree');
    expect(Object.keys(BEHAVIORS).length).toBe(8);
  });
});
