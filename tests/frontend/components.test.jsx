// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Unit tests verifying core UI components including error boundaries, date-time pickers, stat cards, and SQL previews.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SqlPreview, StatCard } from '../../src/frontend/components/layout/SharedComponents.jsx';
import { DateTimePicker } from '../../src/frontend/components/layout/DateTimePicker.jsx';
import ErrorBoundary from '../../src/frontend/components/layout/ErrorBoundary.jsx';

describe('SqlPreview', () => {
  it('renders SQL text in a pre tag', () => {
    render(<SqlPreview sql="SELECT 1" />);
    expect(screen.getByText('SELECT 1')).toBeInTheDocument();
    expect(screen.getByText('SELECT 1').tagName).toBe('PRE');
  });

  it('renders nothing when sql is empty', () => {
    const { container } = render(<SqlPreview sql="" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when sql is null', () => {
    const { container } = render(<SqlPreview sql={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "Generated SQL" label', () => {
    render(<SqlPreview sql="DROP TABLE x" />);
    expect(screen.getByText('Generated SQL')).toBeInTheDocument();
  });
});

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Uptime" value="99.9%" />);
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();
  });

  it('renders dash when value is null', () => {
    render(<StatCard label="Memory" value={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders dash when value is undefined', () => {
    render(<StatCard label="CPU" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders zero as a valid value', () => {
    render(<StatCard label="Errors" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const { container } = render(<StatCard icon="ti-database" label="DB" value="5" />);
    expect(container.querySelector('.ti.ti-database')).toBeTruthy();
  });

  it('applies color to icon', () => {
    const { container } = render(<StatCard icon="ti-heart" label="Health" value="OK" color="red" />);
    const icon = container.querySelector('.ti.ti-heart');
    expect(icon.style.color).toBe('red');
  });
});

describe('DateTimePicker', () => {
  it('renders date input and three time selects', () => {
    const { container } = render(<DateTimePicker value="2025-01-15 09:30:00" onChange={() => {}} />);
    expect(container.querySelector('input[type="date"]')).toBeTruthy();
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(3);
  });

  it('renders label when provided', () => {
    render(<DateTimePicker value="2025-01-15 09:30:00" onChange={() => {}} label="Start Time" />);
    expect(screen.getByText('Start Time')).toBeInTheDocument();
  });

  it('parses value into date and time parts', () => {
    const { container } = render(<DateTimePicker value="2025-06-20 14:30:45" onChange={() => {}} />);
    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput.value).toBe('2025-06-20');
    const selects = container.querySelectorAll('select');
    expect(selects[0].value).toBe('14');
    expect(selects[1].value).toBe('30');
    expect(selects[2].value).toBe('45');
  });

  it('calls onChange when hour changes', () => {
    const fn = vi.fn();
    const { container } = render(<DateTimePicker value="2026-05-23 15:15:00" onChange={fn} name="From"/>);
    const hourSelect = container.querySelectorAll('select')[1];
    fireEvent.change(hourSelect, { target: { value: '15' } });
    expect(fn).toHaveBeenCalledWith('2026-05-23 15:15:00',"From");
  });

  it('calls onChange when date changes', () => {
    const fn = vi.fn();
    const { container } = render(<DateTimePicker value="2025-01-01 10:00:00" onChange={fn} name="To" />);
    const dateInput = container.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2025-12-25' } });
    expect(fn).toHaveBeenCalledWith('2025-12-25 10:00:00',"To");
  });

  it('uses current time when value is empty', () => {
    const { container } = render(<DateTimePicker value="" onChange={() => {}} />);
    const dateInput = container.querySelector('input[type="date"]');
    // Should be today's date
    expect(dateInput.value).toBeTruthy();
  });
});

describe('ErrorBoundary', () => {
  // Suppress React error boundary console output during tests
  const originalError = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = originalError; });

  function BrokenChild() {
    throw new Error('Component crashed');
  }

  function GoodChild() {
    return <div>Working fine</div>;
  }

  it('renders children when no error', () => {
    render(<ErrorBoundary><GoodChild /></ErrorBoundary>);
    expect(screen.getByText('Working fine')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    render(<ErrorBoundary><BrokenChild /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Component crashed')).toBeInTheDocument();
  });

  it('shows Try Again button in error state', () => {
    render(<ErrorBoundary><BrokenChild /></ErrorBoundary>);
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders a custom compact fallback with the error message', () => {
    render(
      <ErrorBoundary fallback={(err) => <div>preview failed: {err.message}</div>}>
        <BrokenChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('preview failed: Component crashed')).toBeInTheDocument();
    // custom fallback replaces the default UI
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('clears the error when resetKeys change (e.g. after fixing chart mapping)', () => {
    function Maybe({ crash }) {
      if (crash) throw new Error('bad columns');
      return <div>recovered</div>;
    }
    const { rerender } = render(
      <ErrorBoundary resetKeys={[1]} fallback={(e) => <div>err: {e.message}</div>}>
        <Maybe crash />
      </ErrorBoundary>
    );
    expect(screen.getByText('err: bad columns')).toBeInTheDocument();
    rerender(
      <ErrorBoundary resetKeys={[2]} fallback={(e) => <div>err: {e.message}</div>}>
        <Maybe crash={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
