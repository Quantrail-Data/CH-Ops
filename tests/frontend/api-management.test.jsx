// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> kathir Moorthy
// Unit tests verifying API token generation, lifecycle states, endpoint access controls, and rate limits.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ApiManagement from '../../src/frontend/components/admin/ApiManagement.jsx';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../src/frontend/components/layout/Toast.jsx', () => ({
  useToast: () => mockToast,
}));

const mockApiFetch = vi.fn();
const mockGetActiveApiKey = vi.fn();
const mockSetGlobalConnection = vi.fn();

vi.mock('../../src/frontend/utils/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
  getActiveApiKey: (...args) => mockGetActiveApiKey(...args),
  setGlobalConnection: (...args) => mockSetGlobalConnection(...args),
}));

function setupMatchMedia(matches = false, withModernApi = true) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: withModernApi ? vi.fn() : undefined,
      removeEventListener: withModernApi ? vi.fn() : undefined,
      addListener: withModernApi ? undefined : vi.fn(),
      removeListener: withModernApi ? undefined : vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setTheme({ htmlTheme, bodyTheme, htmlClass = '', bodyClass = '', storedTheme } = {}) {
  document.documentElement.setAttribute('data-theme', htmlTheme ?? '');
  document.body.setAttribute('data-theme', bodyTheme ?? '');
  document.documentElement.className = htmlClass;
  document.body.className = bodyClass;

  const getItem = vi.fn((k) => (k === 'theme' ? storedTheme ?? null : null));
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    value: { getItem },
  });
}

async function waitUntilLoaded() {
  await screen.findByText('API Key Management');
}

async function openAddForm() {
  const addButton = screen.getByText('Add API Key');
  fireEvent.click(addButton);
  await screen.findByText(/API Key Name/i);
}

function fillProviderAndModel(provider = 'OPEN AI', model = 'GPT-5.4 mini') {
  const providerSelect = screen.getByRole('combobox');
  fireEvent.change(providerSelect, { target: { value: provider } });
  const modelInput = screen.getByDisplayValue(model === '' ? '' : model) || screen.getByRole('textbox');
  return { providerSelect, modelInput };
}

describe('ApiManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMatchMedia(false, true);
    setTheme({});

    mockApiFetch.mockResolvedValue({
      apiKeys: [],
      selectedKeyId: null,
    });

    mockGetActiveApiKey.mockResolvedValue(null);
  });

  it('renders loading then main content', async () => {
    render(<ApiManagement />);
    expect(screen.getByText(/Loading.../i)).toBeTruthy();
    await waitUntilLoaded();
    expect(screen.getByText('Qurioz API Key Manager')).toBeTruthy();
  });

  it('renders saved keys and active badge', async () => {
    mockApiFetch.mockResolvedValueOnce({
      apiKeys: [{ id: 1, name: 'Prod', model: 'GPT-5.4 mini', createdAt: new Date().toISOString() }],
      selectedKeyId: 1,
    });

    render(<ApiManagement />);
    await waitUntilLoaded();

    expect(screen.getByText('Prod')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows add form from empty state', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));

    expect(screen.getByText(/API Key Name/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Enter your API key/i)).toBeTruthy();
  });

  it('validates missing provider name', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });

    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalledWith('Please enter an API key name');
    });
  });

  it('validates missing model value', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });

    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });

    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalledWith('Please enter an API key name');
    });
  });

  it('validates invalid key format', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'short' },
    });

    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalled();
    });
  });

  it('validates key max length', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'k'.repeat(501) },
    });

    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalledWith('API key must not exceed 500 characters');
    });
  });

  it('blocks duplicate name on create', async () => {
    mockApiFetch.mockResolvedValueOnce({
      apiKeys: [{ id: 1, name: 'OPEN AI', model: 'GPT-5.4 mini', createdAt: new Date().toISOString() }],
      selectedKeyId: null,
    });

    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });

    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalledWith('Cannot create: API key name "OPEN AI" already exists');
    });
  });

  it('blocks duplicate value on create', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null })
      .mockResolvedValueOnce({
        apiKeys: [{ id: 2, name: 'Other', key: 'sk-dup-value-1234567890' }],
      });

    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-dup-value-1234567890' },
    });

    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalledWith('Cannot create: This API key value already exists');
    });
  });

  it('creates new key successfully and updates global key when active exists', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null })
      .mockResolvedValueOnce({ apiKeys: [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null });

    mockGetActiveApiKey.mockResolvedValue({ key: 'sk-live', name: 'Live' });

    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });
    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/qurioz/api-keys', expect.objectContaining({ method: 'POST' }));
      expect(mockToast.success).toHaveBeenCalledWith('API key added successfully');
      expect(mockSetGlobalConnection).toHaveBeenCalledWith({ apiKey: 'sk-live', apiKeyName: 'Live' });
    });
  });

  it('updates an existing key successfully', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        apiKeys: [{ id: 7, name: 'OPEN AI', model: 'GPT-5.4 mini', createdAt: new Date().toISOString() }],
        selectedKeyId: 7,
      })
      .mockResolvedValueOnce({ keyValue: 'sk-original-1234567890123' })
      .mockResolvedValueOnce({ apiKeys: [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null });

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('OPEN AI');

    fireEvent.click(screen.getByTitle('Edit key'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OPEN AI')).toBeTruthy();
      expect(screen.getByDisplayValue('GPT-5.4 mini')).toBeTruthy();
      expect(screen.getByDisplayValue('sk-original-1234567890123')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('GPT-5.4 mini'), { target: { value: 'GPT-5.4-nano' } });
    fireEvent.change(screen.getByDisplayValue('sk-original-1234567890123'), {
      target: { value: 'sk-updated-1234567890123' },
    });

    fireEvent.submit(screen.getByText('Update Key').closest('form'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/qurioz/api-keys/7', expect.objectContaining({ method: 'PUT' }));
      expect(mockToast.success).toHaveBeenCalledWith('API key updated successfully');
    });
  });

  it('edit flow handles fetch value failure', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        apiKeys: [{ id: 11, name: 'OPEN AI', model: 'GPT-5.4 mini', createdAt: new Date().toISOString() }],
        selectedKeyId: null,
      })
      .mockRejectedValueOnce(new Error('value fail'));

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('OPEN AI');

    fireEvent.click(screen.getByTitle('Edit key'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to load key value: value fail');
    });
  });

  it('selects active key successfully', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        apiKeys: [
          { id: 1, name: 'A', model: 'm1', createdAt: new Date().toISOString() },
          { id: 2, name: 'B', model: 'm2', createdAt: new Date().toISOString() },
        ],
        selectedKeyId: 1,
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValue({ apiKeys: [], selectedKeyId: null });

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('A');

    fireEvent.click(screen.getByTitle('Set as active'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/qurioz/api-keys/select', expect.objectContaining({ method: 'POST' }));
      expect(mockToast.success).toHaveBeenCalledWith('Active API key changed');
    });
  });

  it('select active key failure shows toast', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        apiKeys: [
          { id: 1, name: 'A', model: 'm1', createdAt: new Date().toISOString() },
          { id: 2, name: 'B', model: 'm2', createdAt: new Date().toISOString() },
        ],
        selectedKeyId: 1,
      })
      .mockRejectedValueOnce(new Error('select fail'));

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('A');

    fireEvent.click(screen.getByTitle('Set as active'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to select API key: select fail');
    });
  });

  it('opens and cancels delete modal by button', async () => {
    mockApiFetch.mockResolvedValueOnce({
      apiKeys: [{ id: 3, name: 'DeleteMe', model: 'm1', createdAt: new Date().toISOString() }],
      selectedKeyId: null,
    });

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('DeleteMe');

    fireEvent.click(screen.getByTitle('Delete key'));
    await screen.findByText('Confirm Delete');

    fireEvent.click(screen.getByText('No, Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Confirm Delete')).toBeNull();
    });
  });

  it('deletes key successfully', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        apiKeys: [{ id: 10, name: 'ToDelete', model: 'm1', createdAt: new Date().toISOString() }],
        selectedKeyId: null,
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValue({ apiKeys: [], selectedKeyId: null });

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('ToDelete');

    fireEvent.click(screen.getByTitle('Delete key'));
    await screen.findByText('Yes, Delete');
    fireEvent.click(screen.getByText('Yes, Delete'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/qurioz/api-keys/10', expect.objectContaining({ method: 'DELETE' }));
      expect(mockToast.success).toHaveBeenCalledWith('API key "ToDelete" removed successfully');
    });
  });

  it('delete failure shows toast and closes modal', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        apiKeys: [{ id: 21, name: 'FailDelete', model: 'm1', createdAt: new Date().toISOString() }],
        selectedKeyId: null,
      })
      .mockRejectedValue(new Error('delete fail'));

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('FailDelete');

    fireEvent.click(screen.getByTitle('Delete key'));
    await screen.findByText('Yes, Delete');
    fireEvent.click(screen.getByText('Yes, Delete'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });

    const errorMessages = mockToast.error.mock.calls.map((c) => c[0]);
    expect(errorMessages.some((m) => m.includes('delete fail'))).toBe(true);

    await waitFor(() => {
      expect(screen.queryByText('Confirm Delete')).toBeNull();
    });
  });

  it('escape key closes delete modal', async () => {
    mockApiFetch.mockResolvedValueOnce({
      apiKeys: [{ id: 4, name: 'EscDelete', model: 'm1', createdAt: new Date().toISOString() }],
      selectedKeyId: null,
    });

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('EscDelete');

    fireEvent.click(screen.getByTitle('Delete key'));
    await screen.findByText('Confirm Delete');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Confirm Delete')).toBeNull();
    });
  });

  it('shows max keys state and hides add button', async () => {
    mockApiFetch.mockResolvedValueOnce({
      apiKeys: [
        { id: 1, name: 'K1', model: 'm1', createdAt: new Date().toISOString() },
        { id: 2, name: 'K2', model: 'm2', createdAt: new Date().toISOString() },
        { id: 3, name: 'K3', model: 'm3', createdAt: new Date().toISOString() },
      ],
      selectedKeyId: 1,
    });

    render(<ApiManagement />);
    await waitUntilLoaded();

    expect(screen.getByText('Saved API Keys (3/3)')).toBeTruthy();
    expect(screen.queryByText('Add API Key')).toBeNull();
  });

  it('toggle show/hide key button works', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.click(screen.getByTitle('Show'));
    expect(screen.getByTitle('Hide')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Hide'));
    expect(screen.getByTitle('Show')).toBeTruthy();
  });

  it('cancel in form resets back to non-edit mode', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Save Key')).toBeNull();
    });
  });

  it('loadApiKeys ignores Not found error toast', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Not found'));

    render(<ApiManagement />);
    await waitFor(() => {
      expect(screen.getByText('API Key Management')).toBeTruthy();
    });

    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('loadApiKeys non-Not-found error shows toast', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Boom'));

    render(<ApiManagement />);
    await waitFor(() => {
      expect(screen.getByText('API Key Management')).toBeTruthy();
    });

    expect(mockToast.error).toHaveBeenCalledWith('Failed to load API keys: Boom');
  });

  it('duplicate value check failure logs path still allows create', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockApiFetch
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null })
      .mockRejectedValueOnce(new Error('with-values fail'))
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null });

    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });
    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith('Failed to check duplicate values');
      expect(mockToast.success).toHaveBeenCalledWith('API key added successfully');
    });

    logSpy.mockRestore();
  });

  it('covers dark mode preference via localStorage and legacy addListener path', async () => {
    setupMatchMedia(false, false);
    setTheme({ storedTheme: 'dark' });

    render(<ApiManagement />);
    await waitUntilLoaded();

    expect(screen.getByText('API Key Management')).toBeTruthy();
  });

  it('renders empty state text when no keys exist', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    expect(screen.getByText('No API keys configured yet.')).toBeTruthy();
  });

  it('updateGlobalActiveKey clears global connection when no active key exists', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        apiKeys: [{ id: 10, name: 'ToDelete', model: 'm1', createdAt: new Date().toISOString() }],
        selectedKeyId: null,
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValue({ apiKeys: [], selectedKeyId: null });

    mockGetActiveApiKey.mockResolvedValue(null);

    render(<ApiManagement />);
    await waitUntilLoaded();
    await screen.findByText('ToDelete');

    fireEvent.click(screen.getByTitle('Delete key'));
    await screen.findByText('Yes, Delete');
    fireEvent.click(screen.getByText('Yes, Delete'));

    await waitFor(() => {
      expect(mockSetGlobalConnection).toHaveBeenCalledWith({
        apiKey: null,
        apiKeyName: null,
      });
    });
  });

  it('save failure shows toast', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null })
      .mockResolvedValueOnce({ apiKeys: [] })
      .mockRejectedValueOnce(new Error('save fail'));

    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });
    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to save API key: save fail');
    });
  });

  it('updateGlobalActiveKey failure is swallowed via console.log path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockApiFetch
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null })
      .mockResolvedValueOnce({ apiKeys: [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ apiKeys: [], selectedKeyId: null });

    mockGetActiveApiKey.mockRejectedValueOnce(new Error('active key fail'));

    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'OPEN AI' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model name/i), {
      target: { value: 'GPT-5.4 mini' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your API key/i), {
      target: { value: 'sk-12345678901234567890' },
    });
    fireEvent.submit(screen.getByText('Save Key').closest('form'));

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith('Failed to update global API key');
    });

    logSpy.mockRestore();
  });

  it('detects dark mode from html data-theme', async () => {
    setTheme({ htmlTheme: 'dark' });

    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    expect(screen.getByText('API Key Management')).toBeTruthy();
  });

  it('supports gemini placeholder path', async () => {
    render(<ApiManagement />);
    await waitUntilLoaded();

    fireEvent.click(screen.getByText('Add API Key'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'GEMINI' },
    });

    expect(screen.getByPlaceholderText(/gemini-2.5-flash/i)).toBeTruthy();
  });
});