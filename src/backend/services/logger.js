// logger.js - Structured JSON logging for systemd journald
//
// Outputs JSON lines to stdout/stderr which journald captures and
// stores natively. Use journalctl to query structured logs. Log
// levels: debug, info, warn, error. Debug logs are suppressed
// unless LOG_LEVEL=debug is set in .env. Each entry includes
// timestamp, level, message, and optional context object.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function write(level, msg, ctx) {
  if (LEVELS[level] < minLevel) return;
  const entry = { ts: new Date().toISOString(), level, msg };
  if (ctx && Object.keys(ctx).length) entry.ctx = ctx;
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  debug: (msg, ctx) => write('debug', msg, ctx),
  info:  (msg, ctx) => write('info', msg, ctx),
  warn:  (msg, ctx) => write('warn', msg, ctx),
  error: (msg, ctx) => write('error', msg, ctx),
};
