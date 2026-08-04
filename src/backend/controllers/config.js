// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// API endpoint serving authenticated cluster configurations for frontend
// navigation dropdowns. Node passwords are masked: the browser never receives
// a ClickHouse® credential. The backend resolves the stored password from the
// cluster configuration when it runs a query.

import { eq } from 'drizzle-orm';
import { db, appSettings } from '../db/index.js';
import { getAllClusters, maskClusterPasswords } from '../services/clusterUtils.js';
import { ensureCapabilities, unavailableFeatures } from '../services/capabilities.js';

export function getConnection(req, res) {
  const clusters = getAllClusters();

  // Warm the capability cache in the background.
  for (const c of clusters) {
    ensureCapabilities(c.id).catch(() => {});
  }

  res.json({
    clusters: clusters.map(maskClusterPasswords),
    features: { kubernetes: kubernetesEnabled() },
  });
}

// app_setting['k8s.enabled'], default ON.
export function kubernetesEnabled() {
  try {
    const row = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'k8s.enabled'))
      .get();
    return row?.value !== 'false';
  } catch {
    // A read failure must not hide a working feature.
    return true;
  }
}

// GET /api/config/capabilities/:clusterId What this deployment cannot do, and why.
export async function getCapabilities(req, res) {
  const { clusterId } = req.params;

  try {
    const probe = await ensureCapabilities(clusterId);
    res.json({
      probed: probe.probed,
      deployment: probe.deployment,
      unavailable: unavailableFeatures(clusterId),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
