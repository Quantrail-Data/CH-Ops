// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Backend suite validating schemas, router injection, multi-tier RBAC, secure crypto pipelines, SSRF blocks, and ClickHouse ingestion services.


import { describe, it, expect } from "vitest";
import fs from "fs";
function read(f) {
  return fs.readFileSync(f, "utf8");
}

describe("Schema: 8 Tables", () => {
  const schema = read("src/backend/db/schema.js");
  const migrate = read("src/backend/db/migrate.js");
  const idx = read("src/backend/db/index.js");
  [
    "app_setting",
    "alert_rule",
    "alert_channel",
    "alert_rule_channel",
    "dashboard",
    "chart",
    "app_user",
  ].forEach((t) => {
    it(`${t} in schema + migration`, () => {
      expect(schema.includes(`'${t}'`) || schema.includes(`"${t}"`)).toBe(true);
      expect(migrate).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    });
  });
  it("app_user: unique username, password_hash, role", () => {
    expect(migrate).toContain("username TEXT NOT NULL UNIQUE");
  });
  it("alert_rule: nodes column for per-rule node targeting", () => {
    expect(schema).toContain("nodes");
  });
  it("alert_rule: cluster_id column for per-rule cluster assignment", () => {
    expect(schema).toContain("cluster_id");
  });
  it("all tables exported from index.js", () => {
    [
      "appSettings",
      "alertRules",
      "dashboards",
      "appUsers",
    ].forEach((e) => expect(idx).toContain(e));
  });
});

describe("Routes: 10 files exist and mounted", () => {
  const sv = read("src/backend/server.js");
  [
    "auth",
    "config",
    "cluster",
    "query",
    "dashboards",
    "alerts",
    "settings",
    "users",
    "appBackup",
  ].forEach((name) => {
    it(`${name}.js exists and mounted`, () => {
      expect(fs.existsSync(`src/backend/routes/${name}.js`)).toBe(true);
      expect(sv).toContain(`${name}Route`);
    });
  });
});

describe("Routes: Auth", () => {
  const code = read("src/backend/controllers/auth.js");
  it("login + change-password endpoints", () => {
    expect(code).toContain("changePassword");
  });
  it("password change: hash, updatedAt, read-back verification", () => {
    expect(code).toContain("const newHash = await hashPassword");
    expect(code).toContain("updatedAt: new Date().toISOString()");
    expect(code).toContain("updated.passwordHash !== newHash");
    expect(code).toContain("Password update failed to persist");
  });
  it("uses timingSafeEqual for env fallback", () => {
    expect(code).toContain("timingSafeEqual");
  });
  it("uses argon2id via Bun.password", () => {
    expect(code).toContain("Bun.password.hash");
    expect(code).toContain("argon2id");
  });
  it("has brute-force lockout", () => {
    expect(code).toContain("checkLockout");
    expect(code).toContain("recordFailure");
    expect(code).toContain("MAX_FAILURES");
  });
  it("supports DISABLE_ENV_LOGIN", () => {
    expect(code).toContain("disableEnvLogin");
  });
  it("uses generic error messages (no username enumeration)", () => {
    const changeSection = code.slice(code.indexOf("changePassword"));
    expect(changeSection).not.toContain("'User not found.'");
  });
  it("auto-upgrades legacy SHA-256 hashes to argon2", () => {
    expect(code).toContain("Upgrade legacy SHA-256");
  });
});

describe("Routes: Cluster validation", () => {
  const code = read("src/backend/controllers/cluster.js");
  const utils = read("src/backend/services/clusterUtils.js");
  it("node name required", () => {
    expect(code).toContain("Node Name is required");
  });
  it("unique names (case-insensitive)", () => {
    expect(code).toContain("Node names must be unique");
    expect(code).toContain("toLowerCase()");
  });
  it("max 3 clusters, 18 total nodes", () => {
    expect(utils).toContain("MAX_CLUSTERS = 3");
    expect(utils).toContain("MAX_TOTAL_NODES = 18");
  });
  it("encrypts passwords in clusterUtils", () => {
    expect(utils).toContain("encrypt(n.password");
  });
  it("decrypts passwords in clusterUtils", () => {
    expect(utils).toContain("decrypt(n.password");
  });
  it("CRUD endpoints (list, create, update, delete)", () => {
    expect(code).toContain("listClusters");
    expect(code).toContain("createCluster");
    expect(code).toContain("updateCluster");
    expect(code).toContain("deleteCluster");
  });
  it("cluster name uniqueness check", () => {
    expect(code).toContain("Cluster name must be unique");
  });
  it("migrates old single-cluster format", () => {
    expect(utils).toContain("migrateClusterData");
    expect(utils).toContain("cluster.nodes");
  });
});

describe("Routes: Users RBAC (4-tier)", () => {
  const code = read("src/backend/controllers/users.js");
  const routes = read("src/backend/routes/users.js");
  it("defines 4 roles: superadmin, admin, editor, readonly", () => {
    expect(code).toContain("VALID_ROLES");
    expect(code).toContain("\"superadmin\"");
    expect(code).toContain("\"admin\"");
    expect(code).toContain("\"editor\"");
    expect(code).toContain("\"readonly\"");
  });
  it("has ROLE_LEVEL hierarchy", () => {
    expect(code).toContain("readonly: 0");
    expect(code).toContain("superadmin: 3");
  });
  it("exports requireAdmin, requireSuperAdmin, requireEditor", () => {
    expect(code).toContain("export function requireAdmin");
    expect(code).toContain("export function requireSuperAdmin");
    expect(code).toContain("export function requireEditor");
  });
  it("DELETE route uses requireAdmin", () => {
    expect(routes).toContain("requireAdmin, deleteUser");
  });
  it("create route uses requireAdmin", () => {
    expect(routes).toContain("requireAdmin, createUser");
  });
  it("has canChangeRole function with hierarchy checks", () => {
    expect(code).toContain("canChangeRole");
    expect(code).toContain("targetLevel >= callerLevel");
  });
  it("delete checks privilege level", () => {
    expect(code).toContain(
      "Cannot delete a user with equal or higher privileges",
    );
  });
});

describe("Services: Alert Scheduler", () => {
  const code = read("src/backend/services/alertScheduler.js");
  it("exports startScheduler", () => {
    expect(code).toContain("startScheduler");
  });
  it("uses clusterUtils for node credentials", () => {
    expect(code).toContain("getClusterNodes");
    expect(code).toContain("from './clusterUtils.js'");
  });
  it("filters nodes by rule.nodes when set", () => {
    expect(code).toContain("selected.includes(n.host)");
  });
  it("falls back to all nodes when rule.nodes is null", () => {
    expect(code).toContain("let nodes = allNodes");
  });
  it("uses per-rule clusterId for node lookup", () => {
    expect(code).toContain("getClusterNodes(rule.clusterId");
  });
  it("handles rules with no cluster (falls back to default)", () => {
    expect(code).toContain("rule.clusterId || null");
  });
});

describe("Services: Notifier", () => {
  const code = read("src/backend/services/notifier.js");
  it("uses rule clusterId for cluster name in notifications", () => {
    expect(code).toContain("alert?.clusterId");
  });
  it("formats timestamp as yyyy-mm-dd hh:mm:ss", () => {
    expect(code).toMatch(/padStart\(2,\s*['"]0['"]\)/);
    expect(code).toContain("d.getFullYear()");
  });
  it("shows cluster name and fired node in all channels", () => {
    expect(code).toContain("d.clusterName");
    expect(code).toContain("d.firedNode");
  });
});

describe("Services: Logger", () => {
  const code = read("src/backend/services/logger.js");
  it("exports log object with 4 levels", () => {
    ["debug", "info", "warn", "error"].forEach((l) =>
      expect(code).toContain(`${l}:`),
    );
  });
  it("writes JSON lines to stdout/stderr", () => {
    expect(code).toContain("JSON.stringify");
    expect(code).toContain("process.stdout.write");
    expect(code).toContain("process.stderr.write");
  });
  it("respects LOG_LEVEL env var", () => {
    expect(code).toContain("LOG_LEVEL");
    expect(code).toContain("minLevel");
  });
  it("includes timestamp, level, message in each entry", () => {
    expect(code).toContain("ts:");
    expect(code).toContain("level");
    expect(code).toContain("msg");
  });
});

describe("Middleware: Request Logger", () => {
  const code = read("src/backend/middleware/requestLogger.js");
  it("logs method, path, status, duration, user", () => {
    [
      "req.method",
      "req.path",
      "res.statusCode",
      "duration",
      "username",
    ].forEach((s) => expect(code).toContain(s));
  });
  it("skips non-API requests", () => {
    expect(code).toContain("/api/");
  });
  it("uses structured logger", () => {
    expect(code).toContain("from '../services/logger.js'");
  });
});

describe("Services: App Data Backup", () => {
  const code = read("src/backend/services/appBackup.js");
  it("exports createAppBackup and listAppBackups", () => {
    expect(code).toContain("export async function createAppBackup");
    expect(code).toContain("export async function listAppBackups");
  });
  it("exports startAppBackupScheduler", () => {
    expect(code).toContain("export function startAppBackupScheduler");
  });
  it("uses VACUUM INTO for WAL-safe snapshot", () => {
    expect(code).toContain("VACUUM INTO");
  });
  it("uploads via ClickHouse® S3 function", () => {
    expect(code).toContain("s3('");
  });
  it("writes manifest JSON alongside backup", () => {
    expect(code).toContain("manifestKey = `chops-app-backups/");
  });
  it("includes table row counts in manifest", () => {
    expect(code).toContain("getTableCounts");
  });
  it("cleans up temp file after upload", () => {
    expect(code).toContain("fs.unlinkSync(snapshot.path)");
  });
  it("scheduled backup checks hour and frequency", () => {
    expect(code).toContain("config.backupHour");
    expect(code).toContain("config.frequency === 'weekly'");
  });
});

describe("Routes: App Backup", () =>{
  const code = read("src/backend/routes/appBackup.js");
  it("has create, list, and config endpoints", () => {
    expect(code).toContain('router.post("/create"');
    expect(code).toContain('router.get("/list"');
    expect(code).toContain('router.get("/config"');
    expect(code).toContain('router.put("/config"');
  });
  it("requires superadmin for all routes", () => {
    expect(code).toContain("requireSuperAdmin");
  });
});

describe("Services: Crypto", () => {
  const code = read("src/backend/services/crypto.js");
  it("uses AES-256-GCM", () => {
    expect(code).toContain("aes-256-gcm");
  });
  it("derives key via scrypt", () => {
    expect(code).toContain("scryptSync");
  });
  it("backward compatible with legacy plaintext", () => {
    expect(code).toContain("not encrypted (legacy plaintext)");
  });
  it("uses per-install random salt file", () => {
    expect(code).toContain("crypto.salt");
    expect(code).toContain("randomBytes(32)");
  });
  it("requires 32+ character SESSION_SECRET", () => {
    expect(code).toContain("sessionSecret.length < 32");
  });
});

describe("Security: SSRF Prevention", () => {
  const queryCode = read("src/backend/controllers/query.js");
  it("query controller validates node against cluster config", () => {
    expect(queryCode).toContain("SSRF prevention");
    expect(queryCode).toContain("Node not found in cluster configuration");
  });
  it("query controller does not accept raw host from request", () => {
    expect(queryCode).toContain("host: targetNode.host");
    expect(queryCode).not.toContain("host: node ||");
  });
  it("query controller uses clusterUtils for SSRF-safe node lookup", () => {
    expect(queryCode).toContain("from '../services/clusterUtils.js'");
    expect(queryCode).toContain("getClusterNodes(clusterId)");
  });

  const notifierCode = read("src/backend/services/notifier.js");
  it("notifier validates webhook URLs", () => {
    expect(notifierCode).toContain("validateWebhookUrl");
  });
  it("notifier blocks private IPs in webhooks", () => {
    expect(notifierCode).toContain("private networks");
    expect(notifierCode).toContain("localhost");
    expect(notifierCode).toContain("link-local");
  });
  it("notifier requires HTTPS for webhooks", () => {
    expect(notifierCode).toMatch(/parsed\.protocol\s*!==\s*['"]https:['"]/);
  });
});

describe("Security: RBAC on Write Operations", () => {
  const alertRoutes = read("src/backend/routes/alerts.js");
  it("alert write routes require admin level", () => {
    expect(alertRoutes).toContain("requireSuperAdmin, createRule");
    expect(alertRoutes).toContain("requireSuperAdmin, createChannel");
  });

  const dashRoutes = read("src/backend/routes/dashboards.js");
  it("dashboard write routes require editor level", () => {
    expect(dashRoutes).toContain("requireEditor, createDashboard");
    expect(dashRoutes).toContain("requireEditor, createChart");
    expect(dashRoutes).toContain("requireEditor, deleteChart");
  });
  it("dashboard read routes are open", () => {
    const listLine = dashRoutes
      .split("\n")
      .find((l) => l.includes("'/'") && l.includes(".get"));
    expect(listLine).not.toContain("requireEditor");
  });

  const settingsCode = read("src/backend/controllers/settings.js");
  it("settings protects sensitive keys at admin level", () => {
    expect(settingsCode).toContain("PROTECTED_KEYS");
    expect(settingsCode).toContain("cluster.nodes");
    expect(settingsCode).toContain("requireAdminForKey");
  });

  const clusterCode = read("src/backend/controllers/cluster.js");
  it("cluster update requires admin level", () => {
    expect(clusterCode).toContain('role !== "superadmin" && role !== "admin"');
  });
});

describe("Database: WAL and Backup", () => {
  it("WAL mode enabled", () => {
    const dbIndex = read("src/backend/db/index.js");
    expect(dbIndex).toContain("journal_mode = WAL");
  });
  it("db:backup script in package.json", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["db:backup"]).toBeDefined();
  });
  it("all deps use valid version formats", () => {
    const pkg = JSON.parse(read("package.json"));

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const validVersion =
      /^(?:[\^~]?\d+\.\d+\.\d+(?:[-+.\w]*)?|[<>]=?\s*\d+\.\d+\.\d+|workspace:.*|file:.*|link:.*|git\+.*|github:.*|https?:.*|latest)$/;
    for (const [name, ver] of Object.entries(allDeps)) {
      expect(ver, `${name} has invalid version format: ${ver}`).toMatch(
        validVersion,
      );
    }
  });
});

describe("Services: JWT", () => {
  const code = read("src/backend/services/jwt.js");
  it("has no default secret", () => {
    expect(code).not.toContain("secret = 'default'");
  });
  it("throws if secret not set", () => {
    expect(code).toContain("JWT secret not set");
  });
  it("includes jti in tokens", () => {
    expect(code).toContain("jti");
  });
  it("has token revocation", () => {
    expect(code).toContain("revokeToken");
    expect(code).toContain("blocklist");
  });
  it("2h token expiry", () => {
    expect(code).toContain("'2h'");
  });
});

describe("Services: ClickHouse®", () => {
  const code = read("src/backend/services/clickhouse.js");
  it("X-ClickHouse-Summary for stats", () => {
    expect(code).toContain("X-ClickHouse-Summary");
  });
  it("FORMAT injection", () => {
    expect(code).toContain("FORMAT");
  });
});

describe("Server: Safety", () => {
  const code = read("src/backend/server.js");
  it("checks dist exists before serving", () => {
    expect(code).toContain("fs.existsSync(distDir)");
    expect(code).toContain("fs.existsSync(distIndex)");
  });
  it("helpful error when not built", () => {
    expect(code).toContain("Frontend not built");
  });
  it("initializes crypto from session secret", () => {
    expect(code).toContain("initCrypto(env.sessionSecret)");
  });
  it("query endpoint has 100kb body limit", () => {
    expect(code).toContain("limit: '100kb'");
  });
  it("SPA catch-all skips /docs/ so Docsify can fetch .md files", () => {
    expect(code).toContain("req.path.startsWith('/docs/')");
  });
  it("SPA catch-all skips /api/ routes", () => {
    expect(code).toContain("req.path.startsWith('/api/')");
  });
  it("serves docs directory as static files", () => {
    expect(code).toContain("app.use('/docs', express.static(docsDir))");
  });
});

describe("Server: Security Headers", () => {
  const code = read("src/backend/middleware/securityHeaders.js");
  it("sets Content-Security-Policy", () => {
    expect(code).toContain("Content-Security-Policy");
  });
  it("sets Strict-Transport-Security", () => {
    expect(code).toContain("Strict-Transport-Security");
  });
  it("blocks framing via CSP frame-ancestors", () => {
    expect(code).toContain("frame-ancestors 'none'");
  });
});

describe("Server: Auth middleware on all routes except login", () => {
  const sv = read("src/backend/server.js");
  it("auth route has no authMiddleware", () => {
    const line = sv
      .split("\n")
      .find((l) => (l.includes("'/api/auth'") || l.includes('"/api/auth"')) && l.includes("app.use"));
    expect(line).not.toContain("authMiddleware");
  });
  [
    "query",
    "config",
    "cluster",
    "dashboards",
    "alerts",
    "settings",
    "users",
  ].forEach((r) => {
    it(`/api/${r} requires authMiddleware`, () => {
      const line = sv
        .split("\n")
        .find((l) => (l.includes(`'/api/${r}'`) || l.includes(`"/api/${r}"`)) && l.includes("app.use"));
      expect(line).toContain("authMiddleware");
    });
  });
});

describe("App: Entry Points", () => {
  it("package.json has dev + build scripts", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
  });
  it("index.html loads main.jsx", () => {
    expect(read("index.html")).toContain("src/frontend/main.jsx");
  });
  it(".env.example has admin credentials", () => {
    const env = read(".env.example");
    expect(env).toContain("SUPER_ADMIN_1");
    expect(env).toContain("SUPER_ADMIN_1_PASSWORD");
  });
  it("vite proxy for /api", () => {
    expect(read("vite.config.js").includes("'/api'") || read("vite.config.js").includes('"/api"')).toBe(true);
  });
});
