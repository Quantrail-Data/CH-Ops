// aiCredentials.js - credential handling for the Qurioz AI database registration.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar, Ravivarman, Dhivya
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { getClusterNodes } from '../services/clusterUtils.js';
import { encrypt, decrypt } from '../services/crypto.js';

export function resolveFromCluster({ clusterId, node, database }) {
  const nodes = getClusterNodes(clusterId);
  if (nodes.length === 0) {
    const err = new Error('No cluster nodes configured.');
    err.statusCode = 400;
    throw err;
  }

  const target = node ? nodes.find((n) => n.host === node) : nodes[0];
  if (!target) {
    const err = new Error('Node not found in cluster configuration.');
    err.statusCode = 400;
    throw err;
  }

  if (!database) {
    const err = new Error('A database name is required.');
    err.statusCode = 422;
    throw err;
  }

  return {
    host: target.host,
    port: target.port || 8123,
    username: target.user || 'default',
    password: target.password ?? '',
    database,
  };
}

// Stored shape keeps the password under a separate key so a plaintext row
// written by an older build is still readable (see deserialize).
export function serialize(credentials) {
  const { password, ...rest } = credentials || {};
  return JSON.stringify({ ...rest, encryptedPassword: encrypt(password ?? '') });
}

export function deserialize(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  const { encryptedPassword, password, ...rest } = parsed;
  // encryptedPassword is the current shape. A legacy row has a plaintext
  // password field instead; it keeps working and is re-encrypted on next save.
  if (encryptedPassword !== undefined) {
    return { ...rest, password: decrypt(encryptedPassword) };
  }
  return { ...rest, password: password ?? '' };
}
