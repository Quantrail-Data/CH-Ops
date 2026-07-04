// schema-studio.test.js - Unit tests for Schema Studio pure logic
//
// Covers the deterministic guard functions in ddlPrompt.js: defensive JSON
// parsing of AI responses, the single-CREATE-TABLE guard, the cardinality
// fallback sort key, the ORDER BY detector, and the LowCardinality advisory.
// These are pure functions with no external dependencies. The credential store
// and routes are covered separately where database wiring is available.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect } from 'bun:test';
import {
  parseAiResponse,
  isCreateTableOnly,
  hasOrderBy,
  fallbackOrderBy,
  lowCardinalitySuggestions,
  buildUserMessage,
  SYSTEM_PROMPT,
  EVAL_SYSTEM_PROMPT,
  buildEvalMessage,
  parseEvalResponse,
} from '../../src/backend/services/ddlPrompt.js';
import {
  formatFromName,
  sqlEscape,
  buildSourceExpr,
  aliasName,
  buildStatsSql,
  shapeStats,
} from '../../src/backend/services/studioSource.js';
import { aiStatusFromConfig } from '../../src/backend/services/studioAi.js';

describe('parseAiResponse', () => {
  it('parses a plain JSON object', () => {
    const r = parseAiResponse('{"ddl":"CREATE TABLE t (a Int32) ENGINE = MergeTree ORDER BY a"}');
    expect(r.ddl).toContain('CREATE TABLE t');
  });

  it('strips ```json fences', () => {
    const r = parseAiResponse('```json\n{"ddl":"CREATE TABLE t (a Int32)"}\n```');
    expect(r.ddl).toBe('CREATE TABLE t (a Int32)');
  });

  it('strips ```sql fences', () => {
    const r = parseAiResponse('```sql\n{"ddl":"CREATE TABLE t (a Int32)"}\n```');
    expect(r.ddl).toBe('CREATE TABLE t (a Int32)');
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const r = parseAiResponse('Sure! Here you go:\n{"ddl":"CREATE TABLE t (a Int32)","notes":"ok"}\nHope that helps.');
    expect(r.ddl).toBe('CREATE TABLE t (a Int32)');
    expect(r.notes).toBe('ok');
  });

  it('falls back to treating the whole response as DDL when no JSON', () => {
    const r = parseAiResponse('CREATE TABLE t (a Int32) ENGINE = MergeTree ORDER BY a');
    expect(r.ddl).toContain('CREATE TABLE t');
  });

  it('handles empty / null input', () => {
    expect(parseAiResponse('').ddl).toBe('');
    expect(parseAiResponse(null).ddl).toBe('');
  });
});

describe('isCreateTableOnly', () => {
  it('accepts a single CREATE TABLE', () => {
    expect(isCreateTableOnly('CREATE TABLE t (a Int32) ENGINE = MergeTree ORDER BY a')).toBe(true);
  });

  it('accepts CREATE OR REPLACE TABLE', () => {
    expect(isCreateTableOnly('CREATE OR REPLACE TABLE t (a Int32) ENGINE = MergeTree ORDER BY a')).toBe(true);
  });

  it('accepts a trailing semicolon on a single statement', () => {
    expect(isCreateTableOnly('CREATE TABLE t (a Int32) ENGINE = MergeTree ORDER BY a;')).toBe(true);
  });

  it('rejects multiple statements', () => {
    expect(isCreateTableOnly('CREATE TABLE t (a Int32); DROP TABLE other')).toBe(false);
  });

  it('rejects non-create statements', () => {
    expect(isCreateTableOnly('DROP TABLE t')).toBe(false);
    expect(isCreateTableOnly('INSERT INTO t VALUES (1)')).toBe(false);
    expect(isCreateTableOnly('SELECT 1')).toBe(false);
  });

  it('rejects empty / null', () => {
    expect(isCreateTableOnly('')).toBe(false);
    expect(isCreateTableOnly(null)).toBe(false);
  });
});

describe('hasOrderBy', () => {
  it('detects ORDER BY in any case and spacing', () => {
    expect(hasOrderBy('... ENGINE = MergeTree ORDER BY a')).toBe(true);
    expect(hasOrderBy('... order   by (a, b)')).toBe(true);
  });
  it('returns false when absent', () => {
    expect(hasOrderBy('CREATE TABLE t (a Int32) ENGINE = MergeTree')).toBe(false);
    expect(hasOrderBy('')).toBe(false);
  });
});

describe('fallbackOrderBy', () => {
  const columns = [
    { name: 'id', type: 'Int64' },
    { name: 'country', type: 'String' },
    { name: 'event_date', type: 'Date' },
  ];
  const stats = {
    id: { approx_distinct: 1000000 },
    country: { approx_distinct: 50 },
    event_date: { approx_distinct: 365 },
  };

  it('orders by ascending cardinality when nothing is filtered', () => {
    expect(fallbackOrderBy(columns, stats, [])).toBe('(country, event_date, id)');
  });

  it('puts frequently filtered columns first', () => {
    expect(fallbackOrderBy(columns, stats, ['event_date'])).toBe('(event_date, country, id)');
  });

  it('returns tuple() when there are no usable columns', () => {
    expect(fallbackOrderBy([], {}, [])).toBe('tuple()');
  });

  it('skips MATERIALIZED / ALIAS / EPHEMERAL columns', () => {
    const cols = [
      { name: 'a', type: 'Int32' },
      { name: 'b', type: 'Int32 MATERIALIZED a + 1' },
    ];
    expect(fallbackOrderBy(cols, { a: { approx_distinct: 10 } }, [])).toBe('(a)');
  });
});

describe('lowCardinalitySuggestions', () => {
  it('suggests low-cardinality String columns under the 10% ratio', () => {
    const columns = [
      { name: 'status', type: 'String' },
      { name: 'uuid', type: 'String' },
      { name: 'n', type: 'Int32' },
    ];
    const stats = {
      status: { approx_distinct: 5 },
      uuid: { approx_distinct: 950 },
      n: { approx_distinct: 100 },
    };
    expect(lowCardinalitySuggestions(columns, stats, 1000)).toEqual(['status']);
  });

  it('does not suggest already-LowCardinality or user-overridden columns', () => {
    const columns = [
      { name: 'a', type: 'LowCardinality(String)' },
      { name: 'b', type: 'String', overridden: true },
    ];
    const stats = { a: { approx_distinct: 3 }, b: { approx_distinct: 3 } };
    expect(lowCardinalitySuggestions(columns, stats, 1000)).toEqual([]);
  });
});

describe('prompt helpers', () => {
  it('buildUserMessage returns pretty JSON of the bundle', () => {
    const msg = buildUserMessage({ a: 1 });
    expect(msg).toContain('"a": 1');
  });
  it('SYSTEM_PROMPT names the JSON output keys', () => {
    expect(SYSTEM_PROMPT).toContain('"ddl"');
    expect(SYSTEM_PROMPT).toContain('"ddl_local"');
    expect(SYSTEM_PROMPT).toContain('ORDER BY');
  });
});

describe('formatFromName', () => {
  it('maps binary extensions to binary formats', () => {
    expect(formatFromName('data.parquet')).toEqual({ format: 'Parquet', binary: true });
    expect(formatFromName('data.orc')).toEqual({ format: 'ORC', binary: true });
  });
  it('maps text extensions to text formats', () => {
    expect(formatFromName('data.csv')).toEqual({ format: 'CSVWithNames', binary: false });
    expect(formatFromName('data.tsv')).toEqual({ format: 'TSVWithNames', binary: false });
    expect(formatFromName('data.json')).toEqual({ format: 'JSONEachRow', binary: false });
    expect(formatFromName('data.ndjson')).toEqual({ format: 'JSONEachRow', binary: false });
  });
  it('accepts a bare format name (from the query string)', () => {
    expect(formatFromName('Parquet')).toEqual({ format: 'Parquet', binary: true });
    expect(formatFromName('CSVWithNames')).toEqual({ format: 'CSVWithNames', binary: false });
  });
  it('defaults unknown names to CSVWithNames', () => {
    expect(formatFromName('mystery.dat')).toEqual({ format: 'CSVWithNames', binary: false });
    expect(formatFromName('')).toEqual({ format: 'CSVWithNames', binary: false });
  });
});

describe('sqlEscape', () => {
  it('escapes single quotes and backslashes', () => {
    expect(sqlEscape("a'b")).toBe("a\\'b");
    expect(sqlEscape('a\\b')).toBe('a\\\\b');
    expect(sqlEscape("o'\\x")).toBe("o\\'\\\\x");
  });
});

describe('buildSourceExpr', () => {
  it('embeds the sample for text uploads', () => {
    expect(buildSourceExpr({ kind: 'upload', format: 'CSVWithNames', binary: false, sampleText: 'a,b\n1,2' }))
      .toBe("format(CSVWithNames, 'a,b\n1,2')");
  });
  it('references format() with no data for binary uploads', () => {
    expect(buildSourceExpr({ kind: 'upload', format: 'Parquet', binary: true }))
      .toBe('format(Parquet)');
  });
  it('builds an s3() expression', () => {
    const e = buildSourceExpr({ kind: 'object', objectStore: { provider: 's3', path: 's3://b/f.parquet', accessKeyId: 'AK', secretAccessKey: 'SK', format: 'Parquet' } });
    expect(e).toBe("s3('s3://b/f.parquet', 'AK', 'SK', 'Parquet')");
  });
  it('builds an azureBlobStorage() expression', () => {
    const e = buildSourceExpr({ kind: 'object', objectStore: { provider: 'azure', connectionString: 'cs', container: 'c', path: 'f.orc', format: 'ORC' } });
    expect(e).toBe("azureBlobStorage('cs', 'c', 'f.orc', 'ORC')");
  });
  it('falls back to Parquet for an unknown object format (allow-list)', () => {
    const e = buildSourceExpr({ kind: 'object', objectStore: { provider: 's3', path: 'p', accessKeyId: 'AK', secretAccessKey: 'SK', format: 'Evil; DROP' } });
    expect(e).toContain("'Parquet')");
  });
  it('escapes quotes inside object credentials', () => {
    const e = buildSourceExpr({ kind: 'object', objectStore: { provider: 's3', path: "p'x", accessKeyId: 'AK', secretAccessKey: 'SK', format: 'Parquet' } });
    expect(e).toContain("'p\\'x'");
  });
});

describe('aliasName', () => {
  it('produces a stable, valid identifier per column+suffix', () => {
    const a = aliasName('weird col!', 'uniq');
    expect(a).toMatch(/^c_\d+_uniq$/);
    expect(aliasName('weird col!', 'uniq')).toBe(a); // stable
  });
  it('differs by suffix and by column', () => {
    expect(aliasName('x', 'uniq')).not.toBe(aliasName('x', 'nulls'));
    expect(aliasName('x', 'uniq')).not.toBe(aliasName('y', 'uniq'));
  });
});

describe('buildStatsSql + shapeStats', () => {
  const columns = [{ name: 'country' }, { name: 'weird`col' }];
  it('builds a bounded aggregate with backtick-quoted identifiers', () => {
    const sql = buildStatsSql('format(Parquet)', columns, 1000);
    expect(sql).toContain('count() AS _rows');
    expect(sql).toContain('uniqExact(`country`)');
    expect(sql).toContain('sum(isNull(`country`))');
    expect(sql).toContain('toString(min(`country`))');
    expect(sql).toContain('uniqExact(`weird``col`)'); // backtick escaped
    expect(sql).toContain('FROM (SELECT * FROM format(Parquet) LIMIT 1000)');
  });
  it('shapeStats turns one row into per-column statistics', () => {
    const row = {
      _rows: 200,
      [aliasName('country', 'uniq')]: 12,
      [aliasName('country', 'nulls')]: 10,
      [aliasName('country', 'min')]: 'AD',
      [aliasName('country', 'max')]: 'ZW',
    };
    const out = shapeStats(row, [{ name: 'country' }]);
    expect(out.sample_rows).toBe(200);
    expect(out.stats.country.approx_distinct).toBe(12);
    expect(out.stats.country.null_fraction).toBe(0.05);
    expect(out.stats.country.min).toBe('AD');
    expect(out.stats.country.max).toBe('ZW');
  });
});

describe('aiStatusFromConfig', () => {
  it('reports not configured when there is no active key', () => {
    expect(aiStatusFromConfig(null)).toEqual({ configured: false, executable: false });
  });
  it('marks GEMINI as executable in v1', () => {
    const s = aiStatusFromConfig({ provider: 'GEMINI', model: 'gemini-2.5-flash', apiKey: 'x' });
    expect(s).toEqual({ configured: true, provider: 'GEMINI', model: 'gemini-2.5-flash', executable: true });
  });
  it('marks other providers configured but not executable', () => {
    const s = aiStatusFromConfig({ provider: 'OPEN AI', model: 'gpt', apiKey: 'x' });
    expect(s.configured).toBe(true);
    expect(s.executable).toBe(false);
    expect(s.provider).toBe('OPEN AI');
  });
});

describe('evaluation prompt', () => {
  it('EVAL_SYSTEM_PROMPT asks for review JSON and forbids rewriting', () => {
    expect(EVAL_SYSTEM_PROMPT).toContain('"assessment"');
    expect(EVAL_SYSTEM_PROMPT).toContain('"suggestions"');
    expect(EVAL_SYSTEM_PROMPT).toContain('"warnings"');
    expect(EVAL_SYSTEM_PROMPT.toLowerCase()).toContain('suggested_ddl');
  });
  it('buildEvalMessage serializes the payload', () => {
    expect(buildEvalMessage({ ddl: 'CREATE TABLE t ...' })).toContain('CREATE TABLE t');
  });
  it('parseEvalResponse extracts the three fields with safe defaults', () => {
    const r = parseEvalResponse('```json\n{"assessment":"ok","suggestions":["use LowCardinality"],"warnings":[]}\n```');
    expect(r.assessment).toBe('ok');
    expect(r.suggestions).toEqual(['use LowCardinality']);
    expect(r.warnings).toEqual([]);
  });
  it('parseEvalResponse tolerates junk and non-arrays', () => {
    const r = parseEvalResponse('not json at all');
    expect(r).toEqual({ assessment: '', suggestions: [], warnings: [], suggested_ddl: '' });
    const r2 = parseEvalResponse('{"assessment":5,"suggestions":"x","warnings":[1,"keep"]}');
    expect(r2.assessment).toBe('');
    expect(r2.suggestions).toEqual([]);
    expect(r2.warnings).toEqual(['keep']);
  });
});
