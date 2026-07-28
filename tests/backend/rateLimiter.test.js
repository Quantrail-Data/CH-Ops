// Contributors - Kathir Moorthy, Kathirdhasan
// Copyright (C) 2026 Quantrail™ Data Private Limited
// rateLimiter.test.js - unit tests for rate limiting middleware

import { describe, it, expect, beforeEach } from 'bun:test';
import { rateLimiter, __resetRateLimiter } from '../../src/backend/middleware/rateLimiter.js';

function mockReq(ip, baseUrl) { return { ip, baseUrl }; }

// The limiter keeps state in a module-level map, so cases leak into each other
// without this.
beforeEach(() => __resetRateLimiter());

describe('Rate Limiter', () => {
  it('allows requests under the limit', () => {
    const mw = rateLimiter(5, 60);
    let nextCount = 0;
    const res = { setHeader: () => {}, status: () => ({ json: () => {} }) };
    for (let i = 0; i < 5; i++) mw(mockReq('1.1.1.1', '/t1'), res, () => nextCount++);
    expect(nextCount).toBe(5);
  });

  it('blocks requests over the limit with 429', () => {
    const mw = rateLimiter(3, 60);
    let statusCode = null;
    const res = { setHeader: () => {}, status: (c) => { statusCode = c; return { json: () => {} }; } };
    for (let i = 0; i < 5; i++) mw(mockReq('2.2.2.2', '/t2'), res, () => {});
    expect(statusCode).toBe(429);
  });

  it('tracks different IPs independently', () => {
    const mw = rateLimiter(2, 60);
    let calls = 0;
    const res = { setHeader: () => {}, status: () => ({ json: () => {} }) };
    mw(mockReq('3.3.3.3', '/t3'), res, () => calls++);
    mw(mockReq('4.4.4.4', '/t3'), res, () => calls++);
    mw(mockReq('3.3.3.3', '/t3'), res, () => calls++);
    mw(mockReq('4.4.4.4', '/t3'), res, () => calls++);
    expect(calls).toBe(4); // both IPs get 2 each
  });

  it('stops counting once over the limit', () => {
    // Hits used to be recorded unconditionally, so a client already being
    // throttled kept extending its own array: the window never drained and
    // memory grew for as long as it kept knocking.
    const mw = rateLimiter(2, 60);
    const res = { setHeader: () => {}, status: () => ({ json: () => {} }) };
    for (let i = 0; i < 50; i++) mw(mockReq('6.6.6.6', '/t6'), res, () => {});

    // Two allowed, and the 48 rejected requests left no trace.
    const headers = {};
    const res2 = { setHeader: (k, v) => { headers[k] = v; }, status: () => ({ json: () => {} }) };
    mw(mockReq('6.6.6.6', '/t6'), res2, () => {});
    expect(headers['X-RateLimit-Remaining']).toBe(0);
  });

  it('sets Retry-After when rejecting', () => {
    const mw = rateLimiter(1, 30);
    const headers = {};
    let statusCode = null;
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      status: (c) => { statusCode = c; return { json: () => {} }; },
    };
    mw(mockReq('7.7.7.7', '/t7'), res, () => {});
    mw(mockReq('7.7.7.7', '/t7'), res, () => {});
    expect(statusCode).toBe(429);
    expect(headers['Retry-After']).toBe(30);
  });

  it('tracks the same IP separately per route', () => {
    const mw = rateLimiter(1, 60);
    let calls = 0;
    const res = { setHeader: () => {}, status: () => ({ json: () => {} }) };
    mw(mockReq('8.8.8.8', '/routeA'), res, () => calls++);
    mw(mockReq('8.8.8.8', '/routeB'), res, () => calls++);
    expect(calls).toBe(2);
  });

  it('sets rate limit headers', () => {
    const mw = rateLimiter(10, 60);
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; }, status: () => ({ json: () => {} }) };
    mw(mockReq('5.5.5.5', '/t5'), res, () => {});
    expect(headers['X-RateLimit-Limit']).toBe(10);
    expect(headers['X-RateLimit-Remaining']).toBe(9);
  });
});
