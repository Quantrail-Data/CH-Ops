/**
 * ai-studio.test.js - Unit tests for AI Response
 *
 * Tests AI Response Generation based on prompt.
 * Verifies error generation
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */


import { describe, it, expect, beforeAll, beforeEach, vi } from 'bun:test'
import { initCrypto } from '../../src/backend/services/crypto'
import { completeDdl } from '../../src/backend/services/studioAi'
import { createApiKey, deleteApiKey, getActiveApiKey, setActiveApiKey } from '../../src/backend/services/apiKeys'


try {

    initCrypto(process.env.SESSION_SECRET)
} catch {

}


let activeAPIKey;
beforeEach(() => {
    vi.clearAllMocks()
    activeAPIKey = getActiveApiKey()
})

describe("AI Completion", () => {

    it("Returns error on empty API Keys", async () => {
        if (activeAPIKey) deleteApiKey(activeAPIKey.id)
        try {
            await completeDdl('This is a test request, respond with only `WORKING`')
            throw new Error("Failed to return Error.")
        } catch (e) {
            expect(e.status).toBe(400)
            expect(e.message).toBe('No AI provider configured. Set one in Settings.')
        }
        if (activeAPIKey) {
            activeAPIKey = createApiKey(activeAPIKey.name, activeAPIKey.key, activeAPIKey.model)
            setActiveApiKey(activeAPIKey.id)
        }
    })

    it("Returns error on empty API Key value", async () => {
        const tempAPIKey = createApiKey('Test Key', '', 'test-model')
        setActiveApiKey(tempAPIKey.id)
        try {
            await completeDdl('This is a test request, respond with only `WORKING`')
            throw new Error("Failed to return Error.")
        } catch (e) {
            expect(e.status).toBe(400)
            expect(e.message).toBe('The configured AI key is empty.')
        }
        if (activeAPIKey) setActiveApiKey(activeAPIKey.id)
        deleteApiKey(tempAPIKey.id)
    })

    it("Returns error invalid AI Provider", async () => {
        const tempAPIKey = createApiKey('Invalid Provider Key', 'test-key', 'test-model')
        setActiveApiKey(tempAPIKey.id)
        try {
            await completeDdl('This is a test request, respond with only `WORKING`')
            throw new Error("Failed to return Error.")
        } catch (e) {
            expect(e.status).toBe(400)
            expect(e.message).toInclude('Select Gemini')
        }
        if (activeAPIKey) setActiveApiKey(activeAPIKey.id)
        deleteApiKey(tempAPIKey.id)
    })



})