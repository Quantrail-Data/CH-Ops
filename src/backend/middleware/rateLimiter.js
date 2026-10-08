// Copyright (C) 2026 Quantrail™ Data Private Limited
// Authors: Kathir Moorthy, Kathir Dhasan, Praveen Kumar

const stores = new Map();

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

export function rateLimiter(
  maxRequests = 10000,
  windowSeconds = 60,
  keyFn = null
) {
  return (req, res, next) => {
    const key = keyFn
      ? keyFn(req)
      : req.ip + ':' + req.baseUrl;

    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    if (!stores.has(key)) {
      stores.set(key, []);
    }

    // Drop timestamps outside the active window.
    const hits = stores.get(key).filter(
      (t) => now - t < windowMs
    );

    const overLimit = hits.length >= maxRequests;

    if (!overLimit) {
      hits.push(now);
    }

    stores.set(key, hits);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, maxRequests - hits.length)
    );

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

export function __resetRateLimiter() {
  stores.clear();
}
