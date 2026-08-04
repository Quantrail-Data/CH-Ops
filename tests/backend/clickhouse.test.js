/**
 * clickhouse.test.js - Unit tests for ClickHouse query formatting logic
 *
 * Tests the FORMAT JSONEachRow detection logic from clickhouse.js.
 * Verifies that data-returning queries (SELECT, SHOW, DESCRIBE, EXPLAIN,
 * EXISTS, WITH) get FORMAT appended, while DDL/DML queries (CREATE,
 * ALTER, DROP, GRANT, KILL, INSERT, SYSTEM, OPTIMIZE, BACKUP) do not.
 * Also tests EXPLAIN graph=1 and json=1 raw output detection, which
 * skip FORMAT to preserve DOT/JSON output. Edge cases like comments,
 * trailing semicolons, and whitespace are covered.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { afterEach, beforeEach, describe, it, expect } from 'bun:test';
import { executeQuery, executeQueryWithBody } from '../../src/backend/services/clickhouse.js';
import { isDataQuery, leadingKeyword } from '../../src/shared/sqlClassify.js';

// EXPLAIN graph=1 / json=1 produce raw (non-tabular) output and skip FORMAT.
// This mirrors the check kept in src/backend/services/clickhouse.js.
function isExplainRaw(sql) {
  const trimmed = sql.trimEnd().replace(/;+$/, '');
  const firstWord = leadingKeyword(trimmed);
  const lowerStripped = trimmed.toLowerCase();
  return firstWord === 'EXPLAIN' && (/\bgraph\s*=\s*1/.test(lowerStripped) || /\bjson\s*=\s*1/.test(lowerStripped));
}

describe('FORMAT detection - data queries (FORMAT appended)', () => {
  it('SELECT', () => expect(isDataQuery('SELECT 1')).toBe(true));
  it('SHOW', () => expect(isDataQuery('SHOW TABLES')).toBe(true));
  it('DESCRIBE', () => expect(isDataQuery('DESCRIBE TABLE t')).toBe(true));
  it('DESC', () => expect(isDataQuery('DESC t')).toBe(true));
  it('EXPLAIN', () => expect(isDataQuery('EXPLAIN SELECT 1')).toBe(true));
  it('EXPLAIN AST', () => expect(isDataQuery('EXPLAIN AST SELECT 1')).toBe(true));
  it('EXPLAIN PIPELINE', () => expect(isDataQuery('EXPLAIN PIPELINE SELECT 1')).toBe(true));
  it('EXISTS', () => expect(isDataQuery('EXISTS db.t')).toBe(true));
  it('WITH CTE', () => expect(isDataQuery('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true));
});

describe('FORMAT detection - DDL/DML (FORMAT NOT appended)', () => {
  it('CREATE USER', () => expect(isDataQuery("CREATE USER alice IDENTIFIED BY 'p'")).toBe(false));
  it('CREATE TABLE', () => expect(isDataQuery('CREATE TABLE t (x Int32) ENGINE=Memory')).toBe(false));
  it('ALTER TABLE', () => expect(isDataQuery('ALTER TABLE t ADD INDEX idx(c) TYPE minmax GRANULARITY 1')).toBe(false));
  it('DROP USER', () => expect(isDataQuery('DROP USER IF EXISTS alice')).toBe(false));
  it('GRANT', () => expect(isDataQuery('GRANT SELECT ON db.* TO alice')).toBe(false));
  it('REVOKE', () => expect(isDataQuery('REVOKE SELECT ON db.* FROM alice')).toBe(false));
  it('KILL QUERY', () => expect(isDataQuery("KILL QUERY WHERE query_id='abc'")).toBe(false));
  it('INSERT INTO', () => expect(isDataQuery('INSERT INTO t VALUES (1)')).toBe(false));
  it('SYSTEM', () => expect(isDataQuery('SYSTEM FLUSH LOGS')).toBe(false));
  it('OPTIMIZE', () => expect(isDataQuery('OPTIMIZE TABLE t FINAL')).toBe(false));
  it('BACKUP', () => expect(isDataQuery("BACKUP ALL TO S3('s3://b/p','k','s')")).toBe(false));
});

describe('FORMAT detection - edge cases', () => {
  it('leading -- comment then SELECT', () => expect(isDataQuery('-- comment\nSELECT 1')).toBe(true));
  it('leading /* block */ then DROP', () => expect(isDataQuery('/* block */\nDROP TABLE t')).toBe(false));
  it('multiple line comments', () => expect(isDataQuery('-- a\n-- b\nSELECT 1')).toBe(true));
  it('trailing semicolons', () => expect(isDataQuery('SELECT 1;;')).toBe(true));
  it('empty string', () => expect(isDataQuery('')).toBe(false));
  it('whitespace only', () => expect(isDataQuery('   \n  ')).toBe(false));
});

describe('EXPLAIN raw detection - graph/json skip FORMAT', () => {
  it('EXPLAIN AST graph=1 is raw', () => expect(isExplainRaw('EXPLAIN AST graph = 1 SELECT 1')).toBe(true));
  it('EXPLAIN PIPELINE graph=1 is raw', () => expect(isExplainRaw('EXPLAIN PIPELINE graph=1 SELECT 1')).toBe(true));
  it('EXPLAIN json=1 is raw', () => expect(isExplainRaw('EXPLAIN json = 1, description = 0 SELECT 1')).toBe(true));
  it('EXPLAIN AST without graph is NOT raw', () => expect(isExplainRaw('EXPLAIN AST SELECT 1')).toBe(false));
  it('EXPLAIN PLAN without json is NOT raw', () => expect(isExplainRaw('EXPLAIN PLAN SELECT 1')).toBe(false));
  it('EXPLAIN SYNTAX is NOT raw', () => expect(isExplainRaw('EXPLAIN SYNTAX SELECT 1')).toBe(false));
  it('EXPLAIN ESTIMATE is NOT raw', () => expect(isExplainRaw('EXPLAIN ESTIMATE SELECT 1')).toBe(false));
  it('SELECT from graph_table is NOT raw', () => expect(isExplainRaw('SELECT * FROM graph_table')).toBe(false));
  it('EXPLAIN with graph=0 is NOT raw', () => expect(isExplainRaw('EXPLAIN AST graph = 0 SELECT 1')).toBe(false));
});

describe('clickhouse client execution', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = async (url, options) => ({
      ok: true,
      status: 200,
      text: async () => '{"id":1,"name":"Alice"}\n{"id":2,"name":"Bob"}',
      headers: new Headers({
        'X-ClickHouse-Summary': '{"read_rows":"2"}',
        'X-ClickHouse-Query-Id': 'query-123',
      }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('executes data queries with readonly and JSONEachRow parsing', async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => '{"id":1,"name":"Alice"}\n{"id":2,"name":"Bob"}',
        headers: new Headers({
          'X-ClickHouse-Summary': '{"read_rows":"2"}',
          'X-ClickHouse-Query-Id': 'query-123',
        }),
      };
    };

    const result = await executeQuery({
      host: 'clickhouse.local',
      port: 8123,
      secure: true,
      user: 'alice',
      password: 'secret',
      sql: 'SELECT * FROM system.tables',
      readOnly: true,
    });

    expect(captured.url.hostname).toBe('clickhouse.local');
    expect(captured.url.protocol).toBe('https:');
    expect(captured.url.searchParams.get('readonly')).toBe('1');
    expect(captured.options.method).toBe('POST');
    expect(captured.options.body).toBe('SELECT * FROM system.tables\nFORMAT JSONEachRow');
    expect(captured.options.headers['X-ClickHouse-User']).toBe('alice');
    expect(captured.options.headers['X-ClickHouse-Key']).toBe('secret');
    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
    expect(result.columns).toEqual(['id', 'name']);
    expect(result.stats).toEqual({ read_rows: '2' });
    expect(result.queryId).toBe('query-123');
  });

  it('returns raw explain output as a single explain column', async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => 'Expression\n  Source',
        headers: new Headers(),
      };
    };

    const result = await executeQuery({
      host: 'example',
      sql: 'EXPLAIN graph=1 SELECT 1',
    });

    expect(captured.options.body).toBe('EXPLAIN graph=1 SELECT 1');
    expect(result.rows).toEqual([{ explain: 'Expression' }, { explain: 'Source' }]);
    expect(result.columns).toEqual(['explain']);
    expect(result.stats).toEqual({});
    expect(result.queryId).toBeNull();
  });

  it('adds JSONEachRow formatting for executeQueryWithBody requests', async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => '{"value":1}\n{"value":2}',
        headers: new Headers({ 'X-ClickHouse-Query-Id': 'query-456' }),
      };
    };

    const result = await executeQueryWithBody({
      host: 'db',
      port: 9000,
      user: 'default',
      password: '',
      query: 'SELECT value FROM t',
      body: 'payload',
      jsonEachRow: true,
    });

    expect(captured.url.hostname).toBe('db');
    expect(captured.url.searchParams.get('query')).toBe('SELECT value FROM t FORMAT JSONEachRow');
    expect(captured.url.searchParams.get('max_execution_time')).toBe('30');
    expect(captured.options.body).toBe('payload');
    expect(result.rows).toEqual([{ value: 1 }, { value: 2 }]);
    expect(result.columns).toEqual(['value']);
    expect(result.queryId).toBe('query-456');
  });
});
