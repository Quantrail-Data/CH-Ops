// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Main backend server entry point that initializes security middleware, mounts API routes, and starts the HTTP server.


import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let embeddedAssets = null;
try {
  const mod = await import('./embeddedAssets.js');
  embeddedAssets = mod.default;
} catch {}

// let RD_SERVICE = null;
// try {
//   RD_SERVICE = new RD_ShcemaData();
// }
// catch(err) {
//   console.error(err?.message)
// }

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
import exportRoute, { downloadRouter } from "./routes/export.js";
import { initExportStorage, startExportSweeper, cancelJobsForUser } from "./services/exportJobs.js";
import ForgetRouter from "./routes/forgetPassword.js";


import databaseAIConnection from "./routes/databaseAIConnection.js";
import sqlAIChat from "./routes/sqlAIChat.js";
import schemaStudioRoute from "./routes/schemaStudio.js";
import editorRoute from "./routes/editor.js";
import { onRevoke } from './services/jwt.js';
import { clearCredSessionByJti, pruneExpired } from './services/chCredStore.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));


let env;
try { env = loadEnv(); } catch (err) { console.error(`  Config error: ${err.message}`); process.exit(1); }


setSecret(env.sessionSecret);
initCrypto(env.sessionSecret);


onRevoke(clearCredSessionByJti);
onRevoke(() => { try { cancelJobsForUser(undefined); } catch {} });


pruneExpired();
setInterval(pruneExpired, 10 * 60 * 1000).unref?.();


const appVersion = loadEnv()?.version;


try {
  const { APP_VERSION } = await import('./version.generated.js');
  if (APP_VERSION) appVersion.version = APP_VERSION;
} catch {}


await import('./db/migrate.js').catch(() => {});
log.info('Database ready (Drizzle ORM + bun:sqlite)');



import { migrateClusterData } from './services/clusterUtils.js';
migrateClusterData();


const app = express();


app.use(securityHeaders);
app.use(requestLogger);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => { req.env = env; next(); });


app.use('/api/auth', rateLimiter(100, 60), authRoute);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString(), version: appVersion.version }));
app.get('/api/version', (req, res) => res.json(appVersion));
app.use(`/api/forget-password`,ForgetRouter);
app.use('/api/query', authMiddleware, rateLimiter(10000, 60), express.json({ limit: '100kb' }), queryRoute);
app.use('/api/editor', authMiddleware,rateLimiter(10000, 60), editorRoute);
app.use('/api/config', authMiddleware,rateLimiter(10000, 60), configRoute);
app.use('/api/settings', authMiddleware,rateLimiter(10000, 60), settingsRoute);
app.use('/api/alerts', authMiddleware,rateLimiter(10000, 60), alertsRoute);
app.use('/api/dashboards', authMiddleware,rateLimiter(10000, 60), dashboardsRoute);
app.use('/api/users', authMiddleware,rateLimiter(10000, 60), usersRoute);
app.use('/api/cluster', authMiddleware,rateLimiter(10000, 60), clusterRoute);
app.use('/api/app-backup', authMiddleware,rateLimiter(10000, 60), appBackupRoute);
app.use('/api/qurioz/api-keys', authMiddleware,rateLimiter(10000, 60), apiKeysRoute);
app.use('/api/export/download', rateLimiter(10000, 60), downloadRouter);
app.use('/api/export', authMiddleware, rateLimiter(10000, 60), exportRoute);




app.use("/api/ai/database", authMiddleware,rateLimiter(10000, 60),databaseAIConnection);
app.use("/api/ai/sql",authMiddleware,rateLimiter(10000, 60), sqlAIChat);
app.use("/api/schema-studio", authMiddleware,rateLimiter(10000, 60), schemaStudioRoute);



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
  app.use(serveEmbedded('dist'));
  app.use((req, res, next) => {
    if (req.path.startsWith('/docs/') || req.path.startsWith('/api/')) return next();
    const idx = embeddedAssets.get('dist/index.html');
    res.set('Content-Type', 'text/html');
    res.send(idx.data);
  });
} else if (fs.existsSync(distDir) && fs.existsSync(distIndex)) {
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
initExportStorage();
startExportSweeper();
startScheduler(env);
startAppBackupScheduler();





const port = env.port;
app.listen(port, () => {
  log.info(`CHOps v${appVersion.version} listening on http://localhost:${port}`, { port, env: env.nodeEnv, docs: `/docs/` });
});

export default app;