// clusterUtils.js - Shared cluster data access for all services
//
// Centralized access to cluster and node configuration stored in
// app_settings. Handles password decryption, node lookup by name,
// and cluster selection. Supports multi-cluster with max 3 clusters
// and 18 total nodes across all clusters. Includes migration for
// old single-cluster format to new multi-cluster format.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { eq } from 'drizzle-orm';
import { db, appSettings } from '../db/index.js';
import { encrypt, decrypt } from './crypto.js';

const MAX_CLUSTERS = 3;
const MAX_TOTAL_NODES = 18;

export function getAllClusters() {
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

export function getClusterById(clusterId) {
  if (!clusterId) return null;
  return getAllClusters().find(c => c.id === clusterId) || null;
}

export function getNodeByName(cluster, clusterName) {
  if (!cluster?.nodes || !clusterName) return null;
  
  return cluster.nodes.find(node => node.name === clusterName) || null;
}


// Get nodes for a specific cluster. Falls back to first cluster if clusterId is null.
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
  const totalNodes = clusters.reduce((sum, c) => sum + (c.nodes?.length || 0), 0);
  if (totalNodes > MAX_TOTAL_NODES) throw new Error(`Maximum ${MAX_TOTAL_NODES} total nodes across all clusters.`);

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

// Migrate old single-cluster format to new multi-cluster format.
// Called once on startup. Safe to run multiple times.
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
  } catch {}
}

export { MAX_CLUSTERS, MAX_TOTAL_NODES };
