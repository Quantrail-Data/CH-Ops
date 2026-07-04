/**
 * alertScheduler.test.js - Unit tests for alert scheduler logic
 *
 * Tests the core scheduling and evaluation logic extracted from
 * alertScheduler.js. Covers threshold evaluation operators (gt, gte,
 * lt, lte, eq, neq), parallel node result aggregation, per-rule node
 * filtering, and parallel rule evaluation. Verifies that multiple rules
 * run concurrently and that node failures don't block other nodes or rules.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect } from 'bun:test';

// Extracted evalThreshold logic from alertScheduler.js
function evalThreshold(value, operator, threshold) {
  switch (operator) {
    case 'gt':  return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt':  return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq':  return value === threshold;
    case 'neq': return value !== threshold;
    default:    return false;
  }
}

// Extracted parallel node aggregation logic
async function aggregateNodeResults(nodePromises) {
  const results = await Promise.allSettled(nodePromises);
  let maxValue = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.rows?.length > 0) {
      const v = parseFloat(Object.values(r.value.rows[0])[0]) || 0;
      if (Math.abs(v) > Math.abs(maxValue)) maxValue = v;
    }
  }
  return maxValue;
}

describe('evalThreshold', () => {
  it('gt: 10 > 5 = true', () => expect(evalThreshold(10, 'gt', 5)).toBe(true));
  it('gt: 5 > 10 = false', () => expect(evalThreshold(5, 'gt', 10)).toBe(false));
  it('gte: 5 >= 5 = true', () => expect(evalThreshold(5, 'gte', 5)).toBe(true));
  it('lt: 3 < 5 = true', () => expect(evalThreshold(3, 'lt', 5)).toBe(true));
  it('lte: 5 <= 5 = true', () => expect(evalThreshold(5, 'lte', 5)).toBe(true));
  it('eq: 5 === 5 = true', () => expect(evalThreshold(5, 'eq', 5)).toBe(true));
  it('eq: 5 === 6 = false', () => expect(evalThreshold(5, 'eq', 6)).toBe(false));
  it('neq: 5 !== 6 = true', () => expect(evalThreshold(5, 'neq', 6)).toBe(true));
  it('unknown operator = false', () => expect(evalThreshold(5, 'xyz', 5)).toBe(false));
});

describe('Parallel node aggregation', () => {
  it('takes max value from multiple fulfilled nodes', async () => {
    const promises = [
      Promise.resolve({ rows: [{ v: 10 }] }),
      Promise.resolve({ rows: [{ v: 25 }] }),
      Promise.resolve({ rows: [{ v: 15 }] }),
    ];
    expect(await aggregateNodeResults(promises)).toBe(25);
  });

  it('ignores rejected nodes', async () => {
    const promises = [
      Promise.resolve({ rows: [{ v: 10 }] }),
      Promise.reject(new Error('node down')),
      Promise.resolve({ rows: [{ v: 20 }] }),
    ];
    expect(await aggregateNodeResults(promises)).toBe(20);
  });

  it('returns 0 when all nodes fail', async () => {
    const promises = [
      Promise.reject(new Error('fail')),
      Promise.reject(new Error('fail')),
    ];
    expect(await aggregateNodeResults(promises)).toBe(0);
  });

  it('handles empty rows', async () => {
    const promises = [
      Promise.resolve({ rows: [] }),
      Promise.resolve({ rows: [{ v: 7 }] }),
    ];
    expect(await aggregateNodeResults(promises)).toBe(7);
  });

  it('runs all promises concurrently (not sequentially)', async () => {
    const starts = [];
    const makePromise = (val, delay) => new Promise(resolve => {
      starts.push(Date.now());
      setTimeout(() => resolve({ rows: [{ v: val }] }), delay);
    });
    const promises = [makePromise(1, 50), makePromise(2, 50), makePromise(3, 50)];
    await aggregateNodeResults(promises);
    // All should start within 10ms of each other (parallel), not 50ms apart (sequential)
    const maxGap = Math.max(...starts) - Math.min(...starts);
    expect(maxGap).toBeLessThan(20);
  });
});

describe('Per-rule node filtering', () => {
  // Simulates the scheduler's node filtering logic from evaluateRule
  function filterNodes(rule, allNodes) {
    let nodes = allNodes;
    if (rule.nodes) {
      try {
        const selected = JSON.parse(rule.nodes);
        if (Array.isArray(selected) && selected.length > 0) {
          nodes = allNodes.filter(n => selected.includes(n.host));
        }
      } catch {}
    }
    return nodes;
  }

  const allNodes = [
    { host: 'node-1', port: 8123 },
    { host: 'node-2', port: 8123 },
    { host: 'node-3', port: 8123 },
  ];

  it('returns all nodes when rule.nodes is null', () => {
    const result = filterNodes({ nodes: null }, allNodes);
    expect(result.length).toBe(3);
  });

  it('returns all nodes when rule.nodes is undefined', () => {
    const result = filterNodes({}, allNodes);
    expect(result.length).toBe(3);
  });

  it('returns all nodes when rule.nodes is empty array JSON', () => {
    const result = filterNodes({ nodes: '[]' }, allNodes);
    expect(result.length).toBe(3);
  });

  it('filters to specific nodes when rule.nodes has hostnames', () => {
    const result = filterNodes({ nodes: '["node-1","node-3"]' }, allNodes);
    expect(result.length).toBe(2);
    expect(result.map(n => n.host)).toEqual(['node-1', 'node-3']);
  });

  it('filters to single node', () => {
    const result = filterNodes({ nodes: '["node-2"]' }, allNodes);
    expect(result.length).toBe(1);
    expect(result[0].host).toBe('node-2');
  });

  it('returns empty if selected nodes do not match any cluster nodes', () => {
    const result = filterNodes({ nodes: '["node-99"]' }, allNodes);
    expect(result.length).toBe(0);
  });

  it('handles invalid JSON in nodes field gracefully (falls back to all)', () => {
    const result = filterNodes({ nodes: 'not-json' }, allNodes);
    expect(result.length).toBe(3);
  });

  it('selected nodes still run in parallel', async () => {
    const starts = [];
    const selected = filterNodes({ nodes: '["node-1","node-3"]' }, allNodes);
    const promises = selected.map(n => new Promise(resolve => {
      starts.push(Date.now());
      setTimeout(() => resolve({ rows: [{ v: 1 }] }), 50);
    }));
    await Promise.allSettled(promises);
    expect(starts.length).toBe(2);
    const maxGap = Math.max(...starts) - Math.min(...starts);
    expect(maxGap).toBeLessThan(20);
  });
});

describe('Parallel rule evaluation', () => {
  // Simulates the scheduler pattern: multiple rules evaluated in parallel,
  // each querying multiple nodes in parallel
  async function evaluateRulesParallel(rules, nodeQueryFn) {
    return Promise.allSettled(
      rules.map(async (rule) => {
        const nodeResults = await Promise.allSettled(
          rule.nodes.map(node => nodeQueryFn(node, rule.sql))
        );
        let maxValue = 0;
        for (const r of nodeResults) {
          if (r.status === 'fulfilled' && r.value?.rows?.length > 0) {
            const v = parseFloat(Object.values(r.value.rows[0])[0]) || 0;
            if (Math.abs(v) > Math.abs(maxValue)) maxValue = v;
          }
        }
        return { ruleId: rule.id, value: maxValue };
      })
    );
  }

  it('evaluates multiple rules concurrently', async () => {
    const starts = [];
    const rules = [
      { id: 1, sql: 'SELECT 1', nodes: ['a', 'b'] },
      { id: 2, sql: 'SELECT 2', nodes: ['a', 'b'] },
      { id: 3, sql: 'SELECT 3', nodes: ['a', 'b'] },
    ];
    const nodeQueryFn = (node, sql) => new Promise(resolve => {
      starts.push(Date.now());
      setTimeout(() => resolve({ rows: [{ v: parseInt(sql.split(' ')[1]) }] }), 50);
    });
    const results = await evaluateRulesParallel(rules, nodeQueryFn);
    // 3 rules * 2 nodes = 6 starts, all within a tight window (parallel)
    expect(starts.length).toBe(6);
    const maxGap = Math.max(...starts) - Math.min(...starts);
    expect(maxGap).toBeLessThan(20);
    // All should be fulfilled
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    expect(results.map(r => r.value.value).sort()).toEqual([1, 2, 3]);
  });

  it('isolates rule failures - one rule error does not block others', async () => {
    const rules = [
      { id: 1, sql: 'SELECT 10', nodes: ['a'] },
      { id: 2, sql: 'FAIL', nodes: ['a'] },
      { id: 3, sql: 'SELECT 30', nodes: ['a'] },
    ];
    const nodeQueryFn = (node, sql) => {
      if (sql === 'FAIL') return Promise.reject(new Error('query error'));
      return Promise.resolve({ rows: [{ v: parseInt(sql.split(' ')[1]) }] });
    };
    const results = await evaluateRulesParallel(rules, nodeQueryFn);
    // All rules complete (allSettled never rejects). Rule 2's node failed,
    // so it gets value 0 (no fulfilled results), but it doesn't block rules 1 and 3.
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    expect(results[0].value.value).toBe(10);
    expect(results[1].value.value).toBe(0);  // all nodes failed → 0
    expect(results[2].value.value).toBe(30);
  });

  it('total time is ~max(rule durations), not sum', async () => {
    const rules = [
      { id: 1, sql: 'SELECT 1', nodes: ['a'] },
      { id: 2, sql: 'SELECT 2', nodes: ['a'] },
      { id: 3, sql: 'SELECT 3', nodes: ['a'] },
    ];
    const nodeQueryFn = (node, sql) => new Promise(resolve => {
      setTimeout(() => resolve({ rows: [{ v: 1 }] }), 50);
    });
    const t0 = Date.now();
    await evaluateRulesParallel(rules, nodeQueryFn);
    const elapsed = Date.now() - t0;
    // 3 rules at 50ms each, parallel should be ~50-80ms, not 150ms+
    expect(elapsed).toBeLessThan(120);
  });
});
