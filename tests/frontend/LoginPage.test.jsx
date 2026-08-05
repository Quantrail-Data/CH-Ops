import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockLogin = vi.fn();
const mockToggleTheme = vi.fn();
const mockApiFetch = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('../../src/frontend/App.jsx', () => ({
    useAuth: () => ({ login: mockLogin }),
    useTheme: () => ({ theme: 'dark', toggleTheme: mockToggleTheme }),
}));

vi.mock('../../src/frontend/utils/api.js', () => ({
    apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock('../../src/frontend/components/layout/Toast.jsx', () => ({
    useToast: () => ({ success: mockToastSuccess }),
}));

vi.mock('../../src/frontend/components/common/Icon.jsx', () => ({
    default: ({ className = '', style, children }) => (
        <span data-testid="icon" className={className} style={style}>
            {children}
        </span>
    ),
}));

vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }) => <div {...props}>{children}</div>,
    },
}));

vi.mock('swiper/react', () => ({
    Swiper: ({ children }) => <div>{children}</div>,
    SwiperSlide: ({ children }) => <div>{children}</div>,
}));

vi.mock('swiper/modules', () => ({
    Pagination: {},
    Navigation: {},
    Autoplay: {},
    EffectFade: {},
}));

vi.mock('react-otp-input', () => ({
    default: ({ value, onChange }) => (
        <input
            data-testid="otp-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    ),
}));

vi.mock('../../src/frontend/assets/chops-light.svg', () => ({ default: 'chops-light.svg' }));
vi.mock('../../src/frontend/assets/chops-dark.svg', () => ({ default: 'chops-dark.svg' }));

import LoginPage from '../../src/frontend/components/layout/LoginPage.jsx';

const originalFetch = global.fetch;

beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
});

describe('LoginPage', () => {
    it('submits login credentials and calls login on success', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ username: 'alice', token: 'secret-token' }),
        });

        const { container } = render(<LoginPage />);
        const inputs = container.querySelectorAll('input');
        const usernameInput = inputs[0];
        const passwordInput = inputs[1];

        fireEvent.change(usernameInput, { target: { value: 'alice' } });
        fireEvent.change(passwordInput, { target: { value: 'hunter2' } });
        fireEvent.click(screen.getByRole('button', { name: /Login/i }));

        await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ username: 'alice', token: 'secret-token' }));
        expect(global.fetch).toHaveBeenCalledWith('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'alice', password: 'hunter2' }),
        });
    });

    it('toggles the password input visibility', () => {
        const { container } = render(<LoginPage />);
        const passwordInput = container.querySelector('input[type="password"]');
        const eyeButtons = container.querySelectorAll('.password-eye');

        expect(passwordInput).toHaveAttribute('type', 'password');
        fireEvent.click(eyeButtons[0]);
        expect(passwordInput).toHaveAttribute('type', 'text');
        fireEvent.click(eyeButtons[0]);
        expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('toggles theme when the top theme button is clicked', () => {
        render(<LoginPage />);
        fireEvent.click(screen.getByTitle(/Light mode|Dark mode/i));
        expect(mockToggleTheme).toHaveBeenCalled();
    });

    it('switches to forget password flow and sends verification code', async () => {
        mockApiFetch.mockResolvedValue({ success: true, email: 'alice@example.com' });

        const { container } = render(<LoginPage />);
        fireEvent.click(screen.getByText(/Forget password/i));

        expect(await screen.findByText(/Enter your email to reset your password/i)).toBeTruthy();

        const emailInput = container.querySelector('input');
        fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

        await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/forget-password/email/verify', {
            method: 'POST',
            body: JSON.stringify({ email: 'alice@example.com' }),
        }));
        expect(localStorage.getItem('otp-mail')).toBe('alice@example.com');
        expect(mockToastSuccess).toHaveBeenCalledWith('OTP generated!');
        expect(await screen.findByTestId('otp-input')).toBeTruthy();
    });
});
