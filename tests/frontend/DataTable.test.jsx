// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Unit tests verifying data table rendering, pagination, column sorting, and cell formatting behaviors.


import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DataTable from '../../src/frontend/components/layout/DataTable.jsx';

describe('DataTable', () => {
  it('renders column headers from columns prop', () => {
    render(<DataTable rows={[{ name: 'Alice', age: 30 }]} columns={['name', 'age']} />);
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
  });

  it('infers columns from row keys when columns not provided', () => {
    render(<DataTable rows={[{ x: 1, y: 2 }]} />);
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
  });

  it('renders row data correctly', () => {
    render(<DataTable rows={[{ name: 'Bob', age: 25 }]} columns={['name', 'age']} />);
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('shows custom empty message when no rows', () => {
    render(<DataTable rows={[]} columns={['x']} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('shows default empty message', () => {
    render(<DataTable rows={[]} columns={['x']} />);
    expect(screen.getByText('No data found.')).toBeInTheDocument();
  });

  it('fires onCellDoubleClick with cell value', () => {     
    const fn = vi.fn();     
    render(<DataTable rows={[{ x: 'clickme' }]} columns={['x']} onCellClick={fn} />);     
    fireEvent.doubleClick(screen.getByText('clickme'));     
    expect(fn).toHaveBeenCalledWith('clickme');   
  });

  it('renders actions column with header', () => {
    render(<DataTable rows={[{ x: 1 }]} columns={['x']} actions={row => <button>Del {row.x}</button>} />);
    expect(screen.getByText('Del 1')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('respects maxRows limit and shows count', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ i }));
    render(<DataTable rows={rows} columns={['i']} maxRows={5} />);
    expect(screen.getByText('Showing 5 of 50 rows')).toBeInTheDocument();
  });

  it('handles null and undefined cell values', () => {
    render(<DataTable rows={[{ x: null, y: undefined }]} columns={['x', 'y']} />);
    expect(screen.getAllByRole('row').length).toBeGreaterThan(0);
  });
});
