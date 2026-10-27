// alertScheduler.js - Cron-based alert evaluation engine
//
// Runs every minute and evaluates all enabled alert rules that are due.
// Each rule is evaluated in parallel across all nodes in its cluster.
// If a node breaches the threshold, a separate notification is sent
// for that node with its specific value. Rules can target specific
// nodes via the nodes field. All notifications (nodes x channels)
// are dispatched in parallel for maximum throughput.
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
import { alertEvents } from "../db/schema.js";
import { DecryptValuesChannels } from "../controllers/alerts.js";

// Cluster nodes loaded from clusterUtils.getClusterNodes()

const DEFAULT_NOTIFY_COOLDOWN_MINUTES = 60;

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

function cooldownElapsed(rule, now) {
  const minutes = Number.isFinite(Number(rule.cooldownMinutes))
    ? Number(rule.cooldownMinutes)
    : DEFAULT_NOTIFY_COOLDOWN_MINUTES;
  if (minutes <= 0) return true;
  if (!rule.lastNotifiedAt) return true;
  const last = new Date(rule.lastNotifiedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= minutes * 60 * 1000;
}

async function evaluateRule(rule, allNodes, now) {
  const prevStatus = rule.lastState; 
  let errorMsg = null;
  let firingNodes = [];
  let lastValue = 0;

  try {
  
    let nodes = allNodes;
    if (rule.nodes) {
      try {
        const selected = JSON.parse(rule.nodes);
        if (Array.isArray(selected) && selected.length > 0)
          nodes = allNodes.filter((n) => selected.includes(n.host));
      } catch {}
    }
    if (nodes.length === 0) errorMsg = "No target nodes resolved for this rule";

    if (!errorMsg) {
      const nodeResults = await Promise.allSettled(
        nodes.map((node) =>
          executeQuery({
            host: node.host,
            port: node.port,
            secure: !!node.secure,
            user: node.user,
            password: node.password,
            sql: rule.sql,
            readOnly: true,
            timeoutMs: 120000,
          }),
        ),
      );

      const errs = [];
      for (let i = 0; i < nodeResults.length; i++) {
        const r = nodeResults[i];
        if (r.status === "rejected") {
          errs.push(
            `${nodes[i].name || nodes[i].host}: ${r.reason?.message || "query failed"}`,
          );
          continue;
        }
        if (!r.value.rows?.length) {
          if (rule.noRowsMeansBreach) {
            firingNodes.push({
              host: nodes[i].host,
              name: nodes[i].name || nodes[i].host,
              value: null,
            });
          }
          continue;
        }
        const rawValue = Object.values(r.value.rows[0])[0];
        const v = Number(rawValue);
        if (rawValue === null || rawValue === "" || Number.isNaN(v)) {
          errs.push(`${nodes[i].name || nodes[i].host}: query returned a
non numeric value: ${String(rawValue).slice(0, 50)}`);
          continue;
        }
        if (Math.abs(v) > Math.abs(lastValue)) lastValue = v;
        if (evalThreshold(v, rule.operator, rule.threshold))
          firingNodes.push({
            host: nodes[i].host,
            name: nodes[i].name || nodes[i].host,
            value: v,
          });
      }
      if (errs.length) errorMsg = errs.join("; "); 
    }
  } catch (err) {
    errorMsg = err?.message || "evaluation failed"; 
  }

  if (errorMsg) errorMsg = String(errorMsg).slice(0, 500);
  const breachedThisRun = firingNodes.length > 0;
  const requiredRuns = rule.breachRunsRequired || 1;
  const breachRunCount = breachedThisRun ? (rule.breachRunCount || 0) + 1 : 0;
  const isFiring = breachedThisRun && breachRunCount >= requiredRuns;
  if (!isFiring) firingNodes = [];
  const status = errorMsg ? "error" : isFiring ? "firing" : "ok";
  db.update(alertRules)
    .set({
      lastRunAt: now.toISOString(),
      lastValue,
      lastStatus: status,
      lastError: errorMsg, 
      isActive: isFiring,
      breachRunCount,
    })
    .where(eq(alertRules.id, rule.id))
    .run();


  if (status !== prevStatus) {
    db.insert(alertEvents)
      .values({
        alertRuleId: rule.id,
        status,
        prevStatus: prevStatus || null,
        value: lastValue,
        error: errorMsg,
      })
      .run();
  }

  const notified = await notify(rule, now, {
    prevStatus,
    status,
    errorMsg,
    firingNodes,
  });
  if (notified) {
    db.update(alertRules)
      .set({
        lastNotifiedAt: now.toISOString(),
        lastState: status,
      })
      .where(eq(alertRules.id, rule.id))
      .run();
  } else {
    db.update(alertRules)
      .set({
        lastState: status,
      })
      .where(eq(alertRules.id, rule.id))
      .run();
  }
}

async function notify(
  rule,
  now,
  { prevStatus, status, errorMsg, firingNodes },
) {
  const links = db
    .select()
    .from(alertRuleChannels)
    .where(eq(alertRuleChannels.alertRuleId, rule.id))
    .all();
  const channels = [];
  for (const link of links) {
    const ch = db
      .select()
      .from(alertChannels)
      .where(eq(alertChannels.id, link.alertChannelId))
      .get();
    if (ch?.enabled) {
      let cfgObj = {};
      try {
       cfgObj = DecryptValuesChannels(ch?.config,ch?.type)
      } catch {}
      channels.push({
        id: ch.id,
        name: ch.name,
        config: { type: ch.type, ...cfgObj },
      });
    }
  }
  if (channels.length === 0) return false;

  const jobs = [];
  const push = (payload) =>
    channels.forEach((ch) =>
      jobs.push(
        sendNotification(ch.config, payload)
          .then(() => recordSendResult(ch.id, true, null))
          .catch((err) => {
            recordSendResult(ch.id, false, err.message);
            log.error("Alert notification failed", {
              channel: ch.name,
              error: err.message,
            });
          }),
      ),
    );

  let dispatched = false;

 
  if (status === "firing") {
    const newlyFiring = prevStatus !== "firing";
    const reminderMinutes = rule.notifyIntervalMinutes || 0;
    let reminderDue = false;
    if (!newlyFiring && reminderMinutes > 0 && rule.lastBreachNotifiedAt) {
      const lastSent = new Date(rule.lastBreachNotifiedAt).getTime();
      reminderDue = now.getTime() - lastSent >= reminderMinutes * 60000;
    }
    if (newlyFiring || reminderDue) {
      for (const fn of firingNodes)
        push({
          ...rule,
          kind: "breach",
          lastValue: fn.value,
          lastRunAt: now.toISOString(),
          firedNode: fn.host,
        });
      db.update(alertRules)
        .set({ lastBreachNotifiedAt: now.toISOString() })
        .where(eq(alertRules.id, rule.id))
        .run();

      dispatched = true;
    }
  }


  if (status === "error" && prevStatus !== "error") {
    push({
      ...rule,
      kind: "failure",
      severity: "critical",
      error: errorMsg,
      lastRunAt: now.toISOString(),
      name: `${rule.name} - evaluation failed`,
    });
    dispatched = true;
  }


  if (status !== "error" && prevStatus === "error") {
    push({
      ...rule,
      kind: "recovery",
      severity: "info",
      lastRunAt: now.toISOString(),
      name: `${rule.name} - recovered`,
    });
    dispatched = true;
  }


  if (status === "ok" && prevStatus === "firing") {
    push({
      ...rule,
      kind: "resolved",
      severity: "info",
      lastRunAt: now.toISOString(),
      name: `${rule.name} - resolved`,
    });
    dispatched = true;
  }

  await Promise.allSettled(jobs);
  return dispatched;
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


export async function notifyBeforeRuleDisabled(ruleId) {
  const rule = db
    .select()
    .from(alertRules)
    .where(eq(alertRules.id, ruleId))
    .get();

  if (!rule) {
    throw new Error("Alert rule not found");
  }

  if (rule.lastState !== "firing") {
    return;
  }

  const now = new Date();

  await notify(rule, now, {
    prevStatus: "firing",
    status: "ok",
    errorMsg: null,
    firingNodes: [],
  });

  db.update(alertRules)
    .set({
      lastState: "ok",
      lastStatus: "ok",
      isActive: false,
    })
    .where(eq(alertRules.id, ruleId))
    .run();
}


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
    [0, 7],
  ];
  const names = ["minute", "hour", "day-of-month", "month", "day-of-week"];
  for (let i = 0; i < 5; i++) {
    const p = parts[i];
    if (p === "*") continue;
    if (p.startsWith("*/")) {
      const n = parseInt(p.slice(2), 10);
      if (!Number.isInteger(n) || n < 1)
        return `Invalid step in
${names[i]}: ${p}`;
      continue;
    }
    for (const v of p.split(",")) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < ranges[i][0] || n > ranges[i][1])
        return `CRON ERROR : ${names[i]} value out of range or unsupported syntax:
${v}`;
    }
  }
  return null;
}
