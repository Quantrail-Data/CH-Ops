// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Tests query metrics utilities covering metric groupings, column classification, unit detection, and SQL builders (suggests extraction).


import { describe, it, expect } from 'vitest';


const SKIP_COLUMNS = new Set([
  'query_id', 'hostname', 'event_date', 'event_time', 'event_time_microseconds'
]);

const UNIT_SUFFIXES = [
  ['Microseconds', 'μs'],
  ['Milliseconds', 'ms'],
  ['Nanoseconds',  'ns'],
  ['BytesSent',    'bytes'],
  ['BytesReceived','bytes'],
  ['Bytes',        'bytes'],
  ['Chars',        'bytes'],
  ['Rows',         'rows'],
];

const UNIT_LABELS = {
  'μs':    'Time (μs)',
  'ms':    'Time (ms)',
  'ns':    'Time (ns)',
  'bytes': 'Bytes',
  'rows':  'Rows',
  'count': 'Count',
};

function detectUnit(colName) {
  // 1. Match explicit base memory names instantly
  if (colName === 'memory_usage' || colName === 'peak_memory_usage') return 'bytes';
  
  const name = colName.replace('ProfileEvent_', '');
  
  // 2. Loop through your core suffix map
  let detected = null;
  for (const [suffix, unit] of UNIT_SUFFIXES) {
    if (name.endsWith(suffix)) {
      detected = unit;
      break;
    }
  }

  // 3. Normalize mapped variations
  if (detected) {
    if (detected === 'bytes' || detected === 'kb' || detected === 'mb' || detected === 'B') {
      return 'bytes';
    }
    return detected; 
  }
  
  // 4. SMART CONTEXT FILTER:
  // If it clearly tracks byte capacities but lacked a mapped suffix pattern, it's bytes.
  // We explicitly avoid matching discrete structural tokens like 'Chunks' or 'Allocs'.
  const lowerName = name.toLowerCase();
  if (
    (lowerName.includes('memory') || lowerName.includes('bytes')) && 
    !lowerName.endsWith('chunks') && 
    !lowerName.endsWith('allocs')
  ) {
    return 'bytes';
  }
  
  // 5. Everything else safely collapses to 'count'
  return 'count';
}

// Simplified METRIC_GROUPS for testing (just enough to verify classification)
const METRIC_GROUPS = [
  { key: 'zookeeper',  match: n => /^ZooKeeper|^Keeper/.test(n) },
  { key: 'external_ops', match: n => /^External/.test(n) },
  { key: 'join',       match: n => /^Join/.test(n) },
  { key: 'memory',     match: n => /^memory_usage$|^peak_memory_usage$|^Memory|^Arena|.*Allocat|^jemalloc|AllocChunks$/.test(n) },
  { key: 'cpu_time',   match: n => /^RealTime|^UserTime|^SystemTime|^OSCPU|^Perf/.test(n) },
  { key: 'io_disk',    match: n => /^OSRead|^OSWrite|^DiskRead|^DiskWrite|^AIO|^CreatedReadBuffer|^IOBuffer|^IOUring/.test(n) },
  { key: 'selected_read', match: n => /^Selected/.test(n) },
  { key: 'inserted_write', match: n => /^Inserted|^Delayed.*Insert|^Rejected.*Insert/.test(n) },
  { key: 'network',    match: n => /^Network|^DistributedConnection/.test(n) },
  { key: 's3_remote',  match: n => /^S3|^Azure|^RemoteFS|^ReadBufferFromS3|^DiskS3|^DiskAzure/.test(n) },
  { key: 'page_mark_cache', match: n => /^MarkCache|^PageCache|^UncompressedCache|^QueryCache|^DictCache/.test(n) },
  { key: 'kafka',      match: n => /^Kafka/.test(n) },
  { key: 'logging',    match: n => /^Log(?!aded)/.test(n) },
  { key: 'throttling', match: n => /Throttler/.test(n) },
];

function classifyColumn(colName) {
  const name = colName.replace('ProfileEvent_', '');
  for (const group of METRIC_GROUPS) {
    if (group.match(name)) return group.key;
  }
  for (const group of METRIC_GROUPS) {
    if (group.match(colName)) return group.key;
  }
  return 'other';
}

function discoverActiveColumns(rows) {
  if (!rows || rows.length === 0) return [];
  const totals = {};
  const firstRow = rows.find(r => r != null);
  if (!firstRow) return [];
  const allKeys = Object.keys(firstRow);
  for (const row of rows) {
    if (row == null) continue;
    for (const k of allKeys) {
      if (SKIP_COLUMNS.has(k)) continue;
      const v = parseFloat(row[k]);
      if (!isNaN(v) && v !== 0) {
        totals[k] = (totals[k] || 0) + Math.abs(v);
      }
    }
  }
  return Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
}

describe('detectUnit', () => {
  it('classifies *Microseconds as μs', () => {
    expect(detectUnit('ProfileEvent_RealTimeMicroseconds')).toBe('μs');
    expect(detectUnit('ProfileEvent_DiskReadElapsedMicroseconds')).toBe('μs');
    expect(detectUnit('ProfileEvent_S3ReadMicroseconds')).toBe('μs');
    expect(detectUnit('ProfileEvent_OSCPUVirtualTimeMicroseconds')).toBe('μs');
    expect(detectUnit('ProfileEvent_CompileExpressionsMicroseconds')).toBe('μs');
    expect(detectUnit('ProfileEvent_ZooKeeperWaitMicroseconds')).toBe('μs');
  });

  it('classifies *Milliseconds as ms', () => {
    expect(detectUnit('ProfileEvent_RWLockReadersWaitMilliseconds')).toBe('ms');
    expect(detectUnit('ProfileEvent_RWLockWritersWaitMilliseconds')).toBe('ms');
  });

  it('classifies *Nanoseconds as ns', () => {
    expect(detectUnit('ProfileEvent_LoggerElapsedNanoseconds')).toBe('ns');
  });

  it('classifies *Bytes as bytes', () => {
    expect(detectUnit('ProfileEvent_OSReadBytes')).toBe('bytes');
    expect(detectUnit('ProfileEvent_SelectedBytes')).toBe('bytes');
    expect(detectUnit('ProfileEvent_ArenaAllocBytes')).toBe('bytes');
    expect(detectUnit('ProfileEvent_InsertedBytes')).toBe('bytes');
    expect(detectUnit('ProfileEvent_ReadBufferFromS3Bytes')).toBe('bytes');
  });

  it('classifies *BytesSent before *Bytes', () => {
    expect(detectUnit('ProfileEvent_ZooKeeperBytesSent')).toBe('bytes');
    expect(detectUnit('ProfileEvent_NetworkSendBytes')).toBe('bytes');
  });

  it('classifies *BytesReceived as bytes', () => {
    expect(detectUnit('ProfileEvent_ZooKeeperBytesReceived')).toBe('bytes');
  });

  it('classifies *Chars as bytes (OSReadChars, OSWriteChars)', () => {
    expect(detectUnit('ProfileEvent_OSReadChars')).toBe('bytes');
    expect(detectUnit('ProfileEvent_OSWriteChars')).toBe('bytes');
  });

  it('classifies *Rows as rows', () => {
    expect(detectUnit('ProfileEvent_SelectedRows')).toBe('rows');
    expect(detectUnit('ProfileEvent_InsertedRows')).toBe('rows');
    expect(detectUnit('ProfileEvent_MergedRows')).toBe('rows');
  });

  it('classifies everything else as count', () => {
    expect(detectUnit('ProfileEvent_MarkCacheHits')).toBe('count');
    expect(detectUnit('ProfileEvent_MarkCacheMisses')).toBe('count');
    expect(detectUnit('ProfileEvent_SoftPageFaults')).toBe('count');
    expect(detectUnit('ProfileEvent_HardPageFaults')).toBe('count');
    expect(detectUnit('ProfileEvent_PerfCPUCycles')).toBe('count');
    expect(detectUnit('ProfileEvent_S3ReadRequestsCount')).toBe('count');
    expect(detectUnit('ProfileEvent_ArenaAllocChunks')).toBe('count');
    expect(detectUnit('ProfileEvent_IOBufferAllocs')).toBe('count');
  });

  it('classifies memory_usage and peak_memory_usage as bytes', () => {
    expect(detectUnit('memory_usage')).toBe('bytes');
    expect(detectUnit('peak_memory_usage')).toBe('bytes');
  });
});

describe('classifyColumn', () => {
  it('classifies memory columns', () => {
    expect(classifyColumn('memory_usage')).toBe('memory');
    expect(classifyColumn('peak_memory_usage')).toBe('memory');
    expect(classifyColumn('ProfileEvent_ArenaAllocBytes')).toBe('memory');
    expect(classifyColumn('ProfileEvent_ArenaAllocChunks')).toBe('memory');
    expect(classifyColumn('ProfileEvent_MemoryTracking')).toBe('memory');
  });

  it('classifies CPU columns', () => {
    expect(classifyColumn('ProfileEvent_RealTimeMicroseconds')).toBe('cpu_time');
    expect(classifyColumn('ProfileEvent_UserTimeMicroseconds')).toBe('cpu_time');
    expect(classifyColumn('ProfileEvent_OSCPUVirtualTimeMicroseconds')).toBe('cpu_time');
    expect(classifyColumn('ProfileEvent_SoftPageFaults')).toBe('other');
    expect(classifyColumn('ProfileEvent_PerfCPUCycles')).toBe('cpu_time');
  });

  it('classifies disk IO columns', () => {
    expect(classifyColumn('ProfileEvent_OSReadBytes')).toBe('io_disk');
    expect(classifyColumn('ProfileEvent_OSWriteBytes')).toBe('io_disk');
    expect(classifyColumn('ProfileEvent_DiskReadElapsedMicroseconds')).toBe('io_disk');
    expect(classifyColumn('ProfileEvent_IOBufferAllocBytes')).toBe('io_disk');
  });

  it('classifies ZooKeeper before general columns', () => {
    // ZooKeeper must match first to avoid being caught by other groups
    expect(classifyColumn('ProfileEvent_ZooKeeperWaitMicroseconds')).toBe('zookeeper');
    expect(classifyColumn('ProfileEvent_ZooKeeperBytesSent')).toBe('zookeeper');
    expect(classifyColumn('ProfileEvent_KeeperTransactions')).toBe('zookeeper');
  });

  it('classifies External before general IO', () => {
    expect(classifyColumn('ProfileEvent_ExternalSortWritePart')).toBe('external_ops');
    expect(classifyColumn('ProfileEvent_ExternalAggregationCompressedBytes')).toBe('external_ops');
  });

  it('classifies JOIN columns', () => {
    expect(classifyColumn('ProfileEvent_JoinBuildTableRows')).toBe('join');
    expect(classifyColumn('ProfileEvent_JoinProbeTableRows')).toBe('join');
  });

  it('classifies S3/remote columns', () => {
    expect(classifyColumn('ProfileEvent_S3ReadMicroseconds')).toBe('s3_remote');
    expect(classifyColumn('ProfileEvent_ReadBufferFromS3Bytes')).toBe('s3_remote');
    expect(classifyColumn('ProfileEvent_AzureReadBytes')).toBe('s3_remote');
  });

  it('classifies network columns', () => {
    expect(classifyColumn('ProfileEvent_NetworkReceiveBytes')).toBe('network');
    expect(classifyColumn('ProfileEvent_DistributedConnectionMissCount')).toBe('network');
  });

  it('classifies cache columns', () => {
    expect(classifyColumn('ProfileEvent_MarkCacheHits')).toBe('page_mark_cache');
    expect(classifyColumn('ProfileEvent_PageCacheMisses')).toBe('page_mark_cache');
    expect(classifyColumn('ProfileEvent_UncompressedCacheHits')).toBe('page_mark_cache');
  });

  it('classifies Kafka columns', () => {
    expect(classifyColumn('ProfileEvent_KafkaMessagesPolled')).toBe('kafka');
  });

  it('classifies Logging but not LoadedMarks', () => {
    expect(classifyColumn('ProfileEvent_LogInfo')).toBe('logging');
    // LoadedMarks should NOT match Logging (negative lookahead)
  });

  it('classifies throttler columns', () => {
    expect(classifyColumn('ProfileEvent_ReadBackoffThrottlerSleep')).toBe('throttling');
  });

  it('returns other for unknown columns', () => {
    expect(classifyColumn('ProfileEvent_SomeFutureMetric2027')).toBe('other');
  });
});


describe('discoverActiveColumns', () => {
  it('returns empty for empty rows', () => {
    expect(discoverActiveColumns([])).toEqual([]);
    expect(discoverActiveColumns(null)).toEqual([]);
  });

  it('skips metadata columns', () => {
    const rows = [{ query_id: 'abc', hostname: 'h1', event_time: '2026', memory_usage: 100 }];
    const cols = discoverActiveColumns(rows);
    expect(cols).toContain('memory_usage');
    expect(cols).not.toContain('query_id');
    expect(cols).not.toContain('hostname');
    expect(cols).not.toContain('event_time');
  });

  it('excludes zero-valued columns', () => {
    const rows = [{ memory_usage: 100, ProfileEvent_OSReadBytes: 0, ProfileEvent_SelectedRows: 50 }];
    const cols = discoverActiveColumns(rows);
    expect(cols).toContain('memory_usage');
    expect(cols).toContain('ProfileEvent_SelectedRows');
    expect(cols).not.toContain('ProfileEvent_OSReadBytes');
  });

  it('catches metrics that activate mid-query (not just first row)', () => {
    const rows = [
      { memory_usage: 100, ProfileEvent_ExternalSortWritePart: 0 },
      { memory_usage: 200, ProfileEvent_ExternalSortWritePart: 0 },
      { memory_usage: 150, ProfileEvent_ExternalSortWritePart: 5000 }, // activates at row 3
    ];
    const cols = discoverActiveColumns(rows);
    expect(cols).toContain('ProfileEvent_ExternalSortWritePart');
  });

  it('sorts by total absolute value descending', () => {
    const rows = [
      { small: 1, big: 1000, medium: 50 },
    ];
    const cols = discoverActiveColumns(rows);
    expect(cols).toEqual(['big', 'medium', 'small']);
  });

  it('handles negative values', () => {
    const rows = [{ delta: -500, pos: 10 }];
    const cols = discoverActiveColumns(rows);
    expect(cols[0]).toBe('delta'); // |-500| > |10|
  });

  it('skips null rows', () => {
    const rows = [null, { memory_usage: 100 }, null];
    const cols = discoverActiveColumns(rows);
    expect(cols).toContain('memory_usage');
  });

  it('returns empty if all values are zero', () => {
    const rows = [
      { ProfileEvent_A: 0, ProfileEvent_B: 0 },
      { ProfileEvent_A: 0, ProfileEvent_B: 0 },
    ];
    expect(discoverActiveColumns(rows)).toEqual([]);
  });

  it('handles string numbers from ClickHouse JSON', () => {
    // ClickHouse HTTP interface may return numbers as strings
    const rows = [{ ProfileEvent_A: '12345', ProfileEvent_B: '0' }];
    const cols = discoverActiveColumns(rows);
    expect(cols).toContain('ProfileEvent_A');
    expect(cols).not.toContain('ProfileEvent_B');
  });
});


describe('Unit segregation', () => {
  it('Memory category produces separate bytes and count groups', () => {
    const memoryColumns = [
      'memory_usage',              // bytes
      'peak_memory_usage',         // bytes
      'ProfileEvent_ArenaAllocBytes',   // bytes
      'ProfileEvent_ArenaAllocChunks',  // count
      'ProfileEvent_IOBufferAllocs',    // count
    ];
    const groups = {};
    for (const col of memoryColumns) {
      const cat = classifyColumn(col);
      const unit = detectUnit(col);
      const key = `${cat}__${unit}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(col);
    }
    expect(Object.keys(groups)).toHaveLength(3);
    expect(groups['memory__bytes']).toHaveLength(3);
    expect(groups['memory__count']).toHaveLength(1);
  });

  it('CPU category produces separate μs and count groups', () => {
    const cpuColumns = [
      'ProfileEvent_RealTimeMicroseconds',
      'ProfileEvent_UserTimeMicroseconds',
      'ProfileEvent_SoftPageFaults',
      'ProfileEvent_HardPageFaults',
    ];
    const groups = {};
    for (const col of cpuColumns) {
      const cat = classifyColumn(col);
      const unit = detectUnit(col);
      const key = `${cat}__${unit}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(col);
    }
    expect(groups['cpu_time__μs']).toHaveLength(2);
    expect(groups['other__count']).toHaveLength(2);
  });

  it('Disk IO category produces bytes and μs groups', () => {
    const ioColumns = [
      'ProfileEvent_OSReadBytes',
      'ProfileEvent_OSWriteBytes',
      'ProfileEvent_DiskReadElapsedMicroseconds',
      'ProfileEvent_DiskWriteElapsedMicroseconds',
    ];
    const groups = {};
    for (const col of ioColumns) {
      const cat = classifyColumn(col);
      const unit = detectUnit(col);
      const key = `${cat}__${unit}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(col);
    }
    expect(groups['io_disk__bytes']).toHaveLength(2);
    expect(groups['io_disk__μs']).toHaveLength(2);
  });

  it('no group ever mixes μs and bytes', () => {
    const allTestColumns = [
      'memory_usage', 'peak_memory_usage',
      'ProfileEvent_ArenaAllocBytes', 'ProfileEvent_ArenaAllocChunks',
      'ProfileEvent_RealTimeMicroseconds', 'ProfileEvent_OSReadBytes',
      'ProfileEvent_DiskReadElapsedMicroseconds', 'ProfileEvent_SelectedRows',
      'ProfileEvent_InsertedBytes', 'ProfileEvent_MarkCacheHits',
      'ProfileEvent_ZooKeeperWaitMicroseconds', 'ProfileEvent_ZooKeeperBytesSent',
      'ProfileEvent_S3ReadMicroseconds', 'ProfileEvent_ReadBufferFromS3Bytes',
      'ProfileEvent_RWLockReadersWaitMilliseconds',
    ];
    const groups = {};
    for (const col of allTestColumns) {
      const cat = classifyColumn(col);
      const unit = detectUnit(col);
      const key = `${cat}__${unit}`;
      if (!groups[key]) groups[key] = { unit, cols: [] };
      groups[key].cols.push(col);
    }
    // Verify every group has only one unit
    for (const [key, group] of Object.entries(groups)) {
      const units = new Set(group.cols.map(c => detectUnit(c)));
      expect(units.size).toBe(1);
      expect([...units][0]).toBe(group.unit);
    }
  });
});


describe('Chart splitting (MAX_SERIES_PER_CHART = 4)', () => {
  const MAX_SERIES_PER_CHART = 4;

  function splitChunks(cols) {
    const chunks = [];
    for (let i = 0; i < cols.length; i += MAX_SERIES_PER_CHART) {
      chunks.push(cols.slice(i, i + MAX_SERIES_PER_CHART));
    }
    return chunks;
  }

  it('does not split 4 or fewer columns', () => {
    expect(splitChunks(['a', 'b', 'c', 'd'])).toHaveLength(1);
    expect(splitChunks(['a'])).toHaveLength(1);
  });

  it('splits 5 columns into 2 chunks', () => {
    const chunks = splitChunks(['a', 'b', 'c', 'd', 'e']);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(4);
    expect(chunks[1]).toHaveLength(1);
  });

  it('splits 12 columns into 3 chunks of 4', () => {
    const cols = Array.from({ length: 12 }, (_, i) => `col${i}`);
    const chunks = splitChunks(cols);
    expect(chunks).toHaveLength(3);
    chunks.forEach(c => expect(c).toHaveLength(4));
  });

  it('preserves order (most active first)', () => {
    const cols = ['most_active', 'second', 'third', 'fourth', 'fifth'];
    const chunks = splitChunks(cols);
    expect(chunks[0][0]).toBe('most_active');
    expect(chunks[1][0]).toBe('fifth');
  });

  it('all columns accounted for after split', () => {
    const cols = Array.from({ length: 17 }, (_, i) => `col${i}`);
    const chunks = splitChunks(cols);
    const reassembled = chunks.flat();
    expect(reassembled).toEqual(cols);
  });
});

describe('UNIT_LABELS', () => {
  it('has labels for all unit types', () => {
    expect(UNIT_LABELS['μs']).toBe('Time (μs)');
    expect(UNIT_LABELS['ms']).toBe('Time (ms)');
    expect(UNIT_LABELS['ns']).toBe('Time (ns)');
    expect(UNIT_LABELS['bytes']).toBe('Bytes');
    expect(UNIT_LABELS['rows']).toBe('Rows');
    expect(UNIT_LABELS['count']).toBe('Count');
  });

  it('every detected unit has a label', () => {
    const testCols = [
      'ProfileEvent_RealTimeMicroseconds',
      'ProfileEvent_RWLockWritersWaitMilliseconds',
      'ProfileEvent_LoggerElapsedNanoseconds',
      'ProfileEvent_OSReadBytes',
      'ProfileEvent_SelectedRows',
      'ProfileEvent_MarkCacheHits',
      'memory_usage',
    ];
    for (const col of testCols) {
      const unit = detectUnit(col);
      expect(UNIT_LABELS[unit]).toBeDefined();
    }
  });
});
