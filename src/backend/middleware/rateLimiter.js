// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Lightweight, in-memory per-IP rate limiter enforcing configurable request-per-second thresholds per route.

const stores = new Map();

export function rateLimiter(maxRequests = 10000, windowSeconds = 60) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.baseUrl;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    if (!stores.has(key)) stores.set(key, []);

    // Drop timestamps outside the window, then add the current one
    const hits = stores.get(key).filter(t => now - t < windowMs);
    hits.push(now);
    stores.set(key, hits);

    // Tell the client how many requests they have left
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - hits.length));

    if (hits.length > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: windowSeconds,
      });
    }
    next();
  };
}
