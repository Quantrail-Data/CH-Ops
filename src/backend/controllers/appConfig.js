// appConfig.js - REST API for the settings on the App Config page.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { CONFIG, getConfigWithSources, setConfig, resetConfig } from '../services/appConfig.js';
import { log } from '../services/logger.js';

export function getAppConfig(req, res) {
  const resolved = getConfigWithSources();


  const out = Object.entries(CONFIG).map(([key, spec]) => ({
    key,
    value: resolved[key].value,
    source: resolved[key].source,
    default: spec.def,
    min: spec.min,
    max: spec.max,
    env: spec.env || null,
  }));

  res.json(out);
}

export async function putAppConfig(req, res) {
  const { key, value } = req.body || {};
  try {
    setConfig(key, value);
    if (key === 'k8s.syncIntervalMs') {
      const { restartK8sSync } = await import('../services/k8sSync.js');
      restartK8sSync();
    }
    log.info(`App config changed: ${key} = ${value}`);
    return getAppConfig(req, res);
  } catch (err) {

    return res.status(400).json({ error: err.message });
  }
}

export async function deleteAppConfig(req, res) {
  const { key } = req.params;

  try {
    resetConfig(key);
    if (key === 'k8s.syncIntervalMs') {
      const { restartK8sSync } = await import('../services/k8sSync.js');
      restartK8sSync();
    }

    log.info(`App config reset to default: ${key}`);
    return getAppConfig(req, res);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}