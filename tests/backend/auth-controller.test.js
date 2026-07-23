// /**
//  * auth-controller.test.js - Unit tests for Auth controller
//  *
//  * Tests Login, Log out, Password change controllers.
//  * Verifies error generation
//  *
//  * Author: Syed Ashiq
//  * Copyright (C) 2026 Quantrail™ Data Private Limited
//  */



import { describe, it, expect, vi, mock, afterAll, beforeEach } from 'bun:test'
import { changePassword, checkLockout, hashPassword, login, logout, safeCompare, verifyPassword, } from '../../src/backend/controllers/auth'
import { setSecret } from '../../src/backend/services/jwt'

const testUser = {
    id: 1,
    username: "TestUser",
    password: "testuser",
    passwordHash: await hashPassword('testuser'),
    role: "admin",
    mustChangePassword: false,
    updatedAt: new Date(),
    authMethod: ""
}

const mockedRequest = {
    body: testUser,
    headers: { authorization: "" }
}

const mockedResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
}

const mockedChangeRequest = {
    body: {
        currentPassword: testUser.password,
        newPassword: testUser.password,
    },

    headers: { authorization: "" }
}
try {

    setSecret('f1e3c0c41c27795bf60b837cf6ba1e68a151a94ce464539feb39432e2057a8f3')
} catch {

}

describe("User Login", () => {

    const mockedRequest = {
        body: testUser,
        headers: { authorization: "" }
    }
    const mockedResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    }


    it("Returns error on missing fields", async () => {
        vi.clearAllMocks()
        await login({ body: {} }, mockedResponse)
        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Username and password are required." })
    })

    it("Returns error on invalid credentials", async () => {
        vi.clearAllMocks()
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => null })) })) })),

            }
        }))
        await login({ body: { username: "Testing", password: testUser.passwordHash } }, mockedResponse)
        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Invalid credentials." })

    })



    it("Returns error on SSO login", async () => {
        vi.clearAllMocks()
        testUser.authMethod = "sso"
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                set: vi.fn().mockReturnThis(),
                run: vi.fn().mockReturnThis(),
                get: () => testUser,
            }
        }))
        await login(mockedRequest, mockedResponse)
        testUser.authMethod = ""
        expect(mockedResponse.json).toHaveBeenCalledWith({
            error: "This account uses SSO. Please sign in with the SSO button.",
        })

    })


    it("User can log in from database", async () => {
        vi.clearAllMocks()
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                set: vi.fn().mockReturnThis(),
                run: vi.fn().mockReturnThis(),
                get: () => testUser,
            }
        }))
        await login(mockedRequest, mockedResponse)
        const authUser = mockedResponse.json.mock.calls[0][0]
        const authToken = authUser.token
        expect(authToken).toBeDefined()
    })

    it("User can log in from .env", async () => {
        vi.clearAllMocks()

        vi.mock("../../src/backend/utils/env", () => ({
            loadEnv: () => ({
                disableEnvLogin: false,
                superAdmins: [
                    testUser
                ]
            })
        }))


        await login(mockedRequest, mockedResponse)

        const authUser = mockedResponse.json.mock.calls[0][0]
        const authToken = authUser.token
        expect(authToken).toBeDefined()

    })

})

describe("User Log out", () => {

    const mockedRequest = {
        body: testUser,
        headers: { authorization: "" }
    }
    const mockedResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    }

    it("User can log out", async () => {
        vi.clearAllMocks()

        vi.mock("../../src/backend/utils/env", () => ({
            loadEnv: () => ({
                disableEnvLogin: false,
                superAdmins: [
                    testUser
                ]
            })
        }))

        await login(mockedRequest, mockedResponse)

        const authUser = mockedResponse.json.mock.calls[0][0]
        const authToken = authUser.token

        mockedRequest.headers.authorization = "Bearer " + authToken

        vi.clearAllMocks()

        await logout(mockedRequest, mockedResponse)

        expect(mockedResponse.json).toHaveBeenCalledWith({ ok: true })

    })
})

describe("User Password Change", () => {


    beforeEach(async () => {
        vi.clearAllMocks()

        vi.mock("../../src/backend/utils/env", () => ({
            loadEnv: () => ({
                disableEnvLogin: false,
                superAdmins: [
                    testUser
                ]
            })
        }))

        await login({
            body: testUser,
            headers: { authorization: "" }
        }, mockedResponse)

        const authUser = mockedResponse.json.mock.calls[0][0]
        const authToken = authUser.token
        mockedRequest.headers.authorization = "Bearer " + authToken
        mockedChangeRequest.headers.authorization = "Bearer " + authToken
    })


    it("Verifies Autherization", async () => {
        vi.clearAllMocks()


        await changePassword({
            body: {},
            headers: {
                authorization: ""
            }
        }, mockedResponse)

        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Unauthorized" })
    })


    it("Verifies password fields are defined", async () => {
        vi.clearAllMocks()

        await changePassword({
            body: {
            },

            headers: { authorization: mockedChangeRequest.headers.authorization }
        }, mockedResponse)

        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Both passwords required." })
    })


    it("Verifies valid new password", async () => {
        vi.clearAllMocks()

        await changePassword({
            body: {
                currentPassword: testUser.password,
                newPassword: 'test',
            },

            headers: { authorization: mockedChangeRequest.headers.authorization }
        }, mockedResponse)

        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Password must be at least 8 characters." })
    })


    it("Verifies valid user and password authentication", async () => {



        vi.clearAllMocks()
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => null })) })) })),
                update: mock(() => ({
                    set: mock((payload) => {
                        testUser.passwordHash = payload.passwordHash
                        return { where: mock(() => ({ run: vi.fn() })) }
                    })
                }))
            }
        }))

        await changePassword({
            body: {
                currentPassword: 'test',
                newPassword: testUser.password,
            },
            headers: {
                authorization: mockedChangeRequest.headers.authorization
            }
        }, mockedResponse)

        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Invalid credentials." })

        vi.clearAllMocks()

        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => testUser })) })) })),
                update: mock(() => ({
                    set: mock((payload) => {
                        testUser.passwordHash = payload.passwordHash
                        return { where: mock(() => ({ run: vi.fn() })) }
                    })
                }))
            }
        }))
        await changePassword({
            body: {
                currentPassword: 'test',
                newPassword: testUser.password,
            },
            headers: {
                authorization: mockedChangeRequest.headers.authorization
            }
        }, mockedResponse)

        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Invalid credentials." })
    })


    it("Returns error when failed to change", async () => {
        vi.clearAllMocks()



        testUser.passwordHash = await hashPassword(testUser.password)
        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => testUser })) })) })),
                update: mock(() => ({
                    set: mock(() => ({
                        where: mock(() => ({ run: vi.fn() }))
                    }))
                }))
            }
        }))
        await changePassword(mockedChangeRequest, mockedResponse)

        expect(mockedResponse.json).toHaveBeenCalledWith({ error: "Password update failed to persist." })
    })




    it("User can change the password", async () => {
        vi.clearAllMocks()



        vi.mock('../../src/backend/db', () => ({
            db: {
                select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ get: () => testUser })) })) })),
                update: mock(() => ({
                    set: mock((payload) => {
                        testUser.passwordHash = payload.passwordHash
                        return { where: mock(() => ({ run: vi.fn() })) }
                    })
                }))
            }
        }))

        await changePassword(mockedChangeRequest, mockedResponse)
        expect(mockedResponse.json).toHaveBeenCalledWith({ ok: true })
    })

})

describe("Password helper functions", () => {
    it('Hashes password ', async () => {
        const hash = await hashPassword('testing')
        const isvalid = await verifyPassword('testing', hash)
        expect(isvalid).toBeTrue()

        const isSafeEqual = safeCompare('testing-1', 'testing-2')
        expect(isSafeEqual).toBeFalse()
    })

    it('Checks User lockout', () => {
        const isLocked = checkLockout('test')
        expect(isLocked).not.toBeTrue()
    })

    it('Verifies valid password', async () => {
        const isValid = await verifyPassword('tester', '$argon2id$v=19$m=65536,t=2,p=1$DfIapkztNT3BJB8anoD6WDckBdD95/Jfs7cBIuiQA+s$g7XvokdP1VDARIQc+OZW/1KOaYtsue6XGIEiCiJ89E8')
        expect(isValid).toBeTrue()
    })

    it('Verifies invalid password', async () => {
        const isValid = await verifyPassword('test', '$argon2id$v=19$m=65536,t=2,p=1$DfIapkztNT3BJB8anoD6WDckBdD95/Jfs7cBIuiQA+s$g7XvokdP1VDARIQc+OZW/1KOaYtsue6XGIEiCiJ89E8')
        expect(isValid).toBeFalse()
    })

})

afterAll(() => {
    vi.clearAllMocks()
})
