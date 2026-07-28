// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Lightweight, in-memory per-IP rate limiter enforcing configurable request-per-second thresholds per route.

const stores = new Map();

// How long a key may sit untouched before it is dropped. Without this the map
// grows for the lifetime of the process: one entry per (IP, route) ever seen,
// never removed.
const IDLE_EVICT_MS = 15 * 60 * 1000;

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of stores) {
    if (!hits.length || now - hits[hits.length - 1] > IDLE_EVICT_MS) {
      stores.delete(key);
    }
  }
}, 60 * 1000);
sweeper.unref?.();

export function rateLimiter(maxRequests = 10000, windowSeconds = 60) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.baseUrl;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    if (!stores.has(key)) stores.set(key, []);

    // Drop timestamps outside the window, then add the current one
    const hits = stores.get(key).filter(t => now - t < windowMs);

    // Only record while under the limit. Recording unconditionally meant a
    // client already being throttled kept extending its own array, so the
    // window never drained and memory grew for as long as it kept knocking.
    const overLimit = hits.length >= maxRequests;
    if (!overLimit) hits.push(now);
    stores.set(key, hits);

    // Tell the client how many requests they have left
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - hits.length));

    if (overLimit) {
      res.setHeader('Retry-After', windowSeconds);
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: windowSeconds,
      });
    }
    next();
  };
}

// Exposed for tests, which otherwise leak state between cases through the
// module-level map.
export function __resetRateLimiter() {
  stores.clear();
}
