/**
 * api-keys.test.js - Unit tests for API Keys Controller
 *
 * Tests Creating, Updating , Deleting and setting Active API Keys.
 * Verifies error generation
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */


import { afterAll, describe, expect, it } from "bun:test"
import { createApiKey, deleteApiKey, getActiveApiKey, getAllApiKeys, getApiKeyById, getApiKeysWithValues, setActiveApiKey, updateApiKey } from "../../src/backend/services/apiKeys"
import { initCrypto } from "../../src/backend/services/crypto"

try {

    initCrypto(process.env.SESSION_SECRET)
} catch {

}

let ActiveKey, SecondKey;

describe("Create Flow", () => {
    it("Creates API Key and is Marked Active", () => {
        ActiveKey = createApiKey("test API", "sk-test-key", "gpt-5.4")
        expect(ActiveKey.key).toBe("sk-test-key")
        expect(ActiveKey.isActive).toBe(true)
    })

    it("Second key is created and not marked active by default", () => {
        SecondKey = createApiKey("test API Key 2", "sk-test-key-2", "gemini-fast-2.5")
        expect(SecondKey.key).toBe("sk-test-key-2")
        expect(SecondKey.isActive).toBe(false)
    })


    it("key with duplicate name returns error", () => {
        try {

            createApiKey("test API", "sk-test-key", "gpt-5.4")
            throw new Error("Failed.")

        } catch (e) {
            expect(e.message).toBe("An API key with this name already exists.")
        }
    })

})

describe("API Key Limits", () => {
    it("Rejects when maximum keys have been created", () => {
        try {
            Array.from({ length: 3 }).forEach((_, i) => {
                createApiKey(`test API ${i * 50}`, `sk-test-key${i}`, "gpt-5.4")

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
        const fields = ["id", "name", "isActive", "createdAt", "updatedAt", "model"]
        apiKeys.forEach(key => {
            fields.forEach(field => {
                if (key[field] == undefined) {
                    throw new Error(`Missng Field ${field} in ${JSON.stringify(key)}.`)
                }
            })
        })

    })

    it("Fetches Active API Key with decrypted key", () => {
        const activeKey = getActiveApiKey()
        expect(activeKey.isActive).toBe(true)
        expect(activeKey.key).toBe(ActiveKey.key)
    })

    it("Fetches API Key by ID with null as fallback", () => {
        const APIKey = getApiKeyById(ActiveKey.id)
        expect(APIKey.id).toBe(ActiveKey.id)

        const NULLAPIKey = getApiKeyById('')
        expect(NULLAPIKey).toBe(null)

    })

    it('Fetches API Keys with decrypted values', () => {
        const APIKeys = getApiKeysWithValues()
        APIKeys.forEach(key => {
            if (key.key === undefined) {
                throw new Error(`Missng Field key in ${JSON.stringify(key)}.`)
            }
        })
    })

})

describe("Updating API Key", () => {

    it("Updates a valid key", () => {
        ActiveKey = { ...ActiveKey, name: "API Key Updated", key: "sk-updated-keys", model: "gemini-4.5" }
        const updatedKey = updateApiKey(ActiveKey.id, ActiveKey.name, ActiveKey.key, ActiveKey.model)
        expect(updatedKey.name).toBe(ActiveKey.name)
        expect(updatedKey.key).toBe(ActiveKey.key)
        expect(updatedKey.model).toBe(ActiveKey.model)
    })

    it("Returns Duplicate Name error when updating", () => {
        try {

            updateApiKey(ActiveKey.id, "test API Key 2", ActiveKey.key, ActiveKey.model)
            throw new Error('Failed to return Error.')
        } catch (e) {
            expect(e.message).toBe('An API key with this name already exists.')
        }
    })

    it("Return API Key not found error", () => {

        try {

            updateApiKey('', ActiveKey.name, ActiveKey.key, ActiveKey.model)
            throw new Error('Failed to return Error.')
        } catch (e) {
            expect(e.message).toBe('API key not found.')
        }
    })

})


describe("Set Acitve API Key", () => {

    it("Active API Key is set", () => {
        ActiveKey = setActiveApiKey(SecondKey.id)
        expect(ActiveKey.id).toBe(SecondKey.id)
    })

    it("Returns Key not found", () => {
        try {
            ActiveKey = setActiveApiKey('')
            throw new Error('Failed to return Error.')
        } catch (e) {
            expect(e.message).toBe('API key not found.')
        }
    })

})

afterAll(() => {
    const keys = getAllApiKeys()
    keys.forEach(k => deleteApiKey(k.id))
})