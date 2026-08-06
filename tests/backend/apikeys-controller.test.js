import { describe, it, expect, vi, beforeEach, mock, beforeAll, afterAll } from 'bun:test'

const aiAskMock = vi.fn()
const mockLookup = vi.fn()
let keys = []

vi.mock('../../src/backend/servicesAI/AIService.js', () => ({
    default: class {
        async ask(prompt) {
            return aiAskMock(prompt)
        }
    }
}))

vi.mock('../../src/backend/db/index.js', () => ({
    db: {
        select: mock(() => ({
            from: mock(() => ({
                where: mock((fn) => {
                    const field = fn.queryChunks.at(1).name.replace(/(?!^)_(.)/g, (_, char) => char.toUpperCase())
                    const value = fn.queryChunks.at(3).value
                    const filtered = keys.find(k => k[field] === value)
                    return { get: () => filtered, run: () => filtered }
                }),
                all: () => keys,
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
                const field = fn.queryChunks.at(1).name
                const value = fn.queryChunks.at(3).value
                keys = keys.filter(k => k[field] !== value)
                return { run: vi.fn() }
            })
        })),
        update: mock(() => ({
            set: (payload) => {
                return {
                    where: mock((fn) => {
                        const field = fn.queryChunks.at(1).name
                        const value = fn.queryChunks.at(3).value
                        keys = keys.map(k => k[field] === value ? { ...k, ...payload } : k)
                        return { get: () => keys, run: () => keys }
                    }),
                    run: mock(() => {
                        keys = keys.map(k => ({ ...k, ...payload }))
                    })
                }
            }
        }))
    }
}))

vi.mock('node:dns/promises', () => ({
    lookup: mockLookup,
}))

let createAPIKey, deleteAPIKey, getActiveAPIKey, getAPIKeyById, getAPIKeys, getAPIKeysWithValues, setActiveAPIKey, testAPIKey, updateAPIKey, getOllamaModels
import { initCrypto } from '../../src/backend/services/crypto'

beforeAll(async () => {
    try {
        initCrypto('test-session-secret-minimum-32-characters-long!');
    } catch {

    }

    const module = await import('../../src/backend/controllers/apikeys.js')
    createAPIKey = module.createAPIKey
    deleteAPIKey = module.deleteAPIKey
    getActiveAPIKey = module.getActiveAPIKey
    getAPIKeyById = module.getAPIKeyById
    getAPIKeys = module.getAPIKeys
    getAPIKeysWithValues = module.getAPIKeysWithValues
    setActiveAPIKey = module.setActiveAPIKey
    testAPIKey = module.testAPIKey
    updateAPIKey = module.updateAPIKey
    getOllamaModels = module.getOllamaModels
})

const mockedRequest = { body: {} }

const mockedResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
}

beforeEach(async () => {
    vi.clearAllMocks()
    aiAskMock.mockReset()
    mockedRequest.params = {}
    mockedRequest.body = {}
    keys = []

    mockedRequest.body = { name: 'baseline', apiKey: 'baseline-sk', model: 'baseline-model', provider: 'baseline-provider' }
    await createAPIKey(mockedRequest, mockedResponse)
    mockedRequest.body = {}
    vi.clearAllMocks()
})


describe("Create API Keys Controller", () => {
    it("Creates API Key", async () => {
        mockedRequest.body = { name: 'test', apiKey: 'sk-test', model: 'test-model', provider: 'test-provider' }
        await createAPIKey(mockedRequest, mockedResponse)
        mockedRequest.body = {}

        expect(mockedResponse.status).toHaveBeenCalledWith(201)
    })

    it("Returns 400 when required fields are missing", async () => {
        await createAPIKey(mockedRequest, mockedResponse)
        expect(mockedResponse.status).toHaveBeenCalledWith(400)

        mockedRequest.body = { name: 'test' }
        await createAPIKey(mockedRequest, mockedResponse)
        expect(mockedResponse.status).toHaveBeenCalledWith(400)

        mockedRequest.body = { name: 'test', provider: 'test-provider' }
        await createAPIKey(mockedRequest, mockedResponse)
        expect(mockedResponse.status).toHaveBeenCalledWith(400)

        mockedRequest.body = { name: 'test', provider: 'test-provider', apiKey: 'sk-test' }
        await createAPIKey(mockedRequest, mockedResponse)
        expect(mockedResponse.status).toHaveBeenCalledWith(400)

        mockedRequest.body = { name: 'test', provider: 'test-provider', apiKey: 'sk-test', model: 'test-model' }
        await createAPIKey(mockedRequest, mockedResponse)
        expect(mockedResponse.status).toHaveBeenCalledWith(201)
    })

})

describe("Fetch API Keys Controller", () => {
    it("Returns all API keys", async () => {
        await getAPIKeys(mockedRequest, mockedResponse)
        const calledLast = mockedResponse.json.mock.calls
        if (calledLast[0] && calledLast[0][0]) {
            const obj = calledLast[0][0]
            expect(obj).toHaveProperty('apiKeys')
            expect(obj).toHaveProperty('selectedKeyId')
        } else {
            expect().fail()
        }
    })

    it("Returns API Key by ID", async () => {
        mockedRequest.params = { id: 0 }
        await getAPIKeyById(mockedRequest, mockedResponse)
        const calledLast = mockedResponse.json.mock.calls
        if (calledLast[0] && calledLast[0][0]) {
            const obj = calledLast[0][0]
            expect(obj).toHaveProperty('keyValue')
        } else {
            expect().fail()
        }
    })


    it("Returns APi Keys with values", async () => {
        await getAPIKeysWithValues(mockedRequest, mockedResponse)
        const calledLast = mockedResponse.json.mock.calls
        if (calledLast[0] && calledLast[0][0]) {
            const obj = calledLast[0][0]
            expect(obj).toHaveProperty('apiKeys')
            expect(obj).toHaveProperty('selectedKeyId')
        } else {
            expect().fail()
        }
    })

})

describe("Active API Key controller", () => {

    it("Returns Active API Key", async () => {
        await getActiveAPIKey(mockedRequest, mockedResponse)
        const calledLast = mockedResponse.json.mock.calls
        if (calledLast[0] && calledLast[0][0]) {
            const obj = calledLast[0][0]

            expect(obj).toHaveProperty('apiKey')
        } else {
            expect().fail()
        }
    })

    it("Sets Active API Key", async () => {
        mockedRequest.body = { keyId: keys.at(-1).id }
        await setActiveAPIKey(mockedRequest, mockedResponse)
        const calledLast = mockedResponse.json.mock.calls
        if (calledLast[0] && calledLast[0][0]) {

            const obj = calledLast[0][0]
            expect(obj.id).toBe(keys.at(-1).id)
        } else {
            expect().fail()
        }
    })
})

describe("API Key Contoller", () => {

    it("Updates API Key", async () => {
        mockedRequest.body = { name: 'test-modified', apiKey: 'sk-test', model: 'test-model', provider: 'test-provider' }
        mockedRequest.params = { id: 0 }
        await updateAPIKey(mockedRequest, mockedResponse)
        const calledLast = mockedResponse.json.mock.calls
        if (calledLast[0] && calledLast[0][0]) {
            const obj = calledLast[0][0]
            expect(obj.id).toBe(keys.at(0).id)
        } else {
            expect().fail()
        }
    })

    it("Deletes API Key", async () => {
        mockedRequest.params = { id: 0 }
        await deleteAPIKey(mockedRequest, mockedResponse)
        const calledLast = mockedResponse.json.mock.calls
        if (calledLast[0] && calledLast[0][0]) {
            const obj = calledLast[0][0]
            expect(obj.deleted).toBeTrue()
        } else {
            expect().fail()
        }
    })

})


describe("Test API Key", () => {
    it("Tests the API Key and returns if valid", async () => {
        const test = keys.at(-1)
        mockedRequest.body = { apiKeys: { ...test, apiKey: 'sk-test' } }
        aiAskMock.mockResolvedValue('working')
        await testAPIKey(mockedRequest, mockedResponse)

        expect(mockedResponse.status).toHaveBeenCalledWith(201)
        expect(mockedResponse.json).toHaveBeenCalledWith({ success: true, message: 'active' })
    })
    it("Tests the API Key and returns if invalid", async () => {
        const test = keys.at(-1)
        mockedRequest.body = { apiKeys: { ...test, apiKey: 'sk-test' } }
        aiAskMock.mockResolvedValue(null)
        await testAPIKey(mockedRequest, mockedResponse)

        expect(mockedResponse.status).toHaveBeenCalledWith(201)
        expect(mockedResponse.json).toHaveBeenCalledWith({ success: false, message: 'failed' })
    })

})

afterAll(() => {
    vi.clearAllMocks()
    aiAskMock.mockReset()
})