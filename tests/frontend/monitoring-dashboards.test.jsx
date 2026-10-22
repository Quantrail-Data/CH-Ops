import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../src/frontend/components/layout/ChartCard.jsx', () => ({
  default: ({ title }) => <div data-testid="chart-card">{title}</div>,
}));
vi.mock('../../src/frontend/utils/api.js', () => ({ runQuery: vi.fn() }));

import MonitoringDashboards from '../../src/frontend/components/monitoring/MonitoringDashboards.jsx';
import { runQuery } from '../../src/frontend/utils/api.js';

describe('MonitoringDashboards', () => {
  it('loads the selected monitoring tab and renders its chart cards', async () => {
    runQuery.mockResolvedValue({ rows: [{ t: 1, value: 4 }] });
    render(
      <MemoryRouter initialEntries={['/monitoring/dashboards/queries']}>
        <Routes><Route path="/monitoring/dashboards/:tab" element={<MonitoringDashboards />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /monitoring/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /load charts/i }));

    expect(await screen.findByText('Queries/second')).toBeInTheDocument();
    expect(runQuery).toHaveBeenCalled();
  });
});
