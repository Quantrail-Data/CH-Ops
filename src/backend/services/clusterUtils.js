// clusterUtils.js - shared cluster data access for all services
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> kathir Moorthy

import { eq, and } from 'drizzle-orm';
import { db, appSettings, clusters as clusterTable, clusterNodes } from '../db/index.js';
import { encrypt, decrypt } from './crypto.js';
import { getStorageMode, STORAGE_TABLES } from '../db/migrateClusters.js';

const MAX_CLUSTERS = 3;
const MAX_TOTAL_NODES = 18;

// Blob path.

function readClustersFromBlob() {
  try {
    const row = db.select().from(appSettings).where(eq(appSettings.key, 'clusters')).get();
    if (!row?.value) return [];
    const clusters = JSON.parse(row.value);
    return clusters.map(c => ({
      ...c,
      nodes: (c.nodes || []).map(n => ({ ...n, password: decrypt(n.password || '') })),
    }));
  } catch { return []; }
}

function saveClustersToBlob(clusters) {
  // Encrypt passwords before storing
  const encrypted = clusters.map(c => ({
    ...c,
    nodes: (c.nodes || []).map(n => ({
      name: n.name || '', host: n.host, port: n.port || 8123,
      user: n.user || 'default', password: encrypt(n.password || ''),
      secure: !!n.secure,
    })),
  }));

  const value = JSON.stringify(encrypted);
  const existing = db.select().from(appSettings).where(eq(appSettings.key, 'clusters')).get();
  if (existing) db.update(appSettings).set({ value }).where(eq(appSettings.key, 'clusters')).run();
  else db.insert(appSettings).values({ key: 'clusters', value, category: 'cluster' }).run();
}

// Table path.

// Assemble the exact object shape callers have always received.
function rowsToCluster(clusterRow, nodeRows) {
  return {
    id: clusterRow.id,
    name: clusterRow.name,
    kind: clusterRow.kind,
    version: clusterRow.version,
    chUser: clusterRow.chUser || null,
    hasClusterPassword: !!clusterRow.chPasswordEnc,
    chPassword: decrypt(clusterRow.chPasswordEnc || ''),
    endpoint: clusterRow.endpoint || null,
    port: clusterRow.port ?? 8123,
    secure: !!clusterRow.secure,
    k8s: clusterRow.kind === 'k8s'
      ? {
        connectionId: clusterRow.k8sConnectionId,
        namespace: clusterRow.k8sNamespace,
        installation: clusterRow.k8sInstallation,
        operator: clusterRow.k8sOperator || 'akoc',
        lastRefreshedAt: clusterRow.lastRefreshedAt,
      }
      : null,
    nodes: nodeRows.map(n => ({
      name: n.name,
      host: n.host,
      port: n.port ?? clusterRow.port ?? 8123,
      user: n.user || clusterRow.chUser || 'default',
      password: decrypt(n.passwordEnc || clusterRow.chPasswordEnc || ''),
      secure: !!(n.secure ?? clusterRow.secure),
      source: n.source,
      shard: n.shard,
      replica: n.replica,
      podName: n.podName,
    })),
  };
}

function readClustersFromTables() {
  const clusterRows = db.select().from(clusterTable).all();
  if (!clusterRows.length) return [];

  const allNodes = db.select().from(clusterNodes).all();
  const byCluster = new Map();
  for (const n of allNodes) {
    if (!byCluster.has(n.clusterId)) byCluster.set(n.clusterId, []);
    byCluster.get(n.clusterId).push(n);
  }

  return clusterRows.map(c => rowsToCluster(c, byCluster.get(c.id) || []));
}

// Diff the incoming list against what is stored and write the difference.
function ensureUniqueClusterNames(clusters, existingRows = []) {
  const used = new Set((existingRows || []).map(c => (c.name || '').trim().toLowerCase()));
  const names = [];

  return clusters.map((cluster, index) => {
    const baseName = (cluster.name || '').trim() || `Cluster ${index + 1}`;
    let candidate = baseName;
    let suffix = 2;
    let normalized = candidate.trim().toLowerCase();

    while (used.has(normalized)) {
      candidate = `${baseName} ${suffix}`;
      normalized = candidate.trim().toLowerCase();
      suffix += 1;
    }

    used.add(normalized);
    names.push(candidate);
    return {
      ...cluster,
      id: cluster.id || `cluster_${index + 1}`,
      name: candidate,
    };
  });
}

function saveClustersToTables(clusters) {
  const existing = db.select().from(clusterTable).all();
  const normalizedClusters = ensureUniqueClusterNames(clusters, existing);
  const existingIds = new Set(existing.map(c => c.id));
  const incomingIds = new Set(normalizedClusters.map(c => c.id));

  db.transaction(() => {
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        db.delete(clusterNodes).where(eq(clusterNodes.clusterId, id)).run();
        db.delete(clusterTable).where(eq(clusterTable.id, id)).run();
      }
    }

    for (const cluster of normalizedClusters) {
      const isK8s = cluster.kind === 'k8s';
      const first = cluster.nodes?.[0];
      const values = {
        name: cluster.name,
        kind: cluster.kind || 'direct',
        port: cluster.port ?? first?.port ?? 8123,
        secure: cluster.secure ?? !!first?.secure,
        chUser: cluster.chUser ?? null,
        endpoint: cluster.endpoint ?? null,
        k8sConnectionId: cluster.k8s?.connectionId ?? null,
        k8sNamespace: cluster.k8s?.namespace ?? null,
        k8sInstallation: cluster.k8s?.installation ?? null,
        k8sOperator: cluster.k8s?.operator || 'akoc',
        updatedAt: new Date().toISOString(),
      };
      // Only overwrite the stored cluster password when one was supplied
      if (cluster.chPassword !== undefined) {
        values.chPasswordEnc = encrypt(cluster.chPassword || '');
      }

      if (existingIds.has(cluster.id)) {
        db.update(clusterTable).set(values).where(eq(clusterTable.id, cluster.id)).run();
      } else {
        db.insert(clusterTable).values({ id: cluster.id, version: 1, ...values }).run();
      }

      // Replace the node set wholesale, mirroring what the blob did.
      db.delete(clusterNodes).where(eq(clusterNodes.clusterId, cluster.id)).run();
      for (const n of cluster.nodes || []) {
        db.insert(clusterNodes).values({
          clusterId: cluster.id,
          name: n.name || '',
          host: n.host,
          port: n.port || 8123,
          user: n.user || null,
          passwordEnc: n.password !== undefined ? encrypt(n.password || '') : null,
          secure: !!n.secure,
          source: isK8s ? 'k8s' : 'manual',
          shard: n.shard ?? null,
          replica: n.replica ?? null,
          podName: n.podName ?? null,
          lastSeenAt: new Date().toISOString(),
        }).run();
      }
    }
  });
}

// Public API.

export function getAllClusters() {
  if (getStorageMode() === STORAGE_TABLES) return readClustersFromTables();
  return readClustersFromBlob();
}

// Strip decrypted node passwords from anything about to leave the server
export function maskClusterPasswords(cluster) {
  const { chPassword, ...rest } = cluster;
  return {
    ...rest,
    hasChPassword: !!chPassword,
    nodes: (cluster.nodes || []).map(({ password, ...node }) => ({
      ...node,
      hasPassword: !!password,
    })),
  };
}

export function getClusterById(clusterId) {
  if (!clusterId) return null;
  return getAllClusters().find(c => c.id === clusterId) || null;
}

export function getNodeByName(cluster, clusterName) {
  if (!cluster?.nodes || !clusterName) return null;

  return cluster.nodes.find(node => node.name === clusterName) || null;
}

// Get nodes for a specific cluster.
export function getClusterNodes(clusterId) {
  const clusters = getAllClusters();
  if (!clusters.length) return [];
  if (clusterId) {
    const cluster = clusters.find(c => c.id === clusterId);
    return cluster?.nodes || [];
  }
  return clusters[0]?.nodes || [];
}

// Get the first cluster (for backwards compatibility with services that don't have a clusterId)
export function getDefaultCluster() {
  const clusters = getAllClusters();
  return clusters[0] || null;
}

export function saveClusters(clusters) {
  if (clusters.length > MAX_CLUSTERS) throw new Error(`Maximum ${MAX_CLUSTERS} clusters allowed.`);

  // Names must be unique, compared without case
  const names = clusters.map((c) => (c.name || '').trim().toLowerCase());
  const duplicate = names.find((n, i) => n && names.indexOf(n) !== i);
  if (duplicate) {
    const original = clusters.find((c) => (c.name || '').trim().toLowerCase() === duplicate);
    throw new Error(`Cluster name must be unique. "${original.name}" is already in use.`);
  }

  // The node cap applies to hand-entered clusters only.
  const totalNodes = clusters
    .filter(c => c.kind !== 'k8s')
    .reduce((sum, c) => sum + (c.nodes?.length || 0), 0);
  if (totalNodes > MAX_TOTAL_NODES) throw new Error(`Maximum ${MAX_TOTAL_NODES} total nodes across all clusters.`);

  if (getStorageMode() === STORAGE_TABLES) return saveClustersToTables(clusters);
  return saveClustersToBlob(clusters);
}

/**
 * Replace the node list of one cluster, guarding against a concurrent write.
 *
 * Only the Kubernetes refresh calls this. It reads the cluster's version, sends
 * it back, and the update applies only if nobody else wrote in between. A false
 * return means somebody did, and the caller re-reads and retries rather than
 * overwriting their change.
 *
 * @returns {boolean} true if the update applied
 */
export function updateClusterNodes(clusterId, nodes, expectedVersion) {
  if (getStorageMode() !== STORAGE_TABLES) {
    throw new Error('updateClusterNodes requires table storage. Run the migration first.');
  }

  const result = db
    .update(clusterTable)
    .set({
      version: expectedVersion + 1,
      lastRefreshedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(clusterTable.id, clusterId), eq(clusterTable.version, expectedVersion)))
    .run();

  const changed = (result?.changes ?? result?.rowsAffected ?? 0) > 0;
  if (!changed) return false;

  db.transaction(() => {
    const existing = db
      .select()
      .from(clusterNodes)
      .where(eq(clusterNodes.clusterId, clusterId))
      .all();
    // Identity is shard and replica position, never the name.
    const existingByIdentity = new Map(
      existing.map(n => [`${n.shard}/${n.replica}`, n]),
    );
    const now = new Date().toISOString();

    for (const node of nodes) {
      const identity = `${node.shard}/${node.replica}`;
      const prior = existingByIdentity.get(identity);

      if (prior) {
        db.update(clusterNodes)
          .set({
            name: node.name,
            host: node.host,
            port: node.port || 8123,
            podName: node.podName ?? null,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(clusterNodes.id, prior.id))
          .run();
      } else {
        db.insert(clusterNodes).values({
          clusterId,
          name: node.name,
          host: node.host,
          port: node.port || 8123,
          user: null,
          passwordEnc: null,
          secure: !!node.secure,
          source: 'k8s',
          shard: node.shard ?? null,
          replica: node.replica ?? null,
          podName: node.podName ?? null,
          lastSeenAt: now,
        }).run();
      }
    }

    // Anything absent from this round keeps its old lastSeenAt and stays in place.
  });

  return true;
}

// Kubernetes-sourced nodes not seen since the given timestamp.
export function findStaleNodes(clusterId, olderThanIso) {
  if (getStorageMode() !== STORAGE_TABLES) return [];
  return db
    .select()
    .from(clusterNodes)
    .where(eq(clusterNodes.clusterId, clusterId))
    .all()
    .filter(n => n.source === 'k8s' && (n.lastSeenAt || '') < olderThanIso);
}

export function removeNodes(clusterId, nodeIds) {
  if (!nodeIds.length) return;
  db.transaction(() => {
    for (const id of nodeIds) {
      db.delete(clusterNodes).where(eq(clusterNodes.id, id)).run();
    }
  });
}

// Migrate old single-cluster format to new multi-cluster format.
export function migrateClusterData() {
  const newRow = db.select().from(appSettings).where(eq(appSettings.key, 'clusters')).get();
  if (newRow?.value) return; // already migrated

  const oldRow = db.select().from(appSettings).where(eq(appSettings.key, 'cluster.nodes')).get();
  if (!oldRow?.value) return; // nothing to migrate

  try {
    const old = JSON.parse(oldRow.value);
    const cluster = {
      id: 'cluster_1',
      name: old.name || 'Default Cluster',
      nodes: old.nodes || [],
    };
    // Store using the new format (passwords are already encrypted in old format)
    const value = JSON.stringify([cluster]);
    db.insert(appSettings).values({ key: 'clusters', value, category: 'cluster' }).run();
  } catch { }
}

// SSRF protection: only hosts in the configured cluster are reachable.
export function resolveTargetNode(clusterId, node){
  const nodes = getClusterNodes(clusterId);
  if (!nodes.length) {
    const e = new Error('No cluster nodes configured');
    e.status = 400;
    throw e;
  }
  const target = node ? nodes.find((n) => n.host === node) : nodes[0];
  if(!target) {
    const e = new Error('Node not found in cluster configuration.');
    e.status = 400;
    throw e;

  }
  return target;

}

export { MAX_CLUSTERS, MAX_TOTAL_NODES };
