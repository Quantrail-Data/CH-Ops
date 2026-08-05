import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockToggleTheme = vi.fn();
const mockApiFetch = vi.fn();

vi.mock('../../src/frontend/App.jsx', () => ({
    useAuth: () => ({ auth: { username: 'test-user', mustChangePassword: true }, login: mockLogin, logout: mockLogout }),
    useTheme: () => ({ theme: 'dark', toggleTheme: mockToggleTheme }),
}));

vi.mock('../../src/frontend/utils/api.js', () => ({
    apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
    default: ({ className = '', style, children }) => (
        <span data-testid="icon" className={className} style={style}>
            {children}
        </span>
    ),
}));

import ForceChangePassword from '../../src/frontend/components/layout/ForceChangePassword.jsx';

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe('ForceChangePassword', () => {
    function passwordInputs(container) {
        return Array.from(container.querySelectorAll('input')).filter((input) =>
            ['password', 'text'].includes(input.type),
        );
    }

    it('shows an error when new password and confirm password do not match', async () => {
        const { container } = render(<ForceChangePassword />);
        const inputs = passwordInputs(container);

        fireEvent.change(inputs[0], { target: { value: 'current-pass' } });
        fireEvent.change(inputs[1], { target: { value: 'new-pass-123' } });
        fireEvent.change(inputs[2], { target: { value: 'different-pass' } });

        fireEvent.click(screen.getByRole('button', { name: /Change Password & Continue/i }));

        expect(await screen.findByText(/Passwords do not match/i)).toBeTruthy();
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('shows an error when new password is too short', async () => {
        const { container } = render(<ForceChangePassword />);
        const inputs = passwordInputs(container);

        fireEvent.change(inputs[0], { target: { value: 'current-pass' } });
        fireEvent.change(inputs[1], { target: { value: 'short' } });
        fireEvent.change(inputs[2], { target: { value: 'short' } });

        fireEvent.click(screen.getByRole('button', { name: /Change Password & Continue/i }));

        expect(await screen.findByText(/must be at least 8 characters/i)).toBeTruthy();
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('toggles password visibility when the eye icon is clicked', async () => {
        const { container } = render(<ForceChangePassword />);
        const inputs = passwordInputs(container);
        const eyes = container.querySelectorAll('.password-eye');

        expect(inputs[0]).toHaveAttribute('type', 'password');
        fireEvent.click(eyes[0]);
        expect(inputs[0]).toHaveAttribute('type', 'text');
        fireEvent.click(eyes[0]);
        expect(inputs[0]).toHaveAttribute('type', 'password');
    });

    it('submits the form successfully and clears mustChangePassword locally', async () => {
        mockApiFetch.mockResolvedValue({});

        const { container } = render(<ForceChangePassword />);
        const inputs = passwordInputs(container);

        fireEvent.change(inputs[0], { target: { value: 'current-password' } });
        fireEvent.change(inputs[1], { target: { value: 'new-password-123' } });
        fireEvent.change(inputs[2], { target: { value: 'new-password-123' } });

        fireEvent.click(screen.getByRole('button', { name: /Change Password & Continue/i }));

        await waitFor(() => expect(mockLogin).toHaveBeenCalled());
        expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: 'current-password', newPassword: 'new-password-123' }),
        });
        expect(mockLogin).toHaveBeenCalledWith({ username: 'test-user', mustChangePassword: false });
    });

    it('shows an error when the API request fails', async () => {
        mockApiFetch.mockRejectedValue(new Error('Server failure'));

        const { container } = render(<ForceChangePassword />);
        const inputs = passwordInputs(container);

        fireEvent.change(inputs[0], { target: { value: 'current-password' } });
        fireEvent.change(inputs[1], { target: { value: 'new-password-123' } });
        fireEvent.change(inputs[2], { target: { value: 'new-password-123' } });

        fireEvent.click(screen.getByRole('button', { name: /Change Password & Continue/i }));

        expect(await screen.findByText(/Server failure/i)).toBeTruthy();
        expect(mockLogin).not.toHaveBeenCalled();
    });

    it('calls logout when the logout button is clicked', () => {
        render(<ForceChangePassword />);
        fireEvent.click(screen.getByRole('button', { name: /Log out instead/i }));
        expect(mockLogout).toHaveBeenCalled();
    });

    it('toggles theme when the theme button is clicked', () => {
        render(<ForceChangePassword />);
        fireEvent.click(screen.getByTitle(/Light mode|Dark mode/i));
        expect(mockToggleTheme).toHaveBeenCalled();
    });
});
