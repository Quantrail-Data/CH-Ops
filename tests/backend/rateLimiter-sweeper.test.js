import { describe, expect, it } from 'bun:test';

let sweep;
let unrefCalled = false;
const originalSetInterval = globalThis.setInterval;

globalThis.setInterval = (callback) => {
  sweep = callback;
  return { unref() { unrefCalled = true; } };
};

const { __resetRateLimiter, rateLimiter } = await import('../../src/backend/middleware/rateLimiter.js');
globalThis.setInterval = originalSetInterval;

function response() {
  return {
    setHeader() { },
    status() { return { json() { } }; },
  };
}

describe('rate limiter idle sweeper', () => {
  it('unrefs its timer and evicts an idle IP/route bucket', () => {
    expect(unrefCalled).toBe(true);
    __resetRateLimiter();
    const originalNow = Date.now;
    let now = 1_000;
    Date.now = () => now;
    let allowed = 0;
    const middleware = rateLimiter(1, 60);

    try {
      middleware({ ip: '203.0.113.1', baseUrl: '/query' }, response(), () => allowed++);
      now += 15 * 60 * 1000 + 1;
      sweep();
      middleware({ ip: '203.0.113.1', baseUrl: '/query' }, response(), () => allowed++);
    } finally {
      Date.now = originalNow;
      __resetRateLimiter();
    }

    expect(allowed).toBe(2);
  });
});
