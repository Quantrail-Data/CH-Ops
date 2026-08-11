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
                    if (query.includes('INSERT INTO "cluster"')) {
                        state.clusters.push({ id: params[0], name: params[1] });
                    } else if (query.includes('INSERT INTO "cluster_node"')) {
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
    createClusterTables,
    ensureUniqueClusterName,
    getStorageMode,
    inspectBlob,
    migrateClustersToTables,
    rollbackToBlob,
    verifyMigration,
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

    it('reports absent, malformed, and structurally invalid blobs without parsing them', () => {
        expect(inspectBlob(null).problems).toEqual([
            'No clusters key present. Treating as a fresh install.',
        ]);
        expect(inspectBlob(JSON.stringify({ id: 'not-an-array' })).problems).toEqual([
            'Cluster configuration is not an array.',
        ]);

        const result = inspectBlob(JSON.stringify([
            { id: 'missing-name', nodes: [{ name: 'duplicate' }, { name: 'duplicate' }] },
            { name: 'missing-id', nodes: [] },
        ]));

        expect(result.problems).toEqual([
            'Cluster missing-name has no name.',
            'A node in cluster missing-name has no host.',
            'A node in cluster missing-name has no host.',
            'Duplicate node name "duplicate" in cluster missing-name',
            'A cluster has no id.',
        ]);
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

    it('does not mutate storage during a dry run', () => {
        settingsState.set('clusters', JSON.stringify([{ id: 'cluster-1', name: 'Alpha', nodes: [] }]));

        const result = migrateClustersToTables(fakeDb.sqlite, { dryRun: true, log: () => {} });

        expect(result).toMatchObject({
            migrated: false,
            reason: 'dry-run',
            clusters: 1,
            nodes: 0,
        });
        expect(fakeDb.state.execCalls).toHaveLength(0);
        expect(settingsState.get(STORAGE_FLAG_KEY)).toBeUndefined();
        expect([...settingsState.keys()]).not.toContainEqual(expect.stringContaining('clusters.bak.'));
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

    it('does not enable table storage when verification finds mismatched rows', () => {
        settingsState.set('clusters', JSON.stringify([
            { id: 'cluster-1', name: 'Alpha', nodes: [{ name: 'node-1', host: '10.0.0.1' }] },
        ]));
        const sqlite = {
            ...fakeDb.sqlite,
            prepare: () => ({ run: () => {} }),
        };

        const result = migrateClustersToTables(sqlite, { log: () => {} });

        expect(result.reason).toBe('verification-failed');
        expect(result.problems).toContain('Cluster count mismatch: blob has 1, tables have 0.');
        expect(settingsState.get(STORAGE_FLAG_KEY)).toBeUndefined();
    });

    it('recognizes an existing migration and still enforces unique names', () => {
        settingsState.set(STORAGE_FLAG_KEY, STORAGE_TABLES);

        const result = migrateClustersToTables(fakeDb.sqlite, { log: () => {} });

        expect(result).toMatchObject({ migrated: false, reason: 'already-migrated' });
        expect(fakeDb.state.execCalls).toContain(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_cluster_name_unique ON cluster(name COLLATE NOCASE)',
        );
    });

    it('reports duplicate names when the unique index cannot be created', () => {
        const logs = [];
        const sqlite = {
            exec() { throw new Error('duplicate names'); },
            query: () => ({ all: () => [{ name: 'Alpha', n: 2 }] }),
        };

        const result = ensureUniqueClusterName(sqlite, (message) => logs.push(message));

        expect(result).toEqual({ ok: false, duplicates: [{ name: 'Alpha', n: 2 }] });
        expect(logs[0]).toContain('"Alpha" (2)');
        expect(logs[1]).toContain('Rename one');
    });

    it('compares migrated rows with the source, including changed values', () => {
        fakeDb.state.clusters = [{ id: 'cluster-1', name: 'Alpha' }];
        fakeDb.state.nodes = [{
            cluster_id: 'cluster-1', name: 'node-1', host: 'other-host', password_enc: 'other-secret',
        }];

        const result = verifyMigration(fakeDb.sqlite, [{
            id: 'cluster-1', name: 'Alpha',
            nodes: [{ name: 'node-1', host: '10.0.0.1', password: 'secret' }, { name: 'missing', host: 'x' }],
        }]);

        expect(result.ok).toBe(false);
        expect(result.problems).toEqual([
            'Node count mismatch: blob has 2, tables have 1.',
            'Password ciphertext changed for cluster-1::node-1',
            'Host changed for cluster-1::node-1',
            'Node missing from tables: cluster-1::missing',
        ]);
    });

    it('creates tables safely when sqlite is unavailable', () => {
        expect(() => createClusterTables()).not.toThrow();
    });
});
