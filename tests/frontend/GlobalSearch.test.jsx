import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
    default: ({ className = '', style, children }) => (
        <span data-testid="icon" className={className} style={style}>
            {children}
        </span>
    ),
}));

if (typeof window !== 'undefined' && typeof window.HTMLElement !== 'undefined') {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

import GlobalSearch from '../../src/frontend/components/layout/GlobalSearch.jsx';

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe('GlobalSearch', () => {
    it('renders the floating bubble when closed and opens via click', () => {
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onNavigate = vi.fn();

        render(<GlobalSearch open={false} onOpen={onOpen} onClose={onClose} onNavigate={onNavigate} />);

        fireEvent.click(screen.getByRole('button', { name: /Search/i }));
        expect(onOpen).toHaveBeenCalled();
    });

    it('opens via Ctrl+K shortcut', () => {
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onNavigate = vi.fn();

        render(<GlobalSearch open={false} onOpen={onOpen} onClose={onClose} onNavigate={onNavigate} />);
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(onOpen).toHaveBeenCalled();
    });

    it('closes with Escape key and close button when open', async () => {
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onNavigate = vi.fn();

        render(<GlobalSearch open={true} onOpen={onOpen} onClose={onClose} onNavigate={onNavigate} />);

        const input = screen.getByRole('textbox');
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Close search/i }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('shows search results and navigates on Enter', async () => {
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onNavigate = vi.fn();

        const { container } = render(
            <GlobalSearch open={true} onOpen={onOpen} onClose={onClose} onNavigate={onNavigate} />,
        );

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'cluster' } });

        await waitFor(() => {
            expect(container.querySelectorAll('.global-search-item').length).toBeGreaterThan(0);
        });

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(onNavigate).toHaveBeenCalled());
        expect(onClose).toHaveBeenCalled();
    });

    it('renders a no-results message when the query matches nothing', async () => {
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onNavigate = vi.fn();

        render(<GlobalSearch open={true} onOpen={onOpen} onClose={onClose} onNavigate={onNavigate} />);

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'qwertyuiopasdfghjkl' } });

        expect(await screen.findByText(/No pages match/i)).toBeTruthy();
    });
});
