// k8sHealthAlerts.js - Sends a notification when a Kubernetes health check fails or recovers.
// Copyright (C) 2026 Quantrail Data Private Limited

import { eq, and } from "drizzle-orm";
import {
  db,
  k8sHealthState,
  k8sHealthAlertConfigs,
  alertChannels,
} from "../db/index.js";
import { runHealthChecks } from "./k8sHealth.js";
import { getClusterById } from "./clusterUtils.js";
import { decideHealthNotification } from "./k8sHealthDecision.js";
import { sendNotification } from "./notifier.js";
import { DecryptValuesChannels } from "../controllers/alerts.js";
import { log } from "./logger.js";

// The checks of a cluster run at most one time in this period.
const RUN_EVERY_MILLISECONDS = 15 * 60 * 1000;

// The alert scheduler calls this function one time each minute.
export async function runK8sHealthAlerts(now) {
  const enabledConfigs = db
    .select()
    .from(k8sHealthAlertConfigs)
    .where(eq(k8sHealthAlertConfigs.enabled, true))
    .all();

  for (const config of enabledConfigs) {
    // The cluster does not exist now. Remove its settings and states, so that they do not run again.
    if (!getClusterById(config.clusterId)) {
      db.delete(k8sHealthState)
        .where(eq(k8sHealthState.clusterId, config.clusterId))
        .run();
      db.delete(k8sHealthAlertConfigs)
        .where(eq(k8sHealthAlertConfigs.clusterId, config.clusterId))
        .run();
      continue;
    }

    const lastRunTime = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;
    if (now.getTime() - lastRunTime < RUN_EVERY_MILLISECONDS) continue;

    db.update(k8sHealthAlertConfigs)
      .set({ lastRunAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(k8sHealthAlertConfigs.clusterId, config.clusterId))
      .run();

    try {
      await checkCluster(config, now);
    } catch (error) {
      log.error("Kubernetes health alert run failed", {
        clusterId: config.clusterId,
        error: error.message,
      });
    }
  }
}

// Runs the checks of one cluster, stores the new states and sends the notifications.
async function checkCluster(config, now) {
  const report = await runHealthChecks(config.clusterId);
  const channels = loadChannels(config);

  for (const check of report.checks) {
    const storedState = db
      .select()
      .from(k8sHealthState)
      .where(
        and(
          eq(k8sHealthState.clusterId, config.clusterId),
          eq(k8sHealthState.checkName, check.name),
        ),
      )
      .get();

    const nextState = decideHealthNotification(storedState, check.ok);
    const stateValues = {
      status: nextState.status,
      consecutiveFails: nextState.consecutiveFails,
      notified: nextState.notified,
      updatedAt: now.toISOString(),
    };
    if (storedState) {
      db.update(k8sHealthState)
        .set(stateValues)
        .where(eq(k8sHealthState.id, storedState.id))
        .run();
    } else {
      db.insert(k8sHealthState)
        .values({ clusterId: config.clusterId, checkName: check.name, ...stateValues })
        .run();
    }

    if (nextState.notification && channels.length > 0) {
      await sendHealthNotification(config, check, nextState.notification, channels, now);
    }
  }
}

// Returns the channels of the cluster with decrypted secrets. It skips disabled channels.
function loadChannels(config) {
  let channelIds = [];
  try {
    channelIds = JSON.parse(config.channelsJson || "[]");
  } catch {
    channelIds = [];
  }

  const channels = [];
  for (const channelId of channelIds) {
    const channel = db
      .select()
      .from(alertChannels)
      .where(eq(alertChannels.id, channelId))
      .get();
    if (!channel?.enabled) continue;

    // The database keeps the secrets encrypted. The alert scheduler decrypts them the same way.
    let channelConfig;
    try {
      channelConfig = DecryptValuesChannels(channel.config, channel.type);
    } catch (error) {
      log.error("Kubernetes health alert channel could not be read", {
        channel: channel.name,
        error: error.message,
      });
      continue;
    }
    channels.push({
      name: channel.name,
      config: { type: channel.type, ...channelConfig },
    });
  }
  return channels;
}

async function sendHealthNotification(config, check, notification, channels, now) {
  const isFailure = notification === "failure";
  const alert = {
    // The same id for the failure and the recovery, so PagerDuty closes the incident it opened.
    id: `k8s-health-${config.clusterId}-${check.name}`,
    clusterId: config.clusterId,
    kind: notification,
    severity: isFailure ? "critical" : "info",
    name: `Kubernetes health: ${check.name}`,
    description: check.detail,
    error: isFailure ? check.detail : null,
    schedule: "every 15 minutes",
    lastRunAt: now.toISOString(),
  };

  for (const channel of channels) {
    try {
      await sendNotification(channel.config, alert);
    } catch (error) {
      log.error("Kubernetes health notification failed", {
        channel: channel.name,
        error: error.message,
      });
    }
  }
}
