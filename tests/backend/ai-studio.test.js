/**
 * ai-studio.test.js - Unit tests for AI Response
 *
 * Tests AI Response Generation based on prompt.
 * Verifies error generation
 *
 * Author: Syed Ashiq
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */


import { describe, it, expect, beforeEach, vi, mock } from 'bun:test'
import { completeDdl, getActiveAiConfig, getAiStatus } from '../../src/backend/services/studioAi'
import { initCrypto } from '../../src/backend/services/crypto'



try {

    initCrypto(process.env.SESSION_SECRET)
} catch {

}


const cfg = { name: 'GEMINI', provider: 'GEMINI', model: 'gemini-flash-latest', encryptedKey: 'test' }

beforeEach(() => {
    vi.clearAllMocks()

})

describe("AI Completion", () => {

    it("Generates AI Response", async () => {
        vi.mock('@google/genai', () => {
            const Models = class {
                constructor() {
                    this.generateContent = () => ({ text: 'WORKING' })
                }
            }
            return {
                GoogleGenAI: class {
                    constructor() {
                        this.models = new Models()
                    }
                }
            }
        })
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))
        const response = await completeDdl()
        expect(response).toBe('WORKING')
    })

    it("Throws error on empty API Keys", () => {
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => null })) })) })),

            }
        }))
        expect(async () => { await completeDdl() }).toThrow("No AI provider configured. Set one in Settings.")
    })

    it("Throws error on empty API Key value", () => {
        cfg.encryptedKey = ''
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))
        expect(async () => { await completeDdl() }).toThrow("The configured AI key is empty.")
        cfg.encryptedKey = 'test'


    })

    it("Throws error invalid AI Provider", () => {
        cfg.name = 'CLAUDE'
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))
        expect(async () => { await completeDdl() }).toThrow(`AI provider "${cfg.name}" is not supported yet. Select Gemini.`)
        cfg.name = 'GEMINI'


    })

    it('Throws error on resource exhaustion', () => {
        vi.mock('@google/genai', () => {
            const Models = class {
                constructor() {
                    this.generateContent = () => {
                        const e = new Error('Resource exhausted')
                        e.status = 429
                        throw e
                    }
                }
            }
            return {
                GoogleGenAI: class {
                    constructor() {
                        this.models = new Models()
                    }
                }
            }
        })
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))

        expect(async () => { await completeDdl() }).toThrow("AI provider rate limit exceeded. Please try again later.")


    })



    it('Throws error on invalid API Key', () => {
        vi.mock('@google/genai', () => {
            const Models = class {
                constructor() {
                    this.generateContent = () => {
                        const e = new Error('invalid authentication')
                        e.status = 401
                        throw e
                    }
                }
            }
            return {
                GoogleGenAI: class {
                    constructor() {
                        this.models = new Models()
                    }
                }
            }
        })
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))

        expect(async () => { await completeDdl() }).toThrow("AI authentication failed. Please verify the API key in Settings.")


    })


    it('Throws error for unknown error status', () => {
        vi.mock('@google/genai', () => {
            const Models = class {
                constructor() {
                    this.generateContent = () => {
                        const e = new Error('unkonwn error')
                        e.status = 500
                        throw e
                    }
                }
            }
            return {
                GoogleGenAI: class {
                    constructor() {
                        this.models = new Models()
                    }
                }
            }
        })
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))

        expect(async () => { await completeDdl() }).toThrow("AI request failed: unkonwn error")


    })

})


describe("AI Configuration", () => {
    it("Gets active AI config", () => {
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))
        const activeCFG = getActiveAiConfig()
        expect(activeCFG).toBeDefined()
    })


    it("Returns null on empty API Key", () => {
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => null })) })) })),

            }
        }))
        const activeCFG = getActiveAiConfig()
        expect(activeCFG).toBeNull()
    })

    it("Gets AI Status from configuration", () => {
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => cfg })) })) })),

            }
        }))
        const status = getAiStatus(cfg)
        expect(status.executable).toBeTrue()
    })

})