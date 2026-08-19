// Contributors -> Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Probes what a ClickHouse® endpoint supports, plus session affinity and user storage.

import { executeQuery } from './clickhouse.js';
import { getClusterById } from './clusterUtils.js';
import { setAffinityResult } from './k8sConnections.js';

// Cached per cluster.
const cache = new Map();

export const CAPABILITY = {
  REPLICATION_QUEUE: 'system.replication_queue',
  REPLICATED_FETCHES: 'system.replicated_fetches',
  DISTRIBUTION_QUEUE: 'system.distribution_queue',
  REPLICAS: 'system.replicas',
  DISKS: 'system.disks',
  TEXT_LOG: 'system.text_log',
  SESSION_LOG: 'system.session_log',
  CRASH_LOG: 'system.crash_log',
  TRACE_LOG: 'system.trace_log',
  QUERY_LOG: 'system.query_log',
  ZOOKEEPER_CONNECTION: 'system.zookeeper_connection',
  JEMALLOC_STATS: 'system.jemalloc_stats',
};

// Explanations shown in place of an empty screen.
const EXPLANATIONS = {
  [CAPABILITY.REPLICATION_QUEUE]:
    'Replication monitoring is not available on this deployment. SharedMergeTree does not use a replication queue.',
  [CAPABILITY.REPLICATED_FETCHES]:
    'Fetch monitoring is not available on this deployment. SharedMergeTree does not replicate parts between nodes.',
  [CAPABILITY.DISKS]:
    'Disk metrics are not meaningful on this deployment, which stores data in object storage rather than on local disks.',
  [CAPABILITY.TEXT_LOG]: 'Server text logging is not enabled on this deployment.',
  [CAPABILITY.SESSION_LOG]:
    'Session logging is not enabled on this deployment. It is switched off by default in ClickHouse®.',
  [CAPABILITY.CRASH_LOG]: 'Crash logs are not available on this deployment.',
  [CAPABILITY.TRACE_LOG]:
    'Query profiling is not available on this deployment, which requires trace logging.',
};

// executeQuery returns { rows, columns, stats, queryId }, never a bare array.
function rowsOf(result) {
  return result?.rows ?? [];
}

// Ask the server which system tables exist.
export async function probeCapabilities(clusterId, node) {
  const cached = cache.get(clusterId);
  if (cached) return cached;

  let result;
  try {
    result = await executeQuery({
      host: node.host,
      port: node.port,
      secure: node.secure,
      user: node.user,
      password: node.password,
      readOnly: true,
      timeoutMs: 10000,
      sql: "SELECT name FROM system.tables WHERE database = 'system'",
    });
  } catch (err) {
    // A failed probe must not block the connection.
    return { probed: false, error: err.message, tables: null, deployment: 'unknown' };
  }

  const names = new Set(rowsOf(result).map((r) => `system.${r.name}`));

  // SharedMergeTree keeps every ReplicatedMergeTree introspection table except the
  const sharedMergeTree =
    names.has(CAPABILITY.REPLICAS) &&
    !names.has(CAPABILITY.REPLICATION_QUEUE) &&
    !names.has(CAPABILITY.REPLICATED_FETCHES);

  const entry = {
    probed: true,
    tables: names,
    deployment: sharedMergeTree ? 'shared-merge-tree' : 'standard',
  };

  cache.set(clusterId, entry);
  return entry;
}

export function clearCapabilities(clusterId) {
  if (clusterId) cache.delete(clusterId);
  else cache.clear();
}

// Probe if it has not been probed, then return.
export async function ensureCapabilities(clusterId) {
  if (cache.has(clusterId)) return cache.get(clusterId);

  const cluster = getClusterById(clusterId);
  const node = cluster?.nodes?.[0];
  if (!node) return { probed: false, tables: null, deployment: 'unknown' };

  return probeCapabilities(clusterId, node);
}

// Can this screen work?
export function hasCapability(clusterId, table) {
  const entry = cache.get(clusterId);
  if (!entry?.probed || !entry.tables) return true;
  return entry.tables.has(table);
}

export function explain(table) {
  return EXPLANATIONS[table] ?? 'This feature is not available on this deployment.';
}

// Everything unavailable on this cluster, for a summary panel.
export function unavailableFeatures(clusterId) {
  const entry = cache.get(clusterId);
  if (!entry?.probed || !entry.tables) return [];
  return Object.values(CAPABILITY)
    .filter((t) => !entry.tables.has(t) && EXPLANATIONS[t])
    .map((t) => ({ table: t, message: EXPLANATIONS[t] }));
}

// Does this endpoint keep a connection on one replica?
export async function probeSessionAffinity(node) {
  const call = () =>
    executeQuery({
      host: node.host,
      port: node.port,
      secure: node.secure,
      user: node.user,
      password: node.password,
      readOnly: true,
      timeoutMs: 10000,
      sql: 'SELECT hostName() AS h',
    });

  try {
    const [first, second] = await Promise.all([call(), call()]);
    const a = rowsOf(first)[0]?.h ?? null;
    const b = rowsOf(second)[0]?.h ?? null;

    if (!a || !b) return { checked: false, sticky: null };
    return { checked: true, sticky: a === b, hosts: [a, b] };
  } catch {
    return { checked: false, sticky: null };
  }
}

// Classify ClickHouse® users by where they are stored.
export async function classifyUsers(node) {
  try {
    const result = await executeQuery({
      host: node.host,
      port: node.port,
      secure: node.secure,
      user: node.user,
      password: node.password,
      readOnly: true,
      timeoutMs: 10000,
      sql: 'SELECT name, storage FROM system.users',
    });

    const list = rowsOf(result);
    return {
      checked: true,
      users: list.map((u) => ({
        name: u.name,
        storage: u.storage,
        // XML-backed users are operator-owned.
        readOnly: u.storage === 'users_xml',
        nodeLocal: u.storage === 'local_directory',
      })),
      // When access storage is replicated, none of the ON CLUSTER warnings apply and the interface should stay quiet.
      accessStorageReplicated: list.some((u) => u.storage === 'replicated'),
    };
  } catch (err) {
    return { checked: false, error: err.message, users: [], accessStorageReplicated: false };
  }
}

// Everything the RBAC screens need to decide what to show.
export async function rbacContext(clusterId) {
  const cluster = getClusterById(clusterId);
  if (!cluster) return null;

  const node = cluster.nodes?.[0];
  if (!node) return null;

  const [users, affinity] = await Promise.all([
    classifyUsers(node),
    probeSessionAffinity(node),
  ]);

  // Record the affinity answer against the connection
  if (affinity.checked && cluster.k8s?.connectionId) {
    try {
      setAffinityResult(cluster.k8s.connectionId, affinity.sticky);
    } catch {
      // Persisting is a convenience.
    }
  }

  return {
    replicaCount: cluster.nodes.length,
    // Kubernetes clusters know their own cluster name
    defaultOnCluster: cluster.kind === 'k8s' ? (cluster.k8s?.installation ?? null) : null,
    warnAboutOnCluster: cluster.nodes.length > 1 && !users.accessStorageReplicated,
    users: users.users,
    accessStorageReplicated: users.accessStorageReplicated,
    sessionAffinity: affinity,
  };
}
