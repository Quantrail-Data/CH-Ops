// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Main backend server entry point that initializes security middleware, mounts API routes, and starts the HTTP server.


import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// const appVersion = require('../../version.json');

// Embedded static assets (generated at build time for binary mode)
// In dev mode this file does not exist, so we fall back to filesystem serving
let embeddedAssets = null;
try {
  const mod = await import('./embeddedAssets.js');
  embeddedAssets = mod.default;
} catch {}

import { log } from './services/logger.js';

import { loadEnv } from './utils/env.js';
import { setSecret } from './services/jwt.js';
import { initCrypto } from './services/crypto.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requestLogger } from './middleware/requestLogger.js';
import { startScheduler } from './services/alertScheduler.js';
import { startAppBackupScheduler } from './services/appBackup.js';

// Core routes
import authRoute from './routes/auth.js';
import queryRoute from './routes/query.js';
import configRoute from './routes/config.js';
import settingsRoute from './routes/settings.js';
import alertsRoute from './routes/alerts.js';
import dashboardsRoute from './routes/dashboards.js';
import usersRoute from './routes/users.js';
import clusterRoute from './routes/cluster.js';
import appBackupRoute from './routes/appBackup.js';
import apiKeysRoute from './routes/apiKeys.js';
import DownloadRouter from "./routes/downloadFile.js";

import databaseAIConnection from "./routes/databaseAIConnection.js";
import sqlAIChat from "./routes/sqlAIChat.js";
import schemaStudioRoute from "./routes/schemaStudio.js";
import editorRoute from "./routes/editor.js";
import { onRevoke } from './services/jwt.js';
import { clearCredSessionByJti, pruneExpired } from './services/chCredStore.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env and fail fast if required vars are missing
let env;
try { env = loadEnv(); } catch (err) { console.error(`  Config error: ${err.message}`); process.exit(1); }

// These two must happen before any route handler runs:
// - setSecret: so JWT tokens can be signed and verified
// - initCrypto: so encrypted credentials can be read from the database
setSecret(env.sessionSecret);
initCrypto(env.sessionSecret);

// Tie credential lifetime to the login: when a token is revoked (logout), clear
// that login's encrypted ClickHouse credential sessions across all contexts.
onRevoke(clearCredSessionByJti);

// Reap expired / orphaned credential sessions so nothing sits at rest past its
// TTL, even for logins that were never explicitly logged out (tab close, crash).
pruneExpired();
setInterval(pruneExpired, 10 * 60 * 1000).unref?.();


const appVersion = loadEnv()?.version;

// Database migration (core)
await import('./db/migrate.js').catch(() => {});
log.info('Database ready (Drizzle ORM + bun:sqlite)');


// Migrate single-cluster to multi-cluster format if needed
import { migrateClusterData } from './services/clusterUtils.js';
migrateClusterData();


const app = express();

// Security middleware
app.use(securityHeaders);
app.use(requestLogger);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => { req.env = env; next(); });

// Public routes (rate-limited)
app.use('/api/auth', rateLimiter(100, 60), authRoute);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString(), version: appVersion.version }));
app.get('/api/version', (req, res) => res.json(appVersion));

// Protected routes - authMiddleware checks the JWT on every request.
// /api/query has an extra 100kb body limit to prevent oversized SQL payloads.
// RBAC (superadmin checks) is handled inside the route files and controllers,
// not here - so authMiddleware just verifies "is logged in", not "is admin".
app.use('/api/query', authMiddleware, rateLimiter(10000, 60), express.json({ limit: '100kb' }), queryRoute);
app.use('/api/editor', authMiddleware, editorRoute);
app.use('/api/config', authMiddleware, configRoute);
app.use('/api/settings', authMiddleware, settingsRoute);
app.use('/api/alerts', authMiddleware, alertsRoute);
app.use('/api/dashboards', authMiddleware, dashboardsRoute);
app.use('/api/users', authMiddleware, usersRoute);
app.use('/api/cluster', authMiddleware, clusterRoute);
app.use('/api/app-backup', authMiddleware, appBackupRoute);
app.use('/api/qurioz/api-keys', authMiddleware, apiKeysRoute);
app.use("/api/table/download", authMiddleware, DownloadRouter);



// AI chat routes use
// connection of database and deletion of database
app.use("/api/ai/database", authMiddleware,databaseAIConnection);
// Generating the query
app.use("/api/ai/sql",authMiddleware, sqlAIChat);
app.use("/api/schema-studio", authMiddleware, schemaStudioRoute);

// Docs

// --- Static asset serving ---
// Binary mode: serve from embedded assets (in-memory, no filesystem needed)
// Dev/source mode: serve from dist/ and docs/ on disk

function serveEmbedded(prefix) {
  return (req, res, next) => {
    if (!embeddedAssets) return next();
    const reqPath = req.path === '/' ? '/index.html' : req.path;
    const key = `${prefix}${reqPath}`;
    const asset = embeddedAssets.get(key);
    if (!asset) return next();
    res.set('Content-Type', asset.type);
    res.set('Cache-Control', asset.type.startsWith('text/html') ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.send(asset.data);
  };
}

// Docs
const docsDir = path.join(__dirname, '../../docs');
if (embeddedAssets) {
  app.use('/docs', serveEmbedded('docs'));
  app.get('/docs/', (req, res) => {
    const idx = embeddedAssets.get('docs/index.html');
    if (idx) { res.set('Content-Type', 'text/html'); res.send(idx.data); }
    else res.status(404).end();
  });
} else {
  app.use('/docs', express.static(docsDir));
  app.get('/docs/', (req, res) => res.sendFile(path.join(docsDir, 'index.html')));
}

// Frontend (React SPA)
const distDir = path.join(__dirname, '../../dist');
const distIndex = path.join(distDir, 'index.html');

if (embeddedAssets && embeddedAssets.has('dist/index.html')) {
  // Binary mode: serve from memory
  app.use(serveEmbedded('dist'));
  app.use((req, res, next) => {
    if (req.path.startsWith('/docs/') || req.path.startsWith('/api/')) return next();
    const idx = embeddedAssets.get('dist/index.html');
    res.set('Content-Type', 'text/html');
    res.send(idx.data);
  });
} else if (fs.existsSync(distDir) && fs.existsSync(distIndex)) {
  // Source mode: serve from filesystem
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/docs/') || req.path.startsWith('/api/')) return next();
    res.sendFile(distIndex);
  });
} else {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.status(404).json({ error: 'Frontend not built. Run: bun run build' });
  });
}



// Global error handler
app.use((err, req, res, next) => {
  log.error('Unhandled request error', { error: err.message, path: req.path, method: req.method });
  res.status(err?.statusCode || 500).json({ error: err?.message || 'Internal server error' });
});


// Start services
startScheduler(env);
startAppBackupScheduler();

// const appVersion = { version: env.version || '0.0.0' };
const port = env.port;
app.listen(port, () => {
  log.info(`CHOps v${appVersion.version} listening on http://localhost:${port}`, { port, env: env.nodeEnv, docs: `/docs/` });
});

export default app;