// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Kathirdhasan



import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

// --- Mocks -----------------------------------------------------------------

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

// Icon renders as a span that exposes its Tabler class, so we can assert which
// glyph is shown (ti-clock vs ti-clock-off).
vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
  default: ({ className = '', style }) => (
    <span data-testid="icon" className={className} style={style} />
  ),
}));

// Select renders a plain native <select> so options and onChange work normally.
vi.mock('../../src/frontend/components/common/Select.jsx', () => ({
  default: ({ children, value, onChange, title }) => (
    <select value={value} onChange={onChange} title={title}>
      {children}
    </select>
  ),
}));

// The brand logos are static assets; stub them so no asset transform is needed.
vi.mock('../../src/frontend/assets/chops-light.svg', () => ({ default: 'light.svg' }));
vi.mock('../../src/frontend/assets/chops-dark.svg', () => ({ default: 'dark.svg' }));

// Import AFTER the mocks are registered.
import Navbar from '../../src/frontend/components/layout/Navbar.jsx';

// --- Helpers ---------------------------------------------------------------

function connState(overrides = {}) {
  return {
    clusters: [{ id: 'c1', name: 'Production' }],
    selectedClusterId: 'c1',
    nodes: [
      { host: '10.0.0.1', name: 'node-1', user: 'default', password: '', port: 8123 },
      { host: '10.0.0.2', name: 'node-2', user: 'default', password: '', port: 8123 },
    ],
    selectedNode: '10.0.0.1',
    user: 'default',
    password: '',
    connected: true,
    error: '',
    clusterName: 'Production',
    setConnection: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(undefined),
    reloadConfig: vi.fn(),
    switchCluster: vi.fn(),
    ...overrides,
  };
}

function formatInTz(epochSeconds, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(epochSeconds * 1000));
}

const renderNavbar = () => render(<Navbar onRefresh={vi.fn()} onOpenSearch={vi.fn()} />);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ auth: { username: 'admin', role: 'superadmin' }, logout: vi.fn() });
  mockUseTheme.mockReturnValue({ theme: 'light', toggleTheme: vi.fn() });
  mockUseConnection.mockReturnValue(connState());
  mockRunQuery.mockResolvedValue({ rows: [{ tz: 'UTC', epoch: 1700000000 }] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// --- Tests -----------------------------------------------------------------

describe('Navbar server clock - disconnected', () => {
  it('shows a red clock-off icon, no time, and does not query the server', () => {
    mockUseConnection.mockReturnValue(connState({ connected: false }));
    const { container } = renderNavbar();

    expect(container.querySelector('.ti-clock-off')).toBeTruthy();
    expect(container.querySelector('.ti-clock')).toBeNull();
    expect(screen.queryByText(/\d{2}:\d{2}:\d{2}/)).toBeNull();
    expect(mockRunQuery).not.toHaveBeenCalled();
  });
});

describe('Navbar server clock - connected', () => {
  it('fetches the server timezone once and renders a green clock with the time', async () => {
    const { container } = renderNavbar();

    await screen.findByText('UTC'); // timezone label appears after the fetch
    expect(container.querySelector('.ti-clock')).toBeTruthy();
    expect(container.querySelector('.ti-clock-off')).toBeNull();
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeTruthy();

    expect(mockRunQuery).toHaveBeenCalledTimes(1);
    expect(mockRunQuery.mock.calls[0][0]).toMatch(/serverTimeZone\(\)/);
  });

  it('displays the server instant (skew corrected), not the browser time', async () => {
    // Freeze the browser clock far from the server instant. The shown time must
    // still equal the server epoch formatted in the server timezone.
    vi.spyOn(Date, 'now').mockReturnValue(1000); // browser "now" is basically epoch 0
    mockRunQuery.mockResolvedValue({ rows: [{ tz: 'UTC', epoch: 1700000000 }] });

    renderNavbar();
    await screen.findByText('UTC');

    const expected = formatInTz(1700000000, 'UTC'); // e.g. "22:13:20"
    const el = screen.getByText(/\d{2}:\d{2}:\d{2}/);
    expect(el.textContent).toContain(expected);
  });

  it('does not re-query the server every second (only ticks locally)', async () => {
    vi.useFakeTimers();
    renderNavbar();

    // Let the async fetch resolve and state settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRunQuery).toHaveBeenCalledTimes(1);

    // Advance three seconds of ticks; still exactly one query.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });

  it('falls back to timezone() when serverTimeZone() is unavailable', async () => {
    mockRunQuery
      .mockRejectedValueOnce(new Error('Unknown function serverTimeZone'))
      .mockResolvedValueOnce({ rows: [{ tz: 'Asia/Kolkata', epoch: 1700000000 }] });

    renderNavbar();

    await screen.findByText('Asia/Kolkata');
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
    expect(mockRunQuery.mock.calls[1][0]).toMatch(/timezone\(\)/);
  });

  it('hides the clock gracefully if the timezone string is invalid', async () => {
    mockRunQuery.mockResolvedValue({ rows: [{ tz: 'Not/AZone', epoch: 1700000000 }] });
    const { container } = renderNavbar();

    await waitFor(() => expect(mockRunQuery).toHaveBeenCalled());
    // Intl throws on the bad zone -> serverClock is null -> no time text, no crash.
    expect(screen.queryByText(/\d{2}:\d{2}:\d{2}/)).toBeNull();
    expect(container.querySelector('.ti-clock')).toBeTruthy(); // icon still shown (connected)
  });
});

describe('Navbar core', () => {
  it('renders the signed-in username', () => {
    renderNavbar();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  it('renders cluster and node options', () => {
    renderNavbar();
    expect(screen.getByText('Production')).toBeTruthy();
    expect(screen.getByText('node-1')).toBeTruthy();
    expect(screen.getByText('node-2')).toBeTruthy();
  });

  it('reconnects when a different node is selected', async () => {
    const state = connState();
    mockUseConnection.mockReturnValue(state);
    renderNavbar();

    // The node <select> is the one whose value is the selected host.
    const selects = screen.getAllByRole('combobox');
    const nodeSelect = selects.find((s) => s.value === '10.0.0.1');
    fireEvent.change(nodeSelect, { target: { value: '10.0.0.2' } });

    await waitFor(() => expect(state.testConnection).toHaveBeenCalled());
    expect(state.testConnection.mock.calls[0][0]).toBe('10.0.0.2');
    expect(localStorage.getItem('chops_nodename')).toBe('node-2');
  });
});
