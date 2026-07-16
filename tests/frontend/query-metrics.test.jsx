// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Tests query metrics utilities covering metric groupings, column classification, unit detection, and SQL builders (suggests extraction).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

const runQueryMock = vi.fn();
const toastSuccessMock = vi.fn();
const baseChartOptionMock = vi.fn(() => ({
  toolbox: { feature: { saveAsImage: { show: true } } },
}));
const useSearchParamsMock = vi.fn(() => [new URLSearchParams('')]);

vi.mock('../../src/frontend/utils/api.js', () => ({
  runQuery: (...args) => runQueryMock(...args),
}));

vi.mock('../../src/frontend/utils/echarts.js', () => ({
  baseChartOption: (...args) => baseChartOptionMock(...args),
}));

vi.mock('../../src/frontend/components/layout/Toast.jsx', () => ({
  useToast: () => ({ success: (...args) => toastSuccessMock(...args) }),
}));

vi.mock('../../src/frontend/components/layout/ChartCard.jsx', () => ({
  default: ({ title, option, height }) => (
    <div data-testid="chart-card">
      <div>{title}</div>
      <div data-testid="chart-height">{String(height)}</div>
      <div data-testid="chart-series-count">{String(option?.series?.length ?? 0)}</div>
    </div>
  ),
}));

vi.mock('react-router-dom', async () => {
  const mod = await vi.importActual('react-router-dom');
  return {
    ...mod,
    useSearchParams: () => useSearchParamsMock(),
  };
});

import QueryMetrics from '../../src/frontend/components/profiler/QueryMetrics.jsx';

const SKIP_COLUMNS = new Set([
  'query_id',
  'hostname',
  'event_date',
  'event_time',
  'event_time_microseconds',
]);

const UNIT_SUFFIXES = [
  ['Microseconds', 'μs'],
  ['Milliseconds', 'ms'],
  ['Nanoseconds', 'ns'],
  ['BytesSent', 'bytes'],
  ['BytesReceived', 'bytes'],
  ['Bytes', 'bytes'],
  ['Chars', 'bytes'],
  ['Rows', 'rows'],
];

const UNIT_LABELS = {
  μs: 'Time (μs)',
  ms: 'Time (ms)',
  ns: 'Time (ns)',
  bytes: 'Bytes',
  rows: 'Rows',
  count: 'Count',
};

function detectUnit(colName) {
  if (colName === 'memory_usage' || colName === 'peak_memory_usage') return 'bytes';
  const name = colName.replace('ProfileEvent_', '');
  let detected = null;
  for (const [suffix, unit] of UNIT_SUFFIXES) {
    if (name.endsWith(suffix)) {
      detected = unit;
      break;
    }
  }
  if (detected) {
    if (detected === 'bytes' || detected === 'kb' || detected === 'mb' || detected === 'B') {
      return 'bytes';
    }
    return detected;
  }
  const lowerName = name.toLowerCase();
  if (
    (lowerName.includes('memory') || lowerName.includes('bytes')) &&
    !lowerName.endsWith('chunks') &&
    !lowerName.endsWith('allocs')
  ) {
    return 'bytes';
  }
  return 'count';
}

const METRIC_GROUPS = [
  { key: 'throttling', match: (n) => /Throttler/.test(n) },
  { key: 'zookeeper', match: (n) => /^ZooKeeper|^Keeper/.test(n) },
  { key: 'external_ops', match: (n) => /^External/.test(n) },
  { key: 'join', match: (n) => /^Join/.test(n) },
  {
    key: 'memory',
    match: (n) =>
      /^memory_usage$|^peak_memory_usage$|^Memory|^Arena|.*Allocat|^jemalloc|AllocChunks$/.test(n),
  },
  {
    key: 'cpu_time',
    match: (n) =>
      /^RealTime|^UserTime|^SystemTime|^OSCPU|^Perf|^SoftPageFault|^HardPageFault/.test(n),
  },
  {
    key: 'io_disk',
    match: (n) =>
      /^OSRead|^OSWrite|^DiskRead|^DiskWrite|^AIO|^CreatedReadBuffer|^IOBuffer|^IOUring|^SchedulerIO/.test(n),
  },
  { key: 'selected_read', match: (n) => /^Selected|^RowsRead/.test(n) },
  {
    key: 'inserted_write',
    match: (n) =>
      /^Inserted|^Delayed.*Insert|^Rejected.*Insert|^Duplicated|^MergeTreeDataWriter/.test(n),
  },
  {
    key: 'network',
    match: (n) =>
      /^Network|^DistributedConnection|^Shards|^ParallelReplicas|^HTTPConnection|^StorageConnection|^DiskConnection/.test(n),
  },
  {
    key: 's3_remote',
    match: (n) =>
      /^S3|^Azure|^RemoteFS|^ReadBufferFromS3|^WriteBufferFromS3|^ReadBufferFromAzure|^DiskS3|^DiskAzure|^DiskPlain/.test(n),
  },
  {
    key: 'page_mark_cache',
    match: (n) =>
      /^MarkCache|^PageCache|^UncompressedCache|^QueryCache|^QueryConditionCache|^OpenedFileCache|^MMappedFileCache|^RegexpLocalCache|^RegexpWithMultipleNeedles|^SchemaInferenceCache|^DictCache|^VectorSimilarityIndexCache|^TextIndex|^ParquetMetadataCache|^IcebergMetadataFilesCache/.test(
        n,
      ),
  },
  {
    key: 'filesystem_cache',
    match: (n) => /^CachedReadBuffer|^CachedWriteBuffer|^FilesystemCache|^FileSegment/.test(n),
  },
  {
    key: 'threading',
    match: (n) => /^ThreadPool|^ContextSwitch|^ContextLock|^ConcurrencyControl|^RWLock|^PartsLock/.test(n),
  },
  {
    key: 'merges_mutations',
    match: (n) => /^Merge|^Mutate|^Mutation|^Gathering|^Replicated|^Quorum|^DataAfterMerge/.test(n),
  },
  {
    key: 'marks_indexes',
    match: (n) =>
      /^Loaded.*Mark|^Loaded.*PrimaryIndex|^WaitMarksLoad|^Filtering.*PrimaryKey|^Filtering.*SecondaryKey/.test(n),
  },
  {
    key: 'query_execution',
    match: (n) => /^Compile|^FunctionExecute|^QueryProfiler|^Overflow|^SlowRead|^ReadBackoff|^Filter.*Transform/.test(n),
  },
  { key: 'kafka', match: (n) => /^Kafka/.test(n) },
  { key: 'backup', match: (n) => /^Backup/.test(n) },
  { key: 'logging', match: (n) => (/^Log(?!aded)/.test(n) || /^AsyncLogging/.test(n)) && true },
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
  const firstRow = rows.find((r) => r != null);
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

function toLocalDatetime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toChDatetime(val) {
  return val.replace('T', ' ') + ':00';
}

function validateRange(from, to) {
  if (!from || !to) return 'Select both From and To datetimes.';
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (isNaN(fromMs) || isNaN(toMs)) return 'Invalid date format.';
  if (fromMs >= toMs) return 'From must be before To.';
  if (toMs - fromMs > 24 * 60 * 60 * 1000) return 'Maximum interval is 24 hours. Narrow your range.';
  return null;
}

function buildQueryListSql(from, to) {
  const chFrom = toChDatetime(from);
  const chTo = toChDatetime(to);
  return `
SELECT
  t.query_id,
  min(t.event_time) AS first_seen,
  count() AS sample_count,
  substring(coalesce(q.query, ''), 1, 300) AS query_preview,
  q.query_duration_ms
FROM system.query_metric_log AS t
LEFT JOIN (
  SELECT query_id, query, query_duration_ms
  FROM system.query_log
  WHERE type = 'QueryFinish'
    AND event_date >= toDate('${chFrom}') - 1
  ORDER BY event_time DESC
  LIMIT 1 BY query_id
) AS q USING (query_id)
WHERE t.query_id != ''
  AND t.event_time >= '${chFrom}'
  AND t.event_time <= '${chTo}'
GROUP BY t.query_id, q.query, q.query_duration_ms
ORDER BY first_seen DESC
LIMIT 500`.trim();
}

function buildDiscoverySql(queryId) {
  const safeId = queryId.replace(/'/g, "\\'");
  return `SELECT * FROM system.query_metric_log WHERE query_id = '${safeId}' ORDER BY event_time_microseconds`;
}

function buildMetricsSql(queryId, columns) {
  const safeId = queryId.replace(/'/g, "\\'");
  const MAX_ACTIVE_COLUMNS = 100;
  const safeCols = columns
    .slice(0, MAX_ACTIVE_COLUMNS)
    .map((c) => '`' + c.replace(/`/g, '``') + '`')
    .join(', ');
  return `
SELECT
  event_time_microseconds,
  ${safeCols}
FROM system.query_metric_log
WHERE query_id = '${safeId}'
ORDER BY event_time_microseconds`.trim();
}

function buildFullQuerySql(queryId) {
  const safeId = queryId.replace(/'/g, "\\'");
  return `SELECT query FROM system.query_log WHERE query_id = '${safeId}' AND type = 'QueryFinish' ORDER BY event_time DESC LIMIT 1`;
}

describe('detectUnit', () => {
  it('classifies *Microseconds as μs', () => {
    expect(detectUnit('ProfileEvent_RealTimeMicroseconds')).toBe('μs');
    expect(detectUnit('ProfileEvent_DiskReadElapsedMicroseconds')).toBe('μs');
    expect(detectUnit('ProfileEvent_S3ReadMicroseconds')).toBe('μs');
  });

  it('classifies bytes and rows and defaults', () => {
    expect(detectUnit('ProfileEvent_OSReadBytes')).toBe('bytes');
    expect(detectUnit('ProfileEvent_SelectedRows')).toBe('rows');
    expect(detectUnit('ProfileEvent_MarkCacheHits')).toBe('count');
    expect(detectUnit('memory_usage')).toBe('bytes');
    expect(detectUnit('peak_memory_usage')).toBe('bytes');
  });
});

describe('classifyColumn', () => {
  it('classifies known and unknown columns', () => {
    expect(classifyColumn('memory_usage')).toBe('memory');
    expect(classifyColumn('ProfileEvent_RealTimeMicroseconds')).toBe('cpu_time');
    expect(classifyColumn('ProfileEvent_OSReadBytes')).toBe('io_disk');
    expect(classifyColumn('ProfileEvent_SomeFutureMetric2027')).toBe('other');
  });
});

describe('discoverActiveColumns', () => {
  it('returns empty for empty rows and handles metadata', () => {
    expect(discoverActiveColumns([])).toEqual([]);
    const rows = [{ query_id: 'q', event_time: 'x', memory_usage: 100, ProfileEvent_A: 0 }];
    const cols = discoverActiveColumns(rows);
    expect(cols).toContain('memory_usage');
    expect(cols).not.toContain('query_id');
  });
});

describe('toLocalDatetime', () => {
  it('formats timestamp', () => {
    const result = toLocalDatetime(Date.now());
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

describe('toChDatetime', () => {
  it('converts format', () => {
    expect(toChDatetime('2026-07-16T10:30')).toBe('2026-07-16 10:30:00');
  });
});

describe('validateRange', () => {
  it('handles valid and invalid', () => {
    expect(validateRange('2026-07-16T10:00', '2026-07-16T11:00')).toBe(null);
    expect(validateRange('2026-07-16T10:00', '2026-07-17T10:01')).toBe('Maximum interval is 24 hours. Narrow your range.');
  });
});

describe('SQL Builders', () => {
  it('builds SQL snippets', () => {
    expect(buildQueryListSql('2026-07-16T10:00', '2026-07-16T11:00')).toContain('LIMIT 500');
    expect(buildDiscoverySql("abc'123")).toContain("abc\\'123");
    expect(buildMetricsSql('q', Array.from({ length: 130 }, (_, i) => `c${i}`))).toContain('event_time_microseconds');
    expect(buildFullQuerySql('q')).toContain("type = 'QueryFinish'");
  });

  it('unit labels are present', () => {
    expect(UNIT_LABELS['μs']).toBe('Time (μs)');
    expect(UNIT_LABELS['bytes']).toBe('Bytes');
    expect(UNIT_LABELS['count']).toBe('Count');
  });
});

describe('QueryMetrics Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue([new URLSearchParams('')]);
    global.MutationObserver = class {
      observe() {}
      disconnect() {}
    };
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    global.cancelAnimationFrame = (id) => clearTimeout(id);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <QueryMetrics />
      </BrowserRouter>,
    );

  const queryListRows = [
    {
      query_id: 'qid-1',
      first_seen: '2026-07-16 10:00:00',
      sample_count: 5,
      query_preview: 'SELECT 1',
      query_duration_ms: 123,
    },
    {
      query_id: 'qid-2',
      first_seen: '2026-07-16 10:05:00',
      sample_count: 2,
      query_preview: 'SELECT * FROM table_x',
      query_duration_ms: null,
    },
  ];

  const discoveryRows = [
    {
      query_id: 'qid-1',
      hostname: 'h1',
      event_date: '2026-07-16',
      event_time: '2026-07-16 10:00:00',
      event_time_microseconds: '2026-07-16 10:00:00.000001',
      memory_usage: 1000,
      peak_memory_usage: 1200,
      ProfileEvent_RealTimeMicroseconds: 200,
      ProfileEvent_OSReadBytes: 500,
      ProfileEvent_SelectedRows: 100,
      ProfileEvent_MarkCacheHits: 3,
      ProfileEvent_ArenaAllocChunks: 2,
      ProfileEvent_ThrottlerWait: 1,
      ProfileEvent_JoinBuildTableRows: 0,
    },
    {
      query_id: 'qid-1',
      hostname: 'h1',
      event_date: '2026-07-16',
      event_time: '2026-07-16 10:00:01',
      event_time_microseconds: '2026-07-16 10:00:01.000001',
      memory_usage: 1100,
      peak_memory_usage: 1300,
      ProfileEvent_RealTimeMicroseconds: 210,
      ProfileEvent_OSReadBytes: 700,
      ProfileEvent_SelectedRows: 200,
      ProfileEvent_MarkCacheHits: 4,
      ProfileEvent_ArenaAllocChunks: 3,
      ProfileEvent_ThrottlerWait: 2,
      ProfileEvent_JoinBuildTableRows: 10,
    },
  ];

  const selectFromPopupAndUse = async () => {
    fireEvent.click(await screen.findByText('qid-1'));
    fireEvent.click(await screen.findByRole('button', { name: /Use This Query/i }));
  };

  it('renders query metrics page successfully', () => {
    renderComponent();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Query Metrics');
    expect(screen.getByText(/system.query_metric_log/i)).toBeInTheDocument();
  });

  it('shows range validation error when invalid', async () => {
    renderComponent();
    const inputs = document.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-07-17T11:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-07-16T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    expect(await screen.findByText(/From must be before To/i)).toBeInTheDocument();
  });

  it('loads queries and shows list', async () => {
    runQueryMock.mockResolvedValueOnce({ rows: queryListRows });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    expect(await screen.findByText('qid-1')).toBeInTheDocument();
    expect(screen.getByText('qid-2')).toBeInTheDocument();
  });

  it('shows warning for >200 query rows', async () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({
      query_id: `q-${i}`,
      first_seen: '2026-07-16 10:00:00',
      sample_count: 1,
      query_preview: 'SELECT 1',
      query_duration_ms: 1,
    }));
    runQueryMock.mockResolvedValueOnce({ rows });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    expect(await screen.findByText(/queries found. Consider narrowing the range/i)).toBeInTheDocument();
  });

  it('shows cap warning for >=500 query rows', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      query_id: `q-${i}`,
      first_seen: '2026-07-16 10:00:00',
      sample_count: 1,
      query_preview: 'SELECT 1',
      query_duration_ms: 1,
    }));
    runQueryMock.mockResolvedValueOnce({ rows });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    expect(await screen.findByText(/Showing the latest 500/i)).toBeInTheDocument();
  });

  it('shows query load error message when fetch fails', async () => {
    runQueryMock.mockRejectedValueOnce(new Error('boom'));
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });

  it('opens popup and loads full query text', async () => {
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockResolvedValueOnce({ rows: [{ query: 'SELECT * FROM very_long_sql' }] });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    fireEvent.click(await screen.findByText('qid-1'));
    expect(await screen.findByText(/Query Details/i)).toBeInTheDocument();
    expect(await screen.findByText(/SELECT \* FROM very_long_sql/i)).toBeInTheDocument();
  });

  it('popup full query fallback when full query fetch fails', async () => {
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockRejectedValueOnce(new Error('full text failed'));
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    fireEvent.click(await screen.findByText('qid-1'));
    expect(await screen.findByText(/Full text could not be loaded/i)).toBeInTheDocument();
  });

  it('copy query id and copy query text trigger clipboard and toast', async () => {
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockResolvedValueOnce({ rows: [{ query: 'SELECT a' }] });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    fireEvent.click(await screen.findByText('qid-1'));

    const popup = (await screen.findByText(/Query Details/i)).closest('.profiler-popup');
    const copyButtons = within(popup).getAllByRole('button', { name: /Copy/i });

    fireEvent.click(copyButtons[0]);
    fireEvent.click(copyButtons[1]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(toastSuccessMock).toHaveBeenCalled();
    });
  });

  it('esc closes popup', async () => {
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockResolvedValueOnce({ rows: [{ query: 'SELECT pop' }] });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    fireEvent.click(await screen.findByText('qid-1'));
    expect(await screen.findByText(/Query Details/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText(/Query Details/i)).not.toBeInTheDocument();
    });
  });

  it('supports search filtering and disabled show button initially', async () => {
    runQueryMock.mockResolvedValueOnce({ rows: queryListRows });
    renderComponent();
    expect(screen.getByRole('button', { name: /Show Query Metrics/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    await screen.findByText('qid-1');
    fireEvent.change(screen.getByPlaceholderText(/Search by query text or query_id/i), { target: { value: 'table_x' } });
    expect(screen.queryByText('qid-1')).not.toBeInTheDocument();
    expect(screen.getByText('qid-2')).toBeInTheDocument();
  });

  it('show metrics button stays disabled when no query selected', async () => {
    runQueryMock.mockResolvedValueOnce({ rows: queryListRows });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    await screen.findByText('qid-1');
    expect(screen.getByRole('button', { name: /Show Query Metrics/i })).toBeDisabled();
  });

  it('handles no metric data after discovery', async () => {
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockResolvedValueOnce({ rows: [{ query: 'SELECT x' }] })
      .mockResolvedValueOnce({ rows: [] });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    await selectFromPopupAndUse();
    fireEvent.click(screen.getByRole('button', { name: /Show Query Metrics/i }));
    expect(await screen.findByText(/No metric data found for this query/i)).toBeInTheDocument();
  });

  it('handles all-zero discovered metrics', async () => {
    const zeroRows = [
      {
        query_id: 'qid-1',
        event_time_microseconds: '2026-07-16 10:00:00.000001',
        memory_usage: 0,
        ProfileEvent_OSReadBytes: 0,
      },
    ];
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockResolvedValueOnce({ rows: [{ query: 'SELECT x' }] })
      .mockResolvedValueOnce({ rows: zeroRows });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    await selectFromPopupAndUse();
    fireEvent.click(screen.getByRole('button', { name: /Show Query Metrics/i }));
    expect(await screen.findByText(/All metrics are zero for this query/i)).toBeInTheDocument();
  });

  it('handles discovery error path', async () => {
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockResolvedValueOnce({ rows: [{ query: 'SELECT x' }] })
      .mockRejectedValueOnce(new Error('discover failed'));
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    await selectFromPopupAndUse();
    fireEvent.click(screen.getByRole('button', { name: /Show Query Metrics/i }));
    expect(await screen.findByText(/Failed to discover metrics: discover failed/i)).toBeInTheDocument();
  });

  it('renders charts for successful discovery and clear resets state', async () => {
    runQueryMock
      .mockResolvedValueOnce({ rows: queryListRows })
      .mockResolvedValueOnce({ rows: [{ query: 'SELECT x' }] })
      .mockResolvedValueOnce({ rows: discoveryRows });
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Load Queries/i }));
    await selectFromPopupAndUse();
    fireEvent.click(screen.getByRole('button', { name: /Show Query Metrics/i }));

    await waitFor(() => {
      expect(screen.getAllByTestId('chart-card').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/active metrics across/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
    expect(screen.queryByText(/Selected:/i)).not.toBeInTheDocument();
  });

  it('applies qid from url and shows metrics without popup selection', async () => {
    useSearchParamsMock.mockReturnValue([new URLSearchParams('qid=url-qid-123')]);
    runQueryMock.mockResolvedValueOnce({ rows: discoveryRows });
    renderComponent();
    const showButton = screen.getByRole('button', { name: /Show Query Metrics/i });
    await waitFor(() => expect(showButton).toBeEnabled());
    fireEvent.click(showButton);
    await waitFor(() => {
      expect(screen.getAllByTestId('chart-card').length).toBeGreaterThan(0);
    });
  });

  it('auto adjusts to-date by +24h when from-date changes', () => {
    renderComponent();
    const inputs = document.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-07-10T08:15' } });
    expect(inputs[1].value).toBe('2026-07-11T08:15');
  });
});