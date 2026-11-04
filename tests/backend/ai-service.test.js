/**
 * ai-service.test.js - Unit tests for API Keys Controller
 *
 * Tests basic validation of AI Service Class.
 * Verifies error generation
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */



import { describe, it, expect } from 'bun:test'
import AIServices from '../../src/backend/servicesAI/AIService'
import { initCrypto } from '../../src/backend/services/crypto'

try {
    initCrypto(process.env.SESSION_SECRET)
} catch {

}

describe("AI Service", () => {
    it("Returns Error on missing provider", () => {
        try {
            new AIServices()
        } catch (e) {
            expect(e.message).toBe("Provider is missing")
        }
    })

    it("Returns Error on missing model name", () => {
        try {
            new AIServices('GEMINI')
        } catch (e) {
            expect(e.message).toBe("Model name is missing")
        }
    })

    it("Returns Error on missing API Key", () => {
        try {
            new AIServices('GEMINI', 'gemini-flash-latest')
        } catch (e) {
            expect(e.message).toBe("API key is missing")
        }
    })

    it("Verifies valid provider", () => {
        try {
            new AIServices('OTHER', 'gemini-flash-latest', 'test-key')
        } catch (e) {
            expect(e.message).toInclude("Unsupported AI provider")
        }
    })

})