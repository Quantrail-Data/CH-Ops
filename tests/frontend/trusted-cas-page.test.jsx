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
vi.mock('../../src/frontend/components/layout/ConfirmModal.jsx', () => ({
    default: ({ title, message, confirmText, onConfirm, onCancel, danger }) => (
        <div data-testid="confirm-modal" data-danger={String(Boolean(danger))}>
            <div>{title}</div>
            <div>{message}</div>
            <button onClick={onConfirm}>{confirmText}</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
    ),
}));

import TrustedCas from '../../src/frontend/components/admin/TrustedCas.jsx';

describe('TrustedCas', () => {
    beforeEach(() => {
        apiFetch.mockReset();
        toast.success.mockClear();
        toast.error.mockClear();

        apiFetch.mockImplementation(async (url, options) => {
            if (url === '/api/trusted-cas' && !options) {
                return [
                    {
                        id: 'ca-1',
                        name: 'Internal CA',
                        subject: 'CN=Internal CA',
                        fingerprint: 'AA'.repeat(16),
                        notAfter: '2035-01-01',
                        daysUntilExpiry: 90,
                    },
                ];
            }
            if (url === '/api/trusted-cas/ca-1/usage') {
                return {
                    name: 'Internal CA',
                    results: [
                        { cluster: 'prod-cluster', status: 'uses-this' },
                        { cluster: 'dev-cluster', status: 'not-tls' },
                    ],
                };
            }
            if (url === '/api/trusted-cas' && options?.method === 'POST') {
                return [
                    {
                        id: 'ca-2',
                        name: 'Test CA',
                        subject: 'CN=Test CA',
                        fingerprint: 'BB'.repeat(16),
                        notAfter: '2036-01-01',
                        daysUntilExpiry: 120,
                    },
                ];
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
    });

    it('shows usage details and adds a new certificate authority', async () => {
        render(<TrustedCas />);

        await screen.findByText('Internal CA');
        fireEvent.click(screen.getByRole('button', { name: /which clusters use this/i }));

        await screen.findByText('Clusters using Internal CA');
        expect(screen.getByText('prod-cluster')).toBeInTheDocument();
        expect(screen.getByText(/uses this authority/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
        fireEvent.change(screen.getByPlaceholderText('Internal CA'), { target: { value: 'Test CA' } });
        fireEvent.change(screen.getByPlaceholderText(/BEGIN CERTIFICATE/i), {
            target: { value: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----' },
        });
        fireEvent.click(screen.getAllByRole('button', { name: /^add$/i })[1]);

        await waitFor(() => {
            expect(apiFetch).toHaveBeenCalledWith('/api/trusted-cas', {
                method: 'POST',
                body: JSON.stringify({ name: 'Test CA', pem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----' }),
            });
        });
        expect(toast.success).toHaveBeenCalledWith('Certificate authority added.');
    });
});
