// data-lifecycle-request.test.jsx - checks that the Data Lifecycle page sends backup fields, not SQL.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import DataLifecycle from '../../src/frontend/components/backups/DataLifecycle.jsx';

const mockApiFetch = vi.fn();
const mockRunQuery = vi.fn();
const mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

vi.mock('../../src/frontend/utils/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
  runQuery: (...args) => mockRunQuery(...args),
  getGlobalConnection: () => ({ nodeName: 'node-1', clusterId: 'c1' }),
}));
vi.mock('../../src/frontend/components/layout/Toast.jsx', () => ({ useToast: () => mockToast }));
vi.mock('../../src/frontend/App.jsx', () => ({ useAuth: () => ({ auth: { role: 'admin' } }) }));

const PROFILES = [
  { id: 7, name: 'azure-main', type: 'azure', bucket: 'my-container', accessKeyId: 'v1:aa:bb:cc', accessKey: 'v1:dd:ee:ff' },
];

function selectByLabel(label, value) {
  const group = screen.getByText(label).closest('.form-group');
  fireEvent.change(group.querySelector('select'), { target: { value } });
}

function queryCalls() {
  return mockApiFetch.mock.calls.filter(([url]) => url === '/api/query').map(([, options]) => JSON.parse(options.body));
}

describe('DataLifecycle backup requests', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockRunQuery.mockResolvedValue({ rows: [] });
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: JSON.stringify(PROFILES) };
      if (url === '/api/query') return { rows: [], backup_id: 'manual/ALL/MANUAL_ALL__1' };
      return {};
    });
  });

  it('shows an Azure preview with the key masked', async () => {
    render(<DataLifecycle />);
    await screen.findByText('Manual Backup / Restore');
    await waitFor(() => expect(screen.getByRole('option', { name: 'azure-main (AZURE)' })).toBeTruthy());
    selectByLabel('Storage Profile *', 'azure-main');

    const preview = await screen.findByText(/^BACKUP ALL TO AzureBlobStorage/);
    expect(preview.textContent).toMatch(
      /^BACKUP ALL TO AzureBlobStorage\('<connection string or URL>', 'my-container', 'backups\/manual\/ALL\/MANUAL_ALL__[0-9_]+\/', '<account name>', '\*\*\*'\)$/,
    );
  });

  it('shows why a setting is refused in the preview', async () => {
    render(<DataLifecycle />);
    await screen.findByText('Manual Backup / Restore');
    await waitFor(() => expect(screen.getByRole('option', { name: 'azure-main (AZURE)' })).toBeTruthy());
    selectByLabel('Storage Profile *', 'azure-main');
    fireEvent.change(screen.getByPlaceholderText(/compression_method/), { target: { value: 'x = (SELECT 1)' } });
    expect(await screen.findByText(/^-- The value of setting "x" is not valid/)).toBeTruthy();
  });

  it('sends the backup as fields and no SQL', async () => {
    render(<DataLifecycle />);
    await screen.findByText('Manual Backup / Restore');
    await waitFor(() => expect(screen.getByRole('option', { name: 'azure-main (AZURE)' })).toBeTruthy());
    selectByLabel('Storage Profile *', 'azure-main');
    fireEvent.change(screen.getByPlaceholderText(/compression_method/), { target: { value: "compression_method = 'lz4'" } });
    fireEvent.click(screen.getByRole('button', { name: /Execute BACKUP/i }));

    await waitFor(() => expect(queryCalls().length).toBe(1));
    const body = queryCalls()[0];
    expect(body.sql).toBeUndefined();
    expect(body.backup_sp).toBe(true);
    expect(body.node).toBe('node-1');
    expect(body.backup).toEqual({
      action: 'backup',
      scope: 'all',
      database: '',
      table: '',
      profileId: 7,
      onCluster: '',
      async: false,
      exceptTables: '',
      exceptDatabases: '',
      baseBackup: '',
      backupId: '',
      settings: "compression_method = 'lz4'",
    });
    expect(await screen.findByText(/BACKUP executed successfully/)).toBeTruthy();
  });

  it('shows the manifest error that the server returns', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url === '/api/settings/backup_profiles') return { value: JSON.stringify(PROFILES) };
      if (url === '/api/query') return { rows: [], manifest_error: 'write failed AccountKey=***' };
      return {};
    });
    render(<DataLifecycle />);
    await screen.findByText('Manual Backup / Restore');
    await waitFor(() => expect(screen.getByRole('option', { name: 'azure-main (AZURE)' })).toBeTruthy());
    selectByLabel('Storage Profile *', 'azure-main');
    fireEvent.click(screen.getByRole('button', { name: /Execute BACKUP/i }));
    expect(await screen.findByText(/Backup completed, but manifest write failed: write failed AccountKey=\*\*\*/)).toBeTruthy();
  });

  it('scans the manifests with a list request', async () => {
    render(<DataLifecycle />);
    await screen.findByText('Manual Backup / Restore');
    fireEvent.click(screen.getByText('Available Backups'));
    await waitFor(() => expect(screen.getByRole('option', { name: 'azure-main' })).toBeTruthy());
    selectByLabel('Storage Profile *', 'azure-main');
    fireEvent.click(screen.getByRole('button', { name: /Scan S3/i }));

    await waitFor(() => expect(queryCalls().length).toBe(7));
    const first = queryCalls()[0];
    expect(first.sql).toBeUndefined();
    expect(first.backup).toEqual({ action: 'list', profileId: 7, pattern: 'manual/*/manifest.json' });
  });
});
