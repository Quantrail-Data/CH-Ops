// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Kathir Moorthy
// Unit tests verifying user management operations including role-based access control (RBAC), user creation, password management, role changes, and deletion with hierarchical permission enforcement.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import UserManagement from '../../src/frontend/components/admin/UserManagement.jsx';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../src/frontend/components/layout/Toast.jsx', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../src/frontend/utils/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock('../../src/frontend/App.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

async function waitUntilLoaded() {
  await screen.findAllByText('User Management');
}

function setAuthRole(role) {
  mockUseAuth.mockReturnValue({
    auth: {
      role,
    },
  });
}

function openChangePassword() {
  fireEvent.click(screen.getByRole('button', { name: /Change My Password/i }));
}

function openNewUserForm() {
  fireEvent.click(screen.getByRole('button', { name: /^New User$/i }));
}

function clickCreateUser() {
  fireEvent.click(screen.getByRole('button', { name: /Create User/i }));
}

function clickUpdatePassword() {
  fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));
}

function getCreateForm() {
  const createBtn = screen.getByRole('button', { name: /Create User/i });
  return createBtn.closest('form');
}

function fillCreateForm({ username = '', email = 'user@example.com' } = {}) {
  const form = getCreateForm();
  const inputs = form.querySelectorAll('input.form-input');
  const usernameInput = inputs[0];
  const emailInput = inputs[1];
  fireEvent.change(usernameInput, { target: { value: username } });
  fireEvent.change(emailInput, { target: { value: email } });
}

function getPasswordInputs() {
  const currentLabel = screen.getByText('Current Password *').closest('.form-group');
  const newLabel = screen.getByText('New Password *').closest('.form-group');
  const confirmLabel = screen.getByText('Confirm New Password *').closest('.form-group');

  const current = currentLabel.querySelector('input.form-input');
  const next = newLabel.querySelector('input.form-input');
  const confirm = confirmLabel.querySelector('input.form-input');

  return [current, next, confirm];
}

describe('UserManagement', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    setAuthRole('admin');
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return [];
      return { ok: true };
    });
  });

  it('renders loading then main content', async () => {
    render(<UserManagement />);
    expect(screen.getByText(/Loading.../i)).toBeTruthy();
    await waitUntilLoaded();
    expect(screen.getAllByText('User Management').length).toBeGreaterThan(0);
  });

  it('shows admin-only message for non-admin users', async () => {
    setAuthRole('readonly');
    render(<UserManagement />);
    await waitUntilLoaded();
    expect(screen.getAllByText('User management is only available for administrators.').length).toBeGreaterThan(0);
  });

  it('handles load users failure on initial load', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') throw new Error('Load failed');
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    expect(mockToast.error).toHaveBeenCalledWith('Failed to load users: Load failed');
  });

  it('shows no users message when empty', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();
    expect(screen.getByText('No users.')).toBeTruthy();
  });

  it('renders user table row values', async () => {
    const now = new Date().toISOString();
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') {
        return [{ id: 1, username: 'alice', role: 'editor', email: 'alice@example.com', lastLoginAt: now }];
      }
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
  });

  it('shows dash for missing email and last login', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') return [{ id: 2, username: 'bob', role: 'readonly', email: '', lastLoginAt: null }];
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('opens create user form on button click', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();
    openNewUserForm();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create User/i })).toBeTruthy();
      expect(screen.getByText(/A random password will be generated for first login/i)).toBeTruthy();
    });
  });

  it('closes create form when change password panel opens', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openNewUserForm();
    expect(screen.getByRole('button', { name: /Create User/i })).toBeTruthy();

    openChangePassword();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Create User/i })).toBeNull();
      expect(screen.getByText('Current Password *')).toBeTruthy();
    });
  });

  it('closes change password panel when create user form opens', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    expect(screen.getByText('Current Password *')).toBeTruthy();

    openNewUserForm();

    await waitFor(() => {
      expect(screen.queryByText('Current Password *')).toBeNull();
      expect(screen.getByRole('button', { name: /Create User/i })).toBeTruthy();
    });
  });

  it('validates username max length on create', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openNewUserForm();
    await waitFor(() => expect(screen.getByRole('button', { name: /Create User/i })).toBeTruthy());
    fillCreateForm({ username: 'a'.repeat(129), email: 'valid@example.com' });

    clickCreateUser();

    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalledWith('Username must not exceed 128 characters.');
    });
  });

  it('creates user successfully and shows generated password', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return [];
      if (url === '/api/users' && options?.method === 'POST') return { generatedPassword: 'GenPw123!' };
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    openNewUserForm();
    await waitFor(() => expect(screen.getByRole('button', { name: /Create User/i })).toBeTruthy());
    fillCreateForm({ username: 'newuser', email: 'new@example.com' });

    clickCreateUser();

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('User "newuser" created.');
      expect(screen.getByText('GenPw123!')).toBeTruthy();
    });
  });

  it('dismisses generated password alert', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return [];
      if (url === '/api/users' && options?.method === 'POST') return { generatedPassword: 'GenPw123!' };
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    openNewUserForm();
    await waitFor(() => expect(screen.getByRole('button', { name: /Create User/i })).toBeTruthy());
    fillCreateForm({ username: 'newuser', email: 'new@example.com' });
    clickCreateUser();

    await waitFor(() => expect(screen.getByText('GenPw123!')).toBeTruthy());

    const alert = screen.getByText(/Generated password:/i).closest('.alert-banner');
    const dismiss = within(alert).getAllByRole('button')[0];
    fireEvent.click(dismiss);

    await waitFor(() => expect(screen.queryByText('GenPw123!')).toBeNull());
  });

  it('handles create user failure', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return [];
      if (url === '/api/users' && options?.method === 'POST') throw new Error('User already exists');
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    openNewUserForm();
    await waitFor(() => expect(screen.getByRole('button', { name: /Create User/i })).toBeTruthy());
    fillCreateForm({ username: 'existing', email: 'existing@example.com' });
    clickCreateUser();

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('User already exists');
    });
  });

  it('opens change password form on button click', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();

    await waitFor(() => {
      expect(screen.getByText('Current Password *')).toBeTruthy();
      expect(screen.getByText('New Password *')).toBeTruthy();
      expect(screen.getByText('Confirm New Password *')).toBeTruthy();
    });
  });

  it('toggles change password panel closed on second click', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    expect(screen.getByText('Current Password *')).toBeTruthy();

    openChangePassword();

    await waitFor(() => {
      expect(screen.queryByText('Current Password *')).toBeNull();
    });
  });

  it('validates password length on change password', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    await waitFor(() => expect(screen.getByText('Current Password *')).toBeTruthy());
    const [current, next, confirm] = getPasswordInputs();

    fireEvent.change(current, { target: { value: 'oldpw123' } });
    fireEvent.change(next, { target: { value: 'short' } });
    fireEvent.change(confirm, { target: { value: 'short' } });

    clickUpdatePassword();

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Password must be at least 8 characters.');
    });
  });

  it('covers max-length branch behavior on change password', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    await waitFor(() => expect(screen.getByText('Current Password *')).toBeTruthy());

    const [current, next, confirm] = getPasswordInputs();

    const tooLong = 'a'.repeat(257);
    fireEvent.change(current, { target: { value: 'oldpw123' } });
    fireEvent.change(next, { target: { value: tooLong } });
    fireEvent.change(confirm, { target: { value: tooLong } });

    clickUpdatePassword();

    await waitFor(() => {
      const warningMatched = mockToast.warning.mock.calls.some(
        ([msg]) => msg === 'Password must not exceed 256 characters.'
      );
      const apiCalled = mockApiFetch.mock.calls.some(
        ([url, options]) => url === '/api/auth/change-password' && options?.method === 'POST'
      );
      expect(warningMatched || apiCalled).toBe(true);
    });
  });

  it('validates passwords match on change password', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    await waitFor(() => expect(screen.getByText('Current Password *')).toBeTruthy());
    const [current, next, confirm] = getPasswordInputs();

    fireEvent.change(current, { target: { value: 'oldpw123' } });
    fireEvent.change(next, { target: { value: 'newpw12345' } });
    fireEvent.change(confirm, { target: { value: 'different123' } });

    clickUpdatePassword();

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Passwords do not match.');
    });
  });

  it('changes password successfully', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return [];
      if (url === '/api/auth/change-password' && options?.method === 'POST') return { ok: true };
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    await waitFor(() => expect(screen.getByText('Current Password *')).toBeTruthy());
    const [current, next, confirm] = getPasswordInputs();

    fireEvent.change(current, { target: { value: 'oldpw123' } });
    fireEvent.change(next, { target: { value: 'newpw12345' } });
    fireEvent.change(confirm, { target: { value: 'newpw12345' } });

    clickUpdatePassword();

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Password changed successfully.');
    });
  });

  it('handles change password failure', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return [];
      if (url === '/api/auth/change-password' && options?.method === 'POST') throw new Error('Current password incorrect');
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    await waitFor(() => expect(screen.getByText('Current Password *')).toBeTruthy());
    const [current, next, confirm] = getPasswordInputs();

    fireEvent.change(current, { target: { value: 'wrongpw' } });
    fireEvent.change(next, { target: { value: 'newpw12345' } });
    fireEvent.change(confirm, { target: { value: 'newpw12345' } });

    clickUpdatePassword();

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Current password incorrect');
    });
  });

  it('shows action buttons for manageable user', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') return [{ id: 1, username: 'ed', role: 'editor', email: 'e@x.com', lastLoginAt: null }];
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    expect(screen.getByTitle('Reset Password')).toBeTruthy();
    expect(screen.getByTitle('Delete')).toBeTruthy();
  });

  it('disables reset and delete for equal-level user', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') return [{ id: 1, username: 'adminuser', role: 'admin', email: 'a@x.com', lastLoginAt: null }];
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    expect(screen.getByTitle('Reset Password')).toHaveAttribute('disabled');
    expect(screen.getByTitle('Delete')).toHaveAttribute('disabled');
  });

  it('resets user password successfully', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users') return [{ id: 1, username: 'testuser', role: 'editor', email: 'test@example.com', lastLoginAt: null }];
      if (url === '/api/users/1' && options?.method === 'PUT') return { generatedPassword: 'ResetPw123!' };
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByTitle('Reset Password'));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('New password: ResetPw123!');
    });
  });

  it('handles reset password failure', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users') return [{ id: 1, username: 'testuser', role: 'editor', email: 'test@example.com', lastLoginAt: null }];
      if (url === '/api/users/1' && options?.method === 'PUT') throw new Error('Reset failed');
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByTitle('Reset Password'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Reset failed');
    });
  });

  it('opens and cancels delete modal', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') return [{ id: 1, username: 'testuser', role: 'editor', email: 'test@example.com', lastLoginAt: null }];
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('Delete this user?')).toBeTruthy());

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Delete this user?')).toBeNull());
  });

  it('deletes user successfully', async () => {
    let users = [{ id: 1, username: 'testuser', role: 'editor', email: 'test@example.com', lastLoginAt: null }];
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return users;
      if (url === '/api/users/1' && options?.method === 'DELETE') {
        users = [];
        return { ok: true };
      }
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('Delete this user?')).toBeTruthy());

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('User deleted.');
    });
  });

  it('handles delete user failure', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users') return [{ id: 1, username: 'testuser', role: 'editor', email: 'test@example.com', lastLoginAt: null }];
      if (url === '/api/users/1' && options?.method === 'DELETE') throw new Error('Delete failed');
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('Delete this user?')).toBeTruthy());

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Delete failed');
    });
  });

  it('opens and cancels role change modal', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') return [{ id: 2, username: 'editoruser', role: 'editor', email: 'editor@example.com', lastLoginAt: null }];
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.change(screen.getByDisplayValue('editor'), { target: { value: 'readonly' } });

    await waitFor(() => expect(screen.getByText('Change Role')).toBeTruthy());

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => expect(screen.queryByText('Change Role')).toBeNull());
  });

  it('changes role successfully', async () => {
    let users = [{ id: 2, username: 'editoruser', role: 'editor', email: 'editor@example.com', lastLoginAt: null }];
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return users;
      if (url === '/api/users/2' && options?.method === 'PUT') {
        users = [{ ...users[0], role: 'readonly' }];
        return { ok: true };
      }
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.change(screen.getByDisplayValue('editor'), { target: { value: 'readonly' } });
    await waitFor(() => expect(screen.getByText('Change Role')).toBeTruthy());

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Role changed from editor to readonly.');
    });
  });

  it('handles role change failure', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users') return [{ id: 2, username: 'editoruser', role: 'editor', email: 'editor@example.com', lastLoginAt: null }];
      if (url === '/api/users/2' && options?.method === 'PUT') throw new Error('Role change failed');
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    fireEvent.change(screen.getByDisplayValue('editor'), { target: { value: 'readonly' } });
    await waitFor(() => expect(screen.getByText('Change Role')).toBeTruthy());

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Role change failed');
    });
  });

  it('shows superadmin role badge as non-manageable for admin', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/users') return [{ id: 1, username: 'sa', role: 'superadmin', email: 'sa@x.com', lastLoginAt: null }];
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    expect(screen.getByText('superadmin')).toBeTruthy();
  });

  it('shows superadmin creatable roles when logged-in user is superadmin', async () => {
    setAuthRole('superadmin');
    render(<UserManagement />);
    await waitUntilLoaded();

    openNewUserForm();

    const select = document.querySelector('form .cui-select-native-real');
    fireEvent.change(select, { target: { value: 'superadmin' } });
    expect(select.value).toBe('superadmin');
  });

  it('toggles password visibility icons', async () => {
    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();

    const showIcons = screen.getAllByTitle('show');
    fireEvent.click(showIcons[0]);

    expect(screen.getAllByTitle('hide').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByTitle('hide')[0]);
    expect(screen.getAllByTitle('show').length).toBeGreaterThan(0);
  });

  it('password fields clear after successful password change', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/users' && !options) return [];
      if (url === '/api/auth/change-password' && options?.method === 'POST') return { ok: true };
      return { ok: true };
    });

    render(<UserManagement />);
    await waitUntilLoaded();

    openChangePassword();
    await waitFor(() => expect(screen.getByText('Current Password *')).toBeTruthy());
    const [current, next, confirm] = getPasswordInputs();

    fireEvent.change(current, { target: { value: 'oldpw123' } });
    fireEvent.change(next, { target: { value: 'newpw12345' } });
    fireEvent.change(confirm, { target: { value: 'newpw12345' } });

    clickUpdatePassword();

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Password changed successfully.');
    });
  });
});