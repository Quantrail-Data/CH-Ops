// alertScheduler.js - Cron-based alert evaluation engine
//
// Runs every minute and evaluates all enabled alert rules that are due.
// Each rule runs on all nodes of its cluster, or on the nodes in its nodes field.
// The state of each node is kept apart (alertNodeStates.js). A rule sends one
// message for all its nodes: when the list of firing nodes changes, and
// "resolved" when no node fires. Query errors send their own messages.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { log } from "./logger.js";

import { eq, sql } from "drizzle-orm";
import {
  db,
  alertRules,
  alertChannels,
  alertRuleChannels,
} from "../db/index.js";
import { executeQuery } from "./clickhouse.js";
import { sendNotification } from "./notifier.js";
import { getClusterNodes } from "./clusterUtils.js";
import { alertEvents, alertRuleNodeStates } from "../db/schema.js";
import { DecryptValuesChannels } from "../controllers/alerts.js";
import { runK8sHealthAlerts } from "./k8sHealthAlerts.js";
import {
  nodeKey,
  selectRuleNodes,
  nextNodeState,
  decideRuleNotifications,
  ruleStatus,
} from "./alertNodeStates.js";

function cronMatches(expr, date) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const fields = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];
  for (let i = 0; i < 5; i++) {
    const spec = parts[i];
    if (spec === "*") continue;
    if (spec.startsWith("*/")) {
      if (fields[i] % parseInt(spec.slice(2), 10) !== 0) return false;
      continue;
    }
    if (!spec.split(",").map(Number).includes(fields[i])) return false;
  }
  return true;
}

// Also used by the rule test endpoint in controllers/alerts.js.
export function evalThreshold(value, operator, threshold) {
  switch (operator) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold;
    case "neq":
      return value !== threshold;
    default:
      return false;
  }
}

// Runs the rule SQL on each node. Returns one result for each node: its value, or its error.
async function runRuleOnNodes(rule, nodes) {
  const queryResults = await Promise.allSettled(
    nodes.map((node) =>
      executeQuery({
        host: node.host,
        port: node.port,
        secure: !!node.secure,
        user: node.user,
        password: node.password,
        sql: rule.sql,
        // Alert rules only read data. All other queries in CHOps use this guard too.
        readOnly: true,
        timeoutMs: 120000,
      }),
    ),
  );

  return queryResults.map((queryResult, index) => {
    const name = nodeKey(nodes[index]);
    if (queryResult.status === "rejected") {
      return { name, error: queryResult.reason?.message || "query failed" };
    }
    if (!queryResult.value.rows?.length) {
      // No rows is a breach only when noRowsMeansBreach is true.
      return { name, value: null, breached: rule.noRowsMeansBreach === true };
    }
    const rawValue = Object.values(queryResult.value.rows[0])[0];
    const value = Number(rawValue);
    if (rawValue === null || rawValue === "" || Number.isNaN(value)) {
      return {
        name,
        error: `query returned a non numeric value: ${String(rawValue).slice(0, 50)}`,
      };
    }
    return {
      name,
      value,
      breached: evalThreshold(value, rule.operator, rule.threshold),
    };
  });
}

// The name used for the state of a rule whose node choice matches no node.
const NO_NODE = "(no node)";

// The names of the nodes whose state passes the test.
function nodeNamesWhere(states, test) {
  const names = new Set();
  for (const [name, state] of states) {
    if (test(state)) names.add(name);
  }
  return names;
}

// For example "node-1: timeout; node-2: query failed".
function describeNodeErrors(nodeStates) {
  return [...nodeStates]
    .filter(([, state]) => state.error)
    .map(([name, state]) => `${name}: ${state.error}`)
    .join("; ");
}

function storedRowToState(row) {
  return {
    firing: Boolean(row.firing),
    breachRunCount: row.breachRunCount,
    value: row.lastValue,
    error: row.lastError,
  };
}

function loadNodeStates(ruleId) {
  const stateByNode = new Map();
  const rows = db
    .select()
    .from(alertRuleNodeStates)
    .where(eq(alertRuleNodeStates.alertRuleId, ruleId))
    .all();
  for (const row of rows) stateByNode.set(row.nodeName, row);
  return stateByNode;
}

function saveNodeStates(ruleId, nodeStates, now) {
  // Nodes that the rule no longer runs on lose their state.
  db.delete(alertRuleNodeStates)
    .where(eq(alertRuleNodeStates.alertRuleId, ruleId))
    .run();
  for (const [nodeName, state] of nodeStates) {
    db.insert(alertRuleNodeStates)
      .values({
        alertRuleId: ruleId,
        nodeName,
        firing: state.firing,
        breachRunCount: state.breachRunCount,
        lastValue: state.value,
        lastError: state.error ? String(state.error).slice(0, 300) : null,
        updatedAt: now.toISOString(),
      })
      .run();
  }
}

// Exported for the tests.
export async function evaluateRule(rule, allNodes, now) {
  const previousStatus = rule.lastState; // 'ok' | 'firing' | 'error' | null
  const breachRunsRequired = rule.breachRunsRequired || 1;

  let selectedNodes = null;
  try {
    selectedNodes = rule.nodes ? JSON.parse(rule.nodes) : null;
  } catch {
    selectedNodes = null;
  }
  const nodes = selectRuleNodes(allNodes, selectedNodes);

  const storedStates = loadNodeStates(rule.id);
  // Rules from before the upgrade have no node state rows. Then the rule row gives the old state.
  // is_active is true when the rule fired. It stays true also when last_state is "error".
  const noStoredStates = storedStates.size === 0;
  const firedBeforeNodeStates =
    noStoredStates && (previousStatus === "firing" || Boolean(rule.isActive));
  const failedBeforeNodeStates = noStoredStates && previousStatus === "error";

  const nodeStates = new Map();
  if (nodes.length === 0) {
    // No node matches the rule. The rule does not run, so the stored node states do not change.
    for (const [name, row] of storedStates) nodeStates.set(name, storedRowToState(row));
    nodeStates.set(NO_NODE, {
      firing: false,
      breachRunCount: 0,
      value: null,
      error: "No target nodes resolved for this rule",
    });
  } else {
    let nodeResults;
    try {
      nodeResults = await runRuleOnNodes(rule, nodes);
    } catch (error) {
      nodeResults = nodes.map((node) => ({
        name: nodeKey(node),
        error: error?.message || "evaluation failed",
      }));
    }
    for (const result of nodeResults) {
      // After the upgrade, a node that answers starts as firing when the rule fired before.
      const previousState =
        firedBeforeNodeStates && !result.error
          ? { firing: true, breachRunCount: breachRunsRequired }
          : storedStates.get(result.name);
      nodeStates.set(result.name, nextNodeState(previousState, result, breachRunsRequired));
    }
  }

  const currentFiring = nodeNamesWhere(nodeStates, (state) => state.firing);
  const currentErrored = nodeNamesWhere(nodeStates, (state) => Boolean(state.error));
  let previousFiring = nodeNamesWhere(storedStates, (state) => state.firing);
  let previousErrored = nodeNamesWhere(storedStates, (state) => Boolean(state.lastError));

  // The first run after the upgrade must not repeat the message of a rule that fired before.
  // It must send "resolved" or "recovered" when the old problem is gone.
  if (firedBeforeNodeStates) {
    const answeringNodes = nodeNamesWhere(nodeStates, (state) => !state.error);
    previousFiring = currentFiring.size > 0 ? new Set(currentFiring) : answeringNodes;
  }
  if (failedBeforeNodeStates) {
    previousErrored =
      currentErrored.size > 0 ? new Set(currentErrored) : new Set(nodeStates.keys());
  }

  const status = ruleStatus(currentFiring, currentErrored);
  const errorText = describeNodeErrors(nodeStates).slice(0, 500);
  let largestValue = 0;
  let highestBreachRunCount = 0;
  for (const state of nodeStates.values()) {
    if (Number.isFinite(state.value) && Math.abs(state.value) > Math.abs(largestValue)) {
      largestValue = state.value;
    }
    highestBreachRunCount = Math.max(highestBreachRunCount, state.breachRunCount);
  }

  saveNodeStates(rule.id, nodeStates, now);
  db.update(alertRules)
    .set({
      lastRunAt: now.toISOString(),
      lastValue: largestValue,
      lastStatus: status,
      lastError: errorText || null,
      isActive: currentFiring.size > 0,
      breachRunCount: highestBreachRunCount,
      lastState: status,
    })
    .where(eq(alertRules.id, rule.id))
    .run();

  // Record every status change for the history view.
  if (status !== previousStatus) {
    db.insert(alertEvents)
      .values({
        alertRuleId: rule.id,
        status,
        prevStatus: previousStatus || null,
        value: largestValue,
        error: errorText || null,
      })
      .run();
  }

  const reminderMinutes = rule.notifyIntervalMinutes || 0;
  const reminderDue =
    reminderMinutes > 0 &&
    Boolean(rule.lastBreachNotifiedAt) &&
    now.getTime() - new Date(rule.lastBreachNotifiedAt).getTime() >= reminderMinutes * 60000;

  const notifications = decideRuleNotifications({
    previousFiring,
    currentFiring,
    previousErrored,
    currentErrored,
    reminderDue,
  });
  const notified = await notify(rule, now, notifications, nodeStates);
  if (notified) {
    db.update(alertRules)
      .set({ lastNotifiedAt: now.toISOString() })
      .where(eq(alertRules.id, rule.id))
      .run();
  }
}

// The channels of a rule that are on, with their secrets decrypted.
function loadRuleChannels(ruleId) {
  const links = db
    .select()
    .from(alertRuleChannels)
    .where(eq(alertRuleChannels.alertRuleId, ruleId))
    .all();
  const channels = [];
  for (const link of links) {
    const channel = db
      .select()
      .from(alertChannels)
      .where(eq(alertChannels.id, link.alertChannelId))
      .get();
    if (!channel?.enabled) continue;
    let channelConfig = {};
    try {
      channelConfig = DecryptValuesChannels(channel.config, channel.type);
    } catch {
      // The channel gets an empty config. The send then fails, and the channel status shows the error.
    }
    channels.push({
      id: channel.id,
      name: channel.name,
      config: { type: channel.type, ...channelConfig },
    });
  }
  return channels;
}

// For example "node-1 = 95.5, node-2 = 97 (new: node-2; stopped: node-3)".
function describeFiringNodes(nodeStates, notification) {
  const firingNodes = [...nodeStates].filter(([, state]) => state.firing);
  let text = firingNodes
    .map(([name, state]) => (state.value === null ? name : `${name} = ${state.value}`))
    .join(", ");
  if (notification.firstBreach) return text;
  const changes = [];
  if (notification.newNodes.length) changes.push(`new: ${notification.newNodes.join(", ")}`);
  if (notification.stoppedNodes.length) changes.push(`stopped: ${notification.stoppedNodes.join(", ")}`);
  if (changes.length) text += ` (${changes.join("; ")})`;
  return text;
}

function largestFiringValue(nodeStates) {
  let largest = null;
  for (const state of nodeStates.values()) {
    if (!state.firing || state.value === null) continue;
    if (largest === null || Math.abs(state.value) > Math.abs(largest)) largest = state.value;
  }
  return largest;
}

// Builds the message of one notification. Breach and resolved messages use the rule id.
// Failure and recovery messages use a different id. So PagerDuty keeps two incidents,
// and each incident closes separately.
function buildMessage(rule, now, notification, nodeStates) {
  const lastRunAt = now.toISOString();
  switch (notification.kind) {
    case "breach":
    case "reminder": {
      let titleSuffix = " - nodes changed";
      if (notification.kind === "reminder") titleSuffix = " - still firing";
      if (notification.firstBreach) titleSuffix = "";
      return {
        ...rule,
        kind: "breach",
        name: `${rule.name}${titleSuffix}`,
        lastValue: largestFiringValue(nodeStates),
        firedNode: describeFiringNodes(nodeStates, notification),
        lastRunAt,
      };
    }
    case "resolved":
      return {
        ...rule,
        kind: "resolved",
        severity: "info",
        name: `${rule.name} - resolved`,
        firedNode: notification.stoppedNodes.join(", "),
        lastRunAt,
      };
    case "failure":
      return {
        ...rule,
        id: `${rule.id}-evaluation`,
        kind: "failure",
        severity: "critical",
        name: `${rule.name} - evaluation failed`,
        error: describeNodeErrors(nodeStates),
        firedNode: [...nodeNamesWhere(nodeStates, (state) => Boolean(state.error))].join(", "),
        lastRunAt,
      };
    default:
      return {
        ...rule,
        id: `${rule.id}-evaluation`,
        kind: "recovery",
        severity: "info",
        name: `${rule.name} - recovered`,
        firedNode: notification.stoppedNodes.join(", "),
        lastRunAt,
      };
  }
}

// Sends the notifications of one run to every channel of the rule. Returns true when it sent one.
async function notify(rule, now, notifications, nodeStates) {
  if (notifications.length === 0) return false;
  const channels = loadRuleChannels(rule.id);
  if (channels.length === 0) return false;

  const sends = [];
  for (const notification of notifications) {
    const message = buildMessage(rule, now, notification, nodeStates);
    for (const channel of channels) {
      sends.push(
        sendNotification(channel.config, message)
          .then(() => recordSendResult(channel.id, true, null))
          .catch((error) => {
            recordSendResult(channel.id, false, error.message);
            log.error("Alert notification failed", {
              channel: channel.name,
              error: error.message,
            });
          }),
      );
    }
  }
  await Promise.allSettled(sends);

  const sentBreachMessage = notifications.some(
    (notification) => notification.kind === "breach" || notification.kind === "reminder",
  );
  if (sentBreachMessage) {
    db.update(alertRules)
      .set({ lastBreachNotifiedAt: now.toISOString() })
      .where(eq(alertRules.id, rule.id))
      .run();
  }
  return true;
}

function recordSendResult(channelId, ok, errorMessage) {
  try {
    db.update(alertChannels)
      .set({
        lastSendAt: new Date().toISOString(),
        lastSendOk: ok,
        lastSendError: ok ? null : String(errorMessage || "").slice(0, 300),
      })
      .where(eq(alertChannels.id, channelId))
      .run();
  } catch {}
}

let interval = null;

export function startScheduler(env) {
  if (interval) return;
  let lastPruneDay = null;

  async function tick() {
    const now = new Date();

    // The code does not wait for this call. A slow Kubernetes API must not delay the alert rules.
    runK8sHealthAlerts(now).catch((error) =>
      log.error("Kubernetes health alert run failed", { error: error.message }),
    );
    const today = now.toISOString().slice(0, 10);
    if (today !== lastPruneDay) {
      lastPruneDay = today;
      try {
        db.run(sql`DELETE FROM alert_event WHERE created_at <
datetime('now', '-90 days')`);
      } catch {}
    }
    let rules;
    try {
      rules = db
        .select()
        .from(alertRules)
        .where(eq(alertRules.enabled, true))
        .all();
    } catch {
      return;
    }

    // Keep only the rules that are due and that did not run in this minute.
    const dueRules = rules.filter((rule) => {
      if (!cronMatches(rule.schedule, now)) return false;
      if (rule.lastRunAt) {
        const last = new Date(rule.lastRunAt);
        if (
          last.getMinutes() === now.getMinutes() &&
          last.getHours() === now.getHours() &&
          last.getDate() === now.getDate()
        )
          return false;
      }
      return true;
    });

    if (dueRules.length === 0) return;

    // All due rules run at the same time. Each rule runs on the nodes of its own cluster.
    await Promise.allSettled(
      dueRules.map((rule) => {
        const ruleNodes = getClusterNodes(rule.clusterId || null);
        if (ruleNodes.length === 0) return Promise.resolve();
        return evaluateRule(rule, ruleNodes, now);
      }),
    );
  }

  tick();
  interval = setInterval(tick, 60000);
  log.info("Alert scheduler started (60s interval)");
}


// Runs before a rule is turned off. It sends "resolved" for a breach,
// and "recovered" for query errors.
// So no PagerDuty incident stays open for a rule that is off.
export async function notifyBeforeRuleDisabled(ruleId) {
  const rule = db
    .select()
    .from(alertRules)
    .where(eq(alertRules.id, ruleId))
    .get();

  if (!rule) {
    throw new Error("Alert rule not found");
  }

  const storedStates = loadNodeStates(ruleId);
  db.delete(alertRuleNodeStates)
    .where(eq(alertRuleNodeStates.alertRuleId, ruleId))
    .run();

  const firingNodeNames = [...nodeNamesWhere(storedStates, (state) => state.firing)];
  const erroredNodeNames = [...nodeNamesWhere(storedStates, (state) => Boolean(state.lastError))];
  const notifications = [];
  if (rule.lastState === "firing" || rule.isActive) {
    notifications.push({ kind: "resolved", newNodes: [], stoppedNodes: firingNodeNames });
  }
  if (erroredNodeNames.length > 0) {
    notifications.push({ kind: "recovery", newNodes: [], stoppedNodes: erroredNodeNames });
  }
  if (notifications.length === 0) return;

  await notify(rule, new Date(), notifications, new Map());

  db.update(alertRules)
    .set({
      lastState: "ok",
      lastStatus: "ok",
      isActive: false,
    })
    .where(eq(alertRules.id, ruleId))
    .run();
}

// The grammar cronMatches() supports: *, */n, and comma lists. No ranges.
export function validateCronExpression(expr) {
  const parts = String(expr || "")
    .trim()
    .split(/\s+/);
  if (parts.length !== 5) return "Cron must have 5 fields";
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    // getDay() gives 0 (Sunday) to 6. 7 never matches, so the check refuses it.
    [0, 6],
  ];
  const names = ["minute", "hour", "day-of-month", "month", "day-of-week"];
  for (let i = 0; i < 5; i++) {
    const p = parts[i];
    if (p === "*") continue;
    if (p.startsWith("*/")) {
      const n = parseInt(p.slice(2), 10);
      if (!Number.isInteger(n) || n < 1)
        return `Invalid step in ${names[i]}: ${p}`;
      continue;
    }
    for (const v of p.split(",")) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < ranges[i][0] || n > ranges[i][1])
        return `CRON ERROR : ${names[i]} must be a number from ${ranges[i][0]} to ${ranges[i][1]}, or a comma list of numbers: ${v}`;
    }
  }
  return null;
}
