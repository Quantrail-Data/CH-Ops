import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
const mockUseTheme = vi.fn();
const mockUseConnection = vi.fn();
const mockRunQuery = vi.fn();

vi.mock('../../src/frontend/App.jsx', () => ({
    useAuth: () => mockUseAuth(),
    useTheme: () => mockUseTheme(),
    useConnection: () => mockUseConnection(),
}));

vi.mock('../../src/frontend/utils/api.js', () => ({
    runQuery: (...args) => mockRunQuery(...args),
}));

vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
    default: ({ className = '', style }) => (
        <span data-testid="icon" className={className} style={style} />
    ),
}));

vi.mock('../../src/frontend/components/common/Select.jsx', () => ({
    default: ({ children, value, onChange, title }) => (
        <select value={value} onChange={onChange} title={title}>{children}</select>
    ),
}));

vi.mock('../../src/frontend/assets/chops-light.svg', () => ({ default: 'light.svg' }));
vi.mock('../../src/frontend/assets/chops-dark.svg', () => ({ default: 'dark.svg' }));

vi.mock('../../src/frontend/components/layout/GlobalSearch.jsx', () => ({
    default: ({ open }) => (open ? <div>GlobalSearch</div> : null),
}));

vi.mock('../../src/frontend/components/layout/AlertMarquee.jsx', () => ({
    default: () => <div>AlertMarquee</div>,
}));

vi.mock('../../src/frontend/components/layout/ErrorBoundary.jsx', () => ({
    default: ({ children }) => <>{children}</>,
}));

vi.mock('../../src/frontend/components/layout/Toast.jsx', () => ({
    ToastProvider: ({ children }) => <>{children}</>,
}));

vi.mock('../../src/frontend/components/overview/ClusterOverview.jsx', () => ({
    default: () => <div>Cluster Overview</div>,
}));

import Navbar from '../../src/frontend/components/layout/Navbar.jsx';
import Sidebar from '../../src/frontend/components/layout/Sidebar.jsx';
import MainLayout from '../../src/frontend/components/layout/MainLayout.jsx';

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({ auth: { username: 'admin', role: 'superadmin' }, logout: vi.fn() });
    mockUseTheme.mockReturnValue({ theme: 'light', toggleTheme: vi.fn() });
    mockUseConnection.mockReturnValue({
        clusters: [{ id: 'c1', name: 'Production' }],
        selectedClusterId: 'c1',
        nodes: [
            { host: '10.0.0.1', name: 'node-1', user: 'default', password: '', port: 8123 },
            { host: '10.0.0.2', name: 'node-2', user: 'default', password: '', port: 8123 },
        ],
        selectedNode: '10.0.0.1',
        connected: true,
        error: null,
        setConnection: vi.fn(),
        testConnection: vi.fn().mockResolvedValue(undefined),
        reloadConfig: vi.fn(),
        switchCluster: vi.fn(),
    });
    mockRunQuery.mockResolvedValue({ rows: [{ tz: 'UTC', epoch: 1700000000 }] });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('layout shell coverage', () => {
    it('navbar renders the search, refresh and user controls', () => {
        render(<Navbar onRefresh={vi.fn()} onOpenSearch={vi.fn()} />);
        expect(screen.getByText('admin')).toBeTruthy();
        expect(screen.getByText('Search')).toBeTruthy();
        expect(screen.getByText('Refresh')).toBeTruthy();
    });

    it('sidebar exposes the main nav groups and handles toggles', () => {
        const onToggle = vi.fn();
        render(
            <MemoryRouter initialEntries={['/overview/cluster']}>
                <Sidebar
                    currentRoute="overview/cluster"
                    onNavigate={vi.fn()}
                    collapsed={false}
                    onToggle={onToggle}
                    forceCollapsed={false}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('Overview')).toBeTruthy();
        expect(screen.getByText('SQL Tools')).toBeTruthy();
        fireEvent.click(screen.getByText('Collapse'));
        expect(onToggle).toHaveBeenCalled();
    });

    it('main layout renders the overview route under the app shell', async () => {
        window.location.hash = '#/overview/cluster';
        render(<MainLayout />);
        expect((await screen.findAllByText('Cluster Overview')).length).toBeGreaterThan(0);
    });

    it('navbar activates the font size controls and clock state logic', async () => {
        render(<Navbar onRefresh={vi.fn()} onOpenSearch={vi.fn()} />);
        const userButton = screen.getByText('admin').closest('button');
        fireEvent.click(userButton);
        expect(screen.getByText('Text Size')).toBeTruthy();
        fireEvent.click(screen.getByText('-'));
        await waitFor(() => expect(screen.getByText('75%')).toBeTruthy());
    });
});
