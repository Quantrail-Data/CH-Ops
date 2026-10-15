import { describe, expect, it } from 'bun:test';
import { analyzeSql, isDataQuery, isReadOnlySql } from '../../src/shared/sqlClassify.js';

describe('SQL classifier quoted identifiers', () => {
  it('does not split statements on semicolons inside double-quoted identifiers', () => {
    const analysis = analyzeSql('SELECT "column;name" FROM "db;name"; SHOW TABLES');

    expect(analysis.multiple).toBe(true);
    expect(analysis.statements.map((statement) => statement.keyword)).toEqual(['SELECT', 'SHOW']);
    expect(isReadOnlySql('SELECT "column;name" FROM "db;name"; SHOW TABLES')).toBe(true);
  });

  it('handles escaped double quotes and backticks without treating embedded SQL as syntax', () => {
    const quoted = 'SELECT "a""; DROP TABLE x" FROM `table``;name`';

    expect(analyzeSql(quoted)).toMatchObject({ multiple: false, readOnly: true });
    expect(isDataQuery(quoted)).toBe(true);
  });
});
