// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Unit tests verifying temporary notification toast triggers and interactive confirmation modal dialog states.


import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider, useToast } from '../../src/frontend/components/layout/Toast.jsx';
import ConfirmModal from '../../src/frontend/components/layout/ConfirmModal.jsx';

function ToastTrigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Done!')}>S</button>
      <button onClick={() => toast.error('Fail!')}>E</button>
      <button onClick={() => toast.warning('Warn!')}>W</button>
      <button onClick={() => toast.info('Info!')}>I</button>
    </div>
  );
}

describe('Toast', () => {
  it('shows success toast', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    act(() => screen.getByText('S').click());
    expect(screen.getByText('Done!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    vi.useRealTimers();
  });

  it('shows error toast', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    act(() => screen.getByText('E').click());
    expect(screen.getByText('Fail!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    vi.useRealTimers();
  });

  it('shows multiple simultaneous toasts', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    act(() => { screen.getByText('S').click(); screen.getByText('W').click(); });
    expect(screen.getByText('Done!')).toBeInTheDocument();
    expect(screen.getByText('Warn!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    vi.useRealTimers();
  });

  it('auto-removes toast after timeout', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    act(() => screen.getByText('I').click());
    expect(screen.getByText('Info!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(11000));
    expect(screen.queryByText('Info!')).toBeNull();
    vi.useRealTimers();
  });
});

describe('ConfirmModal', () => {
  it('renders title and message', () => {
    render(<ConfirmModal title="Delete?" message="Are you sure?" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    const fn = vi.fn();
    render(<ConfirmModal title="T" message="M" onConfirm={fn} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button clicked', () => {
    const fn = vi.fn();
    render(<ConfirmModal title="T" message="M" onConfirm={() => {}} onCancel={fn} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('shows custom confirm text', () => {
    render(<ConfirmModal title="T" message="M" onConfirm={() => {}} onCancel={() => {}} confirmText="Yes, delete" />);
    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
  });

  it('applies danger class when danger=true', () => {
    render(<ConfirmModal title="T" message="M" onConfirm={() => {}} onCancel={() => {}} danger confirmText="Delete" />);
    expect(screen.getByText('Delete').className).toContain('btn-danger');
  });

  it('has ARIA dialog role', () => {
    render(<ConfirmModal title="T" message="M" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables confirm button when confirmDisabled is true', () => {
    render(<ConfirmModal title="T" message="M" onConfirm={() => {}} onCancel={() => {}} confirmDisabled={true} />);
    expect(screen.getByText('Confirm').disabled).toBe(true);
  });

  it('enables confirm button when confirmDisabled is false', () => {
    render(<ConfirmModal title="T" message="M" onConfirm={() => {}} onCancel={() => {}} confirmDisabled={false} />);
    expect(screen.getByText('Confirm').disabled).toBe(false);
  });
});
