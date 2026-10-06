// Copyright (C) 2026 Quantrail™ Data Private Limited
// Author: Syed Ashiq
// Unit tests for AlertMarquee rendering, polling, message formatting,
// cluster fallback, and toggle visibility behavior.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunEditorQuery = vi.fn();
const mockRunQuery = vi.fn();
const mockBuildCompletionOptions = vi.fn(({ keywords, functions, tables }) => [
    { label: 'keyword', type: 'keyword' },
    { label: 'func1', type: 'function' },
    { label: 'db.table', type: 'table' },
]);
const mockLoadFunctionRows = vi.fn(() => Promise.resolve([{ name: 'func1' }, { name: 'func2' }]));

vi.mock('../../src/frontend/utils/api.js', () => ({
    runEditorQuery: (...args) => mockRunEditorQuery(...args),
    runQuery: (...args) => mockRunQuery(...args),
}));

vi.mock('../../src/frontend/components/editor/sqlEditorSetup.js', () => ({
    buildCompletionOptions: (...args) => mockBuildCompletionOptions(...args),
    loadFunctionRows: (...args) => mockLoadFunctionRows(...args),
}));

import { estimateOne, executeOne, loadAcWords } from '../../src/frontend/utils/queryCompare.js';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('queryCompare runtime helpers', () => {
    it('returns an error when the SQL is empty', async () => {
        const result = await estimateOne('', { user: 'admin' });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Query is empty');
    });

    it('returns an error when credentials are missing', async () => {
        const result = await estimateOne('SELECT 1', {});
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Connect with your ClickHouse credentials first');
    });

    it('returns an error for non-SELECT SQL', async () => {
        const result = await estimateOne('INSERT INTO t VALUES (1)', { user: 'admin' });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('read-only queries');
    });

    it('returns parsed estimate metrics and table indexes for a valid query', async () => {
        mockRunEditorQuery
            .mockResolvedValueOnce({ rows: [{ database: 'default', table: 't', parts: '1', rows: '10', marks: '2' }] })
            .mockResolvedValueOnce({ rows: [{ explain: 'Plan line 1' }] });
        mockRunQuery.mockResolvedValueOnce({ rows: [{ name: 'idx', type_full: 'minmax', expr: 'x', granularity: 4 }] });

        const result = await estimateOne('SELECT 1', { user: 'admin' });

        expect(result.ok).toBe(true);
        expect(result.raw.supported).toBe(true);
        expect(result.metrics.rows).toBe(10);
        expect(result.metrics.parts).toBe(1);
        expect(result.metrics.marks).toBe(2);
        expect(result.raw.tables).toHaveLength(1);
        expect(result.raw.indexes).toHaveLength(1);
        expect(result.raw.indexes[0].skippingIndexes[0].name).toBe('idx');
        expect(result.raw.plan).toContain('Plan line 1');
    });

    it('executes a query and returns result metrics without memory when queryId is absent', async () => {
        mockRunEditorQuery.mockResolvedValueOnce({ rows: [{ a: 1 }], columns: ['a'], queryId: null, stats: { read_rows: '5', read_bytes: '128', written_rows: '0', elapsed_ns: '2000000' } });

        const result = await executeOne('SELECT 1', { user: 'admin' });

        expect(result.ok).toBe(true);
        expect(result.rows).toEqual([{ a: 1 }]);
        expect(result.columns).toEqual(['a']);
        expect(result.metrics.resultRows).toBe(1);
        expect(result.metrics.readRows).toBe(5);
        expect(result.metrics.readBytes).toBe(128);
        expect(result.metrics.writtenRows).toBe(0);
        expect(result.metrics.elapsedMs).toBe(2);
        expect(result.metrics.memoryBytes).toBe(null);
    });

    it('loads autocomplete words when creds are provided', async () => {
        mockLoadFunctionRows.mockResolvedValueOnce([{ name: 'func1' }, { name: 'func2' }]);
        mockRunEditorQuery
            .mockResolvedValueOnce({ rows: [{ keyword: 'select' }] })
            .mockResolvedValueOnce({ rows: [{ database: 'db', name: 'tbl' }] });

        const result = await loadAcWords({ user: 'admin' });

        expect(result.options).toEqual(expect.any(Array));
        expect(result.dialect).toEqual({ keywords: ['select'], functions: ['func1', 'func2'] });
        expect(mockBuildCompletionOptions).toHaveBeenCalled();
    });

    it('returns empty autocomplete payload when creds are absent', async () => {
        const result = await loadAcWords(null);
        expect(result).toEqual({ options: [], dialect: null });
    });
});
