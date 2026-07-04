// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Unit tests validating tree chart data transformations, layout sizes, node depths, and leaf counts.

import { describe, it, expect } from 'vitest';
import { countLeaves, maxDepth, countAll, treeSize, treeSizeTB, treeSeries } from '../../src/frontend/utils/treeChart.js';

// Sample trees for testing
const leaf = { name: 'A' };
const small = { name: 'root', children: [{ name: 'a' }, { name: 'b' }] };
const deep = {
  name: 'db',
  children: [
    { name: 'table1', children: [
      { name: 'idx1' },
      { name: 'idx2' },
      { name: 'idx3' },
    ]},
    { name: 'table2', children: [
      { name: 'idx4', children: [{ name: 'sub1' }, { name: 'sub2' }] },
    ]},
  ],
};

describe('countLeaves', () => {
  it('returns 0 for null', () => expect(countLeaves(null)).toBe(0));
  it('returns 1 for a single node', () => expect(countLeaves(leaf)).toBe(1));
  it('returns 2 for two-leaf tree', () => expect(countLeaves(small)).toBe(2));
  it('counts leaves in a deep tree', () => expect(countLeaves(deep)).toBe(5));
  it('handles empty children array', () => expect(countLeaves({ name: 'x', children: [] })).toBe(1));
});

describe('maxDepth', () => {
  it('returns 0 for a single node', () => expect(maxDepth(leaf)).toBe(0));
  it('returns 1 for one level', () => expect(maxDepth(small)).toBe(1));
  it('returns 3 for deepest branch', () => expect(maxDepth(deep)).toBe(3));
  it('handles null children', () => expect(maxDepth({ name: 'x', children: null })).toBe(0));
});

describe('countAll', () => {
  it('returns 0 for null', () => expect(countAll(null)).toBe(0));
  it('returns 1 for a leaf', () => expect(countAll(leaf)).toBe(1));
  it('returns 3 for root + 2 children', () => expect(countAll(small)).toBe(3));
  it('counts all nodes in deep tree', () => expect(countAll(deep)).toBe(9));
});

describe('treeSize (LR)', () => {
  it('returns minimum dimensions for a leaf', () => {
    const s = treeSize(leaf);
    expect(s.width).toBeGreaterThanOrEqual(500);
    expect(s.height).toBeGreaterThanOrEqual(350);
  });
  it('scales height with leaf count', () => {
    // Need enough leaves to exceed the 350px minimum
    const wide = { name: 'r', children: Array.from({ length: 20 }, (_, i) => ({ name: `n${i}` })) };
    const s = treeSize(wide);
    expect(s.height).toBeGreaterThan(350);
  });
  it('scales width with depth', () => {
    const s = treeSize(deep);
    expect(s.width).toBeGreaterThan(500);
  });
});

describe('treeSizeTB (top-to-bottom)', () => {
  it('returns minimum dimensions for a leaf', () => {
    const s = treeSizeTB(leaf);
    expect(s.width).toBeGreaterThanOrEqual(600);
    expect(s.height).toBeGreaterThanOrEqual(400);
  });
  it('scales width with leaf count', () => {
    const sSmall = treeSizeTB(small);
    const sDeep = treeSizeTB(deep);
    expect(sDeep.width).toBeGreaterThan(sSmall.width);
  });
  it('scales height with depth', () => {
    const sDeep = treeSizeTB(deep);
    expect(sDeep.height).toBeGreaterThan(400);
  });
});

describe('treeSeries', () => {
  it('returns a tree series config', () => {
    const s = treeSeries(small, true);
    expect(s.type).toBe('tree');
    expect(s.data).toEqual([small]);
    expect(s.symbolSize).toBe(12);
  });
  it('uses dark colors when isDark=true', () => {
    const s = treeSeries(small, true);
    expect(s.label.color).toBe('#cbd5e1');
  });
  it('uses light colors when isDark=false', () => {
    const s = treeSeries(small, false);
    expect(s.label.color).toBe('#1a1a2e');
  });
  it('calculates left margin from root label length', () => {
    const longRoot = { name: 'very_long_database_name', children: [{ name: 'x' }] };
    const shortRoot = { name: 'db', children: [{ name: 'x' }] };
    const sLong = treeSeries(longRoot, true);
    const sShort = treeSeries(shortRoot, true);
    expect(sLong.left).toBeGreaterThan(sShort.left);
  });
  it('caps right margin at 280px', () => {
    const longLabel = { name: 'r', children: [{ name: 'a'.repeat(200) }] };
    const s = treeSeries(longLabel, true);
    expect(s.right).toBeLessThanOrEqual(280);
  });
  it('sets edgeForkPosition', () => {
    const s = treeSeries(small, false);
    expect(s.edgeForkPosition).toBe('60%');
  });
});
