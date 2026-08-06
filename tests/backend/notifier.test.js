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
import { describe, it, expect, vi, mock, beforeAll } from 'bun:test';
import { getClusterInfo, sendNotification, sendOTPEmail, testChannel, escapeHtml, extractAccountDetails } from '../../src/backend/services/notifier';

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





// Author: Syed Ashiq

const sendMail = vi.fn().mockResolvedValue({ messageId: 'sent-test' })

beforeAll(() => {

  mock.module("nodemailer", () => {
    return {
      default: {
        createTransport: () => {
          return {
            sendMail
          }
        }
      }
    }
  })
})
describe("Sending Email", () => {
  const config = { type: 'email', smtp_host: 'localhost', to: 'test@example.com' }
  it("Sends OTP to Email", async () => {
    vi.clearAllMocks()
    const isSent = await sendOTPEmail('test@example.com', 'test', {})
    expect(isSent).toBeTrue()
    const isNotSent = await sendOTPEmail('test@example.com', 'test', '')
    expect(isNotSent).toBeFalse()


  })

  it("Sends Alert Mail", async () => {
    vi.clearAllMocks()
    const alert = {
      name: "Testing Alert",
      severity: "info",
      description: `This is a test email`,
      sql: "",
      schedule: "",
      operator: "eq",
      threshold: 0,
      lastValue: 0,
      lastRunAt: new Date().toISOString(),
    }

    alert.name = 'account created'
    await sendNotification(config, alert)
    expect(sendMail).toHaveBeenCalled()
    const args1 = sendMail.mock.calls.at(0).at(0)
    expect(args1.subject).toInclude('Welcome')
    expect(args1.attachments.length).toBe(1)


    sendMail.mockClear()
    alert.name = 'password reset'
    await sendNotification(config, alert)
    expect(sendMail).toHaveBeenCalled()
    const args2 = sendMail.mock.calls.at(0).at(0)
    expect(args2.subject).toInclude('Reset')
    expect(args2.attachments.length).toBe(1)
  })

  it("Tests Channel", async () => {
    vi.clearAllMocks()
    await testChannel(config)
    expect(sendMail).toHaveBeenCalled()
  })


})

beforeAll(() => {
  vi.mock('../../src/backend/services/clusterUtils', () => {
    return {
      getAllClusters: () => ([{ id: 1, nodes: [{ host: 'localhost' }] }])
    }
  })
})

describe("Helper Functions for Notifier", () => {

  const alert = { clusterId: 1, nodes: [], lastRunAt: new Date().toLocaleString(), name: 'test' }

  it('Gets cluster Information', () => {
    const info = getClusterInfo(alert)
    expect(info).toHaveProperty('clusterName')
    expect(info.clusterName).toBe('Default')
    expect(info).toHaveProperty('nodes')
    expect(info.nodes).toBe('localhost')
  })

  it("Formats Alert Details", () => {
    expect(formatDetails(alert)).toBeDefined()
  })

  it('Escapes HTML', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it("Extracts account details", () => {
    const description = `
      Password reset Username: test Password: test123 Role: Admin Please change your password on first login
    `
    const info = extractAccountDetails(description)
    const expectToBe = {
      intro: "Password reset",
      username: "test",
      password: "test123",
      role: "Admin",
      note: "Please change your password on first login",
    }
    expect(info).toHaveProperty('intro')
    expect(info.intro).toBe('Password reset')
    expect(info).toHaveProperty('username')
    expect(info.username).toBe('test')
    expect(info).toHaveProperty('password')
    expect(info.password).toBe('test123')
    expect(info).toHaveProperty('role')
    expect(info.role).toBe('Admin')
    expect(info).toHaveProperty('note')
    expect(info.note).toBe('Please change your password on first login')
  })

})