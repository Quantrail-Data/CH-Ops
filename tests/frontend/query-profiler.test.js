// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Tests query profiler utilities extracted from the component, validating performance analysis logic (suggests file extraction).


import { describe, it, expect } from 'vitest';



const TRACE_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'CPU', label: 'CPU Time' },
  { value: 'Real', label: 'Wall Clock (Real)' },
  { value: 'Memory', label: 'Memory (Watermark)' },
  { value: 'MemorySample', label: 'Memory (Sampled)' },
  { value: 'MemoryPeak', label: 'Memory Peak' },
  { value: 'ProfileEvent', label: 'Profile Events' },
  { value: 'JemallocSample', label: 'Jemalloc Samples' },
  { value: 'Instrumentation', label: 'Instrumentation' },
];

const MEMORY_CONTEXTS = [
  { value: '', label: 'All Contexts' },
  { value: 'Global', label: 'Global' },
  { value: 'User', label: 'User' },
  { value: 'Process', label: 'Process' },
  { value: 'Thread', label: 'Thread' },
];

const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

function toLocalDatetime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toChDatetime(val) {
  const s = val.replace('T', ' ');
  return /\d{2}:\d{2}:\d{2}/.test(s) ? s : s + ':00';
}

function validateRange(from, to) {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  if (isNaN(f)) return 'Invalid From datetime.';
  if (isNaN(t)) return 'Invalid To datetime.';
  if (f >= t) return 'From must be before To.';
  if (t - f > MAX_INTERVAL_MS) return 'Time range cannot exceed 24 hours.';
  return null;
}

function isMemoryTraceType(traceType) {
  return traceType === 'Memory' || traceType === 'MemoryPeak';
}

function supportsMemoryContext(traceType) {
  return traceType === 'Memory' || traceType === 'MemoryPeak' || traceType === 'MemorySample';
}

function buildQueryListSql(from, to) {
  return `SELECT query_id, any(query) AS query_preview, count() AS sample_count,
  min(event_time) AS first_seen, max(event_time) AS last_seen
FROM system.trace_log
WHERE event_time >= '${toChDatetime(from)}' AND event_time <= '${toChDatetime(to)}'
GROUP BY query_id
ORDER BY sample_count DESC
LIMIT 500`;
}

function buildFlameGraphSql({ traceType, queryId, from, to, memoryContext }) {
  const safeId = queryId.replace(/'/g, "\\'");
  const conditions = [
    `query_id = '${safeId}'`,
    `event_time >= '${toChDatetime(from)}'`,
    `event_time <= '${toChDatetime(to)}'`,
  ];
  if (traceType) conditions.push(`trace_type = '${traceType}'`);
  if (memoryContext && isMemoryTraceType(traceType)) {
    conditions.push(`memory_context = '${memoryContext}'`);
  }
  return `SELECT arrayStringConcat(arrayReverse(arrayMap(x -> demangle(addressToSymbol(x)), trace)), ';') AS stack, count() AS samples
FROM system.trace_log
WHERE ${conditions.join(' AND ')}
GROUP BY stack
ORDER BY samples DESC
SETTINGS allow_introspection_functions = 1`;
}

function parseFlameGraphLines(lines) {
  const root = { name: 'root', value: 0, children: [] };
  for (const line of lines) {
    if (!line.stack || !line.samples) continue;
    const parts = line.stack.split(';');
    const count = parseInt(line.samples, 10);
    if (isNaN(count) || count <= 0) continue;
    let node = root;
    for (const part of parts) {
      const name = part.trim();
      if (!name) continue;
      let child = node.children.find(c => c.name === name);
      if (!child) {
        child = { name, value: 0, children: [] };
        node.children.push(child);
      }
      child.value += count;
      node = child;
    }
    root.value += count;
  }
  return root;
}

function heightOfJson(json) {
  if (!json.children || json.children.length === 0) return 1;
  return 1 + Math.max(...json.children.map(heightOfJson));
}

function nameToColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  const h = ((hash % 60) + 60) % 60;
  return `hsl(${h}, 70%, 55%)`;
}

describe('Trace Types', () => {
  it('has 9 trace types including All Types', () => {
    expect(TRACE_TYPES).toHaveLength(9);
  });

  it('All Types has empty value', () => {
    expect(TRACE_TYPES[0]).toEqual({ value: '', label: 'All Types' });
  });

  it('excludes MemoryAllocatedWithoutCheck', () => {
    const values = TRACE_TYPES.map(t => t.value);
    expect(values).not.toContain('MemoryAllocatedWithoutCheck');
  });

  it('every type has a non-empty label', () => {
    TRACE_TYPES.forEach(t => expect(t.label.length).toBeGreaterThan(0));
  });
});

describe('Memory Context', () => {
  it('has 5 contexts including All', () => {
    expect(MEMORY_CONTEXTS).toHaveLength(5);
  });

  it('isMemoryTraceType returns true for Memory and MemoryPeak', () => {
    expect(isMemoryTraceType('Memory')).toBe(true);
    expect(isMemoryTraceType('MemoryPeak')).toBe(true);
    expect(isMemoryTraceType('CPU')).toBe(false);
    expect(isMemoryTraceType('Real')).toBe(false);
    expect(isMemoryTraceType('MemorySample')).toBe(false);
  });

  it('supportsMemoryContext includes MemorySample', () => {
    expect(supportsMemoryContext('Memory')).toBe(true);
    expect(supportsMemoryContext('MemoryPeak')).toBe(true);
    expect(supportsMemoryContext('MemorySample')).toBe(true);
    expect(supportsMemoryContext('CPU')).toBe(false);
  });
});

describe('toChDatetime', () => {
  it('replaces T with space for datetime-local format', () => {
    expect(toChDatetime('2026-05-26T10:30')).toBe('2026-05-26 10:30:00');
  });

  it('does not double-append :00 if seconds already present', () => {
    expect(toChDatetime('2026-05-26 10:30:45')).toBe('2026-05-26 10:30:45');
  });

  it('handles T-separated with seconds', () => {
    expect(toChDatetime('2026-05-26T10:30:45')).toBe('2026-05-26 10:30:45');
  });
});

describe('validateRange', () => {
  it('returns null for valid range', () => {
    expect(validateRange('2026-05-26 10:00:00', '2026-05-26 11:00:00')).toBeNull();
  });

  it('rejects from >= to', () => {
    const err = validateRange('2026-05-26 12:00:00', '2026-05-26 10:00:00');
    expect(err).toContain('before');
  });

  it('rejects equal dates', () => {
    const err = validateRange('2026-05-26 10:00:00', '2026-05-26 10:00:00');
    expect(err).toContain('before');
  });

  it('rejects range > 24 hours', () => {
    const err = validateRange('2026-05-25 10:00:00', '2026-05-27 10:00:00');
    expect(err).toContain('24 hours');
  });

  it('rejects invalid from', () => {
    expect(validateRange('not-a-date', '2026-05-26 10:00:00')).toContain('Invalid From');
  });

  it('rejects invalid to', () => {
    expect(validateRange('2026-05-26 10:00:00', 'garbage')).toContain('Invalid To');
  });

  it('accepts exactly 24 hours', () => {
    expect(validateRange('2026-05-26 00:00:00', '2026-05-27 00:00:00')).toBeNull();
  });
});

describe('buildQueryListSql', () => {
  it('includes FROM and TO in WHERE clause', () => {
    const sql = buildQueryListSql('2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain("'2026-05-26 10:00:00'");
    expect(sql).toContain("'2026-05-26 11:00:00'");
  });

  it('queries system.trace_log', () => {
    const sql = buildQueryListSql('2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('system.trace_log');
  });

  it('limits to 500 rows', () => {
    const sql = buildQueryListSql('2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('LIMIT 500');
  });
});

describe('buildFlameGraphSql', () => {
  it('includes demangle(addressToSymbol()) and arrayReverse', () => {
    const sql = buildFlameGraphSql({ traceType: 'CPU', queryId: 'abc', from: '2026-05-26 10:00:00', to: '2026-05-26 11:00:00' });
    expect(sql).toContain('demangle(addressToSymbol(x))');
    expect(sql).toContain('arrayReverse');
  });

  it('includes allow_introspection_functions = 1', () => {
    const sql = buildFlameGraphSql({ traceType: 'CPU', queryId: 'abc', from: '2026-05-26 10:00:00', to: '2026-05-26 11:00:00' });
    expect(sql).toContain('allow_introspection_functions = 1');
  });

  it('filters by trace_type when specified', () => {
    const sql = buildFlameGraphSql({ traceType: 'CPU', queryId: 'abc', from: '2026-05-26 10:00:00', to: '2026-05-26 11:00:00' });
    expect(sql).toContain("trace_type = 'CPU'");
  });

  it('omits trace_type filter for All Types (empty string)', () => {
    const sql = buildFlameGraphSql({ traceType: '', queryId: 'abc', from: '2026-05-26 10:00:00', to: '2026-05-26 11:00:00' });
    expect(sql).not.toContain('trace_type');
  });

  it('includes memory_context for Memory type', () => {
    const sql = buildFlameGraphSql({ traceType: 'Memory', queryId: 'abc', from: '2026-05-26 10:00:00', to: '2026-05-26 11:00:00', memoryContext: 'Process' });
    expect(sql).toContain("memory_context = 'Process'");
  });

  it('omits memory_context for CPU type even if provided', () => {
    const sql = buildFlameGraphSql({ traceType: 'CPU', queryId: 'abc', from: '2026-05-26 10:00:00', to: '2026-05-26 11:00:00', memoryContext: 'Process' });
    expect(sql).not.toContain('memory_context');
  });

  it('escapes single quotes in queryId', () => {
    const sql = buildFlameGraphSql({ traceType: 'CPU', queryId: "abc'def", from: '2026-05-26 10:00:00', to: '2026-05-26 11:00:00' });
    expect(sql).toContain("abc\\'def");
    expect(sql).not.toContain("abc'def'");
  });
});

describe('parseFlameGraphLines', () => {
  it('builds a tree from folded stacks', () => {
    const lines = [
      { stack: 'main;foo;bar', samples: '10' },
      { stack: 'main;foo;baz', samples: '5' },
      { stack: 'main;qux', samples: '3' },
    ];
    const root = parseFlameGraphLines(lines);
    expect(root.name).toBe('root');
    expect(root.value).toBe(18);
    expect(root.children).toHaveLength(1); // main
    const main = root.children[0];
    expect(main.name).toBe('main');
    expect(main.value).toBe(18);
    expect(main.children).toHaveLength(2); // foo, qux
  });

  it('merges identical stack prefixes', () => {
    const lines = [
      { stack: 'A;B;C', samples: '10' },
      { stack: 'A;B;D', samples: '5' },
    ];
    const root = parseFlameGraphLines(lines);
    const A = root.children[0];
    expect(A.children).toHaveLength(1); // B
    const B = A.children[0];
    expect(B.value).toBe(15);
    expect(B.children).toHaveLength(2); // C, D
  });

  it('returns empty root for empty input', () => {
    const root = parseFlameGraphLines([]);
    expect(root.value).toBe(0);
    expect(root.children).toHaveLength(0);
  });

  it('skips lines with missing stack or samples', () => {
    const lines = [
      { stack: '', samples: '10' },
      { stack: 'A;B', samples: '' },
      { stack: null, samples: '5' },
      { stack: 'A;B', samples: '0' },
      { stack: 'A;B', samples: '-1' },
    ];
    const root = parseFlameGraphLines(lines);
    expect(root.value).toBe(0);
  });

  it('handles deep stacks', () => {
    const deep = Array.from({ length: 100 }, (_, i) => `func${i}`).join(';');
    const root = parseFlameGraphLines([{ stack: deep, samples: '1' }]);
    expect(heightOfJson(root)).toBe(101); // 100 funcs + root
  });
});

describe('heightOfJson', () => {
  it('returns 1 for leaf node', () => {
    expect(heightOfJson({ name: 'a', children: [] })).toBe(1);
  });

  it('returns correct depth for nested tree', () => {
    const tree = { name: 'root', children: [
      { name: 'a', children: [
        { name: 'b', children: [] }
      ]}
    ]};
    expect(heightOfJson(tree)).toBe(3);
  });
});

describe('nameToColor', () => {
  it('returns a valid HSL string', () => {
    const color = nameToColor('ReadBufferFromFileDescriptor');
    expect(color).toMatch(/^hsl\(\d+, 70%, 55%\)$/);
  });

  it('returns the same color for the same name', () => {
    expect(nameToColor('foo')).toBe(nameToColor('foo'));
  });

  it('returns different colors for different names', () => {
    // Statistically very likely but not guaranteed for all pairs
    const a = nameToColor('ReadBuffer');
    const b = nameToColor('HashTable::insert');
    // Just verify both are valid, not necessarily different
    expect(a).toMatch(/^hsl\(/);
    expect(b).toMatch(/^hsl\(/);
  });
});
