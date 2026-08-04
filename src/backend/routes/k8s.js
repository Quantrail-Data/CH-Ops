// Route definitions for the Kubernetes connection, discovery and insight endpoints.
// Contributors -> Kathirdhasan
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { Router } from 'express';
import {
  listK8sConnections,
  listOperators,
  createK8sConnection,
  updateK8sConnection,
  deleteK8sConnection,
  testK8sConnection,
  listNamespaces,
  listInstallations,
  getInstallation,
  importInstallation,
  refreshCluster,
} from '../controllers/k8s.js';
import {
  getTopology,
  getReconcile,
  getConfig,
  getStorage,
  getNetwork,
  getEvents,
  getLogs,
  getHealth,
  getRbacContext,
  refreshNow,
} from '../controllers/k8sInsight.js';
import { requireAdmin } from '../controllers/users.js';

const router = Router();

// Connections.
router.get('/operators', listOperators);
router.get('/connections', listK8sConnections);
router.post('/connections', requireAdmin, createK8sConnection);
router.put('/connections/:id', requireAdmin, updateK8sConnection);
router.delete('/connections/:id', requireAdmin, deleteK8sConnection);

// Testing reaches out to a caller-supplied address, so it is admin only.
router.post('/test', requireAdmin, testK8sConnection);

// Discovery.
router.get('/connections/:id/namespaces', listNamespaces);
router.get('/connections/:id/installations', listInstallations);
router.get('/connections/:id/installations/:name', getInstallation);

// Import creates a CHOps cluster, so it matches cluster creation.
router.post('/import', requireAdmin, importInstallation);

// Manual refresh re-reads the host list.
router.post('/clusters/:id/refresh', refreshCluster);

// Insight.
router.get('/insight/:clusterId/topology', getTopology);
router.get('/insight/:clusterId/reconcile', getReconcile);
router.get('/insight/:clusterId/config', getConfig);
router.get('/insight/:clusterId/storage', getStorage);
router.get('/insight/:clusterId/network', getNetwork);
router.get('/insight/:clusterId/events', getEvents);
router.get('/insight/:clusterId/logs/:pod', getLogs);
router.get('/insight/:clusterId/health', getHealth);
router.get('/insight/:clusterId/rbac-context', getRbacContext);
router.post('/insight/:clusterId/refresh', refreshNow);

export default router;
