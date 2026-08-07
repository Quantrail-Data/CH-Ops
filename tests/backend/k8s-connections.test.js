/**
 * api-keys.test.js - Unit tests for K8s Controller
 *
 * Tests K8s connection, provider, operator controllers.
 * Verifies error generation
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */

import { describe, it, expect, vi, mock, beforeEach } from 'bun:test'
import { checkPermissions, deleteConnection, detectOperators, getConnection, listConnections, providerFor, readInstallationHosts, saveConnection, setAffinityResult, testConnection } from '../../src/backend/services/k8sConnections'

let connections = [{ id: 1, name: 'test', apiAddress: 'localhost', namespaces: null, affinityOk: false, createdAt: new Date().toLocaleString(), updatedAt: new Date().toLocaleString(), caCertificate: 'test', tokenEnc: 'test' }]


beforeEach(() => {
    vi.clearAllMocks()

    vi.mock('../../src/backend/db', () => ({
        db: {
            select: mock(() => ({
                from: mock(() => ({
                    where: mock((fn) => {
                        const field = fn.queryChunks.at(1).name.replace(
                            /(?!^)_(.)/g,
                            (_, char) => char.toUpperCase())
                        const value = fn.queryChunks.at(3).value
                        const filtered = connections.find(k => k[field] === value)
                        return { get: () => filtered, run: () => filtered }
                    }),
                    all: () => connections
                }))
            })),
            insert: mock(() => ({
                values: (payload) => {
                    const id = connections.length
                    connections.push({ ...payload, id })
                    return { run: () => ({ lastInsertRowid: id }) }
                }
            })),
            delete: mock(() => ({
                where: mock((fn) => {
                    const field = fn.queryChunks.at(1).name
                    const value = fn.queryChunks.at(3).value
                    connections = connections.filter(k => k[field] !== value)
                    return { run: vi.fn() }
                })
            })),
            update: mock(() => ({
                set: (payload) => {

                    return {
                        where: mock((fn) => {
                            const field = fn.queryChunks.at(1).name
                            const value = fn.queryChunks.at(3).value
                            connections = connections.map(k => {
                                if (k[field] === value) {
                                    return { ...k, ...payload }
                                } else {
                                    return k
                                }
                            })
                            return { get: () => connections, run: () => connections }
                        }),
                        run: mock(() => {
                            connections = connections.map(k => {
                                return { ...k, ...payload }
                            })
                        })
                    }
                }
            }))
        }
    }))
    vi.mock('../../src/backend/services/crypto', () => ({
        decrypt: (str) => str
    }))
})


describe("Connections controller", () => {

    it("lists connections", () => {
        const connections = listConnections()

        expect(connections.length).toBe(1)
    })

    it("gets connection", () => {
        const connection = getConnection(1)

        expect(connection).toBeDefined()
    })

    it('Updates connection', () => {
        const updateTo = { ...connections.at(0), name: 'test-2' }
        saveConnection(updateTo)
        expect(connections.at(0).name).toBe('test-2')
    })

    it('deletes connection', () => {
        const temp = connections.at(0)
        deleteConnection(1)
        expect(connections.length).toBe(0)
        connections.push(temp)
    })

    it('Sets Affinity Result', () => {
        setAffinityResult(1, true)
        expect(connections.at(0).affinityOk).toBeTrue()
    })

})


describe("Provider controller", () => {
    vi.mock('../../src/backend/services/k8s/akoc', () => {
        return {
            createAkocProvider: () => 'AKOC'
        }
    })

    vi.mock('../../src/backend/services/k8s/ocko', () => {
        return {
            createOckoProvider: () => 'OCKO'
        }
    })

    vi.mock('../../src/backend/services/k8s/client', () => {
        return { createK8sClient: () => 'Client' }
    })
    it('Creates AKOC provider', () => {
        expect(providerFor(1).provider).toBe('AKOC')
    })
    it('Creates OCKO provider', () => {
        expect(providerFor(1, 'ocko').provider).toBe('OCKO')
    })
})


describe.only('Operator controller', () => {
    it('Lists providers', async () => {
        const client = {
            listPage: () => { },
            get: () => ({ preferredVersion: { version: 1 } })
        }
        const found = await detectOperators(client, '')
        expect(found.length).toBe(2)

    })
    it("Checks permission", async () => {
        const client = {
            post: () => ({
                status: {
                    resourceRules: []
                }
            })
        }
        const result = await checkPermissions(client, '')
        expect(result.checked).toBeTrue()
    })
    it('Tests connection', async () => {

        vi.mock('../../src/backend/services/k8s/client', () => {
            return {
                createK8sClient: () => {
                    return {
                        listPage: vi.fn(),
                        post: () => ({
                            status: {
                                resourceRules: []
                            }
                        })
                    }
                },

            }
        })
        const { apiAddress, caCertificate, token } = connections.at(0)
        const result = await testConnection({ apiAddress, caCertificate, token, namespace: 'namespace' })
        expect(result.kubernetes.ok).toBeTrue()
        expect(result.permissions.checked).toBeTrue()
        expect(result.operator.reachable).toBeTrue()

    })
    it('reads installation hooks', async () => {

        vi.mock('../../src/backend/services/k8s/akoc', () => {
            return {
                createAkocProvider: () => ({
                    getHosts: () => {
                        return [{
                            podName: 'test',
                            cluster: 'test',
                            shard: 'test',
                            replica: 'test',
                        }]
                    }
                })

            }
        })

        vi.mock('../../src/backend/services/k8s/client', () => {
            return { createK8sClient: () => 'Client' }
        })

        const hosts = await readInstallationHosts(1, 'localhost', '')

        expect(hosts.length).toBe(1)

    })
})

