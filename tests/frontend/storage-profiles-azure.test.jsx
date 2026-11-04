// storage-profiles-azure.test.jsx - checks the Azure Blob fields of the Storage Profiles form.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import StorageProfiles from '../../src/frontend/components/backups/StorageProfiles.jsx';

const mockApiFetch = vi.fn();

vi.mock('../../src/frontend/utils/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
  runQuery: vi.fn(),
}));
vi.mock('../../src/frontend/App.jsx', () => ({ useAuth: () => ({ auth: { role: 'superadmin' } }) }));

describe('StorageProfiles Azure form', () => {
  beforeEach(() => {
    cleanup();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ value: '[]' });
  });

  it('asks for the container, the account, the key or connection string and an endpoint', async () => {
    render(<StorageProfiles />);
    fireEvent.click(await screen.findByRole('button', { name: /New Profile/i }));
    const typeSelect = screen.getByText('Type').closest('.form-group').querySelector('select');
    fireEvent.change(typeSelect, { target: { value: 'azure' } });

    expect(screen.getByText('Container *')).toBeTruthy();
    expect(screen.getByText('Account Name (not needed with a connection string)')).toBeTruthy();
    expect(screen.getByText('Account Key or Connection String *')).toBeTruthy();
    expect(screen.getByPlaceholderText('https://ACCOUNT.blob.core.windows.net (optional)')).toBeTruthy();
  });
});
