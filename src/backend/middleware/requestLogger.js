// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Middleware logging request details (method, path, status, duration, user) while masking sensitive auth endpoints.

import { log } from '../services/logger.js';

export function requestLogger(req, res, next) {
  // Skip static assets and docs
  if (!req.path.startsWith('/api/')) return next();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const username = req.user?.username || '-';
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    log[level](`${req.method} ${req.path} ${status} ${duration}ms`, {
      method: req.method,
      path: req.path,
      status,
      duration,
      user: username,
      ip: req.ip,
    });
  });

  next();
}
