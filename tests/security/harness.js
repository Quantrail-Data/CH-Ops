// harness.js - shared test harness that boots a real backend server and ClickHouse stub for integration tests
// Contributors - Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { Database } from "bun:sqlite";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const REPO_ROOT = path.join(import.meta.dir, "../..");
export const ENCRYPTION_SECRET =
  "test-encryption-secret-at-least-32-characters";
export const ROLES = ["readonly", "editor", "admin", "superadmin"];
export const NODE_NAME = "node1";

const SERVER_SCRIPT = path.join(REPO_ROOT, "src/backend/server.js");
const USER_PASSWORD = "user-pass-123";
const SALT_PATH = path.join(REPO_ROOT, "data", "crypto.salt");

if (!fs.existsSync(SALT_PATH)) {
  throw new Error(
    `Missing ${SALT_PATH}. The test process and the server process must share ` +
      `the same encryption salt, or decrypt() will fail. Run "bun run dev:backend" ` +
      `once from the repo root to create it, then re-run the tests.`,
  );
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function httpRequest(port, method, url, headers, bodyText) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path: url, method, headers, agent: false },
      (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, text }),
        );
      },
    );
    request.on("error", reject);
    if (bodyText !== undefined) request.write(bodyText);
    request.end();
  });
}

function startFakeClickHouse(answerQuery) {
  const requests = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      const sql =
        request.method === "POST"
          ? await request.text()
          : url.searchParams.get("query") || "";
      const query = {
        sql,
        user: request.headers.get("x-clickhouse-user"),
        readonly: url.searchParams.get("readonly"),
      };
      requests.push(query);
      const answer = answerQuery ? answerQuery(query) : null;
      if (!answer) return new Response("", { status: 200 });
      return new Response(answer.body ?? "", { status: answer.status ?? 200 });
    },
  });
  return { server, requests, port: server.port };
}

export async function startServer({ answerQuery } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-security-"));
  const dbPath = path.join(tempDir, "chops.db");
  const logPath = path.join(tempDir, "server.log");
  const clickHouse = startFakeClickHouse(answerQuery);
  const port = await findFreePort();

  const serverProcess = Bun.spawn([process.execPath, SERVER_SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      SUPER_ADMIN_1: "test-superadmin",
      SUPER_ADMIN_1_PASSWORD: "test-password-123",
      SUPER_ADMIN_1_EMAIL: "superadmin@example.com",
      ENCRYPTION_SECRET,
    },
    stdout: Bun.file(logPath),
    stderr: Bun.file(logPath),
  });

  function setupError(message) {
    let log = "";
    try {
      log = fs.readFileSync(logPath, "utf8").split("\n").slice(-20).join("\n");
    } catch {}
    return new Error(`${message}\n--- server log (last 20 lines) ---\n${log}`);
  }

  let serverIsUp = false;
  for (let attempt = 0; attempt < 150 && !serverIsUp; attempt++) {
    try {
      await httpRequest(port, "GET", "/api/health", {});
      serverIsUp = true;
    } catch {
      await Bun.sleep(100);
    }
  }
  if (!serverIsUp) throw setupError("The CHOps server did not start.");

  const tokens = {};

  async function login(username, password) {
    const body = JSON.stringify({ username, password });
    const { text } = await httpRequest(
      port,
      "POST",
      "/api/auth",
      { "Content-Type": "application/json" },
      body,
    );
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {}
    if (!json.token) throw setupError(`Login failed for ${username}: ${text}`);
    return json.token;
  }

  async function api(role, method, url, body) {
    const headers = { "Content-Type": "application/json" };
    if (role) headers.Authorization = `Bearer ${tokens[role]}`;
    const bodyText = body === undefined ? undefined : JSON.stringify(body);
    const { status, text } = await httpRequest(
      port,
      method,
      url,
      headers,
      bodyText,
    );
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status, json, text };
  }

  function openDatabase() {
    return new Database(dbPath);
  }

  tokens.superadmin = await login("test-superadmin", "test-password-123");

  const passwordHash = await Bun.password.hash(USER_PASSWORD, {
    algorithm: "argon2id",
  });
  const database = openDatabase();
  for (const role of ["readonly", "editor", "admin"]) {
    database
      .query(
        "INSERT INTO app_user (username, password_hash, role, email, must_change_password) VALUES (?, ?, ?, ?, 0)",
      )
      .run(`test-${role}`, passwordHash, role, `${role}@example.com`);
  }
  database.close();
  for (const role of ["readonly", "editor", "admin"]) {
    tokens[role] = await login(`test-${role}`, USER_PASSWORD);
  }

  const created = await api("superadmin", "POST", "/api/cluster", {
    name: "test-cluster",
    nodes: [
      {
        name: NODE_NAME,
        host: "127.0.0.1",
        port: clickHouse.port,
        user: "service",
        password: "service-pass",
      },
    ],
  });
  if (!created.json?.id)
    throw setupError(`Cluster create failed: ${created.text}`);

  async function stop() {
    serverProcess.kill();
    clickHouse.server.stop(true);
    await Bun.sleep(300);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {}
  }

  return {
    api,
    openDatabase,
    clickHouse,
    clusterId: created.json.id,
    stop,
  };
}