// Copyright (C) 2026 Quantrail™ Data Private Limited
// Author: Syed Ashiq
// Unit tests for AlertMarquee rendering, polling, message formatting,
// cluster fallback, and toggle visibility behavior.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunQuery = vi.fn();
const mockRunEditorQuery = vi.fn();

vi.mock('../../src/frontend/utils/api.js', () => ({
    runQuery: (...args) => mockRunQuery(...args),
    runEditorQuery: (...args) => mockRunEditorQuery(...args),
}));

import { runEstimate, lookupMemoryUsage, fmtBytes, fmtRows } from '../../src/frontend/utils/costEstimator.js';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('costEstimator formatting helpers', () => {
    it('formats byte values with the right unit suffix', () => {
        expect(fmtBytes(0)).toBe('0 B');
        expect(fmtBytes(512)).toBe('512.0 B');
        expect(fmtBytes(1500)).toBe('1.46 KB');
        expect(fmtBytes(1048576)).toBe('1.00 MB');
        expect(fmtBytes(5 * 1024 * 1024 * 1024)).toBe('5.00 GB');
    });

    it('formats row counts into human-friendly units', () => {
        expect(fmtRows(1)).toBe('1');
        expect(fmtRows(999)).toBe('999');
        expect(fmtRows(1000)).toBe('1.0K');
        expect(fmtRows(2500000)).toBe('2.5M');
        expect(fmtRows(2000000000)).toBe('2.0B');
    });
});

describe('costEstimator runtime behavior', () => {
    it('rejects non-SELECT SQL for estimate', async () => {
        const result = await runEstimate('INSERT INTO t VALUES (1)', { user: 'admin' });
        expect(result.supported).toBe(false);
        expect(result.reason).toContain('SELECT queries');
    });

    it('uses shared runner without creds and returns estimate metadata', async () => {
        mockRunQuery.mockResolvedValueOnce({ rows: [{ database: 'default', table: 't', parts: '2', rows: '20', marks: '4' }] });
        mockRunQuery.mockResolvedValueOnce({ rows: [{ explain: 'Plan line' }] });
        mockRunQuery.mockResolvedValueOnce({ rows: [{ sorting_key: 'x', primary_key: 'id', engine: 'MergeTree', total_rows: '20', total_bytes: '1000' }] });
        mockRunQuery.mockResolvedValueOnce({ rows: [{ name: 'idx', type_full: 'minmax', expr: 'x', granularity: 8 }] });

        const result = await runEstimate('SELECT * FROM t', null);

        expect(result.supported).toBe(true);
        expect(result.tables).toHaveLength(1);
        expect(result.totalRows).toBe(20);
        expect(result.indexes[0].skippingIndexes[0].name).toBe('idx');
    });

    it('returns estimate data and index metadata for a supported query', async () => {
        mockRunEditorQuery.mockResolvedValueOnce({ rows: [{ database: 'default', table: 't', parts: '2', rows: '20', marks: '4' }] });
        mockRunEditorQuery.mockResolvedValueOnce({ rows: [{ explain: 'Plan line' }] });
        mockRunQuery.mockResolvedValueOnce({ rows: [{ name: 'idx', type_full: 'minmax', expr: 'x', granularity: 8 }] });

        const result = await runEstimate('SELECT * FROM t', { user: 'admin' });

        expect(result.supported).toBe(true);
        expect(result.tables).toHaveLength(1);
        expect(result.totalRows).toBe(20);
        expect(result.totalParts).toBe(2);
        expect(result.totalMarks).toBe(4);
        expect(result.indexes[0].skippingIndexes[0].name).toBe('idx');
    });

    it('returns memory usage when query_log has a row', async () => {
        mockRunEditorQuery.mockResolvedValueOnce({ rows: [{ memory_usage: '4096' }] });
        const result = await lookupMemoryUsage('query-1', { user: 'admin' });
        expect(result).toBe(4096);
    });

    it('returns null when memory lookup returns no row', async () => {
        mockRunEditorQuery.mockResolvedValueOnce({ rows: [] });
        const result = await lookupMemoryUsage('query-2', { user: 'admin' });
        expect(result).toBe(null);
    });

    it('returns null immediately when no queryId is provided', async () => {
        const result = await lookupMemoryUsage('', { user: 'admin' });
        expect(result).toBe(null);
    });
});
