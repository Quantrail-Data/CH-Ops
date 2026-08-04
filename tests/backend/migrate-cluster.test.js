// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathir Moorthy
// Unit tests for cluster migration helpers.

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const settingsState = new Map();

function createFakeDb() {
    const state = {
        settings: settingsState,
        clusters: [],
        nodes: [],
        execCalls: [],
    };

    const db = {
        select() {
            return {
                from() {
                    return {
                        where(filter) {
                            return {
                                get: () => {
                                    const key = filter?.value;
                                    if (typeof key !== 'string') return null;
                                    return state.settings.has(key) ? { value: state.settings.get(key) } : null;
                                },
                            };
                        },
                    };
                },
            };
        },
        update() {
            return {
                set(values) {
                    return {
                        where(filter) {
                            return {
                                run: () => {
                                    const key = filter?.value;
                                    if (typeof key === 'string') {
                                        state.settings.set(key, values.value);
                                    }
                                },
                            };
                        },
                    };
                },
            };
        },
        insert() {
            return {
                values(values) {
                    return {
                        run: () => {
                            if (values?.key) {
                                state.settings.set(values.key, values.value);
                            }
                        },
                    };
                },
            };
        },
    };

    const sqlite = {
        exec(sql) {
            this.execCalls.push(sql);
        },
        execCalls: [],
        prepare(query) {
            return {
                run: (...params) => {
                    if (query.includes('INSERT INTO cluster')) {
                        state.clusters.push({ id: params[0], name: params[1] });
                    } else if (query.includes('INSERT INTO cluster_node')) {
                        state.nodes.push({
                            cluster_id: params[0],
                            name: params[1],
                            host: params[2],
                            password_enc: params[5],
                        });
                    }
                },
            };
        },
        query(query) {
            return {
                all: () => {
                    if (query.includes('SELECT id, name FROM cluster')) {
                        return state.clusters.map(({ id, name }) => ({ id, name }));
                    }
                    if (query.includes('SELECT cluster_id, name, host, password_enc FROM cluster_node')) {
                        return state.nodes.map(({ cluster_id, name, host, password_enc }) => ({
                            cluster_id,
                            name,
                            host,
                            password_enc,
                        }));
                    }
                    return [];
                },
            };
        },
        transaction(fn) {
            return (list) => fn(list);
        },
        state,
    };

    return { db, sqlite, state };
}

const fakeDb = createFakeDb();

mock.module('drizzle-orm', () => ({
    eq: (_field, value) => ({ value }),
}));

mock.module('../../src/backend/db/index.js', () => ({
    db: fakeDb.db,
    appSettings: {},
}));

const {
    STORAGE_BLOB,
    STORAGE_FLAG_KEY,
    STORAGE_TABLES,
    getStorageMode,
    inspectBlob,
    migrateClustersToTables,
    rollbackToBlob,
} = await import('../../src/backend/db/migrateClusters.js');

describe('migrateClusters helpers', () => {
    beforeEach(() => {
        settingsState.clear();
        fakeDb.state.clusters = [];
        fakeDb.state.nodes = [];
        fakeDb.state.execCalls = [];
    });

    it('returns the blob storage mode by default and allows rollback', () => {
        expect(getStorageMode()).toBe(STORAGE_BLOB);
        rollbackToBlob();
        expect(getStorageMode()).toBe(STORAGE_BLOB);
    });

    it('inspects a blob and surfaces duplicate cluster data problems', () => {
        const raw = JSON.stringify([
            {
                id: 'cluster-1',
                name: 'Primary',
                nodes: [{ name: 'node-1', host: '10.0.0.1' }],
            },
            {
                id: 'cluster-1',
                name: 'Secondary',
                nodes: [{ name: 'node-1', host: '10.0.0.2' }],
            },
        ]);

        const result = inspectBlob(raw);

        expect(result.clusters).toBe(2);
        expect(result.nodes).toBe(2);
        expect(result.problems).toContain('Duplicate cluster id: cluster-1');
        expect(result.parsed).toHaveLength(2);
    });

    it('creates the cluster tables for a fresh install and marks the storage flag', () => {
        const result = migrateClustersToTables(fakeDb.sqlite, { log: () => { } });

        expect(result.reason).toBe('fresh-install');
        expect(result.migrated).toBe(true);
        expect(fakeDb.state.execCalls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS cluster'))).toBe(true);
        expect(settingsState.get(STORAGE_FLAG_KEY)).toBe(STORAGE_TABLES);
    });

    it('aborts when the blob is invalid JSON', () => {
        settingsState.set('clusters', '{not json');

        const result = migrateClustersToTables(fakeDb.sqlite, { log: () => { } });

        expect(result.reason).toBe('invalid-blob');
        expect(result.migrated).toBe(false);
        expect(result.problems[0]).toContain('not valid JSON');
        expect(settingsState.get(STORAGE_FLAG_KEY)).toBeUndefined();
    });

    it('migrates valid cluster blob data into the relational tables', () => {
        settingsState.set(
            'clusters',
            JSON.stringify([
                {
                    id: 'cluster-1',
                    name: 'Alpha',
                    nodes: [{ name: 'node-1', host: '10.0.0.1', password: 'secret', secure: true }],
                },
            ]),
        );

        const result = migrateClustersToTables(fakeDb.sqlite, { log: () => { } });

        expect(result.reason).toBe('migrated');
        expect(result.migrated).toBe(true);
        expect(fakeDb.state.clusters).toHaveLength(1);
        expect(fakeDb.state.nodes).toHaveLength(1);
        expect(fakeDb.state.nodes[0].password_enc).toBe('secret');
        expect(settingsState.get(STORAGE_FLAG_KEY)).toBe(STORAGE_TABLES);
    });
});
