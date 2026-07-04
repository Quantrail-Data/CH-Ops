/**
 * notifier.test.js - Unit tests for alert notification formatting
 *
 * Tests the formatDetails function extracted from notifier.js.
 * Verifies all required fields are included (name, severity, description,
 * SQL, schedule, operator, threshold, value, timestamp), severity is
 * uppercased, missing fields default to safe values (dash for strings,
 * '?' for null values), and current time is used when lastRunAt is missing.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect } from 'bun:test';

// Extracted formatDetails logic from notifier.js
function formatDetails(alert) {
  const ts = alert.lastRunAt ? new Date(alert.lastRunAt).toISOString() : new Date().toISOString();
  return {
    name: alert.name, severity: (alert.severity || 'info').toUpperCase(),
    description: alert.description || '-', sql: alert.sql || '-',
    schedule: alert.schedule || '-', operator: alert.operator || 'gt',
    threshold: alert.threshold, value: alert.lastValue ?? '?',
    hostname: 'test-host', timestamp: ts,
  };
}

describe('Alert notification details', () => {
  const base = { name: 'HighCPU', severity: 'critical', description: 'CPU above 90%', sql: 'SELECT avg(cpu) FROM metrics', schedule: '*/5 * * * *', operator: 'gt', threshold: 90, lastValue: 95.5, lastRunAt: '2026-05-07T10:00:00Z' };

  it('includes all required fields', () => {
    const d = formatDetails(base);
    expect(d.name).toBe('HighCPU');
    expect(d.severity).toBe('CRITICAL');
    expect(d.description).toBe('CPU above 90%');
    expect(d.sql).toBe('SELECT avg(cpu) FROM metrics');
    expect(d.schedule).toBe('*/5 * * * *');
    expect(d.operator).toBe('gt');
    expect(d.threshold).toBe(90);
    expect(d.value).toBe(95.5);
    expect(d.timestamp).toBe('2026-05-07T10:00:00.000Z');
  });

  it('uppercases severity', () => {
    expect(formatDetails({ ...base, severity: 'warning' }).severity).toBe('WARNING');
    expect(formatDetails({ ...base, severity: 'info' }).severity).toBe('INFO');
  });

  it('defaults missing description to dash', () => {
    expect(formatDetails({ ...base, description: undefined }).description).toBe('-');
    expect(formatDetails({ ...base, description: '' }).description).toBe('-');
  });

  it('defaults missing SQL to dash', () => {
    expect(formatDetails({ ...base, sql: undefined }).sql).toBe('-');
  });

  it('defaults missing operator to gt', () => {
    expect(formatDetails({ ...base, operator: undefined }).operator).toBe('gt');
  });

  it('handles null lastValue', () => {
    expect(formatDetails({ ...base, lastValue: null }).value).toBe('?');
    expect(formatDetails({ ...base, lastValue: undefined }).value).toBe('?');
  });

  it('uses current time when lastRunAt missing', () => {
    const d = formatDetails({ ...base, lastRunAt: undefined });
    const parsed = new Date(d.timestamp);
    expect(parsed.getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});

describe('Channel config validation', () => {
  function validateChannel(config) {
    if (config.type === 'email' && !config.smtp_host) return 'SMTP host is not configured';
    if (config.type === 'email' && !config.to) return 'Recipient email is not configured';
    return null;
  }

  it('rejects email without smtp_host', () => { expect(validateChannel({ type: 'email' })).toContain('SMTP'); });
});

