/** @vitest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
    default: ({ className }) => <span data-icon={className} />,
}));

import ConfirmDialog from '../../src/frontend/components/editor/ConfirmDialog.jsx';

describe('ConfirmDialog', () => {
    it('renders the modal and handles keyboard and button actions', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        const { rerender } = render(
            <ConfirmDialog
                open
                title="Delete query"
                message="Are you sure you want to continue?"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );

        expect(screen.getByRole('alertdialog', { name: 'Delete query' })).toBeInTheDocument();
        expect(screen.getByText('Are you sure you want to continue?')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Enter' });
        expect(onConfirm).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(2);

        rerender(
            <ConfirmDialog
                open={false}
                title="Delete query"
                message="Are you sure you want to continue?"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
});
