import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
    setGlobalConnection,
    getGlobalConnection,
    getActiveApiKey,
    apiFetch,
    apiFetchText,
    runQuery,
    runEditorQuery,
    editorConnect,
    editorConnectionStatus,
    editorDisconnect,
    logoutRequest,
} from '../../src/frontend/utils/api.js';

beforeEach(() => {
    localStorage.clear();
    setGlobalConnection({
        node: 'node-1',
        nodeName: 'node-a',
        user: 'test-user',
        port: 8123,
        clusterId: 'cluster-1',
        apiKey: null,
        apiKeyName: null,
    });
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: vi.fn() },
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('frontend API utilities', () => {
    it('merges connection settings without discarding defaults', () => {
        setGlobalConnection({ node: 'node-2', apiKeyName: 'demo-key' });

        expect(getGlobalConnection()).toMatchObject({
            node: 'node-2',
            nodeName: 'node-a',
            port: 8123,
            clusterId: 'cluster-1',
            apiKeyName: 'demo-key',
        });
    });

    it('reads the active API key and records its label in the global connection', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ apiKey: { name: 'demo-key' } }),
        });

        await expect(getActiveApiKey()).resolves.toMatchObject({ name: 'demo-key' });
        expect(getGlobalConnection().apiKeyName).toBe('demo-key');
    });

    it('returns null instead of throwing when there is no active API key', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({}),
        });

        await expect(getActiveApiKey()).resolves.toBeNull();
    });

    it('adds auth and audit metadata to JSON calls and returns parsed data', async () => {
        localStorage.setItem('chops_session', JSON.stringify({ token: 'abc-token' }));
        global.fetch.mockResolvedValue({
            status: 200,
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, rows: [1, 2] }),
        });

        const result = await apiFetch('/api/query', {
            method: 'POST',
            body: JSON.stringify({ sql: 'SELECT 1' }),
        });

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/query',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer abc-token',
                    'Content-Type': 'application/json',
                }),
            }),
        );

        const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(sent).toMatchObject({
            sql: 'SELECT 1',
            audit: { clusterId: 'cluster-1', nodeName: 'node-a' },
        });
        expect(result).toEqual({ ok: true, rows: [1, 2] });
    });

    it('surfaces credential-session expiry without logging the user out', async () => {
        global.fetch.mockResolvedValue({
            status: 401,
            ok: false,
            json: vi.fn().mockResolvedValue({ code: 'CRED_SESSION_EXPIRED', error: 'Session expired. Please reconnect.' }),
        });

        try {
            await apiFetch('/api/editor/connect');
            throw new Error('expected rejection');
        } catch (error) {
            expect(error.message).toBe('Session expired. Please reconnect.');
            expect(error.code).toBe('CRED_SESSION_EXPIRED');
        }
    });

    it('clears the app session and reloads on auth expiry', async () => {
        localStorage.setItem('chops_session', JSON.stringify({ token: 'expired-token' }));
        const reload = vi.fn();
        Object.defineProperty(window, 'location', {
            value: { ...window.location, reload },
            writable: true,
            configurable: true,
        });

        global.fetch.mockResolvedValue({
            status: 401,
            ok: false,
            json: vi.fn().mockResolvedValue({ error: 'Session expired.' }),
        });

        await expect(apiFetch('/api/query')).rejects.toThrow('Session expired.');
        expect(localStorage.getItem('chops_session')).toBeNull();
        expect(reload).toHaveBeenCalled();
    });

    it('throws friendly errors for rate limits and bad requests', async () => {
        global.fetch.mockResolvedValue({
            status: 429,
            ok: false,
            json: vi.fn().mockResolvedValue({ error: 'Too many requests.' }),
        });
        await expect(apiFetch('/api/query')).rejects.toThrow('Too many requests.');

        global.fetch.mockResolvedValue({
            status: 400,
            ok: false,
            json: vi.fn().mockResolvedValue({ error: 'Bad request.' }),
        });
        await expect(apiFetch('/api/query')).rejects.toThrow('Bad request.');
    });

    it('returns plain text for text endpoints and handles 401 logout', async () => {
        localStorage.setItem('chops_session', JSON.stringify({ token: 'abc-token' }));
        const reload = vi.fn();
        Object.defineProperty(window, 'location', {
            value: { ...window.location, reload },
            writable: true,
            configurable: true,
        });

        global.fetch.mockResolvedValue({
            status: 200,
            ok: true,
            text: vi.fn().mockResolvedValue('ok-text'),
        });

        await expect(apiFetchText('/api/health')).resolves.toBe('ok-text');

        global.fetch.mockResolvedValue({
            status: 401,
            ok: false,
            text: vi.fn().mockResolvedValue(''),
        });

        await expect(apiFetchText('/api/health')).rejects.toThrow('Session expired.');
        expect(localStorage.getItem('chops_session')).toBeNull();
        expect(reload).toHaveBeenCalled();
    });

    it('validates SQL input and forwards the effective row limit settings', async () => {
        global.fetch.mockResolvedValue({
            status: 200,
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true }),
        });

        await expect(runQuery('')).rejects.toThrow('SQL is required.');

        localStorage.setItem('chops_max_rows', '10');
        await runQuery('SELECT 1', { settings: { timezone: 'UTC' } });

        const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(payload.settings).toMatchObject({
            max_result_rows: 11,
            result_overflow_mode: 'break',
            timezone: 'UTC',
        });
    });

    it('supports editor queries with and without explicit credentials', async () => {
        global.fetch.mockResolvedValue({
            status: 200,
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true }),
        });

        await runEditorQuery('SELECT 1', { user: 'demo', password: 'pw' });
        let payload = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(payload.user).toBe('demo');
        expect(payload.password).toBe('pw');
        expect(payload.strictAuth).toBe(true);

        global.fetch.mockClear();
        await runEditorQuery('SELECT 1', null, { readOnly: true });
        payload = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(payload.useSession).toBe(true);
        expect(payload.context).toBe('editor');
        expect(payload.readOnly).toBe(true);
    });

    it('wraps editor connect, status, disconnect and logout calls', async () => {
        global.fetch.mockResolvedValue({
            status: 200,
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true }),
        });

        await editorConnect({ user: 'demo', password: 'secret' });
        expect(global.fetch.mock.calls[0][0]).toBe('/api/editor/connect');

        await editorConnectionStatus();
        expect(global.fetch.mock.calls[1][0]).toBe('/api/editor/connect');

        await editorDisconnect();
        expect(global.fetch.mock.calls[2][0]).toBe('/api/editor/connect');

        global.fetch.mockResolvedValue({
            status: 200,
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true }),
        });
        await expect(logoutRequest()).resolves.toMatchObject({ ok: true });
    });
});
