// Tests for the shared SQL statement classifier.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from 'vitest';
import {
  isReadOnlySql, isDataQuery, analyzeSql, leadingKeyword, classifyStatement, READ_ONLY_LEADERS,
} from '../../src/shared/sqlClassify.js';

describe('sqlClassify: read-only leaders', () => {
  it('treats row-returning statements as read-only', () => {
    for (const s of [
      'SELECT 1',
      '  select * from t',
      '\n\tSELECT now()',
      'WITH x AS (SELECT 1) SELECT * FROM x',
      'with cte as (select 1) select 1',
      'SHOW TABLES',
      'DESCRIBE TABLE t',
      'DESC t',
      'EXPLAIN SELECT 1',
      'EXPLAIN AST SELECT 1',
      'EXISTS TABLE t',
    ]) {
      expect(isReadOnlySql(s)).toBe(true);
    }
  });

  it('blocks writes, DDL and admin statements', () => {
    for (const s of [
      'INSERT INTO t VALUES (1)',
      'INSERT INTO t SELECT * FROM u',
      'DELETE FROM t WHERE 1',
      'ALTER TABLE t UPDATE a = 1 WHERE 1',
      'DROP TABLE t',
      'CREATE TABLE t (a Int)',
      'RENAME TABLE a TO b',
      'TRUNCATE TABLE t',
      'OPTIMIZE TABLE t',
      'SYSTEM RELOAD CONFIG',
      'SET max_threads = 4',
      'KILL QUERY WHERE 1',
      'GRANT SELECT ON db.* TO u',
      'ATTACH TABLE t',
      'DETACH TABLE t',
    ]) {
      expect(isReadOnlySql(s)).toBe(false);
    }
  });

  it('blocks empty / null / whitespace', () => {
    for (const s of ['', '   ', null, undefined, '\n\n', ';', ';;']) {
      expect(isReadOnlySql(s)).toBe(false);
    }
  });
});

describe('sqlClassify: lexing is comment / string / identifier safe', () => {
  it('ignores a leading line comment', () => {
    expect(isReadOnlySql('-- a note\nSELECT 1')).toBe(true);
    expect(isReadOnlySql('-- drop everything\nDROP TABLE t')).toBe(false);
  });
  it('ignores a leading block comment', () => {
    expect(isReadOnlySql('/* hello */ SELECT 1')).toBe(true);
    expect(isReadOnlySql('/* SELECT */ INSERT INTO t VALUES (1)')).toBe(false);
  });
  it('does not merge tokens across a comment', () => {
    expect(leadingKeyword('SELECT/*c*/ 1')).toBe('SELECT');
  });
  it('is not fooled by a semicolon inside a string', () => {
    const a = analyzeSql("SELECT 'a;b' AS x");
    expect(a.multiple).toBe(false);
    expect(a.readOnly).toBe(true);
  });
  it('is not fooled by keywords inside strings or identifiers', () => {
    expect(isReadOnlySql("SELECT 'DROP TABLE t' AS note")).toBe(true);
    expect(isReadOnlySql('SELECT 1 AS `DROP TABLE`')).toBe(true);
  });
  it('handles a leading parenthesized SELECT', () => {
    expect(isReadOnlySql('(SELECT 1) UNION ALL (SELECT 2)')).toBe(true);
  });
});

describe('sqlClassify: multi-statement handling', () => {
  it('rejects a read followed by a write (classic injection shape)', () => {
    const a = analyzeSql('SELECT 1; DROP TABLE t');
    expect(a.multiple).toBe(true);
    expect(a.readOnly).toBe(false);
  });
  it('allows multiple read-only statements but flags multiple', () => {
    const a = analyzeSql('SELECT 1; SELECT 2');
    expect(a.multiple).toBe(true);
    expect(a.readOnly).toBe(true);
  });
  it('a trailing semicolon is a single statement', () => {
    expect(analyzeSql('SELECT 1;').multiple).toBe(false);
  });
});

describe('sqlClassify: helpers', () => {
  it('classifyStatement returns keyword + category', () => {
    expect(classifyStatement('SELECT 1')).toMatchObject({ keyword: 'SELECT', category: 'read', readOnly: true });
    expect(classifyStatement('DROP TABLE t')).toMatchObject({ keyword: 'DROP', category: 'ddl', readOnly: false });
    expect(classifyStatement('INSERT INTO t VALUES (1)')).toMatchObject({ category: 'write' });
    expect(classifyStatement('SYSTEM RELOAD CONFIG')).toMatchObject({ category: 'admin' });
  });
  it('isDataQuery matches the FORMAT-append decision', () => {
    expect(isDataQuery('SELECT 1')).toBe(true);
    expect(isDataQuery('SHOW TABLES')).toBe(true);
    expect(isDataQuery('  -- c\nDESCRIBE t')).toBe(true);
    expect(isDataQuery('CREATE TABLE t (a Int)')).toBe(false);
    expect(isDataQuery('INSERT INTO t VALUES (1)')).toBe(false);
  });
  it('READ_ONLY_LEADERS is the expected allowlist', () => {
    expect([...READ_ONLY_LEADERS].sort()).toEqual(
      ['DESC', 'DESCRIBE', 'EXISTS', 'EXPLAIN', 'SELECT', 'SHOW', 'WITH']
    );
  });
});

describe('sqlClassify: bounded input (loop-bound-injection hardening)', () => {
  // This module runs client-side too (no request-body size limit applies
  // there), so its internal loops must not scale unboundedly with attacker-
  // controlled input length - CodeQL flags exactly this (js/loop-bound-injection).
  it('analyzeSql completes quickly on a pathologically large statement', () => {
    const huge = 'SELECT 1; -- ' + 'x'.repeat(5_000_000);
    const start = Date.now();
    const result = analyzeSql(huge);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(result.statements.length).toBeGreaterThan(0);
  });

  it('leadingKeyword completes quickly on huge leading whitespace', () => {
    const huge = ' '.repeat(5_000_000) + 'SELECT 1';
    const start = Date.now();
    leadingKeyword(huge);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
