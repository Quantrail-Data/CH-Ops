import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../src/frontend/components/layout/ChartCard.jsx', () => ({
  default: ({ title }) => <div data-testid="chart-card">{title}</div>,
}));
vi.mock('../../src/frontend/utils/api.js', () => ({ runQuery: vi.fn() }));

import Playback from '../../src/frontend/components/monitoring/Playback.jsx';
import { runQuery } from '../../src/frontend/utils/api.js';

describe('Playback', () => {
  it('fetches metric data and exposes playback controls', async () => {
    runQuery.mockResolvedValue({ rows: [{ t: 1, min_val: 1, med_val: 2, max_val: 3 }] });
    render(<Playback />);

    expect(screen.getByRole('heading', { name: /playback/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /fetch data/i }));

    expect(await screen.findByText('Hardware')).toBeInTheDocument();
    expect(runQuery).toHaveBeenCalled();
  });
});
