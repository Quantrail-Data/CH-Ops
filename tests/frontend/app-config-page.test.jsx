/** @vitest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, toast } = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/frontend/utils/api.js', () => ({ apiFetch }));
vi.mock('../../src/frontend/components/layout/Toast.jsx', () => ({ useToast: () => toast }));
vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
    default: ({ className }) => <span data-icon={className} />,
}));

import AppConfig from '../../src/frontend/components/admin/AppConfig.jsx';

describe('AppConfig', () => {
    beforeEach(() => {
        apiFetch.mockReset();
        toast.success.mockClear();
        toast.error.mockClear();

        apiFetch.mockImplementation(async (url, options) => {
            if (url === '/api/app-config' && !options) {
                return [
                    {
                        key: 'query.maxResultBytes',
                        value: 1048576,
                        min: 0,
                        max: 104857600,
                        source: 'setting',
                        env: '',
                    },
                    {
                        key: 'export.maxTotalBytes',
                        value: 1073741824,
                        min: 0,
                        max: 10737418240,
                        source: 'default',
                        env: '',
                    },
                ];
            }
            if (url === '/api/app-config' && options?.method === 'PUT') {
                return [
                    {
                        key: 'query.maxResultBytes',
                        value: 2097152,
                        min: 0,
                        max: 104857600,
                        source: 'setting',
                        env: '',
                    },
                ];
            }
            if (url === '/api/app-config/query.maxResultBytes') {
                return [
                    {
                        key: 'query.maxResultBytes',
                        value: 1048576,
                        min: 0,
                        max: 104857600,
                        source: 'default',
                        env: '',
                    },
                ];
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
    });

    it('loads tabbed app settings and saves or resets a row', async () => {
        render(<AppConfig />);

        await screen.findByRole('heading', { name: /app config/i });
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));

        const input = await screen.findByDisplayValue('1');
        expect(input).toBeInTheDocument();

        fireEvent.change(input, { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        await waitFor(() => {
            expect(apiFetch).toHaveBeenCalledWith('/api/app-config', {
                method: 'PUT',
                body: JSON.stringify({ key: 'query.maxResultBytes', value: 2097152 }),
            });
        });
        expect(toast.success).toHaveBeenCalledWith('Saved.');

        fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));

        await waitFor(() => {
            expect(apiFetch).toHaveBeenCalledWith('/api/app-config/query.maxResultBytes', { method: 'DELETE' });
        });
        expect(toast.success).toHaveBeenCalledWith('Reset to the default.');
    });
});
