// Copyright (C) 2026 Quantrail™ Data Private Limited
// Author: Syed Ashiq
// Unit tests for AlertMarquee rendering, polling, message formatting,
// cluster fallback, and toggle visibility behavior.

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const alerts = {
    operator: 'gt',
    lastRunAt: '2026-08-05T12:00:00Z',
    nodes: [],
    severity: 'info',
    name: 'Disk usage',
    lastValue: '90%',
    threshold: '80%',
}
const mockApiFetch = vi.fn();
const mockUseConnection = vi.fn();

vi.mock('../../src/frontend/utils/api.js', () => ({
    apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock('../../src/frontend/App.jsx', () => ({
    useConnection: () => mockUseConnection(),
}));

vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
    default: ({ className = '', style, ...props }) => (
        <span data-testid="icon" className={className} style={style} {...props} />
    ),
}));

vi.mock('motion/react', () => ({
    motion: {
        button: ({ children, ...props }) => (
            <button type="button" aria-label="Close alerts" {...props}>{children}</button>
        ),
    },
}));

import AlertMarquee from '../../src/frontend/components/layout/AlertMarquee.jsx';


describe('AlertMarquee', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        mockUseConnection.mockReturnValue({ clusterName: 'Production' });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders alerts after fetch', async () => {
        mockApiFetch.mockResolvedValueOnce([
            alerts
        ]);

        render(<AlertMarquee />);

        const alert = await screen.findByText((content) =>
            content.includes('Disk usage') &&
            content.includes('value 90%') &&
            content.includes('threshold 80%')
        );

        expect(mockApiFetch).toHaveBeenCalledWith('/api/alerts/rules/active');
        expect(alert).toBeInTheDocument();
    });

    it('renders no alerts after empty fetch', async () => {
        mockApiFetch.mockResolvedValueOnce([]);
        render(<AlertMarquee />);

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledTimes(1);
        });

        expect(screen.queryByText(/Disk usage/i)).toBeNull();
    });

    it('calls apiFetch once when mounted', async () => {
        mockApiFetch.mockResolvedValueOnce([]);
        render(<AlertMarquee />);

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledTimes(1);
        });
    });

    it('polls again after 30 seconds', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockApiFetch.mockResolvedValueOnce([]);

        render(<AlertMarquee />);

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(30000);
        });

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledTimes(2);
        });
    });

    it('formats alert messages with operator mapping and cluster info', async () => {
        mockApiFetch.mockResolvedValueOnce([alerts]);

        render(<AlertMarquee />);

        const alert = await screen.findByText((content) =>
            content.includes('INFO: Disk usage') &&
            content.includes('value 90% > threshold 80%') &&
            content.includes('Production') &&
            content.includes('all nodes')
        );

        expect(alert).toBeInTheDocument();
    });

    it('renders warning severity and non-empty node list', async () => {
        const warningAlert = {
            ...alerts,
            operator: 'lte',
            severity: 'warning',
            name: 'Memory pressure',
            lastValue: '65%',
            threshold: '80%',
            nodes: ['node-a'],
        };

        mockApiFetch.mockResolvedValueOnce([warningAlert]);
        render(<AlertMarquee />);

        const alert = await screen.findByText((content) =>
            content.includes('WARNING: Memory pressure') &&
            content.includes('value 65% <= threshold 80%') &&
            content.includes('node-a')
        );
        expect(alert).toBeInTheDocument();
    });

    it('falls back to Default cluster name when connection is missing', async () => {
        mockUseConnection.mockReturnValue({ clusterName: '' });
        mockApiFetch.mockResolvedValueOnce([alerts]);

        render(<AlertMarquee />);

        const alert = await screen.findByText((content) =>
            content.includes('Default / all nodes') &&
            content.includes('Disk usage')
        );
        expect(alert).toBeInTheDocument();
    });

    it('toggles alert visibility and reopens on click', async () => {
        mockApiFetch.mockResolvedValueOnce([alerts]);

        render(<AlertMarquee />);
        await screen.findByText(/Disk usage/);

        const closeBtn = screen.getByRole('button', { name: /close alerts/i });
        expect(closeBtn).toBeTruthy();
        fireEvent.click(closeBtn);

        const openBtn = await screen.findByText((content) =>
            content.includes('click to expand')
        );
        expect(openBtn).toBeTruthy();

        fireEvent.click(openBtn);
        const reopenedAlert = await screen.findByText(/Disk usage/);
        expect(reopenedAlert).toBeInTheDocument();
    });

});
