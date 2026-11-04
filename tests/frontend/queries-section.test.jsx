import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../src/frontend/components/queries/CurrentQueries.jsx', () => ({ default: () => <div>Current query list</div> }));
vi.mock('../../src/frontend/components/layout/ChartCard.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/common/ChartToolbar.jsx', () => ({
  default: () => <div />,
  useChartTools: () => ({}),
}));

import QueriesSection from '../../src/frontend/components/queries/QueriesSection.jsx';

describe('QueriesSection', () => {
  it('renders the current view and navigates to the query-log tab', () => {
    render(
      <MemoryRouter initialEntries={['/overview/queries/current']}>
        <Routes><Route path="/overview/queries/:tab" element={<QueriesSection />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Current query list')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Query Log'));
    expect(screen.getAllByText('Search')).not.toHaveLength(0);
  });
});
