import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/frontend/utils/api.js', () => ({ runQuery: vi.fn() }));
vi.mock('../../src/frontend/components/layout/ChartCard.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/common/ChartToolbar.jsx', () => ({
  default: () => <div />,
  useChartTools: () => ({}),
}));

import MemoryAllocator from '../../src/frontend/components/monitoring/MemoryAllocator.jsx';
import { runQuery } from '../../src/frontend/utils/api.js';

describe('MemoryAllocator', () => {
  it('shows the server response when jemalloc stats cannot be loaded', async () => {
    runQuery.mockRejectedValue(new Error('jemalloc is unavailable'));
    render(<MemoryAllocator />);

    expect(await screen.findByText('Failed to load jemalloc stats')).toBeInTheDocument();
    expect(screen.getByText('jemalloc is unavailable')).toBeInTheDocument();
  });
});
