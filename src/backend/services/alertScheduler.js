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
import { log } from './logger.js';

import { eq } from 'drizzle-orm';
import { db, alertRules, alertChannels, alertRuleChannels } from '../db/index.js';
import { executeQuery } from './clickhouse.js';
import { sendNotification } from './notifier.js';
import { getClusterNodes } from './clusterUtils.js';

// Cluster nodes loaded from clusterUtils.getClusterNodes()

function cronMatches(expr, date) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const fields = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  for (let i = 0; i < 5; i++) {
    const spec = parts[i];
    if (spec === '*') continue;
    if (spec.startsWith('*/')) { if (fields[i] % parseInt(spec.slice(2), 10) !== 0) return false; continue; }
    if (!spec.split(',').map(Number).includes(fields[i])) return false;
  }
  return true;
}

function evalThreshold(value, operator, threshold) {
  switch (operator) {
    case 'gt': return value > threshold;   case 'gte': return value >= threshold;
    case 'lt': return value < threshold;   case 'lte': return value <= threshold;
    case 'eq': return value === threshold; case 'neq': return value !== threshold;
    default: return false;
  }
}

/**
 * Evaluate a single alert rule against all cluster nodes in parallel.
 * Returns the aggregated max absolute value, fires notifications if threshold breached.
 */
// async function evaluateRule(rule, allNodes, now) {
//   try {
//     // If the rule specifies target nodes, only query those.
//     let nodes = allNodes;
//     if (rule.nodes) {
//       try {
//         const selected = JSON.parse(rule.nodes);
//         if (Array.isArray(selected) && selected.length > 0) {
//           nodes = allNodes.filter(n => selected.includes(n.host));
//         }
//       } catch {}
//     }
//     if (nodes.length === 0) return;

//     // Query all target nodes in parallel
//     const nodeResults = await Promise.allSettled(
//       nodes.map(node =>
//         executeQuery({
//           host: node.host, port: node.port, secure: !!node.secure,
//           user: node.user, password: node.password, sql: rule.sql,
//         })
//       )
//     );

//     // Evaluate each node independently. Each node that breaches the threshold
//     // gets its own notification with that node's name and value.
//     const firingNodes = [];
//     let lastValue = 0;

//     for (let i = 0; i < nodeResults.length; i++) {
//       const r = nodeResults[i];
//       if (r.status !== 'fulfilled' || !r.value.rows?.length) continue;
//       const v = parseFloat(Object.values(r.value.rows[0])[0]) || 0;
//       if (Math.abs(v) > Math.abs(lastValue)) lastValue = v;
//       if (evalThreshold(v, rule.operator, rule.threshold)) {
//         firingNodes.push({ host: nodes[i].host, name: nodes[i].name || nodes[i].host, value: v });
//       }
//     }

//     const isFiring = firingNodes.length > 0;

//     db.update(alertRules).set({
//       lastRunAt: now.toISOString(), lastValue,
//       lastStatus: isFiring ? 'firing' : 'ok', lastError: null,
//       isActive: isFiring,
//     }).where(eq(alertRules.id, rule.id)).run();

//     if (isFiring) {
//       // Load channels once, then send one notification per firing node per channel
//       const links = db.select().from(alertRuleChannels).where(eq(alertRuleChannels.alertRuleId, rule.id)).all();
//       const channels = [];
//       for (const link of links) {
//         const ch = db.select().from(alertChannels).where(eq(alertChannels.id, link.alertChannelId)).get();
//         if (ch?.enabled) {
//           let cfgObj = {};
//           try { cfgObj = typeof ch.config === 'string' ? JSON.parse(ch.config) : (ch.config || {}); } catch {}
//           channels.push({ name: ch.name, config: { type: ch.type, ...cfgObj } });
//         }
//       }

//       // Send all notifications in parallel (nodes x channels)
//       const notifyPromises = [];
//       for (const fn of firingNodes) {
//         for (const ch of channels) {
//           notifyPromises.push(
//             sendNotification(ch.config, { ...rule, lastValue: fn.value, lastRunAt: now.toISOString(), firedNode: fn.host })
//               .catch(err => log.error('Alert notification failed', { channel: ch.name, node: fn.host, error: err.message }))
//           );
//         }
//       }
//       await Promise.allSettled(notifyPromises);
//     }
//   } catch (err) {
//     db.update(alertRules).set({
//       lastRunAt: now.toISOString(), lastStatus: 'error',
//       lastError: err.message?.substring(0, 500), isActive: false,
//     }).where(eq(alertRules.id, rule.id)).run();
//   }
// }

async function evaluateRule(rule, allNodes, now) {
  const prevStatus = rule.lastStatus;   // 'ok' | 'firing' | 'error' | null
  let errorMsg = null;
  let firingNodes = [];
  let lastValue = 0;

  try {
    // Resolve target nodes.
    let nodes = allNodes;
    if (rule.nodes) {
      try {
        const selected = JSON.parse(rule.nodes);
        if (Array.isArray(selected) && selected.length > 0)
          nodes = allNodes.filter(n => selected.includes(n.host));
      } catch {}
    }
    if (nodes.length === 0) errorMsg = 'No target nodes resolved for this rule';

    if (!errorMsg) {
      const nodeResults = await Promise.allSettled(
        nodes.map(node =>
          executeQuery({
            host: node.host, port: node.port, secure: !!node.secure,
            user: node.user, password: node.password, sql: rule.sql,
          })
        )
      );

      const errs = [];
      for (let i = 0; i < nodeResults.length; i++) {
        const r = nodeResults[i];
        if (r.status === 'rejected') {                       // <-- was silently skipped
          errs.push(`${nodes[i].name || nodes[i].host}: ${r.reason?.message || 'query failed'}`);
          continue;
        }
        if (!r.value.rows?.length) continue;
        const v = parseFloat(Object.values(r.value.rows[0])[0]) || 0;
        if (Math.abs(v) > Math.abs(lastValue)) lastValue = v;
        if (evalThreshold(v, rule.operator, rule.threshold))
          firingNodes.push({ host: nodes[i].host, name: nodes[i].name || nodes[i].host, value: v });
      }
      if (errs.length) errorMsg = errs.join('; ');           // any node error = failed run
    }
  } catch (err) {
    errorMsg = err?.message || 'evaluation failed';           // rule-level failure
  }

  if (errorMsg) errorMsg = String(errorMsg).slice(0, 500);
  const isFiring = firingNodes.length > 0;
  const status = errorMsg ? 'error' : (isFiring ? 'firing' : 'ok');

  db.update(alertRules).set({
    lastRunAt: now.toISOString(),
    lastValue,
    lastStatus: status,
    lastError: errorMsg,          // null when healthy
    isActive: isFiring,
  }).where(eq(alertRules.id, rule.id)).run();

  await notify(rule, now, { prevStatus, status, errorMsg, firingNodes });
}

async function notify(rule, now, { prevStatus, status, errorMsg, firingNodes }) {
  const links = db.select().from(alertRuleChannels)
    .where(eq(alertRuleChannels.alertRuleId, rule.id)).all();
  const channels = [];
  for (const link of links) {
    const ch = db.select().from(alertChannels)
      .where(eq(alertChannels.id, link.alertChannelId)).get();
    if (ch?.enabled) {
      let cfgObj = {};
      try { cfgObj = typeof ch.config === 'string' ? JSON.parse(ch.config) : (ch.config || {}); } catch {}
      channels.push({ name: ch.name, config: { type: ch.type, ...cfgObj } });
    }
  }
  if (channels.length === 0) return;

  const jobs = [];
  const push = (payload) => channels.forEach(ch =>
    jobs.push(
      sendNotification(ch.config, payload)
        .catch(err => log.error('Alert notification failed', { channel: ch.name, error: err.message }))
    ));

  // (a) Threshold breach - existing behaviour, one per firing node.
  if (status === 'firing') {
    for (const fn of firingNodes)
      push({ ...rule, kind: 'breach', lastValue: fn.value, lastRunAt: now.toISOString(), firedNode: fn.host });
  }

  // (b) Failure edge: was healthy, now errored -> notify once, with the exception.
  if (status === 'error' && prevStatus !== 'error') {
    push({ ...rule, kind: 'failure', severity: 'critical', error: errorMsg,
           lastRunAt: now.toISOString(), name: `${rule.name} - evaluation failed` });
  }

  // (c) Recovery edge: was errored, now healthy again.
  if (status !== 'error' && prevStatus === 'error') {
    push({ ...rule, kind: 'recovery', severity: 'info',
           lastRunAt: now.toISOString(), name: `${rule.name} - recovered` });
  }

  await Promise.allSettled(jobs);
}


let interval = null;

export function startScheduler(env) {
  if (interval) return;

  async function tick() {
    const now = new Date();
    let rules;
    try { rules = db.select().from(alertRules).where(eq(alertRules.enabled, true)).all(); }
    catch { return; }

    // Filter to rules that are due and haven't already run this minute
    const dueRules = rules.filter(rule => {
      if (!cronMatches(rule.schedule, now)) return false;
      if (rule.lastRunAt) {
        const last = new Date(rule.lastRunAt);
        if (last.getMinutes() === now.getMinutes() && last.getHours() === now.getHours() && last.getDate() === now.getDate()) return false;
      }
      return true;
    });

    if (dueRules.length === 0) return;

    // Evaluate all due rules in parallel, each on its own cluster
    await Promise.allSettled(
      dueRules.map(rule => {
        const ruleNodes = getClusterNodes(rule.clusterId || null);
        if (ruleNodes.length === 0) return Promise.resolve(); // no nodes for this cluster
        return evaluateRule(rule, ruleNodes, now);
      })
    );
  }

  tick();
  interval = setInterval(tick, 60000);
  log.info('Alert scheduler started (60s interval)');
}
