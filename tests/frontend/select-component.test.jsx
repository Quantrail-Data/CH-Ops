// Tests for the themed Select / MultiSelect dropdown components.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Select from '../../src/frontend/components/common/Select.jsx';
import MultiSelect from '../../src/frontend/components/common/MultiSelect.jsx';

describe('Select (themed, drop-in)', () => {
  function setup(value = 'b', onChange = () => {}) {
    return render(
      <Select value={value} onChange={onChange} className="form-select" aria-label="letter">
        <option value="a">Apple</option>
        <option value="b">Banana</option>
        <option value="c">Cherry</option>
      </Select>
    );
  }

  it('renders a real native select (combobox) reflecting the value', () => {
    setup('b');
    const combo = screen.getByRole('combobox');
    expect(combo).toBeTruthy();
    expect(combo.value).toBe('b');
    expect(combo.querySelectorAll('option').length).toBe(3);
  });

  it('fires onChange with the native event (e.target.value) like a native select', () => {
    let captured;
    const fn = vi.fn((e) => { captured = e.target.value; });
    setup('b', fn);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c' } });
    expect(fn).toHaveBeenCalled();
    expect(captured).toBe('c');
  });

  it('shows the selected label and a themed menu (not the browser dropdown)', () => {
    const { container } = setup('a');
    expect(container.querySelector('.cui-select-value').textContent).toContain('Apple');
    fireEvent.click(container.querySelector('.cui-select-control'));
    const menu = document.querySelector('.cui-select-menu'); // portalled to <body>
    expect(menu).toBeTruthy();
    expect(menu.querySelectorAll('.cui-select-opt').length).toBe(3);
  });

  it('selecting from the themed menu calls onChange with the chosen value', () => {
    const fn = vi.fn();
    const { container } = setup('a', fn);
    fireEvent.click(container.querySelector('.cui-select-control'));
    const opts = document.querySelectorAll('.cui-select-opt'); // portalled to <body>
    fireEvent.mouseDown(opts[2]); // Cherry
    expect(fn).toHaveBeenCalled();
    expect(fn.mock.calls[0][0].target.value).toBe('c');
  });

  it('keeps required on the native control for form validation', () => {
    render(
      <Select value="" onChange={() => {}} required>
        <option value="">Pick</option>
        <option value="x">X</option>
      </Select>
    );
    expect(screen.getByRole('combobox').required).toBe(true);
  });

  it('portals the menu out of the wrapper so it escapes stacking/clipping', () => {
    const { container } = setup('a');
    fireEvent.click(container.querySelector('.cui-select-control'));
    const menu = document.querySelector('.cui-select-menu');
    expect(menu).toBeTruthy();
    // The menu is NOT a descendant of the render container (it lives under <body>).
    expect(container.contains(menu)).toBe(false);
    // Fixed positioning with a high z-index keeps it above page chrome.
    expect(menu.style.position).toBe('fixed');
    expect(Number(menu.style.zIndex)).toBeGreaterThanOrEqual(1000);
  });
});

describe('MultiSelect (themed)', () => {
  it('shows chips for selected values and toggles on menu click', () => {
    const fn = vi.fn();
    const { container } = render(
      <MultiSelect options={['x', 'y', 'z']} value={['x']} onChange={fn} />
    );
    expect(container.querySelectorAll('.cui-ms-chip').length).toBe(1);
    fireEvent.click(container.querySelector('.cui-select-control'));
    const opts = document.querySelectorAll('.cui-select-opt'); // portalled to <body>
    fireEvent.mouseDown(opts[1]); // add 'y'
    expect(fn).toHaveBeenCalledWith(['x', 'y']);
  });

  it('removing a chip calls onChange without that value', () => {
    const fn = vi.fn();
    const { container } = render(
      <MultiSelect options={['x', 'y']} value={['x', 'y']} onChange={fn} />
    );
    const chipRemove = container.querySelector('.cui-ms-chip button');
    fireEvent.click(chipRemove);
    expect(fn).toHaveBeenCalledWith(['y']);
  });
});

describe('Select: compact size modifier', () => {
  it('passes a cui-sm className through to the control wrapper', () => {
    const { container } = render(
      <Select className="form-select cui-sm" value="b" onChange={() => {}} aria-label="letter">
        <option value="a">Apple</option>
        <option value="b">Banana</option>
      </Select>
    );
    // The compact modifier is what lines the Processors Kind/Type selects up
    // with the small datetime inputs; the class must survive to the wrapper so
    // the scoped `.cui-select.cui-sm .cui-select-control` rule can apply.
    expect(container.querySelector('.cui-select.cui-sm')).toBeTruthy();
  });
});
