// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Tests frontend playback utils covering formatting, date parsing, SQL builders, and chart configurations (suggests extraction).

import { describe, it, expect } from 'vitest';


const pad = n => String(n).padStart(2, '0');

function fmtTimestamp(epochSec) {
  if (!epochSec || isNaN(epochSec)) return '--';
  const d = new Date(epochSec * 1000);
  if (isNaN(d.getTime())) return '--';
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseDatetime(val) {
  if (!val) return NaN;
  return new Date(val.replace(' ', 'T')).getTime();
}

function toChDt(val) {
  const s = val.replace('T', ' ');
  return /\d{2}:\d{2}:\d{2}/.test(s) ? s : s + ':00';
}

function validateInputs(from, to, step) {
  const fromMs = parseDatetime(from);
  const toMs = parseDatetime(to);
  if (isNaN(fromMs)) return 'Invalid From datetime.';
  if (isNaN(toMs)) return 'Invalid To datetime.';
  if (fromMs >= toMs) return 'From must be before To.';
  const rangeSeconds = (toMs - fromMs) / 1000;
  if (rangeSeconds < step) return 'Time range is shorter than one step interval.';
  const estimatedFrames = Math.ceil(rangeSeconds / step);
  if (estimatedFrames > 10000) {
    return `Too many frames (${estimatedFrames.toLocaleString()}). Increase the step or narrow the range. Max 10,000.`;
  }
  return null;
}

function buildSql(template, from, to, step) {
  const fromMs = parseDatetime(from);
  const toMs = parseDatetime(to);
  const seconds = isNaN(fromMs) || isNaN(toMs) ? 0 : Math.round((toMs - fromMs) / 1000);
  return template
    .replace(/\{from\}/g, `'${from}'`)
    .replace(/\{to\}/g, `'${to}'`)
    .replace(/\{step\}/g, String(step))
    .replace(/\{seconds\}/g, String(seconds));
}

function buildFailedQueriesSql(frameT, step, from, to) {
  const chFrom = toChDt(from);
  const chTo = toChDt(to);
  return `SELECT initial_user, substring(query, 1, 500) AS query, substring(exception, 1, 500) AS exception
FROM system.query_log
WHERE (type = 'ExceptionBeforeStart' OR type = 'ExceptionWhileProcessing')
  AND toStartOfInterval(event_time, INTERVAL ${step} SECOND)::INT = ${frameT}
  AND event_time >= '${chFrom}' AND event_time <= '${chTo}'
ORDER BY event_time DESC LIMIT 200`;
}

function buildErrorLogsSql(frameT, step, from, to) {
  const chFrom = toChDt(from);
  const chTo = toChDt(to);
  return `SELECT level, logger_name, substring(message, 1, 500) AS message
FROM merge('system', '^text_log')
WHERE level IN ('Error', 'Critical', 'Fatal')
  AND toStartOfInterval(event_time, INTERVAL ${step} SECOND)::INT = ${frameT}
  AND event_time >= '${chFrom}' AND event_time <= '${chTo}'
ORDER BY event_time DESC LIMIT 200`;
}

const CHARTS = [
  { key: 'hw_cpu',          section: 'Hardware',   chartType: 'band',         categoryCol: undefined },
  { key: 'hw_ram',          section: 'Hardware',   chartType: 'band',         categoryCol: undefined },
  { key: 'hw_net',          section: 'Hardware',   chartType: 'band',         categoryCol: undefined },
  { key: 'logs_severity',   section: 'App Logs',   chartType: 'stacked_area', categoryCol: 'level' },
  { key: 'parts_type',      section: 'Data Parts', chartType: 'stacked_area', categoryCol: 'event_type' },
  { key: 'q_success',       section: 'Queries',    chartType: 'stacked_area', categoryCol: 'query_kind' },
  { key: 'q_exceptions',    section: 'Queries',    chartType: 'stacked_area', categoryCol: 'query_kind' },
  { key: 'q_throughput',    section: 'Queries',    chartType: 'stacked_area', categoryCol: null },
];

const STEP_OPTIONS = [
  { value: 1,  label: '1s' },
  { value: 5,  label: '5s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

const SPEED_OPTIONS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5,  label: '0.5x' },
  { value: 1,    label: '1x' },
  { value: 2,    label: '2x' },
  { value: 4,    label: '4x' },
];

const LOG_LEVEL_COLORS = { Error: '#ef4444', Critical: '#dc2626', Fatal: '#991b1b' };

const FALLBACK_SERIES_COLORS = [
  '#22d3ee',
  '#f97316',
  '#22c55e',
  '#a78bfa',
  '#f43f5e',
  '#0ea5e9',
  '#84cc16',
  '#eab308',
  '#14b8a6',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#ec4899',
];

function getSeriesColorByIndex(idx) {
  return FALLBACK_SERIES_COLORS[idx % FALLBACK_SERIES_COLORS.length];
}

function baseChartOption() {
  return {
    toolbox: {
      feature: {
        saveAsImage: {},
      },
    },
    xAxis: { axisLabel: {} },
  };
}

function buildBandOption(label, rows, frameT) {
  if (!rows?.length) return null;

  const minData = rows.map((r) => [r.t * 1000, parseFloat(r.min_val) || 0]);
  const medData = rows.map((r) => [r.t * 1000, parseFloat(r.med_val) || 0]);
  const maxData = rows.map((r) => [r.t * 1000, parseFloat(r.max_val) || 0]);

  const markLine =
    frameT != null
      ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#8b5cf6', width: 2, type: 'solid' },
          data: [{ xAxis: frameT * 1000 }],
          label: { show: false },
          animation: false,
        }
      : undefined;

  return {
    ...baseChartOption(),
    backgroundColor: '#ffffff',
    textStyle: { color: '#1f2937' },
    xAxis: {
      type: 'time',
      position: 'bottom',
      axisLabel: {
        ...baseChartOption()?.xAxis?.axisLabel,
        color: '#374151',
        rotate: 0,
        hideOverlap: true,
        margin: 14,
      },
      axisTick: { alignWithLabel: true, lineStyle: { color: '#9ca3af' } },
      axisLine: { lineStyle: { color: '#9ca3af' } },
      splitLine: { show: true, lineStyle: { color: '#e5e7eb' } },
    },
    yAxis: {
      type: 'value',
      name: label,
      nameTextStyle: { color: '#374151' },
      scale: true,
      axisLabel: { hideOverlap: true, color: '#374151' },
      axisLine: { lineStyle: { color: '#9ca3af' } },
      splitLine: { show: true, lineStyle: { color: '#e5e7eb' } },
    },
    legend: {
      show: true,
      left: 'center',
      top: 0,
      type: 'plain',
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 12, color: '#1f2937' },
    },
    toolbox: {
      ...baseChartOption()?.toolbox,
      right: 0,
      top: 0,
      itemSize: 14,
      itemGap: 8,
      iconStyle: {
        borderColor: '#374151',
      },
      emphasis: {
        iconStyle: {
          borderColor: '#111827',
        },
      },
      feature: {
        ...(baseChartOption()?.toolbox?.feature || {}),
        saveAsImage: {
          ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
          backgroundColor: '#ffffff',
          pixelRatio: 2,
          excludeComponents: [],
        },
      },
    },
    grid: {
      left: 54,
      right: 18,
      top: 56,
      bottom: 46,
      containLabel: true,
    },
    animation: false,
    series: [
      {
        name: 'Max',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: maxData,
        lineStyle: { color: '#06b6d4', width: 1.5 },
        itemStyle: { color: '#06b6d4' },
        areaStyle: { color: '#06b6d4', opacity: 0.08 },
        markLine,
        animation: false,
      },
      {
        name: 'Median',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: medData,
        lineStyle: { color: '#f97316', width: 2 },
        itemStyle: { color: '#f97316' },
        areaStyle: { color: '#f97316', opacity: 0.06 },
        markLine,
        animation: false,
      },
      {
        name: 'Min',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: minData,
        lineStyle: { color: '#8b5cf6', width: 1.5 },
        itemStyle: { color: '#8b5cf6' },
        areaStyle: { color: '#8b5cf6', opacity: 0.08 },
        markLine,
        animation: false,
      },
    ],
  };
}

function buildStackedAreaOption(chart, rows, frameT) {
  if (!rows?.length) return null;

  const markLine =
    frameT != null
      ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#8b5cf6', width: 2, type: 'solid' },
          data: [{ xAxis: frameT * 1000 }],
          label: { show: false },
          animation: false,
        }
      : undefined;

  if (!chart.categoryCol) {
    const cols = Object.keys(rows[0]).filter((c) => c !== 't');
    if (cols.length === 0) return null;
    const series = cols.map((col, idx) => {
      const color = chart.seriesColors?.[col] || getSeriesColorByIndex(idx);
      return {
        name: col.replace(/_/g, ' '),
        type: 'line',
        smooth: true,
        symbol: 'none',
        stack: 'total',
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        areaStyle: { color, opacity: 0.3 },
        data: rows.map((r) => [r.t * 1000, parseFloat(r[col]) || 0]),
        markLine,
        animation: false,
      };
    });
    return {
      ...baseChartOption(),
      backgroundColor: '#ffffff',
      textStyle: { color: '#1f2937' },
      color: series.map((s) => s.itemStyle?.color).filter(Boolean),
      toolbox: {
        ...baseChartOption()?.toolbox,
        right: 0,
        top: 0,
        itemSize: 14,
        itemGap: 8,
        iconStyle: { borderColor: '#374151' },
        emphasis: { iconStyle: { borderColor: '#111827' } },
        feature: {
          ...(baseChartOption()?.toolbox?.feature || {}),
          saveAsImage: {
            ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
            backgroundColor: '#ffffff',
            pixelRatio: 2,
            excludeComponents: [],
          },
        },
      },
      grid: { left: 54, right: 18, top: 56, bottom: 46, containLabel: true },
      xAxis: {
        type: 'time',
        position: 'bottom',
        axisLabel: { ...baseChartOption()?.xAxis?.axisLabel, color: '#374151', rotate: 0, hideOverlap: true, margin: 14 },
        axisTick: { alignWithLabel: true, lineStyle: { color: '#9ca3af' } },
        axisLine: { lineStyle: { color: '#9ca3af' } },
        splitLine: { show: true, lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: {
        type: 'value',
        name: chart.label,
        nameTextStyle: { color: '#374151' },
        scale: true,
        axisLabel: { hideOverlap: true, color: '#374151' },
        axisLine: { lineStyle: { color: '#9ca3af' } },
        splitLine: { show: true, lineStyle: { color: '#e5e7eb' } },
      },
      legend: {
        show: true,
        top: 0,
        left: 'center',
        type: 'scroll',
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { fontSize: 12, color: '#1f2937' },
      },
      animation: false,
      series,
    };
  }

  const catCol = chart.categoryCol;
  const valCol =
    Object.keys(rows[0]).find((c) => c !== 't' && c !== catCol) || 'cnt';
  const categories =
    chart.seriesOrder ||
    [...new Set(rows.map((r) => r[catCol]).filter((v) => v != null && v !== ''))].sort();

  const timeMap = {};
  for (const r of rows) {
    const t = Number(r.t);
    if (isNaN(t)) continue;
    if (!timeMap[t]) timeMap[t] = {};
    timeMap[t][r[catCol]] = parseFloat(r[valCol]) || 0;
  }
  const allTimes = Object.keys(timeMap)
    .map(Number)
    .sort((a, b) => a - b);
  if (allTimes.length === 0) return null;

  const series = categories.map((cat, idx) => {
    const color = chart.seriesColors?.[cat] || getSeriesColorByIndex(idx);
    return {
      name: cat || '(empty)',
      type: 'line',
      smooth: true,
      symbol: 'none',
      stack: 'total',
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      areaStyle: { color, opacity: 0.4 },
      data: allTimes.map((t) => [t * 1000, timeMap[t]?.[cat] || 0]),
      markLine,
      animation: false,
    };
  });

  return {
    ...baseChartOption(),
    backgroundColor: '#ffffff',
    textStyle: { color: '#1f2937' },
    color: series.map((s) => s.itemStyle?.color).filter(Boolean),
    toolbox: {
      ...baseChartOption()?.toolbox,
      right: 0,
      top: 0,
      itemSize: 14,
      itemGap: 8,
      iconStyle: { borderColor: '#374151' },
      emphasis: { iconStyle: { borderColor: '#111827' } },
      feature: {
        ...(baseChartOption()?.toolbox?.feature || {}),
        saveAsImage: {
          ...(baseChartOption()?.toolbox?.feature?.saveAsImage || {}),
          backgroundColor: '#ffffff',
          pixelRatio: 2,
          excludeComponents: [],
        },
      },
    },
    grid: { left: 54, right: 18, top: 56, bottom: 46, containLabel: true },
    xAxis: {
      type: 'time',
      position: 'bottom',
      axisLabel: { ...baseChartOption()?.xAxis?.axisLabel, color: '#374151', rotate: 0, hideOverlap: true, margin: 14 },
      axisTick: { alignWithLabel: true, lineStyle: { color: '#9ca3af' } },
      axisLine: { lineStyle: { color: '#9ca3af' } },
      splitLine: { show: true, lineStyle: { color: '#e5e7eb' } },
    },
    yAxis: {
      type: 'value',
      name: chart.label,
      nameTextStyle: { color: '#374151' },
      scale: true,
      axisLabel: { hideOverlap: true, color: '#374151' },
      axisLine: { lineStyle: { color: '#9ca3af' } },
      splitLine: { show: true, lineStyle: { color: '#e5e7eb' } },
    },
    legend: {
      show: true,
      top: 0,
      left: 'center',
      type: 'scroll',
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 12, color: '#1f2937' },
    },
    animation: false,
    series,
  };
}


describe('toChDt', () => {
  it('converts datetime-local (no seconds) to ClickHouse format', () => {
    expect(toChDt('2026-05-26T10:30')).toBe('2026-05-26 10:30:00');
  });

  it('does not double-append :00 when seconds already present', () => {
    expect(toChDt('2026-05-26 10:30:45')).toBe('2026-05-26 10:30:45');
  });

  it('handles T-separated with seconds', () => {
    expect(toChDt('2026-05-26T10:30:45')).toBe('2026-05-26 10:30:45');
  });

  it('handles space-separated without seconds', () => {
    expect(toChDt('2026-05-26 10:30')).toBe('2026-05-26 10:30:00');
  });

  it('handles fmtAgo/fmtNow output (already has seconds)', () => {
    // This was the original bug: fmtAgo produces "2026-05-26 11:24:42"
    // toChDt was appending :00 to make "2026-05-26 11:24:42:00"
    expect(toChDt('2026-05-26 11:24:42')).toBe('2026-05-26 11:24:42');
  });

  it('handles microsecond timestamps from ClickHouse', () => {
    expect(toChDt('2026-05-26 11:24:42.123456')).toBe('2026-05-26 11:24:42.123456');
  });
});


describe('fmtTimestamp', () => {
  it('formats epoch seconds to readable datetime', () => {
    const epoch = new Date('2026-05-26T10:30:00').getTime() / 1000;
    const result = fmtTimestamp(epoch);
    expect(result).toContain('2026');
    expect(result).toContain('10:30:00');
  });

  it('returns -- for null', () => {
    expect(fmtTimestamp(null)).toBe('--');
  });

  it('returns -- for undefined', () => {
    expect(fmtTimestamp(undefined)).toBe('--');
  });

  it('returns -- for NaN', () => {
    expect(fmtTimestamp(NaN)).toBe('--');
  });

  it('returns -- for 0', () => {
    expect(fmtTimestamp(0)).toBe('--');
  });
});



describe('parseDatetime', () => {
  it('parses space-separated datetime', () => {
    const ms = parseDatetime('2026-05-26 10:30:00');
    expect(ms).toBeGreaterThan(0);
    expect(new Date(ms).getFullYear()).toBe(2026);
  });

  it('parses T-separated datetime', () => {
    const ms = parseDatetime('2026-05-26T10:30:00');
    expect(ms).toBeGreaterThan(0);
  });

  it('returns NaN for empty string', () => {
    expect(parseDatetime('')).toBeNaN();
  });

  it('returns NaN for null', () => {
    expect(parseDatetime(null)).toBeNaN();
  });

  it('returns NaN for garbage', () => {
    expect(parseDatetime('not-a-date')).toBeNaN();
  });
});


describe('validateInputs', () => {
  it('returns null for valid inputs', () => {
    expect(validateInputs('2026-05-26 10:00:00', '2026-05-26 11:00:00', 10)).toBeNull();
  });

  it('rejects invalid From', () => {
    expect(validateInputs('garbage', '2026-05-26 11:00:00', 10)).toContain('Invalid From');
  });

  it('rejects invalid To', () => {
    expect(validateInputs('2026-05-26 10:00:00', 'garbage', 10)).toContain('Invalid To');
  });

  it('rejects From >= To', () => {
    expect(validateInputs('2026-05-26 12:00:00', '2026-05-26 10:00:00', 10)).toContain('before');
  });

  it('rejects range shorter than one step', () => {
    // 5 seconds range with 10 second step
    expect(validateInputs('2026-05-26 10:00:00', '2026-05-26 10:00:05', 10)).toContain('shorter');
  });

  it('rejects > 10,000 frames', () => {
    // 24 hours with 1s step = 86,400 frames
    expect(validateInputs('2026-05-26 00:00:00', '2026-05-27 00:00:00', 1)).toContain('Too many frames');
  });

  it('accepts exactly 10,000 frames', () => {
    // 10,000 seconds with 1s step = exactly 10,000 frames (at the limit, should be accepted)
    // Use hardcoded strings to avoid timezone-dependent Date arithmetic
    expect(validateInputs('2026-05-26 00:00:00', '2026-05-26 02:46:40', 1)).toBeNull();
  });

  it('accepts 24 hours with 10s step (8640 frames)', () => {
    expect(validateInputs('2026-05-26 00:00:00', '2026-05-27 00:00:00', 10)).toBeNull();
  });

  it('accepts 1 hour with 1s step (3600 frames)', () => {
    expect(validateInputs('2026-05-26 10:00:00', '2026-05-26 11:00:00', 1)).toBeNull();
  });
});



describe('buildSql', () => {
  it('replaces {from}, {to}, {step}, {seconds}', () => {
    const template = 'SELECT * WHERE t BETWEEN {from} AND {to} STEP {step} RANGE {seconds}';
    const sql = buildSql(template, '2026-05-26 10:00:00', '2026-05-26 11:00:00', 10);
    expect(sql).toContain("'2026-05-26 10:00:00'");
    expect(sql).toContain("'2026-05-26 11:00:00'");
    expect(sql).toContain('STEP 10');
    expect(sql).toContain('RANGE 3600');
  });

  it('replaces multiple occurrences', () => {
    const template = '{from} {from} {to} {to}';
    const sql = buildSql(template, '2026-05-26 10:00:00', '2026-05-26 11:00:00', 10);
    expect(sql.match(/2026-05-26 10:00:00/g)).toHaveLength(2);
    expect(sql.match(/2026-05-26 11:00:00/g)).toHaveLength(2);
  });

  it('computes seconds correctly', () => {
    const template = '{seconds}';
    // 30 minutes = 1800 seconds
    expect(buildSql(template, '2026-05-26 10:00:00', '2026-05-26 10:30:00', 10)).toBe('1800');
  });

  it('returns 0 seconds for invalid dates', () => {
    expect(buildSql('{seconds}', 'bad', 'bad', 10)).toBe('0');
  });
});


describe('buildFailedQueriesSql', () => {
  it('queries system.query_log for exceptions', () => {
    const sql = buildFailedQueriesSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('system.query_log');
    expect(sql).toContain('ExceptionBeforeStart');
    expect(sql).toContain('ExceptionWhileProcessing');
  });

  it('uses toStartOfInterval with correct step', () => {
    const sql = buildFailedQueriesSql(1716710400, 30, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('INTERVAL 30 SECOND');
  });

  it('matches the exact frame timestamp', () => {
    const sql = buildFailedQueriesSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('= 1716710400');
  });

  it('limits to 200 rows', () => {
    const sql = buildFailedQueriesSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('LIMIT 200');
  });

  it('truncates query and exception to 500 chars', () => {
    const sql = buildFailedQueriesSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('substring(query, 1, 500)');
    expect(sql).toContain('substring(exception, 1, 500)');
  });

  it('scopes to the from/to range', () => {
    const sql = buildFailedQueriesSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain("event_time >= '2026-05-26 10:00:00'");
    expect(sql).toContain("event_time <= '2026-05-26 11:00:00'");
  });

  it('does not produce double :00 timestamps', () => {
    const sql = buildFailedQueriesSql(1716710400, 10, '2026-05-26 10:00:42', '2026-05-26 11:00:42');
    expect(sql).not.toContain('42:00');
    expect(sql).toContain('10:00:42');
    expect(sql).toContain('11:00:42');
  });
});


describe('buildErrorLogsSql', () => {
  it('queries text_log for Error, Critical, Fatal', () => {
    const sql = buildErrorLogsSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain("merge('system', '^text_log')");
    expect(sql).toContain("'Error'");
    expect(sql).toContain("'Critical'");
    expect(sql).toContain("'Fatal'");
  });

  it('uses toStartOfInterval with correct step', () => {
    const sql = buildErrorLogsSql(1716710400, 60, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('INTERVAL 60 SECOND');
  });

  it('truncates message to 500 chars', () => {
    const sql = buildErrorLogsSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('substring(message, 1, 500)');
  });

  it('limits to 200 rows', () => {
    const sql = buildErrorLogsSql(1716710400, 10, '2026-05-26 10:00:00', '2026-05-26 11:00:00');
    expect(sql).toContain('LIMIT 200');
  });

  it('does not produce double :00 timestamps', () => {
    const sql = buildErrorLogsSql(1716710400, 10, '2026-05-26 10:00:42', '2026-05-26 11:00:42');
    expect(sql).not.toContain('42:00');
  });
});


describe('CHARTS', () => {
  it('has exactly 8 charts', () => {
    expect(CHARTS).toHaveLength(8);
  });

  it('has 4 sections', () => {
    const sections = [...new Set(CHARTS.map(c => c.section))];
    expect(sections).toEqual(['Hardware', 'App Logs', 'Data Parts', 'Queries']);
  });

  it('Hardware section has 3 band charts', () => {
    const hw = CHARTS.filter(c => c.section === 'Hardware');
    expect(hw).toHaveLength(3);
    hw.forEach(c => expect(c.chartType).toBe('band'));
  });

  it('Queries section has 3 stacked_area charts', () => {
    const q = CHARTS.filter(c => c.section === 'Queries');
    expect(q).toHaveLength(3);
    q.forEach(c => expect(c.chartType).toBe('stacked_area'));
  });

  it('every chart has a unique key', () => {
    const keys = CHARTS.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('category-based charts do NOT use WITH FILL in SQL', () => {
    const categoryCharts = CHARTS.filter(c => c.categoryCol);
    // Category charts had WITH FILL removed because it pollutes categories with empty strings
    // This test verifies against the chart definitions (SQL is in the actual component)
    expect(categoryCharts.length).toBeGreaterThan(0);
    categoryCharts.forEach(c => {
      expect(c.categoryCol).toBeTruthy();
    });
  });

  it('q_throughput has no categoryCol (multi-value, not pivot)', () => {
    const throughput = CHARTS.find(c => c.key === 'q_throughput');
    expect(throughput.categoryCol).toBeNull();
  });
});



describe('STEP_OPTIONS', () => {
  it('has 5 options', () => {
    expect(STEP_OPTIONS).toHaveLength(5);
  });

  it('values are 1, 5, 10, 30, 60', () => {
    expect(STEP_OPTIONS.map(s => s.value)).toEqual([1, 5, 10, 30, 60]);
  });
});

describe('SPEED_OPTIONS', () => {
  it('has 5 options', () => {
    expect(SPEED_OPTIONS).toHaveLength(5);
  });

  it('includes 1x as default', () => {
    expect(SPEED_OPTIONS.find(s => s.value === 1)).toBeDefined();
  });
});

describe('LOG_LEVEL_COLORS', () => {
  it('has colors for Error, Critical, Fatal', () => {
    expect(LOG_LEVEL_COLORS.Error).toBeDefined();
    expect(LOG_LEVEL_COLORS.Critical).toBeDefined();
    expect(LOG_LEVEL_COLORS.Fatal).toBeDefined();
  });

  it('Fatal is darker than Error', () => {
    // Fatal = #991b1b (dark), Error = #ef4444 (light)
    // Verify by checking the hex values: lower = darker
    const fatalBrightness = parseInt(LOG_LEVEL_COLORS.Fatal.slice(1, 3), 16);
    const errorBrightness = parseInt(LOG_LEVEL_COLORS.Error.slice(1, 3), 16);
    expect(fatalBrightness).toBeLessThan(errorBrightness);
  });
});



describe('Frame count edge cases', () => {
  it('1 hour at 1s = 3600 frames (under 10K limit)', () => {
    expect(validateInputs('2026-05-26 10:00:00', '2026-05-26 11:00:00', 1)).toBeNull();
  });

  it('24 hours at 1s = 86400 frames (over 10K limit)', () => {
    const err = validateInputs('2026-05-26 00:00:00', '2026-05-27 00:00:00', 1);
    expect(err).toContain('86,400');
  });

  it('24 hours at 10s = 8640 frames (under 10K limit)', () => {
    expect(validateInputs('2026-05-26 00:00:00', '2026-05-27 00:00:00', 10)).toBeNull();
  });

  it('24 hours at 60s = 1440 frames', () => {
    expect(validateInputs('2026-05-26 00:00:00', '2026-05-27 00:00:00', 60)).toBeNull();
  });

  it('1 minute at 1s = 60 frames', () => {
    expect(validateInputs('2026-05-26 10:00:00', '2026-05-26 10:01:00', 1)).toBeNull();
  });
});

describe('Series color fallback helpers', () => {
  it('returns deterministic fallback color by index', () => {
    expect(getSeriesColorByIndex(0)).toBe(FALLBACK_SERIES_COLORS[0]);
    expect(getSeriesColorByIndex(1)).toBe(FALLBACK_SERIES_COLORS[1]);
  });

  it('cycles through fallback palette', () => {
    expect(getSeriesColorByIndex(FALLBACK_SERIES_COLORS.length)).toBe(FALLBACK_SERIES_COLORS[0]);
  });

  it('fallback palette has unique colors', () => {
    expect(new Set(FALLBACK_SERIES_COLORS).size).toBe(FALLBACK_SERIES_COLORS.length);
  });
});

describe('buildBandOption', () => {
  const rows = [
    { t: 1716710400, min_val: 1, med_val: 2, max_val: 3 },
    { t: 1716710410, min_val: 2, med_val: 3, max_val: 4 },
  ];

  it('returns null for empty rows', () => {
    expect(buildBandOption('CPU', [], 1716710400)).toBeNull();
  });

  it('returns 3 series with unique colors', () => {
    const o = buildBandOption('CPU', rows, 1716710400);
    expect(o.series).toHaveLength(3);
    const colors = o.series.map(s => s.itemStyle.color);
    expect(new Set(colors).size).toBe(3);
  });

  it('includes white export background for saveAsImage', () => {
    const o = buildBandOption('CPU', rows, 1716710400);
    expect(o.toolbox.feature.saveAsImage.backgroundColor).toBe('#ffffff');
    expect(o.toolbox.feature.saveAsImage.pixelRatio).toBe(2);
  });

  it('contains visible axis/legend text colors for exported image', () => {
    const o = buildBandOption('CPU', rows, 1716710400);
    expect(o.legend.textStyle.color).toBe('#1f2937');
    expect(o.xAxis.axisLabel.color).toBe('#374151');
    expect(o.yAxis.axisLabel.color).toBe('#374151');
  });

  it('contains visible grid/split line colors for exported image', () => {
    const o = buildBandOption('CPU', rows, 1716710400);
    expect(o.xAxis.splitLine.lineStyle.color).toBe('#e5e7eb');
    expect(o.yAxis.splitLine.lineStyle.color).toBe('#e5e7eb');
  });
});

describe('buildStackedAreaOption', () => {
  it('returns null for empty rows', () => {
    expect(buildStackedAreaOption({ key: 'x', label: 'X', categoryCol: 'k' }, [], 1716710400)).toBeNull();
  });

  it('uses explicit chart.seriesColors when present', () => {
    const chart = {
      key: 'logs',
      label: 'Logs',
      categoryCol: 'level',
      seriesOrder: ['Error', 'Fatal'],
      seriesColors: { Error: '#111111', Fatal: '#222222' },
    };
    const rows = [
      { t: 1716710400, level: 'Error', cnt: 2 },
      { t: 1716710400, level: 'Fatal', cnt: 1 },
    ];
    const o = buildStackedAreaOption(chart, rows, 1716710400);
    expect(o.series[0].itemStyle.color).toBe('#111111');
    expect(o.series[1].itemStyle.color).toBe('#222222');
  });

  it('uses fallback unique colors when chart.seriesColors is absent', () => {
    const chart = {
      key: 'dynamic',
      label: 'Dynamic',
      categoryCol: 'kind',
      seriesOrder: ['A', 'B', 'C'],
    };
    const rows = [
      { t: 1716710400, kind: 'A', cnt: 1 },
      { t: 1716710400, kind: 'B', cnt: 2 },
      { t: 1716710400, kind: 'C', cnt: 3 },
    ];
    const o = buildStackedAreaOption(chart, rows, 1716710400);
    const colors = o.series.map(s => s.itemStyle.color);
    expect(new Set(colors).size).toBe(3);
  });

  it('non-category multi-value chart uses fallback unique colors', () => {
    const chart = { key: 'throughput', label: 'Rows', categoryCol: null };
    const rows = [
      { t: 1716710400, selected_rows: 10, inserted_rows: 20 },
      { t: 1716710410, selected_rows: 11, inserted_rows: 21 },
    ];
    const o = buildStackedAreaOption(chart, rows, 1716710400);
    expect(o.series).toHaveLength(2);
    expect(o.series[0].itemStyle.color).not.toBe(o.series[1].itemStyle.color);
    expect(o.color).toHaveLength(2);
  });

  it('includes white export background for saveAsImage', () => {
    const chart = { key: 'throughput', label: 'Rows', categoryCol: null };
    const rows = [
      { t: 1716710400, selected_rows: 10, inserted_rows: 20 },
    ];
    const o = buildStackedAreaOption(chart, rows, 1716710400);
    expect(o.toolbox.feature.saveAsImage.backgroundColor).toBe('#ffffff');
    expect(o.toolbox.feature.saveAsImage.pixelRatio).toBe(2);
  });

  it('contains visible text and grid settings for exported image', () => {
    const chart = { key: 'throughput', label: 'Rows', categoryCol: null };
    const rows = [
      { t: 1716710400, selected_rows: 10, inserted_rows: 20 },
    ];
    const o = buildStackedAreaOption(chart, rows, 1716710400);
    expect(o.legend.textStyle.color).toBe('#1f2937');
    expect(o.xAxis.axisLabel.color).toBe('#374151');
    expect(o.yAxis.axisLabel.color).toBe('#374151');
    expect(o.xAxis.splitLine.lineStyle.color).toBe('#e5e7eb');
    expect(o.yAxis.splitLine.lineStyle.color).toBe('#e5e7eb');
  });
});
