/**
 * securityHeaders.test.js - Unit tests for HTTP security headers middleware
 *
 * Tests the securityHeaders middleware that adds security headers to
 * every response. Verifies X-Content-Type-Options, X-Frame-Options,
 * X-XSS-Protection, Referrer-Policy, Permissions-Policy, and Strict-
 * Transport-Security are set. Tests strict CSP for app routes (no unsafe-
 * inline) and relaxed CSP for /docs/ path (allows CDN scripts). Also
 * verifies X-Powered-By is removed.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect } from 'bun:test';
import { securityHeaders } from '../../src/backend/middleware/securityHeaders.js';

describe('Security Headers', () => {
  it('sets all required security headers', () => {
    const headers = {};
    const removed = [];
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      removeHeader: (k) => { removed.push(k); },
    };
    securityHeaders({}, res, () => {});

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toBeDefined();
  });

  it('sets strict Content-Security-Policy for app routes', () => {
    const headers = {};
    securityHeaders({ path: '/api/query' }, { setHeader: (k, v) => { headers[k] = v; }, removeHeader: () => {} }, () => {});
    const csp = headers['Content-Security-Policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('sets relaxed CSP for /docs/ path (Docsify needs CDN scripts)', () => {
    const headers = {};
    securityHeaders({ path: '/docs/' }, { setHeader: (k, v) => { headers[k] = v; }, removeHeader: () => {} }, () => {});
    const csp = headers['Content-Security-Policy'];
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain('cdn.jsdelivr.net');
    expect(csp).toContain('fonts.googleapis.com');
    expect(csp).toContain('fonts.gstatic.com');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('relaxed CSP also applies to /docs subpaths like /docs/guide/admin.md', () => {
    const headers = {};
    securityHeaders({ path: '/docs/guide/admin.md' }, { setHeader: (k, v) => { headers[k] = v; }, removeHeader: () => {} }, () => {});
    const csp = headers['Content-Security-Policy'];
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain('cdn.jsdelivr.net');
  });

  it('strict CSP for paths that look like docs but are not', () => {
    const headers = {};
    securityHeaders({ path: '/api/docs-like' }, { setHeader: (k, v) => { headers[k] = v; }, removeHeader: () => {} }, () => {});
    const csp = headers['Content-Security-Policy'];
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('sets Strict-Transport-Security', () => {
    const headers = {};
    securityHeaders({}, { setHeader: (k, v) => { headers[k] = v; }, removeHeader: () => {} }, () => {});
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
  });

  it('removes X-Powered-By', () => {
    const removed = [];
    const res = { setHeader: () => {}, removeHeader: (k) => removed.push(k) };
    securityHeaders({}, res, () => {});
    expect(removed).toContain('X-Powered-By');
  });

  it('calls next()', () => {
    let called = false;
    securityHeaders({}, { setHeader: () => {}, removeHeader: () => {} }, () => { called = true; });
    expect(called).toBe(true);
  });
});
