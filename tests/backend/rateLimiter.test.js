/**
 * rateLimiter.test.js - Unit tests for rate limiting middleware
 *
 * Tests the rate limiter that protects API endpoints from abuse.
 * Verifies requests under the limit are allowed, requests over the
 * limit receive 429 status, different IPs are tracked independently,
 * and rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining)
 * are set correctly.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect } from 'bun:test';
import { rateLimiter } from '../../src/backend/middleware/rateLimiter.js';

function mockReq(ip, baseUrl) { return { ip, baseUrl }; }

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

  it('sets rate limit headers', () => {
    const mw = rateLimiter(10, 60);
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; }, status: () => ({ json: () => {} }) };
    mw(mockReq('5.5.5.5', '/t5'), res, () => {});
    expect(headers['X-RateLimit-Limit']).toBe(10);
    expect(headers['X-RateLimit-Remaining']).toBe(9);
  });
});
