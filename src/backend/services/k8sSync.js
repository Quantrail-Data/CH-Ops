// Background refresh of the host list for Kubernetes-derived clusters.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Praveen kumar, Kathirdhasan

import { log } from './logger.js';
import {
  getAllClusters,
  updateClusterNodes,
  findStaleNodes,
  removeNodes,
} from './clusterUtils.js';
import { readInstallationAddresses, ADDRESSING, RESOLUTION } from './k8sConnections.js';
import { getConfig } from './appConfig.js';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

// A host must be absent from this many consecutive successful refreshes before it is removed.

const MISSES_BEFORE_REMOVAL = getConfig('k8s.missesBeforeRemoval') ?? 3;

// Retries when the version check fails, meaning somebody wrote in between.
const MAX_VERSION_RETRIES = 3;

let interval = null;
let running = false;

// Refresh outcomes, kept in memory
const lastResult = new Map();

export function getLastResult(clusterId) {
  return lastResult.get(clusterId) ?? null;
}

// The background refresh keeps the addressing that the cluster uses now.
// Thus one failed probe does not move every host to the shared endpoint.
function backgroundAddressingMode(cluster) {
  const resolution = cluster.k8sAddressing?.resolution;
  if (resolution === RESOLUTION.ENDPOINT) return ADDRESSING.ENDPOINT;
  if (resolution === RESOLUTION.FQDN) return ADDRESSING.PER_POD;
  return cluster.k8sAddressing?.mode || ADDRESSING.AUTO;
}

// Refresh one cluster.
export async function refreshOne(cluster) {
  const started = Date.now();

  if (cluster.kind !== 'k8s' || !cluster.k8s?.connectionId) {
    return { clusterId: cluster.id, ok: false, reason: 'not-a-kubernetes-cluster' };
  }

  let hosts;
  try {
    // Use the same addresses as the import. Each pod keeps its own address when it has one.
    const addressing = await readInstallationAddresses({
      connectionId: cluster.k8s.connectionId,
      namespace: cluster.k8s.namespace,
      installation: cluster.k8s.installation,
      operator: cluster.k8s.operator,
      endpoint: cluster.endpoint || cluster.nodes[0]?.host,
      port: cluster.port,
      secure: cluster.secure,
      user: cluster.chUser || 'default',
      password: cluster.chPassword || '',
      mode: backgroundAddressingMode(cluster),
    });
    hosts = addressing.nodes;
  } catch (err) {
    // The cluster keeps the node list it already had.
    const result = {
      clusterId: cluster.id,
      ok: false,
      reason: 'unreachable',
      code: err.code ?? null,
      message: err.message,
      at: new Date().toISOString(),
    };
    lastResult.set(cluster.id, result);
    return result;
  }

  if (!hosts.length) {
    // An installation that reports nothing is more likely to be mid reconcile than genuinely empty.
    const result = {
      clusterId: cluster.id,
      ok: false,
      reason: 'no-hosts-reported',
      at: new Date().toISOString(),
    };
    lastResult.set(cluster.id, result);
    return result;
  }

  // Optimistic concurrency.
  let applied = false;
  let attempt = 0;
  let currentVersion = cluster.version;

  while (!applied && attempt < MAX_VERSION_RETRIES) {
    applied = updateClusterNodes(cluster.id, hosts, currentVersion);
    if (!applied) {
      attempt += 1;
      const fresh = getAllClusters().find((c) => c.id === cluster.id);
      if (!fresh) break; // deleted while we were working
      currentVersion = fresh.version;
    }
  }

  if (!applied) {
    const result = {
      clusterId: cluster.id,
      ok: false,
      reason: 'write-conflict',
      at: new Date().toISOString(),
    };
    lastResult.set(cluster.id, result);
    return result;
  }

  const removed = pruneMissingHosts(cluster.id);

  const result = {
    clusterId: cluster.id,
    ok: true,
    hosts: hosts.length,
    removed,
    durationMs: Date.now() - started,
    at: new Date().toISOString(),
  };
  lastResult.set(cluster.id, result);
  return result;
}

// Remove hosts that have been absent from several consecutive refreshes.
export function pruneMissingHosts(clusterId, intervalMs = DEFAULT_INTERVAL_MS) {
  const cutoff = new Date(Date.now() - MISSES_BEFORE_REMOVAL * intervalMs).toISOString();
  const stale = findStaleNodes(clusterId, cutoff);
  if (!stale.length) return 0;

  removeNodes(clusterId, stale.map((n) => n.id));
  log?.info?.(
    `k8s sync: removed ${stale.length} host(s) from ${clusterId} after ${getConfig('k8s.missesBeforeRemoval')} missed refreshes`,
  );
  return stale.length;
}

// Refresh every Kubernetes cluster.
export async function refreshAll() {
  const clusters = getAllClusters().filter((c) => c.kind === 'k8s');
  const results = [];

  for (const cluster of clusters) {
    results.push(await refreshOne(cluster));
  }

  return results;
}

// Start the timer.
export function startK8sSync({ intervalMs = getConfig('k8s.syncIntervalMs') } = {}) {
  if (interval) return;

  async function tick() {
    // Overlap guard.
    if (running) return;
    running = true;
    try {
      const results = await refreshAll();
      for (const f of results.filter((r) => !r.ok)) {
        log?.warn?.(`k8s sync: ${f.clusterId} did not refresh (${f.reason})`);
      }
    } catch (err) {
      log?.error?.('k8s sync: unexpected failure: ' + err.message);
    } finally {
      running = false;
    }
  }

  // Do not run immediately on boot.
  interval = setInterval(tick, intervalMs);
  interval.unref?.();
}

export function restartK8sSync() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  startK8sSync({ intervalMs: getConfig('k8s.syncIntervalMs') });
}

export function stopK8sSync() {
  if (interval) clearInterval(interval);
  interval = null;
  running = false;
}
