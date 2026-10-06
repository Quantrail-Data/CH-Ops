

import { beforeEach, describe, expect, it, mock } from 'bun:test'

const executeQuery = mock()
const getClusterById = mock()
const setAffinityResult = mock()

mock.module('../../src/backend/services/clickhouse.js', () => ({ executeQuery }))
mock.module('../../src/backend/services/clusterUtils.js', () => ({ getClusterById }))
mock.module('../../src/backend/services/k8sConnections.js', () => ({ setAffinityResult }))

const {
    CAPABILITY,
    classifyUsers,
    clearCapabilities,
    explain,
    hasCapability,
    ensureCapabilities,
    probeCapabilities,
    probeSessionAffinity,
    rbacContext,
    unavailableFeatures,
} = await import('../../src/backend/services/capabilities.js')

beforeEach(() => {
    clearCapabilities()
    executeQuery.mockReset()
    getClusterById.mockReset()
    setAffinityResult.mockReset()
})

describe('capabilities service', () => {
    it('detects shared merge tree deployments from system tables', async () => {
        executeQuery.mockResolvedValue({
            rows: [{ name: 'replicas' }, { name: 'disks' }, { name: 'query_log' }],
            columns: ['name'],
            stats: {},
            queryId: null,
        })

        const node = { host: 'node-1', port: 8123, secure: false, user: 'default', password: '' }
        const result = await probeCapabilities('cluster-1', node)

        expect(executeQuery).toHaveBeenCalledWith(expect.objectContaining({
            host: 'node-1',
            readOnly: true,
            sql: expect.stringContaining('system.tables'),
        }))
        expect(result.probed).toBeTrue()
        expect(result.deployment).toBe('shared-merge-tree')
        expect(result.tables.has(CAPABILITY.REPLICAS)).toBeTrue()
        expect(result.tables.has(CAPABILITY.REPLICATION_QUEUE)).toBeFalse()
        expect(result.tables.has(CAPABILITY.REPLICATED_FETCHES)).toBeFalse()
    })

    it('reports missing capabilities and explanations', async () => {
        executeQuery.mockResolvedValue({
            rows: [{ name: 'replicas' }, { name: 'disks' }],
            columns: ['name'],
            stats: {},
            queryId: null,
        })

        const node = { host: 'node-1', port: 8123, secure: false, user: 'default', password: '' }
        await probeCapabilities('cluster-1', node)

        expect(hasCapability('cluster-1', CAPABILITY.REPLICAS)).toBeTrue()
        expect(hasCapability('cluster-1', CAPABILITY.QUERY_LOG)).toBeFalse()
        expect(explain(CAPABILITY.TEXT_LOG)).toContain('logging')
        expect(explain('unknown')).toContain('not available')
        expect(unavailableFeatures('cluster-1')).toContainEqual(expect.objectContaining({
            table: CAPABILITY.TEXT_LOG,
        }))
    })

    it('caches successful probes and reports failures without blocking callers', async () => {
        const node = { host: 'node-1', port: 8123, secure: false, user: 'default', password: '' }
            executeQuery.mockRejectedValueOnce(new Error('offline'))
        expect(await probeCapabilities('offline', node)).toEqual({
            probed: false, error: 'offline', tables: null, deployment: 'unknown',
        })
        expect(hasCapability('offline', CAPABILITY.TEXT_LOG)).toBeTrue()
        expect(unavailableFeatures('offline')).toEqual([])

        executeQuery.mockClear()
        executeQuery
            .mockResolvedValueOnce({ rows: [{ name: 'query_log' }] })
            .mockResolvedValueOnce({ rows: [{ version: '25.6.1' }] })
        await probeCapabilities('cached', node)
        await probeCapabilities('cached', node)
        expect(executeQuery).toHaveBeenCalledTimes(2)
        clearCapabilities('cached')
        await probeCapabilities('cached', node)
        expect(executeQuery).toHaveBeenCalledTimes(4)
    })

    it('uses the cluster node when ensuring capabilities and handles missing clusters', async () => {
        expect(await ensureCapabilities('missing')).toEqual({
            probed: false, tables: null, deployment: 'unknown',
        })
        getClusterById.mockReturnValue({ nodes: [{ host: 'node-1', port: 8123 }] })
        executeQuery.mockResolvedValue({ rows: [] })
        expect((await ensureCapabilities('present')).probed).toBeTrue()
    })

    it('checks whether session affinity is sticky across two calls', async () => {
        executeQuery
            .mockResolvedValueOnce({ rows: [{ h: 'node-a' }], columns: ['h'], stats: {}, queryId: null })
            .mockResolvedValueOnce({ rows: [{ h: 'node-a' }], columns: ['h'], stats: {}, queryId: null })

        const node = { host: 'node-1', port: 8123, secure: false, user: 'default', password: '' }
        const result = await probeSessionAffinity(node)

        expect(result).toEqual({ checked: true, sticky: true, hosts: ['node-a', 'node-a'] })
    })

    it('handles affinity probes with missing hosts or query failures', async () => {
        const node = { host: 'node-1' }
        executeQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ h: 'node-a' }] })
        expect(await probeSessionAffinity(node)).toEqual({ checked: false, sticky: null })
        executeQuery.mockRejectedValueOnce(new Error('offline'))
        expect(await probeSessionAffinity(node)).toEqual({ checked: false, sticky: null })
    })

    it('classifies users and flags replicated access storage', async () => {
        executeQuery.mockResolvedValue({
            rows: [
                { name: 'alice', storage: 'local_directory' },
                { name: 'bob', storage: 'replicated' },
            ],
            columns: ['name', 'storage'],
            stats: {},
            queryId: null,
        })

        const node = { host: 'node-1', port: 8123, secure: false, user: 'default', password: '' }
        const result = await classifyUsers(node)

        expect(result.checked).toBeTrue()
        expect(result.users[0]).toMatchObject({
            name: 'alice',
            storage: 'local_directory',
            readOnly: false,
            nodeLocal: true,
        })
        expect(result.accessStorageReplicated).toBeTrue()
    })

    it('reports an unavailable user inventory', async () => {
        executeQuery.mockRejectedValueOnce(new Error('denied'))
        expect(await classifyUsers({ host: 'node-1' })).toEqual({
            checked: false, error: 'denied', users: [], accessStorageReplicated: false,
        })
    })

    it('builds RBAC context and persists affinity results', async () => {
        getClusterById.mockReturnValue({
            id: 'cluster-1',
            kind: 'k8s',
            k8s: { installation: 'prod', connectionId: 'conn-1' },
            nodes: [
                { host: 'node-1', port: 8123, secure: false, user: 'default', password: '' },
                { host: 'node-2', port: 8123, secure: false, user: 'default', password: '' },
            ],
        })

        executeQuery
            .mockResolvedValueOnce({
                rows: [{ name: 'alice', storage: 'users_xml' }],
                columns: ['name', 'storage'],
                stats: {},
                queryId: null,
            })
            .mockResolvedValueOnce({ rows: [{ h: 'node-a' }], columns: ['h'], stats: {}, queryId: null })
            .mockResolvedValueOnce({ rows: [{ h: 'node-a' }], columns: ['h'], stats: {}, queryId: null })

        const result = await rbacContext('cluster-1')

        expect(result).toMatchObject({
            replicaCount: 2,
            defaultOnCluster: 'prod',
            warnAboutOnCluster: true,
            accessStorageReplicated: false,
        })
        expect(result.sessionAffinity).toMatchObject({ checked: true, sticky: true })
        expect(setAffinityResult).toHaveBeenCalledWith('conn-1', true)
    })

    it('returns no RBAC context without a cluster or node', async () => {
        expect(await rbacContext('missing')).toBeNull()
        getClusterById.mockReturnValue({ nodes: [] })
        expect(await rbacContext('empty')).toBeNull()
    })
})
