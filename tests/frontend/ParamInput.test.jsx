// Copyright (C) 2026 Quantrail™ Data Private Limited
// Author: Syed Ashiq
// Unit tests for AlertMarquee rendering, polling, message formatting,
// cluster fallback, and toggle visibility behavior.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ParamInput from '../../src/frontend/components/common/ParamInput.jsx';

describe('ParamInput', () => {
    it('renders an enum select and forwards selected values', () => {
        const onChange = vi.fn();
        render(
            <ParamInput
                param={{ name: 'color', type: "Enum8('red'=1,'green'=2)" }}
                value="red"
                onChange={onChange}
            />,
        );

        const select = screen.getByRole('combobox');
        expect(select.value).toBe('red');
        expect(screen.getByText('(none)')).toBeTruthy();
        fireEvent.change(select, { target: { value: 'green' } });
        expect(onChange).toHaveBeenCalledWith('green');
    });

    it('renders a date input for Date parameters', () => {
        render(
            <ParamInput
                param={{ name: 'd', type: 'Date' }}
                value="2026-08-05"
                onChange={() => { }}
            />,
        );

        expect(screen.getByDisplayValue('2026-08-05')).toHaveAttribute('type', 'date');
    });

    it('renders a datetime-local input for DateTime parameters', () => {
        render(
            <ParamInput
                param={{ name: 'ts', type: 'DateTime' }}
                value="2026-08-05T12:34"
                onChange={() => { }}
            />,
        );

        expect(screen.getByDisplayValue('2026-08-05T12:34')).toHaveAttribute('type', 'datetime-local');
    });

    it('renders a number input for numeric types', () => {
        render(
            <ParamInput
                param={{ name: 'count', type: 'UInt32' }}
                value="42"
                onChange={() => { }}
            />,
        );

        expect(screen.getByDisplayValue('42')).toHaveAttribute('type', 'number');
    });

    it('renders a text input with collection placeholder for Array types', () => {
        render(
            <ParamInput
                param={{ name: 'items', type: 'Array(String)' }}
                value=""
                onChange={() => { }}
            />,
        );

        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('placeholder', '[1,2,3]');
    });

    it('marks invalid inputs with aria-invalid and styles', () => {
        render(
            <ParamInput
                param={{ name: 'name', type: 'String' }}
                value=""
                onChange={() => { }}
                invalid
            />,
        );

        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('respects fullWidth on enum select styling', () => {
        const { container } = render(
            <ParamInput
                param={{ name: 'color', type: "Enum8('red'=1,'green'=2)" }}
                value=""
                onChange={() => { }}
                fullWidth
            />,
        );

        const wrapper = container.querySelector('.cui-select');
        expect(wrapper).toHaveStyle({ width: '100%' });
    });
});
