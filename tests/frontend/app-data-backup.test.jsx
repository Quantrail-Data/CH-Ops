// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Kathir Moorthy
// Unit tests verifying app data backup operations including superadmin access control, profile/config loading, manual/scheduled backups, history listing, and restore instructions.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import AppDataBackup from '../../src/frontend/components/admin/AppDataBackup.jsx';

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

function setAuthRole(role) {
  mockUseAuth.mockReturnValue({
    auth: { role },
  });
}

function profileValue(profiles) {
  return JSON.stringify(profiles);
}

describe('AppDataBackup', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    setAuthRole('superadmin');
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/settings/backup_profiles') {
        return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      }
      if (url === '/api/app-backup/config') {
        if (options?.method === 'PUT') return { ok: true };
        return { enabled: false, profileName: 'primary', frequency: 'daily', backupHour: 2, weekday: 0 };
      }
      if (url.startsWith('/api/app-backup/list?profile=')) return [];
      if (url === '/api/app-backup/create') return { file_size_display: '1.2 MB' };
      return { ok: true };
    });
  });

  it('renders main page', async () => {
    render(<AppDataBackup />);
    await screen.findByText('App Data Backup');
  });

  it('shows access denied for non-superadmin', async () => {
    setAuthRole('admin');
    render(<AppDataBackup />);
    await screen.findByText('App Data Backup');
    expect(screen.getAllByText('App data backup is only available for superadministrators.').length).toBeGreaterThan(0);
  });

  it('shows no profiles banner', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: '[]' };
      if (url === '/api/app-backup/config') return { enabled: false, profileName: '', frequency: 'daily', backupHour: 2, weekday: 0 };
      return [];
    });

    render(<AppDataBackup />);
    await screen.findByText('App Data Backup');
    expect(screen.getByText(/No storage profiles configured/i)).toBeTruthy();
  });

  it('renders main sections when profiles exist', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Manual Backup');
    expect(screen.getByText('Scheduled Backup')).toBeTruthy();
    expect(screen.getByText('Backup History')).toBeTruthy();
    expect(screen.getByText('Restore Instructions')).toBeTruthy();
  });

  it('handles config load failure', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      if (url === '/api/app-backup/config') throw new Error('Config load failed');
      if (url.startsWith('/api/app-backup/list?profile=')) return [];
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('App Data Backup');

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to load backup config: Config load failed');
    });
  });

  it('manual backup success flow', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Manual Backup');

    fireEvent.click(screen.getByRole('button', { name: /Backup Now/i }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/app-backup/create',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockToast.success).toHaveBeenCalledWith('Backup complete: 1.2 MB');
    });
  });

  it('manual backup failure flow', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/settings/backup_profiles') return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      if (url === '/api/app-backup/config') return { enabled: false, profileName: 'primary', frequency: 'daily', backupHour: 2, weekday: 0 };
      if (url.startsWith('/api/app-backup/list?profile=')) return [];
      if (url === '/api/app-backup/create' && options?.method === 'POST') throw new Error('Backup failed');
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('Manual Backup');

    fireEvent.click(screen.getByRole('button', { name: /Backup Now/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Backup failed');
    });
  });

  it('save schedule success', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Scheduled Backup');

    fireEvent.click(screen.getByRole('button', { name: /Save Schedule/i }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/app-backup/config',
        expect.objectContaining({ method: 'PUT' }),
      );
      expect(mockToast.success).toHaveBeenCalledWith('Schedule saved.');
    });
  });

  it('save schedule failure', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (url === '/api/settings/backup_profiles') return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      if (url === '/api/app-backup/config' && options?.method === 'PUT') throw new Error('Save failed');
      if (url === '/api/app-backup/config') return { enabled: false, profileName: 'primary', frequency: 'daily', backupHour: 2, weekday: 0 };
      if (url.startsWith('/api/app-backup/list?profile=')) return [];
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('Scheduled Backup');

    fireEvent.click(screen.getByRole('button', { name: /Save Schedule/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Save failed');
    });
  });

  it('weekly frequency shows day selector', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Scheduled Backup');

    const selects = document.querySelectorAll('select.cui-select-native-real');
    fireEvent.change(selects[2], { target: { value: 'weekly' } });

    await waitFor(() => {
      expect(screen.getByText('Day')).toBeTruthy();
    });
  });

  it('shows empty backup history', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Backup History');
    expect(screen.getByText('No backups found for this profile.')).toBeTruthy();
  });

  it('renders backup rows with table counts', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      if (url === '/api/app-backup/config') return { enabled: false, profileName: 'primary', frequency: 'daily', backupHour: 2, weekday: 0 };
      if (url.startsWith('/api/app-backup/list?profile=')) {
        return [
          {
            backup_id: 'bk_001',
            backup_type: 'manual',
            created_at: new Date().toISOString(),
            file_size_display: '2 MB',
            app_version: '1.0.0',
            table_counts: { users: 10, alerts: 5 },
          },
        ];
      }
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('Backup History');

    await waitFor(() => {
      expect(screen.getByText('bk_001')).toBeTruthy();
      expect(screen.getByText('MANUAL')).toBeTruthy();
      expect(screen.getByText('2 MB')).toBeTruthy();
      expect(screen.getByText('1.0.0')).toBeTruthy();
      expect(screen.getByText('users: 10')).toBeTruthy();
      expect(screen.getByText('alerts: 5')).toBeTruthy();
    });
  });

  it('refresh button reloads history', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Backup History');

    const refreshButtons = screen.getAllByRole('button');
    const refreshBtn = refreshButtons.find((btn) => btn.querySelector('.ti-refresh'));
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/app-backup/list?profile=primary');
    });
  });

  it('list failures fallback to empty history', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      if (url === '/api/app-backup/config') return { enabled: false, profileName: 'primary', frequency: 'daily', backupHour: 2, weekday: 0 };
      if (url.startsWith('/api/app-backup/list?profile=')) throw new Error('List failed');
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('Backup History');

    await waitFor(() => {
      expect(screen.getByText('No backups found for this profile.')).toBeTruthy();
    });
  });

  it('restore instructions toggle show and hide', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Restore Instructions');

    fireEvent.click(screen.getByRole('button', { name: /Show/i }));

    await waitFor(() => {
      expect(screen.getByText(/Restoring replaces all app data/i)).toBeTruthy();
      expect(screen.getByText(/Using AWS CLI/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Hide/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Restoring replaces all app data/i)).toBeNull();
    });
  });

  it('shows last run status when available', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      if (url === '/api/app-backup/config') {
        return {
          enabled: true,
          profileName: 'primary',
          frequency: 'daily',
          backupHour: 2,
          weekday: 0,
          lastRunAt: new Date().toISOString(),
          lastRunStatus: 'ok',
          lastRunError: '',
        };
      }
      if (url.startsWith('/api/app-backup/list?profile=')) return [];
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('Scheduled Backup');

    await waitFor(() => {
      expect(screen.getByText(/Last run:/i)).toBeTruthy();
      expect(screen.getByText('ok')).toBeTruthy();
    });
  });

  it('shows last run error when provided', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: profileValue([{ name: 'primary', type: 's3' }]) };
      if (url === '/api/app-backup/config') {
        return {
          enabled: true,
          profileName: 'primary',
          frequency: 'weekly',
          backupHour: 5,
          weekday: 1,
          lastRunAt: new Date().toISOString(),
          lastRunStatus: 'failed',
          lastRunError: 'Timeout',
        };
      }
      if (url.startsWith('/api/app-backup/list?profile=')) return [];
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('Scheduled Backup');

    await waitFor(() => {
      expect(screen.getByText('failed')).toBeTruthy();
      expect(screen.getByText(/Timeout/)).toBeTruthy();
    });
  });

  it('toggle enabled and save sends updated config', async () => {
    render(<AppDataBackup />);
    await screen.findByText('Scheduled Backup');

    const enabledCheckbox = screen.getByRole('checkbox');
    fireEvent.click(enabledCheckbox);
    fireEvent.click(screen.getByRole('button', { name: /Save Schedule/i }));

    await waitFor(() => {
      const putCall = mockApiFetch.mock.calls.find(
        ([url, options]) => url === '/api/app-backup/config' && options?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const sent = JSON.parse(putCall[1].body);
      expect(sent.enabled).toBe(true);
    });
  });

  it('changing manual profile triggers history load for that profile', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') {
        return { value: profileValue([{ name: 'primary', type: 's3' }, { name: 'archive', type: 's3' }]) };
      }
      if (url === '/api/app-backup/config') return { enabled: false, profileName: 'primary', frequency: 'daily', backupHour: 2, weekday: 0 };
      if (url.startsWith('/api/app-backup/list?profile=')) return [];
      return { ok: true };
    });

    render(<AppDataBackup />);
    await screen.findByText('Manual Backup');

    const selects = document.querySelectorAll('select.cui-select-native-real');
    fireEvent.change(selects[0], { target: { value: 'archive' } });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/app-backup/list?profile=archive');
    });
  });
});