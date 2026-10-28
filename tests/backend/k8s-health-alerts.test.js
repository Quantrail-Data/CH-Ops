// k8s-health-alerts.test.js - Tests how health check results become notifications. The database is in memory.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE k8s_health_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id TEXT NOT NULL,
    check_name TEXT NOT NULL,
    status TEXT NOT NULL,
    consecutive_fails INTEGER NOT NULL DEFAULT 0,
    notified INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    UNIQUE (cluster_id, check_name)
  );
  CREATE TABLE k8s_health_alert_config (
    cluster_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    channels_json TEXT NOT NULL DEFAULT '[]',
    last_run_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE alert_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_test_at TEXT,
    last_test_ok INTEGER,
    last_test_error TEXT,
    last_send_at TEXT,
    last_send_ok INTEGER,
    last_send_error TEXT,
    created_at TEXT,
    updated_at TEXT
  );
`);
const db = drizzle(sqlite, { schema });

// The result of the one health check that the fake returns.
let checkResult = false;
// Clusters that the fake cluster list does not have.
const deletedClusterIds = new Set();
const sentNotifications = [];

mock.module("../../src/backend/db/index.js", () => ({
  db,
  k8sHealthState: schema.k8sHealthState,
  k8sHealthAlertConfigs: schema.k8sHealthAlertConfigs,
  alertChannels: schema.alertChannels,
}));
mock.module("../../src/backend/services/k8sHealth.js", () => ({
  runHealthChecks: async () => ({
    checks: [{ name: "Protected against node drains", ok: checkResult, detail: "No budget." }],
  }),
}));
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterById: (clusterId) =>
    deletedClusterIds.has(clusterId) ? null : { id: clusterId, kind: "k8s" },
}));
mock.module("../../src/backend/services/notifier.js", () => ({
  sendNotification: async (channelConfig, alert) => {
    sentNotifications.push({ channelConfig, alert });
  },
}));
// The real function decrypts. This fake marks the value, so the test can see the call.
mock.module("../../src/backend/controllers/alerts.js", () => ({
  DecryptValuesChannels: (config, type) => {
    const values = JSON.parse(config);
    return { ...values, webhook_url: `decrypted:${values.webhook_url}` };
  },
}));

const { runK8sHealthAlerts } = await import(
  "../../src/backend/services/k8sHealthAlerts.js"
);

const START = new Date("2026-11-01T10:00:00Z");
function minutesAfterStart(minutes) {
  return new Date(START.getTime() + minutes * 60 * 1000);
}

beforeEach(() => {
  sqlite.exec("DELETE FROM k8s_health_state; DELETE FROM k8s_health_alert_config; DELETE FROM alert_channel;");
  sqlite.exec(`INSERT INTO alert_channel (id, name, type, config, enabled)
    VALUES (1, 'teams', 'teams', '{"webhook_url":"encrypted-url"}', 1)`);
  sqlite.exec(`INSERT INTO k8s_health_alert_config (cluster_id, enabled, channels_json)
    VALUES ('k8s_default_demo', 1, '[1]')`);
  sentNotifications.length = 0;
  checkResult = false;
  deletedClusterIds.clear();
});

describe("runK8sHealthAlerts", () => {
  it("sends one failure after two failed runs, with the channel secret decrypted", async () => {
    await runK8sHealthAlerts(minutesAfterStart(0));
    expect(sentNotifications.length).toBe(0);

    await runK8sHealthAlerts(minutesAfterStart(15));
    expect(sentNotifications.length).toBe(1);
    expect(sentNotifications[0].alert.kind).toBe("failure");
    expect(sentNotifications[0].channelConfig).toEqual({
      type: "teams",
      webhook_url: "decrypted:encrypted-url",
    });

    await runK8sHealthAlerts(minutesAfterStart(30));
    expect(sentNotifications.length).toBe(1);
  });

  it("does not run a cluster again within 15 minutes", async () => {
    await runK8sHealthAlerts(minutesAfterStart(0));
    await runK8sHealthAlerts(minutesAfterStart(5));
    await runK8sHealthAlerts(minutesAfterStart(14));
    const state = sqlite.query("SELECT consecutive_fails FROM k8s_health_state").get();
    expect(state.consecutive_fails).toBe(1);
  });

  it("sends a recovery with the same id as the failure", async () => {
    await runK8sHealthAlerts(minutesAfterStart(0));
    await runK8sHealthAlerts(minutesAfterStart(15));
    checkResult = true;
    await runK8sHealthAlerts(minutesAfterStart(30));
    expect(sentNotifications.map((sent) => sent.alert.kind)).toEqual(["failure", "recovery"]);
    expect(sentNotifications[0].alert.id).toBe(sentNotifications[1].alert.id);
  });

  it("sends nothing to a disabled channel, or for a cluster with alerts off", async () => {
    sqlite.exec("UPDATE alert_channel SET enabled = 0");
    await runK8sHealthAlerts(minutesAfterStart(0));
    await runK8sHealthAlerts(minutesAfterStart(15));
    expect(sentNotifications.length).toBe(0);

    sqlite.exec("UPDATE alert_channel SET enabled = 1; UPDATE k8s_health_alert_config SET enabled = 0");
    await runK8sHealthAlerts(minutesAfterStart(30));
    await runK8sHealthAlerts(minutesAfterStart(45));
    expect(sentNotifications.length).toBe(0);
  });

  it("removes the settings and states of a deleted cluster", async () => {
    await runK8sHealthAlerts(minutesAfterStart(0));
    deletedClusterIds.add("k8s_default_demo");
    await runK8sHealthAlerts(minutesAfterStart(15));
    expect(sqlite.query("SELECT count(*) AS rows FROM k8s_health_alert_config").get().rows).toBe(0);
    expect(sqlite.query("SELECT count(*) AS rows FROM k8s_health_state").get().rows).toBe(0);
    expect(sentNotifications.length).toBe(0);
  });
});
