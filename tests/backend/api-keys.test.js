/**
 * api-keys.test.js - Unit tests for API Keys Controller
 *
 * Tests Creating, Updating , Deleting and setting Active API Keys.
 * Verifies error generation
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */


import { beforeEach, describe, expect, it, mock, vi } from "bun:test"
import { createApiKey, deleteApiKey, getActiveApiKey, getAllApiKeys, getApiKeyById, getApiKeysWithValues, setActiveApiKey, updateApiKey } from "../../src/backend/services/apiKeys"
import { initCrypto } from "../../src/backend/services/crypto"

try {

    initCrypto(process.env.SESSION_SECRET)
} catch {

}

let keys = []


beforeEach(() => {
    vi.clearAllMocks()
    vi.mock('drizzle-orm', () => ({
        eq: (_, id) => {
            return keys.find(k => k.id === id)
        }
    }))
    vi.mock('../../src/backend/db', () => ({
        db: {
            select: mock(() => ({
                from: mock(() => ({
                    where: mock((fn) => {
                        return { get: () => fn, run: () => fn }
                    }),
                    all: () => keys
                }))
            })),
            insert: mock(() => ({
                values: (payload) => {
                    const id = keys.length
                    keys.push({ ...payload, id })
                    return { run: () => ({ lastInsertRowid: id }) }
                }
            })),
            delete: mock(() => ({
                where: mock((fn) => {
                    keys = keys.filter(k => k.id !== fn.id)
                    return { run: vi.fn() }
                })
            })),
            update: mock(() => ({
                set: (payload) => {

                    return {
                        where: mock((fn) => {
                            const id = fn.id
                            keys = keys.map(k => {
                                if (k.id === id) {
                                    return { ...k, ...payload }
                                } else {
                                    return k
                                }
                            })
                            return { get: () => fn, run: () => fn }
                        }),
                        run: mock(() => {
                            keys = keys.map(k => {
                                return { ...k, ...payload }
                            })
                        })
                    }
                }
            }))
        }
    }))
})


describe("Create Flow", () => {
    it("Creates API Key and is Marked Active", () => {
        const ActiveKey = createApiKey("test API", "sk-test-key", "gpt-5.4", 'OPEN AI')
        expect(ActiveKey.key).toBe("sk-test-key")
        expect(ActiveKey.isActive).toBe(true)
    })

    it("Second key is created and not marked active by default", () => {
        const SecondKey = createApiKey("test API Key 2", "sk-test-key-2", "gemini-fast-2.5", 'GEMINI')
        expect(SecondKey.key).toBe("sk-test-key-2")
        expect(SecondKey.isActive).toBe(false)
    })


    it("key with duplicate name returns error", () => {
        try {

            createApiKey("test API", "sk-test-key", "gpt-5.4", 'OPEN AI')
            throw new Error("Failed.")

        } catch (e) {
            expect(e.message).toBe("An API key with this name already exists.")
        }
    })

})

describe("API Key Limits", () => {
    it("Rejects when maximum keys have been created", () => {
        try {
            Array.from({ length: 5 }).forEach((_, i) => {
                createApiKey(`test API ${i * 50}`, `sk-test-key${i}`, "gpt-5.4", 'OPEN AI')

            })
            throw new Error("Failed.")
        } catch (e) {
            expect(e.message).toBe(`Maximum 4 API keys allowed.`)
        }
    })
})

describe("Get API Keys", () => {
    it("Fetches All API Keys with expected fileds", () => {
        const apiKeys = getAllApiKeys()
        if (apiKeys.length === 0) throw new Error("Returned Empty.")
        const fields = ["id", "name", "isActive", "model"]
        apiKeys.forEach(key => {
            fields.forEach(field => {
                if (key[field] == undefined) {
                    throw new Error(`Missng Field ${field} in ${JSON.stringify(key)}.`)
                }
            })
        })
        const emp = keys
        keys = []
        const emptyKeys = getAllApiKeys()
        expect(emptyKeys.length).toBe(0)
        keys = emp


    })

    it("Fetches Active API Key with decrypted key", () => {
        const activeKey = getActiveApiKey()
        expect(activeKey.isActive).toBe(true)
        const emp = keys
        keys = []
        const emptyKey = getActiveApiKey()
        expect(emptyKey).toBeNull()
        keys = emp
    })

    it("Fetches API Key by ID with null as fallback", () => {
        const APIKey = getApiKeyById(keys[0].id)
        expect(APIKey.id).toBe(keys[0].id)

        const NULLAPIKey = getApiKeyById('')
        expect(NULLAPIKey).toBe(null)

        const emp = keys
        keys = []
        const emptyKey = getApiKeyById('test')
        expect(emptyKey).toBeNull()
        keys = emp


    })

    it('Fetches API Keys with decrypted values', () => {
        const APIKeys = getApiKeysWithValues()
        APIKeys.forEach(key => {
            if (key.key === undefined) {
                throw new Error(`Missng Field key in ${JSON.stringify(key)}.`)
            }
        })
        const emp = keys
        keys = []
        const emptyKeys = getApiKeysWithValues()
        expect(emptyKeys.length).toBe(0)
        keys = emp
    })

})

describe("Updating API Key", () => {

    it("Updates a valid key", () => {
        const ActiveKey = { ...keys.find(k => k.isActive), name: "API Key Updated", key: "sk-updated-keys", model: "gemini-4.5" }
        const updatedKey = updateApiKey(ActiveKey.id, ActiveKey.name, ActiveKey.key, ActiveKey.model, ActiveKey.provider)
        expect(updatedKey.name).toBe(ActiveKey.name)
        expect(updatedKey.key).toBe(ActiveKey.key)
        expect(updatedKey.model).toBe(ActiveKey.model)
    })

    it("Returns Duplicate Name error when updating", () => {
        try {
            const ActiveKey = keys.find(k => k.isActive)

            updateApiKey(ActiveKey.id, "test API Key 2", ActiveKey.key, ActiveKey.model, ActiveKey.provider)
            throw new Error('Failed to return Error.')
        } catch (e) {
            expect(e.message).toBe('An API key with this name already exists.')
        }
    })

    it("Return API Key not found error", () => {

        try {
            const ActiveKey = keys.find(k => k.isActive)

            updateApiKey('', ActiveKey.name, ActiveKey.key, ActiveKey.model, ActiveKey.provider)
            throw new Error('Failed to return Error.')
        } catch (e) {
            expect(e.message).toBe('API key not found.')
        }
    })

})


describe("Set Acitve API Key", () => {

    it("Active API Key is set", () => {
        const ActiveKey = setActiveApiKey(keys.at(-1).id)
        expect(ActiveKey.id).toBe(keys.at(-1).id)
    })

    it("Returns Key not found", () => {
        try {
            setActiveApiKey('')
            throw new Error('Failed to return Error.')
        } catch (e) {
            expect(e.message).toBe('API key not found.')
        }
    })

})


describe("Deleting API Key", () => {
    it("Verifies valid API Key", () => {

        expect(() => { deleteApiKey('invalid-id') }).toThrow('API key not found.')
    })
    it("Deletes an inactive API Key", () => {
        const toDelete = keys.at(-1)
        deleteApiKey(toDelete.id)
        const deleted = getApiKeyById(toDelete.id)
        expect(deleted).toBeNull()
    })

    it("Deletes an active API Key", () => {
        const toDelete = keys.at(-1)
        deleteApiKey(toDelete.id)
        const active = getActiveApiKey(toDelete.id)
        expect(active).toBeDefined()
    })

})