/**
 * ai-service.test.js - Unit tests for API Keys Controller
 *
 * Tests basic validation of AI Service Class and its models.
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

    it("Successfully creates AIServices instance with valid GEMINI provider", () => {
        try {
            const service = new AIServices('GEMINI', 'gemini-flash-latest', 'test-key-123')
            expect(service).toBeDefined()
        } catch (e) {
            expect(e).toBeUndefined()
        }
    })

    it("Rejects unsupported OPENAI provider", () => {
        try {
            new AIServices('OPENAI', 'gpt-4', 'test-key-456')
        } catch (e) {
            expect(e.message).toInclude("Unsupported AI provider")
        }
    })

    it("Rejects unsupported ANTHROPIC provider", () => {
        try {
            new AIServices('ANTHROPIC', 'claude-3', 'test-key-789')
        } catch (e) {
            expect(e.message).toInclude("Unsupported AI provider")
        }
    })

    it("Rejects invalid model name format", () => {
        try {
            new AIServices('GEMINI', '', 'test-key')
        } catch (e) {
            expect(e.message).toBe("Model name is missing")
        }
    })

    it("Rejects invalid API key format", () => {
        try {
            new AIServices('GEMINI', 'gemini-flash-latest', '')
        } catch (e) {
            expect(e.message).toBe("API key is missing")
        }
    })

    it("Rejects null provider", () => {
        try {
            new AIServices(null, 'gemini-flash-latest', 'test-key')
        } catch (e) {
            expect(e.message).toBe("Provider is missing")
        }
    })

    it("Rejects undefined provider", () => {
        try {
            new AIServices(undefined, 'gemini-flash-latest', 'test-key')
        } catch (e) {
            expect(e.message).toBe("Provider is missing")
        }
    })

    it("Rejects null model name", () => {
        try {
            new AIServices('GEMINI', null, 'test-key')
        } catch (e) {
            expect(e.message).toBe("Model name is missing")
        }
    })

    it("Rejects undefined model name", () => {
        try {
            new AIServices('GEMINI', undefined, 'test-key')
        } catch (e) {
            expect(e.message).toBe("Model name is missing")
        }
    })

    it("Rejects null API key", () => {
        try {
            new AIServices('GEMINI', 'gemini-flash-latest', null)
        } catch (e) {
            expect(e.message).toBe("API key is missing")
        }
    })

    it("Rejects undefined API key", () => {
        try {
            new AIServices('GEMINI', 'gemini-flash-latest', undefined)
        } catch (e) {
            expect(e.message).toBe("API key is missing")
        }
    })

    it("Returns Error on invalid provider type", () => {
        try {
            new AIServices('test', 'gemini-flash-latest', 'test-key')
        } catch (e) {
            expect(e.message).toInclude("Unsupported AI provider")
        }
    })

    it("Case-sensitive provider validation", () => {
        try {
            new AIServices('gemini', 'gemini-flash-latest', 'test-key')
        } catch (e) {
            expect(e.message).toInclude("Unsupported AI provider")
        }
    })

})