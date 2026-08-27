// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Main backend server entry point that initializes security middleware, mounts API routes, and starts the HTTP server.

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { rateLimit } from "express-rate-limit";
createRequire(import.meta.url);
let embeddedAssets = null;
try {
  const mod = await import("./embeddedAssets.js");
  embeddedAssets = mod.default;
} catch {}

// let RD_SERVICE = null;
// try {
//   RD_SERVICE = new RD_ShcemaData();
// }
// catch(err) {
//   console.error(err?.message)
// }

import { log } from "./services/logger.js";

import { loadEnv } from "./utils/env.js";
import { initCrypto } from "./services/crypto.js";
import { authMiddleware } from "./middleware/auth.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { startScheduler } from "./services/alertScheduler.js";
import { startAppBackupScheduler } from "./services/appBackup.js";
import { startK8sSync } from "./services/k8sSync.js";

// Core routes
import authRoute from "./routes/auth.js";
import queryRoute from "./routes/query.js";
import configRoute from "./routes/config.js";
import settingsRoute from "./routes/settings.js";
import appConfigRoute from "./routes/appConfig.js";
import trustedCaRoute from "./routes/trustedCa.js";
import systemSmtpRoute from "./routes/systemSmtp.js";
import alertsRoute from "./routes/alerts.js";
import dashboardsRoute from "./routes/dashboards.js";
import usersRoute from "./routes/users.js";
import clusterRoute from "./routes/cluster.js";
import k8sRoute from "./routes/k8s.js";
import appBackupRoute from "./routes/appBackup.js";
import apiKeysRoute from "./routes/apiKeys.js";
import exportRoute, { downloadRouter } from "./routes/export.js";
import {
  initExportStorage,
  startExportSweeper,
  cancelJobsForUser,
} from "./services/exportJobs.js";
import ForgetRouter from "./routes/forgetPassword.js";

import schemaStudioRoute from "./routes/schemaStudio.js";
import editorRoute from "./routes/editor.js";
import { onRevoke } from "./services/jwt.js";
import { clearCredSessionByJti, pruneExpired } from "./services/chCredStore.js";

// Qurioz
import aiConnectRoute from "./routes/aiConnect.js";
import aiSchemaRoute from "./routes/aiSchema.js";
import aiGenerateRoute from "./routes/aiGenerate.js";
import aiChatRoute from "./routes/aiChats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let env;
try {
  env = loadEnv();
} catch (err) {
  console.error(`  Config error: ${err.message}`);
  process.exit(1);
}

initCrypto(env.encryptionSecret);

onRevoke(clearCredSessionByJti);
onRevoke((jti) => {
  try {
    cancelJobsForJti(jti);
  } catch {}
});

pruneExpired();
setInterval(pruneExpired, 10 * 60 * 1000).unref?.();

// version.generated.js is written by scripts/generate-version.mjs from version.json

let appVersion = { version: "0.0.0" };
try {
  const generated = await import("./version.generated.js");
  if (generated.APP_VERSION) appVersion.version = generated.APP_VERSION;
  if (generated.VERSION_INFO)
    appVersion = { ...generated.VERSION_INFO, ...appVersion };
} catch {}

try {
  await import("./db/migrate.js");
} catch (err) {
  log.error(
    "Database migration failed, refusing to start:",
    err?.message || err,
  );
  process.exit(1);
}

log.info("Database ready (Drizzle ORM + bun:sqlite)");

import { assertDatabaseReadable } from "./db/index.js";
import { migrateClusterData } from "./services/clusterUtils.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
migrateClusterData();

const app = express();

// Opt-in, and deliberately not defaulted to true. Behind a reverse proxy
// (the Caddy setup in the README) req.ip is the proxy without this, so every
// client shares one rate-limit bucket.
// Set TRUST_PROXY to the number of proxies in front of CHOps.

if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.use(securityHeaders);
app.use(requestLogger);
// Mounted ahead of the global parser: body-parser sets req._body and every
// later parser skips, so a tighter limit declared on the route itself never
// applied.
app.use("/api/query", express.json({ limit: "512kb" }));
app.use("/api/export", express.json({ limit: "512kb" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use((req, res, next) => {
  req.env = env;
  next();
});

const authenticatedRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10000,
  standardHeaders: true,
  legacyHeaders: true,
});

// Apply a global rate limiter for all /api routes (excluding the public auth/health/version/forget-password endpoints).
// This ensures any route that performs authorization is always rate-limited.
app.use("/api", (req, res, next) => {
  // Keep these endpoints public / separately rate-limited
  if (
    req.path.startsWith("/auth") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/version") ||
    req.path.startsWith("/forget-password")
  ) {
    return next();
  }
  return authenticatedRateLimiter(req, res, next);
});

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: true,
  }),
  authRoute,
);
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    version: appVersion.version,
  }),
);
app.get("/api/ready", (req, res) => {
  try {
    assertDatabaseReadable();
    res.json({ ok: true });
  } catch (err) {
    log.error("Readiness check failed:", err?.message || err);
    res.status(503).json({ ok: false, error: "database unavailable" });
  }
});
app.get("/api/version", (req, res) => res.json(appVersion));
app.use("/api/forget-password", rateLimiter(100, 60), ForgetRouter);
app.use("/api/query", authMiddleware, rateLimiter(10000, 60), queryRoute);
app.use("/api/editor", authMiddleware, rateLimiter(10000, 60), editorRoute);
app.use("/api/config", authMiddleware, rateLimiter(10000, 60), configRoute);
app.use("/api/settings", authMiddleware, rateLimiter(10000, 60), settingsRoute);
app.use(
  "/api/app-config",
  authMiddleware,
  rateLimiter(120, 60),
  appConfigRoute,
);
app.use(
  "/api/trusted-cas",
  authMiddleware,
  rateLimiter(60, 60),
  trustedCaRoute,
);
app.use(
  "/api/system-smtp",
  authMiddleware,
  rateLimiter(30, 60),
  systemSmtpRoute,
);
app.use("/api/alerts", authMiddleware, rateLimiter(10000, 60), alertsRoute);
app.use(
  "/api/dashboards",
  authMiddleware,
  rateLimiter(10000, 60),
  dashboardsRoute,
);
app.use("/api/users", authMiddleware, rateLimiter(10000, 60), usersRoute);
app.use("/api/cluster", authMiddleware, rateLimiter(10000, 60), clusterRoute);
app.use("/api/k8s", authMiddleware, rateLimiter(10000, 60), k8sRoute);
app.use(
  "/api/app-backup",
  authMiddleware,
  rateLimiter(10000, 60),
  appBackupRoute,
);
app.use(
  "/api/qurioz/api-keys",
  authMiddleware,
  rateLimiter(10000, 60),
  apiKeysRoute,
);
app.use("/api/export/download", rateLimiter(10000, 60), downloadRouter);
app.use("/api/export", rateLimiter(10000, 60), authMiddleware, exportRoute);

app.use(
  "/api/schema-studio",
  authMiddleware,
  rateLimiter(10000, 60),
  schemaStudioRoute,
);

// version3 Qurioz
app.use("/api/ai", authMiddleware, rateLimiter(10000, 60), aiConnectRoute);
app.use("/api/ai", authMiddleware, rateLimiter(10000, 60), aiSchemaRoute);
app.use("/api/ai", authMiddleware, aiGenerateRoute);
app.use("/api/ai", authMiddleware, rateLimiter(10000, 60), aiChatRoute);

function serveEmbedded(prefix) {
  return (req, res, next) => {
    if (!embeddedAssets) return next();
    const reqPath = req.path === "/" ? "/index.html" : req.path;
    const key = `${prefix}${reqPath}`;
    const asset = embeddedAssets.get(key);
    if (!asset) return next();
    res.set("Content-Type", asset.type);
    res.set(
      "Cache-Control",
      asset.type.startsWith("text/html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    );
    res.send(asset.data);
  };
}

// Docs
const docsDir = path.join(__dirname, "../../docs");
if (embeddedAssets) {
  app.use("/docs", serveEmbedded("docs"));
  app.get("/docs/", (req, res) => {
    const idx = embeddedAssets.get("docs/index.html");
    if (idx) {
      res.set("Content-Type", "text/html");
      res.send(idx.data);
    } else res.status(404).end();
  });
} else {
  app.use("/docs", express.static(docsDir));
  app.get("/docs/", (req, res) =>
    res.sendFile(path.join(docsDir, "index.html")),
  );
}

// Frontend (React SPA)
const distDir = path.join(__dirname, "../../dist");
const distIndex = path.join(distDir, "index.html");

if (embeddedAssets && embeddedAssets.has("dist/index.html")) {
  app.use(serveEmbedded("dist"));
  app.use((req, res, next) => {
    if (req.path.startsWith("/docs/") || req.path.startsWith("/api/"))
      return next();
    const idx = embeddedAssets.get("dist/index.html");
    res.set("Content-Type", "text/html");
    res.send(idx.data);
  });
} else if (fs.existsSync(distDir) && fs.existsSync(distIndex)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith("/docs/") || req.path.startsWith("/api/"))
      return next();
    res.sendFile(distIndex);
  });
} else {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.status(404).json({ error: "Frontend not built. Run: bun run build" });
  });
}

// Global error handler
app.use((err, req, res, next) => {
  log.error("Unhandled request error", {
    error: err.message,
    path: req.path,
    method: req.method,
  });
  res
    .status(err?.statusCode || 500)
    .json({ error: err?.message || "Internal server error" });
});

// Start services
initExportStorage();
startExportSweeper();
startScheduler(env);
startAppBackupScheduler();
// Refreshes the node list of Kubernetes-derived clusters.
startK8sSync();

const port = env.port;
app.listen(port, () => {
  log.info(
    `CHOps v${appVersion.version} listening on http://localhost:${port}`,
    { port, env: env.nodeEnv, docs: `/docs/` },
  );
});

export default app;
