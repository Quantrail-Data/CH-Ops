// alert-node-states.test.js - Alert rules keep a state for each node, and send one message per rule.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import {
  selectRuleNodes,
  nextNodeState,
  decideRuleNotifications,
} from "../../src/backend/services/alertNodeStates.js";

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE alert_rule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    sql TEXT NOT NULL,
    threshold REAL NOT NULL DEFAULT 0,
    operator TEXT NOT NULL DEFAULT 'gt',
    severity TEXT NOT NULL DEFAULT 'warning',
    schedule TEXT NOT NULL DEFAULT '*/5 * * * *',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_value REAL,
    last_status TEXT,
    last_error TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    nodes TEXT,
    cluster_id TEXT,
    last_notified_at TEXT,
    last_state TEXT,
    created_at TEXT,
    updated_at TEXT,
    notify_interval_minutes INTEGER NOT NULL DEFAULT 0,
    last_breach_notified_at TEXT,
    breach_runs_required INTEGER NOT NULL DEFAULT 1,
    breach_run_count INTEGER NOT NULL DEFAULT 0,
    no_rows_means_breach INTEGER NOT NULL DEFAULT 0,
    template_id TEXT,
    template_edited INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE alert_rule_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL,
    alert_channel_id INTEGER NOT NULL
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
  CREATE TABLE alert_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    prev_status TEXT,
    value REAL,
    error TEXT,
    created_at TEXT
  );
  CREATE TABLE alert_rule_node_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL,
    node_name TEXT NOT NULL,
    firing INTEGER NOT NULL DEFAULT 0,
    breach_run_count INTEGER NOT NULL DEFAULT 0,
    last_value REAL,
    last_error TEXT,
    updated_at TEXT,
    UNIQUE (alert_rule_id, node_name)
  );
`);
const db = drizzle(sqlite, { schema });

// The value that each node answers, by port. An Error makes that node fail.
const answerByPort = new Map();
const queriedPorts = [];
const sentMessages = [];

mock.module("../../src/backend/db/index.js", () => ({
  db,
  alertRules: schema.alertRules,
  alertChannels: schema.alertChannels,
  alertRuleChannels: schema.alertRuleChannels,
}));
mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery: async ({ port }) => {
    queriedPorts.push(port);
    const answer = answerByPort.get(port);
    if (answer instanceof Error) throw answer;
    return { rows: [{ value: answer }] };
  },
}));
mock.module("../../src/backend/services/notifier.js", () => ({
  sendNotification: async (channelConfig, message) => {
    sentMessages.push(message);
  },
}));
mock.module("../../src/backend/controllers/alerts.js", () => ({
  DecryptValuesChannels: (config) => JSON.parse(config),
}));
mock.module("../../src/backend/services/k8sHealthAlerts.js", () => ({
  runK8sHealthAlerts: async () => {},
}));
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterNodes: () => [],
}));

const { evaluateRule, notifyBeforeRuleDisabled } = await import(
  "../../src/backend/services/alertScheduler.js"
);

const NODES = [
  { name: "node-1", host: "ch.example.com", port: 1 },
  { name: "node-2", host: "ch.example.com", port: 2 },
];

function readRule() {
  return db.select().from(schema.alertRules).get();
}

async function runWith(node1Value, node2Value, minute) {
  answerByPort.set(1, node1Value);
  answerByPort.set(2, node2Value);
  sentMessages.length = 0;
  await evaluateRule(readRule(), NODES, new Date(Date.UTC(2026, 10, 1, 10, minute)));
  return sentMessages.map((message) => ({
    kind: message.kind,
    name: message.name,
    nodes: message.firedNode,
    id: message.id,
  }));
}

beforeEach(() => {
  sqlite.exec(`DELETE FROM alert_rule; DELETE FROM alert_rule_channel; DELETE FROM alert_channel;
    DELETE FROM alert_event; DELETE FROM alert_rule_node_state;`);
  sqlite.exec(`INSERT INTO alert_rule (id, name, sql, threshold, operator)
    VALUES (5, 'Disk space low', 'SELECT 1', 90, 'gt')`);
  sqlite.exec(`INSERT INTO alert_channel (id, name, type, config) VALUES (1, 'teams', 'teams', '{}')`);
  sqlite.exec("INSERT INTO alert_rule_channel (alert_rule_id, alert_channel_id) VALUES (5, 1)");
  queriedPorts.length = 0;
});

describe("alert node states: pure functions", () => {
  it("chooses nodes by name, so nodes that share a host stay apart", () => {
    expect(selectRuleNodes(NODES, ["node-2"]).map((node) => node.name)).toEqual(["node-2"]);
    expect(selectRuleNodes(NODES, []).length).toBe(2);
  });

  it("still reads a host saved by an older version", () => {
    expect(selectRuleNodes(NODES, ["ch.example.com"]).length).toBe(2);
  });

  it("reads a value as a node name first, when it is also a host", () => {
    const nodesNamedLikeHost = [
      { name: "replica-a", host: "replica-a", port: 1 },
      { name: "replica-b", host: "replica-a", port: 2 },
    ];
    const chosen = selectRuleNodes(nodesNamedLikeHost, ["replica-a"]);
    expect(chosen.map((node) => node.name)).toEqual(["replica-a"]);
  });

  it("keeps the breach state of a node whose query failed", () => {
    const firing = { firing: true, breachRunCount: 3 };
    expect(nextNodeState(firing, { error: "timeout" }, 1)).toEqual({
      firing: true,
      breachRunCount: 3,
      value: null,
      error: "timeout",
    });
  });

  it("fires only after the required runs in a row", () => {
    const first = nextNodeState(undefined, { value: 95, breached: true }, 2);
    expect(first.firing).toBe(false);
    expect(nextNodeState(first, { value: 95, breached: true }, 2).firing).toBe(true);
  });

  it("sends a reminder only when the list did not change", () => {
    const notifications = decideRuleNotifications({
      previousFiring: new Set(["node-1"]),
      currentFiring: new Set(["node-1"]),
      previousErrored: new Set(),
      currentErrored: new Set(),
      reminderDue: true,
    });
    expect(notifications.map((notification) => notification.kind)).toEqual(["reminder"]);
  });
});

describe("evaluateRule", () => {
  it("sends one message when the list of firing nodes changes, and resolved when it is empty", async () => {
    expect(await runWith(95, 10, 0)).toEqual([
      { kind: "breach", name: "Disk space low", nodes: "node-1 = 95", id: 5 },
    ]);
    expect(await runWith(96, 10, 1)).toEqual([]);
    expect(await runWith(96, 97, 2)).toEqual([
      {
        kind: "breach",
        name: "Disk space low - nodes changed",
        nodes: "node-1 = 96, node-2 = 97 (new: node-2)",
        id: 5,
      },
    ]);
    expect(await runWith(10, 97, 3)).toEqual([
      {
        kind: "breach",
        name: "Disk space low - nodes changed",
        nodes: "node-2 = 97 (stopped: node-1)",
        id: 5,
      },
    ]);
    expect(await runWith(10, 10, 4)).toEqual([
      { kind: "resolved", name: "Disk space low - resolved", nodes: "node-2", id: 5 },
    ]);
  });

  it("sends the breach of one node also when another node fails, with its own failure id", async () => {
    const messages = await runWith(new Error("timeout"), 97, 0);
    expect(messages.map((message) => message.kind).sort()).toEqual(["breach", "failure"]);
    const failure = messages.find((message) => message.kind === "failure");
    expect(failure.id).toBe("5-evaluation");
    expect(failure.nodes).toBe("node-1");
    expect(readRule().lastStatus).toBe("firing");

    expect(await runWith(10, 97, 1)).toEqual([
      { kind: "recovery", name: "Disk space low - recovered", nodes: "node-1", id: "5-evaluation" },
    ]);
  });

  it("runs only on the chosen node when two nodes share one host", async () => {
    sqlite.exec(`UPDATE alert_rule SET nodes = '["node-2"]'`);
    await runWith(95, 95, 0);
    expect(queriedPorts).toEqual([2]);
  });

  it("does not repeat the message of a rule that fired before the upgrade", async () => {
    sqlite.exec("UPDATE alert_rule SET last_state = 'firing', breach_runs_required = 2");
    expect(await runWith(95, 10, 0)).toEqual([]);
    expect(readRule().lastStatus).toBe("firing");
    expect(await runWith(10, 10, 1)).toEqual([
      { kind: "resolved", name: "Disk space low - resolved", nodes: "node-1", id: 5 },
    ]);
  });

  it("sends nothing until the required runs in a row", async () => {
    sqlite.exec("UPDATE alert_rule SET breach_runs_required = 2");
    expect(await runWith(95, 10, 0)).toEqual([]);
    expect((await runWith(95, 10, 1)).map((message) => message.kind)).toEqual(["breach"]);
  });

  it("does not repeat a breach of a rule stored as error while a node fired, before the upgrade", async () => {
    sqlite.exec("UPDATE alert_rule SET last_state = 'error', is_active = 1");
    expect(await runWith(95, new Error("timeout"), 0)).toEqual([]);
    expect(readRule().lastStatus).toBe("firing");
  });

  it("keeps the node states when the node choice matches no node", async () => {
    await runWith(95, 10, 0);
    sqlite.exec(`UPDATE alert_rule SET nodes = '["gone"]'`);
    const messages = await runWith(95, 10, 1);
    expect(messages.map((message) => message.kind)).toEqual(["failure"]);
    expect(readRule().lastStatus).toBe("firing");

    sqlite.exec("UPDATE alert_rule SET nodes = NULL");
    expect((await runWith(95, 10, 2)).map((message) => message.kind)).toEqual(["recovery"]);
  });

  it("closes the breach and the query errors when the rule is turned off", async () => {
    await runWith(95, new Error("timeout"), 0);
    sentMessages.length = 0;
    await notifyBeforeRuleDisabled(5);
    const kinds = sentMessages.map((message) => message.kind).sort();
    expect(kinds).toEqual(["recovery", "resolved"]);
    const recovery = sentMessages.find((message) => message.kind === "recovery");
    expect(recovery.id).toBe("5-evaluation");
  });
});
